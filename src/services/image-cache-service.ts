import { normalizePath } from "obsidian";

export const MAX_CACHED_IMAGE_BYTES = 1_048_576;
export const MAX_IMAGE_CACHE_BYTES = 100 * 1_024 * 1_024;
export const IMAGE_CACHE_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1_000;

const CACHE_INDEX_FILENAME = "index.json";
const CACHE_INDEX_VERSION = 1;

const IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

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
  private readonly fetchImage: (url: string) => Promise<ImageCacheFetchResponse>;
  private maxCacheBytes: number | null;
  private readonly now: () => number;
  private readonly onChange?: () => void;
  private readonly entries = new Map<string, ImageCacheEntry>();
  private initialized = false;
  private writeGeneration = 0;

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
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!(await this.adapter.exists(this.cacheRoot))) {
      await this.adapter.mkdir(this.cacheRoot);
    }

    const indexPath = this.getIndexPath();
    if (await this.adapter.exists(indexPath)) {
      try {
        const index = JSON.parse(await this.adapter.read(indexPath)) as ImageCacheIndex;
        if (index.version === CACHE_INDEX_VERSION && index.entries) {
          for (const [url, entry] of Object.entries(index.entries)) {
            if (this.isSafeEntry(entry) && (await this.adapter.exists(this.getEntryPath(entry)))) {
              this.entries.set(url, entry);
            }
          }
        }
      } catch (error) {
        console.warn("[RSS dashboard] Unable to read image cache index", error);
      }
    }

    this.initialized = true;
    await this.persistIndex();
  }

  resolveCachedUrl(rawUrl: string): string | null {
    if (!this.initialized) return null;
    const url = this.normalizeUrl(rawUrl);
    if (!url) return null;

    const entry = this.entries.get(url);
    if (!entry) return null;

    entry.lastAccessedAt = this.now();
    return this.adapter.getResourcePath(this.getEntryPath(entry));
  }

  getSizeBytes(): number {
    return Array.from(this.entries.values()).reduce(
      (total, entry) => total + entry.byteLength,
      0,
    );
  }

  async setMaxCacheBytes(maxCacheBytes: number | null): Promise<void> {
    this.maxCacheBytes = maxCacheBytes;
    if (this.initialized && maxCacheBytes !== null) {
      await this.evictUntilFits(0, 0);
      await this.persistIndex();
    }
    this.onChange?.();
  }

  isStale(rawUrl: string): boolean {
    const url = this.normalizeUrl(rawUrl);
    const entry = url ? this.entries.get(url) : undefined;
    return !!entry && this.now() - entry.cachedAt >= IMAGE_CACHE_STALE_AFTER_MS;
  }

  async cacheUrl(rawUrl: string, refreshStale = false): Promise<boolean> {
    if (!this.initialized) return false;
    const url = this.normalizeUrl(rawUrl);
    if (!url) return false;
    const existingEntry = this.entries.get(url);
    if (existingEntry && (!refreshStale || !this.isStale(url))) return true;

    let response: ImageCacheFetchResponse;
    const writeGeneration = this.writeGeneration;
    try {
      response = await this.fetchImage(url);
    } catch (error) {
      console.warn("[RSS dashboard] Unable to cache preview image", error);
      return false;
    }

    const extension = this.getImageExtension(response);
    if (
      response.status < 200 ||
      response.status >= 300 ||
      !extension ||
      response.arrayBuffer.byteLength > MAX_CACHED_IMAGE_BYTES ||
      !this.hasValidImageSignature(response.arrayBuffer, extension)
    ) {
      return false;
    }

    const declaredLength = this.getDeclaredLength(response.headers);
    if (declaredLength !== null && declaredLength > MAX_CACHED_IMAGE_BYTES) {
      return false;
    }

    const fileName = `${await this.hashUrl(url)}.${extension}`;
    const entry: ImageCacheEntry = {
      fileName,
      byteLength: response.arrayBuffer.byteLength,
      cachedAt: this.now(),
      lastAccessedAt: this.now(),
    };

    if (writeGeneration !== this.writeGeneration) return false;
    await this.evictUntilFits(entry.byteLength, existingEntry?.byteLength ?? 0);
    if (writeGeneration !== this.writeGeneration) return false;
    try {
      await this.adapter.writeBinary(this.getEntryPath(entry), response.arrayBuffer);
      if (writeGeneration !== this.writeGeneration) {
        await this.adapter.remove(this.getEntryPath(entry));
        return false;
      }
      this.entries.set(url, entry);
      if (existingEntry && existingEntry.fileName !== entry.fileName) {
        await this.adapter.remove(this.getEntryPath(existingEntry));
      }
      await this.persistIndex();
      this.onChange?.();
      return true;
    } catch (error) {
      console.warn("[RSS dashboard] Unable to write cached preview image", error);
      return false;
    }
  }

  async clear(): Promise<{ cleared: number; failed: number }> {
    this.cancelPendingWrites();
    let cleared = 0;
    let failed = 0;

    for (const [url, entry] of this.entries) {
      try {
        await this.adapter.remove(this.getEntryPath(entry));
        this.entries.delete(url);
        cleared += 1;
      } catch (error) {
        console.warn("[RSS dashboard] Unable to clear cached preview image", error);
        failed += 1;
      }
    }

    await this.persistIndex();
    this.onChange?.();
    return { cleared, failed };
  }

  cancelPendingWrites(): void {
    this.writeGeneration += 1;
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
    const entries = Object.fromEntries(this.entries);
    await this.adapter.write(
      this.getIndexPath(),
      JSON.stringify({ version: CACHE_INDEX_VERSION, entries } satisfies ImageCacheIndex),
    );
  }

  private async evictUntilFits(
    incomingBytes: number,
    replacingBytes: number,
  ): Promise<void> {
    if (this.maxCacheBytes === null) return;

    const entries = Array.from(this.entries.entries()).sort(
      ([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt,
    );
    let size = this.getSizeBytes() - replacingBytes;

    for (const [url, entry] of entries) {
      if (size + incomingBytes <= this.maxCacheBytes) break;
      await this.adapter.remove(this.getEntryPath(entry));
      this.entries.delete(url);
      size -= entry.byteLength;
    }
  }

  private getImageExtension(response: ImageCacheFetchResponse): string | null {
    const contentType = Object.entries(response.headers).find(
      ([name]) => name.toLowerCase() === "content-type",
    )?.[1];
    return IMAGE_TYPES.get(contentType?.split(";", 1)[0].trim().toLowerCase() ?? "") ?? null;
  }

  private getDeclaredLength(headers: Record<string, string>): number | null {
    const contentLength = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === "content-length",
    )?.[1];
    if (!contentLength) return null;
    const parsed = Number.parseInt(contentLength, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private hasValidImageSignature(data: ArrayBuffer, extension: string): boolean {
    const bytes = new Uint8Array(data);
    if (extension === "jpg") {
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (extension === "png") {
      return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
    }
    if (extension === "gif") {
      return bytes.length >= 6 && ("GIF87a" === String.fromCharCode(...bytes.slice(0, 6)) || "GIF89a" === String.fromCharCode(...bytes.slice(0, 6)));
    }
    if (extension === "webp") {
      return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    }
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && String.fromCharCode(...bytes.slice(8, 12)).startsWith("avif");
  }

  private async hashUrl(url: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}
