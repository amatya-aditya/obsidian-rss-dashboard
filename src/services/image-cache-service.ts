import { normalizePath } from "obsidian";
import {
  cacheImageUrl,
  MAX_CACHED_IMAGE_BYTES,
  type ImageCacheWriterHost,
  type ImageCacheWriterState,
} from "./image-cache-writer";

export { MAX_CACHED_IMAGE_BYTES };

export const MAX_IMAGE_CACHE_BYTES = 100 * 1_024 * 1_024;
export const IMAGE_CACHE_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1_000;

const CACHE_INDEX_FILENAME = "index.json";
const CACHE_INDEX_VERSION = 1;

export interface ImageCacheAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  writeBinary(path: string, content: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rmdir(path: string, recursive: boolean): Promise<void>;
  getResourcePath(path: string): string;
}

export interface ImageCacheFetchResponse {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
}

export interface ImageCacheEntry {
  fileName: string;
  byteLength: number;
  cachedAt: number;
  lastAccessedAt: number;
}

interface ImageCacheIndex {
  version: number;
  entries: Record<string, ImageCacheEntry>;
}

interface ImageCacheServiceOptions {
  adapter: ImageCacheAdapter;
  cacheRoot: string;
  fetchImage(url: string): Promise<ImageCacheFetchResponse>;
  maxCacheBytes?: number | null;
  now?: () => number;
  onChange?: () => void;
}

export class ImageCacheService {
  private readonly adapter: ImageCacheAdapter;
  private readonly cacheRoot: string;
  private readonly fetchImage: (
    url: string,
  ) => Promise<ImageCacheFetchResponse>;
  private maxCacheBytes: number | null;
  private readonly now: () => number;
  private readonly onChange?: () => void;
  /**
   * Workflow state the writer reads and writes through `writerHost.state`. It
   * stays on the service and is passed by reference; the writer never holds a
   * copy, so reassigning a field here is safe.
   */
  private readonly state: ImageCacheWriterState = {
    initialized: false,
    entries: new Map<string, ImageCacheEntry>(),
    writeGeneration: 0,
  };
  private readonly writerHost: ImageCacheWriterHost;

  constructor(options: ImageCacheServiceOptions) {
    this.adapter = options.adapter;
    this.cacheRoot = normalizePath(options.cacheRoot);
    this.fetchImage = (url) => options.fetchImage(url);
    this.maxCacheBytes =
      options.maxCacheBytes === undefined
        ? MAX_IMAGE_CACHE_BYTES
        : options.maxCacheBytes;
    this.now = options.now ?? (() => Date.now());
    this.onChange = options.onChange;
    this.writerHost = {
      adapter: this.adapter,
      state: this.state,
      fetchImage: (url) => this.fetchImage(url),
      now: () => this.now(),
      onChange: this.onChange,
      normalizeUrl: (rawUrl) => this.normalizeUrl(rawUrl),
      isStale: (rawUrl) => this.isStale(rawUrl),
      getEntryPath: (entry) => this.getEntryPath(entry),
      evictUntilFits: (incomingBytes, replacingBytes) =>
        this.evictUntilFits(incomingBytes, replacingBytes),
      removeCachedFile: (entry) => this.removeCachedFile(entry),
      persistIndex: () => this.persistIndex(),
    };
  }

  async initialize(): Promise<void> {
    if (this.state.initialized) return;

    if (!(await this.adapter.exists(this.cacheRoot))) {
      await this.adapter.mkdir(this.cacheRoot);
    }

    const indexPath = this.getIndexPath();
    if (await this.adapter.exists(indexPath)) {
      try {
        const index = JSON.parse(
          await this.adapter.read(indexPath),
        ) as ImageCacheIndex;
        if (index.version === CACHE_INDEX_VERSION && index.entries) {
          for (const [url, entry] of Object.entries(index.entries)) {
            if (
              this.isSafeEntry(entry) &&
              (await this.adapter.exists(this.getEntryPath(entry)))
            ) {
              this.state.entries.set(url, entry);
            }
          }
        }
      } catch (error) {
        console.warn("[RSS dashboard] Unable to read image cache index", error);
      }
    }

    this.state.initialized = true;
    await this.persistIndex();
  }

  resolveCachedUrl(rawUrl: string): string | null {
    if (!this.state.initialized) return null;
    const url = this.normalizeUrl(rawUrl);
    if (!url) return null;

    const entry = this.state.entries.get(url);
    if (!entry) return null;

    entry.lastAccessedAt = this.now();
    return this.adapter.getResourcePath(this.getEntryPath(entry));
  }

  getSizeBytes(): number {
    return Array.from(this.state.entries.values()).reduce(
      (total, entry) => total + entry.byteLength,
      0,
    );
  }

