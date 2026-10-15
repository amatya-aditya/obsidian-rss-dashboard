import type {
  ImageCacheAdapter,
  ImageCacheEntry,
  ImageCacheFetchResponse,
} from "./image-cache-service";

export const MAX_CACHED_IMAGE_BYTES = 1_048_576;

const IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

/**
 * Workflow state the owning service keeps and the writer reads and writes
 * through `host.state`. The owner may reassign a field (for example
 * `writeGeneration` in `cancelPendingWrites`), so the writer always reads the
 * current value off the state object rather than holding a copy.
 */
export interface ImageCacheWriterState {
  initialized: boolean;
  entries: Map<string, ImageCacheEntry>;
  writeGeneration: number;
}

/**
 * Collaborators and state the moved code needs, supplied by the owning
 * service. The writer never reaches for `this`; every read and write goes
 * through this host.
 */
export interface ImageCacheWriterHost {
  adapter: ImageCacheAdapter;
  state: ImageCacheWriterState;
  fetchImage(url: string): Promise<ImageCacheFetchResponse>;
  now(): number;
  onChange?: () => void;
  normalizeUrl(rawUrl: string): string | null;
  isStale(rawUrl: string): boolean;
  getEntryPath(entry: ImageCacheEntry): string;
  evictUntilFits(incomingBytes: number, replacingBytes: number): Promise<void>;
  removeCachedFile(entry: ImageCacheEntry): Promise<void>;
  persistIndex(): Promise<void>;
}

/**
 * Fetches one preview image and stores it in the cache. Extracted from
 * `ImageCacheService.cacheUrl`; returns false when the cache is not
 * initialized, the response is missing or invalid, or the write is cancelled
 * or fails.
 */
export async function cacheImageUrl(
  rawUrl: string,
  refreshStale: boolean,
  host: ImageCacheWriterHost,
): Promise<boolean> {
  if (!host.state.initialized) return false;
  const url = host.normalizeUrl(rawUrl);
  if (!url) return false;
  const existingEntry = host.state.entries.get(url);
  if (existingEntry && (!refreshStale || !host.isStale(url))) return true;

  const writeGeneration = host.state.writeGeneration;
  const response = await tryFetchImage(url, host);
  if (!response) return false;

  const extension = getImageExtension(response);
  if (!extension) return false;
  if (!isCacheableResponse(response, extension)) return false;

  const declaredLength = getDeclaredLength(response.headers);
  if (declaredLength !== null && declaredLength > MAX_CACHED_IMAGE_BYTES) {
    return false;
  }

  return commitCachedImage(
    { url, response, extension, existingEntry, writeGeneration },
    host,
  );
}

async function tryFetchImage(
  url: string,
  host: ImageCacheWriterHost,
): Promise<ImageCacheFetchResponse | null> {
  try {
    return await host.fetchImage(url);
  } catch (error) {
    console.warn("[RSS dashboard] Unable to cache preview image", error);
    return null;
  }
}

function isCacheableResponse(
  response: ImageCacheFetchResponse,
  extension: string,
): boolean {
  return (
    response.status >= 200 &&
    response.status < 300 &&
    response.arrayBuffer.byteLength <= MAX_CACHED_IMAGE_BYTES &&
    hasValidImageSignature(response.arrayBuffer, extension)
  );
}

interface CachedImageWrite {
  url: string;
  response: ImageCacheFetchResponse;
  extension: string;
  existingEntry: ImageCacheEntry | undefined;
  writeGeneration: number;
}

async function commitCachedImage(
  write: CachedImageWrite,
  host: ImageCacheWriterHost,
): Promise<boolean> {
  const { url, response, extension, existingEntry, writeGeneration } = write;
  const fileName = `${await hashUrl(url)}.${extension}`;
  const entry: ImageCacheEntry = {
    fileName,
    byteLength: response.arrayBuffer.byteLength,
    cachedAt: host.now(),
    lastAccessedAt: host.now(),
  };

  if (writeGeneration !== host.state.writeGeneration) return false;
  await host.evictUntilFits(entry.byteLength, existingEntry?.byteLength ?? 0);
  if (writeGeneration !== host.state.writeGeneration) return false;
  try {
    await host.adapter.writeBinary(
      host.getEntryPath(entry),
      response.arrayBuffer,
    );
    if (writeGeneration !== host.state.writeGeneration) {
      await host.removeCachedFile(entry);
      return false;
    }
    host.state.entries.set(url, entry);
    if (existingEntry && existingEntry.fileName !== entry.fileName) {
      await host.removeCachedFile(existingEntry);
    }
    await host.persistIndex();
    host.onChange?.();
    return true;
  } catch (error) {
    console.warn("[RSS dashboard] Unable to write cached preview image", error);
    return false;
  }
}

function getImageExtension(response: ImageCacheFetchResponse): string | null {
  const contentType = Object.entries(response.headers).find(
    ([name]) => name.toLowerCase() === "content-type",
  )?.[1];
  const mediaType = contentType?.split(";", 1)[0];
  return IMAGE_TYPES.get(mediaType?.trim().toLowerCase() ?? "") ?? null;
}

function getDeclaredLength(headers: Record<string, string>): number | null {
  const contentLength = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "content-length",
  )?.[1];
  if (!contentLength) return null;
  const parsed = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hasValidImageSignature(data: ArrayBuffer, extension: string): boolean {
  const bytes = new Uint8Array(data);
  if (extension === "jpg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (extension === "png") {
    return (
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, index) => bytes[index] === byte,
      )
    );
  }
  if (extension === "gif") {
    return (
      bytes.length >= 6 &&
      ("GIF87a" === String.fromCharCode(...bytes.slice(0, 6)) ||
        "GIF89a" === String.fromCharCode(...bytes.slice(0, 6)))
    );
  }
  if (extension === "webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" &&
    String.fromCharCode(...bytes.slice(8, 12)).startsWith("avif")
  );
}

async function hashUrl(url: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
