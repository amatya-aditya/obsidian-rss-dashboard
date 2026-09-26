import {
  App,
  normalizePath,
  requestUrl,
  type PluginManifest,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  IMAGE_CACHE_LIMIT_MAX_MIB,
  IMAGE_CACHE_LIMIT_MIN_MIB,
  type Feed,
  type RssDashboardSettings,
} from "../types/types";
import { ImageCacheService } from "./image-cache-service";
import { resolveArticlePreviewImage } from "../utils/article-preview-utils";

/** At most this many preview images are fetched at the same time. */
const MAX_CONCURRENT_WARM_FETCHES = 2;

/** Each article is checked for a preview image in both field orders. */
const PREVIEW_FIELD_ORDERS = [
  ["coverImage", "image"],
  ["image", "coverImage"],
] as const;

/** The part of the dashboard view the cache redraws after a warm-up batch. */
interface RefreshableDashboardView {
  refresh(): void;
}

export interface PreviewImageCacheOptions {
  manifest: Pick<PluginManifest, "dir" | "id">;
  /** Returns the live settings object; the cache never holds its own copy. */
  getSettings: () => RssDashboardSettings;
  saveSettings: () => Promise<void>;
  /** Whether a multi-feed refresh is running, so its batch skips the redraw. */
  isRefreshBatchRunning: () => boolean;
  getDashboardView: () => Promise<RefreshableDashboardView | null>;
}

function collectPreviewImageUrls(feed: Feed): Set<string> {
  const previewUrls = new Set<string>();
  for (const item of feed.items) {
    for (const fieldOrder of PREVIEW_FIELD_ORDERS) {
      const previewUrl = resolveArticlePreviewImage(item, fieldOrder);
      if (previewUrl) previewUrls.add(previewUrl);
    }
  }
  return previewUrls;
}

/**
 * The on-disk cache of article preview images: creating and removing it,
 * warming it with a feed's previews, and redrawing the dashboard once a
 * warm-up batch has cached something.
 */
export class PreviewImageCache {
  private service: ImageCacheService | null = null;
  private warmQueue: string[] = [];
  private readonly queuedUrls = new Set<string>();
  private readonly changeListeners = new Set<() => void>();
  private activeWorkers = 0;
  private batchCachedAny = false;
  private suppressNextRedraw = false;

  constructor(
    private readonly app: App,
    private readonly options: PreviewImageCacheOptions,
  ) {}

  public async initialize(): Promise<void> {
    if (this.service) return;
    if (!this.options.getSettings().display.allowImageCaching) return;

    const adapter = this.app.vault.adapter;
    if (
      typeof adapter.readBinary !== "function" ||
      typeof adapter.writeBinary !== "function" ||
      typeof adapter.getResourcePath !== "function"
    ) {
      return;
    }

    const { manifest } = this.options;
    this.service = new ImageCacheService({
      adapter,
      cacheRoot: normalizePath(
        `${manifest.dir ?? `${this.app.vault.configDir}/plugins/${manifest.id}`}/image-cache`,
      ),
      fetchImage: async (url) => {
        const response = await requestUrl({ url, method: "GET" });
        return {
          status: response.status,
          headers: response.headers,
          arrayBuffer: response.arrayBuffer,
        };
      },
      maxCacheBytes: this.getLimitBytes(),
      onChange: () => this.notifyChanged(),
    });
    await this.service.initialize();
  }

  public resolveCachedUrl(remoteUrl: string): string | null {
    if (!this.options.getSettings().display.allowImageCaching) return null;
    return this.service?.resolveCachedUrl(remoteUrl) ?? null;
  }

  public getSizeBytes(): number {
    return this.service?.getSizeBytes() ?? 0;
  }

