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

/** The part of the dashboard view the cache redraws after a warm-up batch. */
interface DashboardViewLike {
  refresh(): void;
}

export interface PreviewImageCacheOptions {
  manifest: PluginManifest;
  /** Returns the live settings object; the cache never holds its own copy. */
  getSettings: () => RssDashboardSettings;
  saveSettings: () => Promise<void>;
  /** Whether a multi-feed refresh is running, so its batch skips the redraw. */
  isRefreshBatchRunning: () => boolean;
  getDashboardView: () => Promise<DashboardViewLike | null>;
}

/**
 * The on-disk cache of article preview images: creating and removing it,
 * warming it with the previews of refreshed, added and imported feeds (at most
 * two fetches at a time), and redrawing the dashboard once a warm-up batch
 * has cached something.
 */
export class PreviewImageCache {
  private imageCacheService: ImageCacheService | null = null;
  private imageCacheQueue: string[] = [];
  private readonly queuedImageCacheUrls = new Set<string>();
  private readonly imageCacheChangeListeners = new Set<() => void>();
  private imageCacheWorkers = 0;
  private imageCacheBatchHasUsableEntries = false;
  private suppressNextImageCacheDashboardRefresh = false;
  private readonly app: App;
  private readonly manifest: PluginManifest;
  private readonly getSettings: () => RssDashboardSettings;
  private readonly saveSettings: () => Promise<void>;
  private readonly isRefreshBatchRunning: () => boolean;
  private readonly getDashboardView: () => Promise<DashboardViewLike | null>;

  constructor(app: App, options: PreviewImageCacheOptions) {
    this.app = app;
    this.manifest = options.manifest;
    this.getSettings = options.getSettings;
    this.saveSettings = options.saveSettings;
    this.isRefreshBatchRunning = options.isRefreshBatchRunning;
    this.getDashboardView = options.getDashboardView;
  }

  public async initialize(): Promise<void> {
    if (this.imageCacheService) return;
    if (!this.getSettings().display.allowImageCaching) return;

    const adapter = this.app.vault.adapter;
    if (
      typeof adapter.readBinary !== "function" ||
      typeof adapter.writeBinary !== "function" ||
      typeof adapter.getResourcePath !== "function"
    ) {
      return;
    }

    this.imageCacheService = new ImageCacheService({
      adapter,
      cacheRoot: normalizePath(
        `${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/image-cache`,
      ),
      fetchImage: async (url) => {
        const response = await requestUrl({ url, method: "GET" });
        return {
          status: response.status,
          headers: response.headers,
          arrayBuffer: response.arrayBuffer,
        };
      },
      maxCacheBytes: this.getImageCacheLimitBytes(),
      onChange: () => this.notifyImageCacheChanged(),
    });
    await this.imageCacheService.initialize();
  }

  public resolveCachedUrl(remoteUrl: string): string | null {
    if (!this.getSettings().display.allowImageCaching) return null;
    return this.imageCacheService?.resolveCachedUrl(remoteUrl) ?? null;
  }

  public getSizeBytes(): number {
    return this.imageCacheService?.getSizeBytes() ?? 0;
  }

  public onChange(listener: () => void): () => void {
    this.imageCacheChangeListeners.add(listener);
    return () => this.imageCacheChangeListeners.delete(listener);
  }

  public async setLimit(limitMiB: number, unlimited: boolean): Promise<void> {
    const normalizedLimit = Number.isInteger(limitMiB)
      ? Math.min(
          IMAGE_CACHE_LIMIT_MAX_MIB,
          Math.max(IMAGE_CACHE_LIMIT_MIN_MIB, limitMiB),
        )
      : DEFAULT_SETTINGS.display.imageCacheLimitMiB;
    this.getSettings().display.imageCacheLimitMiB = normalizedLimit;
    this.getSettings().display.imageCacheUnlimited = unlimited;
    await this.imageCacheService?.setMaxCacheBytes(
      this.getImageCacheLimitBytes(),
    );
    await this.saveSettings();
  }

  public async clear(): Promise<{ cleared: number; failed: number }> {
    this.imageCacheQueue = [];
    this.queuedImageCacheUrls.clear();
    this.imageCacheBatchHasUsableEntries = false;
    this.suppressNextImageCacheDashboardRefresh = false;
    this.imageCacheService?.cancelPendingWrites();
    return (await this.imageCacheService?.clear()) ?? { cleared: 0, failed: 0 };
  }