  async setMaxCacheBytes(maxCacheBytes: number | null): Promise<void> {
    this.maxCacheBytes = maxCacheBytes;
    if (this.state.initialized && maxCacheBytes !== null) {
      await this.evictUntilFits(0, 0);
      await this.persistIndex();
    }
    this.onChange?.();
  }

  isStale(rawUrl: string): boolean {
    const url = this.normalizeUrl(rawUrl);
    const entry = url ? this.state.entries.get(url) : undefined;
    return !!entry && this.now() - entry.cachedAt >= IMAGE_CACHE_STALE_AFTER_MS;
  }

  async cacheUrl(rawUrl: string, refreshStale = false): Promise<boolean> {
    return cacheImageUrl(rawUrl, refreshStale, this.writerHost);
  }

  async clear(): Promise<{ cleared: number; failed: number }> {
    this.cancelPendingWrites();
    let cleared = 0;
    let failed = 0;

    for (const [url, entry] of this.state.entries) {
      try {
        await this.removeCachedFile(entry);
        this.state.entries.delete(url);
        cleared += 1;
      } catch (error) {
        console.warn(
          "[RSS dashboard] Unable to clear cached preview image",
          error,
        );
        failed += 1;
      }
    }

    await this.persistIndex();
    this.onChange?.();
    return { cleared, failed };
  }

  /** Deletes every cached file, the index, and the cache folder itself. */
  async destroy(): Promise<void> {
    this.cancelPendingWrites();
    this.state.entries.clear();
    this.state.initialized = false;

    try {
      if (await this.adapter.exists(this.cacheRoot)) {
        await this.adapter.rmdir(this.cacheRoot, true);
      }
    } catch (error) {
      console.warn(
        "[RSS dashboard] Unable to remove image cache folder",
        error,
      );
    }
    this.onChange?.();
  }

  async removeUrls(
    rawUrls: Iterable<string>,
  ): Promise<{ cleared: number; failed: number }> {
    const urls = new Set(
      Array.from(rawUrls, (rawUrl) => this.normalizeUrl(rawUrl)).filter(
        (url): url is string => url !== null,
      ),
    );
    if (urls.size === 0) return { cleared: 0, failed: 0 };

    this.cancelPendingWrites();
    let cleared = 0;
    let failed = 0;

    for (const url of urls) {
      const entry = this.state.entries.get(url);
      if (!entry) continue;

      try {
        await this.removeCachedFile(entry);
        this.state.entries.delete(url);
        cleared += 1;
      } catch (error) {
        console.warn(
          "[RSS dashboard] Unable to clear cached preview image",
          error,
        );
        failed += 1;
      }
    }

    await this.persistIndex();
    this.onChange?.();
    return { cleared, failed };
  }

  cancelPendingWrites(): void {
    this.state.writeGeneration += 1;
  }

  private normalizeUrl(rawUrl: string): string | null {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }

  private getIndexPath(): string {
    return normalizePath(`${this.cacheRoot}/${CACHE_INDEX_FILENAME}`);
  }

  private getEntryPath(entry: ImageCacheEntry): string {
    return normalizePath(`${this.cacheRoot}/${entry.fileName}`);
  }

  private isSafeEntry(entry: unknown): entry is ImageCacheEntry {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as ImageCacheEntry;
    return (
      /^[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/.test(candidate.fileName) &&
      Number.isInteger(candidate.byteLength) &&
      candidate.byteLength > 0 &&
      candidate.byteLength <= MAX_CACHED_IMAGE_BYTES &&
      Number.isFinite(candidate.cachedAt) &&
      Number.isFinite(candidate.lastAccessedAt)
    );
  }

  private async persistIndex(): Promise<void> {
    const entries = Object.fromEntries(this.state.entries);
    await this.adapter.write(
      this.getIndexPath(),
      JSON.stringify({
        version: CACHE_INDEX_VERSION,
        entries,
      } satisfies ImageCacheIndex),
    );
  }

  /**
   * Deletes an entry's file. A file that is already gone, for example deleted
   * by the user or a sync tool during the session, counts as removed.
   */
  private async removeCachedFile(entry: ImageCacheEntry): Promise<void> {
    try {
      await this.adapter.remove(this.getEntryPath(entry));
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }

  private async evictUntilFits(
    incomingBytes: number,
    replacingBytes: number,
  ): Promise<void> {
    if (this.maxCacheBytes === null) return;

    const entries = Array.from(this.state.entries.entries()).sort(
      ([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt,
    );
    let size = this.getSizeBytes() - replacingBytes;

    for (const [url, entry] of entries) {
      if (size + incomingBytes <= this.maxCacheBytes) break;
      await this.removeCachedFile(entry);
      this.state.entries.delete(url);
      size -= entry.byteLength;
    }
  }
}

/** True for the ENOENT error that `adapter.remove` rejects with for a missing path. */
function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