  public onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  public async setLimit(limitMiB: number, unlimited: boolean): Promise<void> {
    const normalizedLimit = Number.isInteger(limitMiB)
      ? Math.min(
          IMAGE_CACHE_LIMIT_MAX_MIB,
          Math.max(IMAGE_CACHE_LIMIT_MIN_MIB, limitMiB),
        )
      : DEFAULT_SETTINGS.display.imageCacheLimitMiB;
    const { display } = this.options.getSettings();
    display.imageCacheLimitMiB = normalizedLimit;
    display.imageCacheUnlimited = unlimited;
    await this.service?.setMaxCacheBytes(this.getLimitBytes());
    await this.options.saveSettings();
  }

  public async clear(): Promise<{ cleared: number; failed: number }> {
    this.warmQueue = [];
    this.queuedUrls.clear();
    this.batchCachedAny = false;
    this.suppressNextRedraw = false;
    return (await this.service?.clear()) ?? { cleared: 0, failed: 0 };
  }

  public async forgetFeed(feed: Feed): Promise<void> {
    const deletedFeedPreviewUrls = collectPreviewImageUrls(feed);
    if (deletedFeedPreviewUrls.size === 0) return;

    this.warmQueue = this.warmQueue.filter(
      (url) => !deletedFeedPreviewUrls.has(url),
    );
    for (const url of deletedFeedPreviewUrls) {
      this.queuedUrls.delete(url);
    }

    const retainedPreviewUrls = new Set(
      this.options
        .getSettings()
        .feeds.flatMap((remainingFeed) => [
          ...collectPreviewImageUrls(remainingFeed),
        ]),
    );
    const orphanedPreviewUrls = Array.from(deletedFeedPreviewUrls).filter(
      (url) => !retainedPreviewUrls.has(url),
    );
    await this.service?.removeUrls(orphanedPreviewUrls);
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this.options.getSettings().display.allowImageCaching = enabled;
    if (enabled) {
      await this.initialize();
    } else {
      await this.clear();
      await this.service?.destroy();
      this.service = null;
    }
    await this.options.saveSettings();
  }

  public warmFeed(feed: Feed): void {
    if (!this.isWarmingEnabled() || !this.service) {
      return;
    }

    let queuedImage = false;
    for (const previewUrl of collectPreviewImageUrls(feed)) {
      if (!this.queuedUrls.has(previewUrl)) {
        this.queuedUrls.add(previewUrl);
        this.warmQueue.push(previewUrl);
        queuedImage = true;
      }
    }

    if (queuedImage && this.options.isRefreshBatchRunning()) {
      this.suppressNextRedraw = true;
    }

    this.startWorkers();
  }

  private isWarmingEnabled(): boolean {
    const { display } = this.options.getSettings();
    return display.allowImageCaching && display.showCoverImage;
  }

  private getLimitBytes(): number | null {
    const { display } = this.options.getSettings();
    if (display.imageCacheUnlimited) return null;
    return display.imageCacheLimitMiB * 1_024 * 1_024;
  }

  private notifyChanged(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  private startWorkers(): void {
    while (
      this.activeWorkers < MAX_CONCURRENT_WARM_FETCHES &&
      this.warmQueue.length > 0
    ) {
      this.activeWorkers += 1;
      void this.runWorker();
    }
  }

  private async runWorker(): Promise<void> {
    try {
      while (this.isWarmingEnabled()) {
        const previewUrl = this.warmQueue.shift();
        if (!previewUrl) return;

        this.queuedUrls.delete(previewUrl);
        const cached = await this.service?.cacheUrl(previewUrl, true);
        if (cached) {
          this.batchCachedAny = true;
        }
      }
    } finally {
      this.activeWorkers -= 1;
      this.startWorkers();
      if (this.activeWorkers === 0 && this.warmQueue.length === 0) {
        const shouldRedraw = this.batchCachedAny && !this.suppressNextRedraw;
        this.batchCachedAny = false;
        this.suppressNextRedraw = false;
        if (shouldRedraw) {
          void this.redrawDashboard();
        }
      }
    }
  }

  private async redrawDashboard(): Promise<void> {
    (await this.options.getDashboardView())?.refresh();
  }
}