  public async forgetFeed(feed: Feed): Promise<void> {
    const deletedFeedPreviewUrls = this.getPreviewImageUrls(feed);
    if (deletedFeedPreviewUrls.size === 0) return;

    this.imageCacheQueue = this.imageCacheQueue.filter(
      (url) => !deletedFeedPreviewUrls.has(url),
    );
    for (const url of deletedFeedPreviewUrls) {
      this.queuedImageCacheUrls.delete(url);
    }

    const retainedPreviewUrls = new Set(
      this.getSettings().feeds.flatMap((remainingFeed) => [
        ...this.getPreviewImageUrls(remainingFeed),
      ]),
    );
    const orphanedPreviewUrls = Array.from(deletedFeedPreviewUrls).filter(
      (url) => !retainedPreviewUrls.has(url),
    );
    await this.imageCacheService?.removeUrls(orphanedPreviewUrls);
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this.getSettings().display.allowImageCaching = enabled;
    if (enabled) {
      await this.initialize();
    } else {
      await this.clear();
      await this.imageCacheService?.destroy();
      this.imageCacheService = null;
    }
    await this.saveSettings();
  }

  private getImageCacheLimitBytes(): number | null {
    if (this.getSettings().display.imageCacheUnlimited) return null;
    return this.getSettings().display.imageCacheLimitMiB * 1_024 * 1_024;
  }

  private notifyImageCacheChanged(): void {
    for (const listener of this.imageCacheChangeListeners) {
      listener();
    }
  }

  public warmFeed(feed: Feed): void {
    if (
      !this.getSettings().display.allowImageCaching ||
      !this.getSettings().display.showCoverImage ||
      !this.imageCacheService
    ) {
      return;
    }

    let queuedImage = false;
    for (const previewUrl of this.getPreviewImageUrls(feed)) {
      if (!this.queuedImageCacheUrls.has(previewUrl)) {
        this.queuedImageCacheUrls.add(previewUrl);
        this.imageCacheQueue.push(previewUrl);
        queuedImage = true;
      }
    }

    if (queuedImage && this.isRefreshBatchRunning()) {
      this.suppressNextImageCacheDashboardRefresh = true;
    }

    this.startImageCacheWorkers();
  }

  private getPreviewImageUrls(feed: Feed): Set<string> {
    const previewUrls = new Set<string>();
    for (const item of feed.items) {
      for (const fieldOrder of [
        ["coverImage", "image"],
        ["image", "coverImage"],
      ] as const) {
        const previewUrl = resolveArticlePreviewImage(item, fieldOrder);
        if (previewUrl) previewUrls.add(previewUrl);
      }
    }
    return previewUrls;
  }

  private startImageCacheWorkers(): void {
    while (this.imageCacheWorkers < 2 && this.imageCacheQueue.length > 0) {
      this.imageCacheWorkers += 1;
      void this.runImageCacheWorker();
    }
  }

  private async runImageCacheWorker(): Promise<void> {
    try {
      while (
        this.getSettings().display.allowImageCaching &&
        this.getSettings().display.showCoverImage
      ) {
        const previewUrl = this.imageCacheQueue.shift();
        if (!previewUrl) return;

        this.queuedImageCacheUrls.delete(previewUrl);
        const cached = await this.imageCacheService?.cacheUrl(previewUrl, true);
        if (cached) {
          this.imageCacheBatchHasUsableEntries = true;
        }
      }
    } finally {
      this.imageCacheWorkers -= 1;
      this.startImageCacheWorkers();
      if (this.imageCacheWorkers === 0 && this.imageCacheQueue.length === 0) {
        const shouldRefreshDashboard =
          this.imageCacheBatchHasUsableEntries &&
          !this.suppressNextImageCacheDashboardRefresh;
        this.imageCacheBatchHasUsableEntries = false;
        this.suppressNextImageCacheDashboardRefresh = false;
        if (shouldRefreshDashboard) {
          void this.refreshDashboardAfterImageCacheBatch();
        }
      }
    }
  }

  private async refreshDashboardAfterImageCacheBatch(): Promise<void> {
    const view = await this.getDashboardView();
    if (view) {
      void view.refresh();
    }
  }
}
