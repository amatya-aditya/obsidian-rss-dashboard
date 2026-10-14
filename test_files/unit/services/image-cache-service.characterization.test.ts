import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ImageCacheService,
  type ImageCacheAdapter,
  type ImageCacheFetchResponse,
} from "../../../src/services/image-cache-service";

/**
 * Characterization tests for the preview-image write path (`cacheUrl`), pinned
 * before the method is split into a writer module (#1147). They drive the
 * public `ImageCacheService` boundary with a fake adapter, so they stay valid
 * across the extraction.
 */

const CACHE_ROOT = "config/plugins/rss-dashboard/image-cache";
const INDEX_PATH = `${CACHE_ROOT}/index.json`;

interface ImageCacheIndexShape {
  version: number;
  entries: Record<
    string,
    {
      fileName: string;
      byteLength: number;
      cachedAt: number;
      lastAccessedAt: number;
    }
  >;
}

interface FakeImageCacheAdapter extends ImageCacheAdapter {
  /** The text written at `path`, if any (index.json). */
  text(path: string): string | undefined;
  /** Paths of the cached image files currently on disk. */
  binaryPaths(): string[];
  /** Deletes a file behind the cache's back, as a user or sync tool would. */
  deleteExternally(path: string): void;
}

function createAdapter(): FakeImageCacheAdapter {
  const textFiles = new Map<string, string>();
  const binaryFiles = new Map<string, ArrayBuffer>();
  const directories = new Set<string>();

  return {
    exists: vi.fn(
      async (path: string) =>
        textFiles.has(path) || binaryFiles.has(path) || directories.has(path),
    ),
    read: vi.fn(async (path: string) => textFiles.get(path) ?? ""),
    write: vi.fn(async (path: string, content: string) => {
      textFiles.set(path, content);
    }),
    writeBinary: vi.fn(async (path: string, content: ArrayBuffer) => {
      binaryFiles.set(path, content);
    }),
    mkdir: vi.fn(async (path: string) => {
      directories.add(path);
    }),
    remove: vi.fn(async (path: string) => {
      // Observed on Obsidian 1.13.7 desktop (Windows): adapter.remove on a
      // missing path rejects with an ENOENT error.
      if (!textFiles.delete(path) && !binaryFiles.delete(path)) {
        throw Object.assign(
          new Error(`ENOENT: no such file or directory, unlink '${path}'`),
          { code: "ENOENT" },
        );
      }
    }),
    rmdir: vi.fn(async (path: string) => {
      directories.delete(path);
    }),
    getResourcePath: vi.fn((path: string) => `app://local/${path}`),
    text: (path: string) => textFiles.get(path),
    binaryPaths: () => Array.from(binaryFiles.keys()),
    deleteExternally: (path: string) => {
      textFiles.delete(path);
      binaryFiles.delete(path);
    },
  };
}

function jpegResponse(byteLength = 8): ImageCacheFetchResponse {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0xff, 0xd8, 0xff]);
  return {
    status: 200,
    headers: { "content-type": "image/jpeg" },
    arrayBuffer: bytes.buffer,
  };
}

function createCache(
  adapter: FakeImageCacheAdapter,
  options: {
    fetchImage?: (url: string) => Promise<ImageCacheFetchResponse>;
    maxCacheBytes?: number | null;
    now?: () => number;
    onChange?: () => void;
  } = {},
): ImageCacheService {
  return new ImageCacheService({
    adapter,
    cacheRoot: CACHE_ROOT,
    fetchImage: options.fetchImage ?? (async () => jpegResponse()),
    maxCacheBytes: options.maxCacheBytes,
    now: options.now,
    onChange: options.onChange,
  });
}

function readIndex(adapter: FakeImageCacheAdapter): ImageCacheIndexShape {
  return JSON.parse(adapter.text(INDEX_PATH) ?? "{}") as ImageCacheIndexShape;
}

describe("ImageCacheService cacheUrl characterization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the image file and the index, reports one change, and returns true for a fresh preview", async () => {
    const adapter = createAdapter();
    const onChange = vi.fn();
    const cache = createCache(adapter, { now: () => 100, onChange });

    await cache.initialize();
    await expect(cache.cacheUrl("https://example.com/cover.jpg")).resolves.toBe(
      true,
    );

    const [imagePath] = adapter.binaryPaths();
    expect(imagePath).toMatch(new RegExp(`^${CACHE_ROOT}/[a-f0-9]{64}\\.jpg$`));

    const index = readIndex(adapter);
    expect(index.version).toBe(1);
    expect(Object.keys(index.entries)).toEqual([
      "https://example.com/cover.jpg",
    ]);
    expect(index.entries["https://example.com/cover.jpg"]).toEqual({
      fileName: imagePath.slice(CACHE_ROOT.length + 1),
      byteLength: 8,
      cachedAt: 100,
      lastAccessedAt: 100,
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("returns a fresh entry without refetching, and refetches a stale entry only when asked", async () => {
    const adapter = createAdapter();
    let currentTime = 100;
    const fetchImage = vi.fn(async () => jpegResponse());
    const cache = createCache(adapter, { fetchImage, now: () => currentTime });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/cover.jpg");
    await expect(cache.cacheUrl("https://example.com/cover.jpg")).resolves.toBe(
      true,
    );
    expect(fetchImage).toHaveBeenCalledTimes(1);

    currentTime += 31 * 24 * 60 * 60 * 1_000;
    expect(cache.isStale("https://example.com/cover.jpg")).toBe(true);
    await expect(cache.cacheUrl("https://example.com/cover.jpg")).resolves.toBe(
      true,
    );
    expect(fetchImage).toHaveBeenCalledTimes(1);

    await expect(
      cache.cacheUrl("https://example.com/cover.jpg", true),
    ).resolves.toBe(true);
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  it("uses one entry for URLs that differ only by fragment", async () => {
    const adapter = createAdapter();
    const fetchImage = vi.fn(async () => jpegResponse());
    const cache = createCache(adapter, { fetchImage, now: () => 100 });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/cover.jpg#first");
    await cache.cacheUrl("https://example.com/cover.jpg#second");

    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(cache.getSizeBytes()).toBe(8);
  });

  it("writes nothing and returns false for a response over the one MiB cap", async () => {
    const adapter = createAdapter();
    const cache = createCache(adapter, {
      fetchImage: async () => jpegResponse(1_048_577),
      now: () => 100,
    });

    await cache.initialize();
    await expect(cache.cacheUrl("https://example.com/large.jpg")).resolves.toBe(
      false,
    );
    expect(cache.getSizeBytes()).toBe(0);
    expect(adapter.binaryPaths()).toEqual([]);
    expect(readIndex(adapter).entries).toEqual({});
  });

  it("writes nothing and returns false for a non-image content type", async () => {
    const adapter = createAdapter();
    const cache = createCache(adapter, {
      fetchImage: async () => ({
        status: 200,
        headers: { "content-type": "text/html" },
        arrayBuffer: new TextEncoder().encode("<html>not an image</html>")
          .buffer,
      }),
      now: () => 100,
    });

    await cache.initialize();
    await expect(
      cache.cacheUrl("https://example.com/non-image.jpg"),
    ).resolves.toBe(false);
    expect(cache.getSizeBytes()).toBe(0);
    expect(adapter.binaryPaths()).toEqual([]);
  });

  it("writes nothing and returns false for an image content type with a bad signature", async () => {
    const adapter = createAdapter();
    const cache = createCache(adapter, {
      fetchImage: async () => ({
        status: 200,
        headers: { "content-type": "image/jpeg" },
        arrayBuffer: new TextEncoder().encode("<html>not an image</html>")
          .buffer,
      }),
      now: () => 100,
    });

    await cache.initialize();
    await expect(cache.cacheUrl("https://example.com/error.jpg")).resolves.toBe(
      false,
    );
    expect(cache.getSizeBytes()).toBe(0);
    expect(adapter.binaryPaths()).toEqual([]);
  });

  it("writes nothing and returns false for a non-2xx response", async () => {
    const adapter = createAdapter();
    const cache = createCache(adapter, {
      fetchImage: async () => ({ ...jpegResponse(), status: 404 }),
      now: () => 100,
    });

    await cache.initialize();
    await expect(
      cache.cacheUrl("https://example.com/missing.jpg"),
    ).resolves.toBe(false);
    expect(cache.getSizeBytes()).toBe(0);
    expect(adapter.binaryPaths()).toEqual([]);
  });

  it("writes nothing and returns false when the declared length exceeds the cap", async () => {
    const adapter = createAdapter();
    const cache = createCache(adapter, {
      fetchImage: async () => ({
        ...jpegResponse(),
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(2_000_000),
        },
      }),
      now: () => 100,
    });

    await cache.initialize();
    await expect(cache.cacheUrl("https://example.com/big.jpg")).resolves.toBe(
      false,
    );
    expect(cache.getSizeBytes()).toBe(0);
    expect(adapter.binaryPaths()).toEqual([]);
  });

  it("resolves to false instead of throwing when the fetch fails", async () => {
    const adapter = createAdapter();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cache = createCache(adapter, {
      fetchImage: async () => {
        throw new Error("network down");
      },
      now: () => 100,
    });

    await cache.initialize();
    await expect(cache.cacheUrl("https://example.com/cover.jpg")).resolves.toBe(
      false,
    );
    expect(cache.getSizeBytes()).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it("evicts the least recently used entry before exceeding the total limit", async () => {
    const adapter = createAdapter();
    let currentTime = 100;
    const cache = createCache(adapter, {
      fetchImage: async () => jpegResponse(8),
      maxCacheBytes: 12,
      now: () => currentTime,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/older.jpg");
    currentTime = 200;
    await cache.cacheUrl("https://example.com/newer.jpg");

    expect(cache.resolveCachedUrl("https://example.com/older.jpg")).toBeNull();
    expect(cache.resolveCachedUrl("https://example.com/newer.jpg")).toContain(
      ".jpg",
    );
    expect(cache.getSizeBytes()).toBe(8);
  });

  it("does not evict the entry it is replacing when refreshing a stale image", async () => {
    const adapter = createAdapter();
    let currentTime = 100;
    const cache = createCache(adapter, {
      fetchImage: async () => jpegResponse(8),
      maxCacheBytes: 8,
      now: () => currentTime,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/cover.jpg");
    currentTime += 31 * 24 * 60 * 60 * 1_000;

    await expect(
      cache.cacheUrl("https://example.com/cover.jpg", true),
    ).resolves.toBe(true);
    expect(cache.resolveCachedUrl("https://example.com/cover.jpg")).toContain(
      ".jpg",
    );
    expect(cache.getSizeBytes()).toBe(8);
  });

  it("never stores a response that completes after pending writes are cancelled", async () => {
    const adapter = createAdapter();
    const fetchControl: {
      resolve?: (response: ImageCacheFetchResponse) => void;
    } = {};
    const cache = createCache(adapter, {
      fetchImage: () =>
        new Promise<ImageCacheFetchResponse>((resolve) => {
          fetchControl.resolve = resolve;
        }),
      now: () => 100,
    });

    await cache.initialize();
    const pending = cache.cacheUrl("https://example.com/cover.jpg");
    cache.cancelPendingWrites();
    fetchControl.resolve?.(jpegResponse());

    await expect(pending).resolves.toBe(false);
    expect(cache.getSizeBytes()).toBe(0);
    expect(adapter.binaryPaths()).toEqual([]);
    expect(cache.resolveCachedUrl("https://example.com/cover.jpg")).toBeNull();
  });

  it("treats a file removed outside the cache as already removed when evicting", async () => {
    const adapter = createAdapter();
    let currentTime = 100;
    const cache = createCache(adapter, {
      fetchImage: async () => jpegResponse(8),
      maxCacheBytes: 12,
      now: () => currentTime,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/older.jpg");
    const [olderPath] = adapter.binaryPaths();
    adapter.deleteExternally(olderPath);
    currentTime = 200;

    await expect(cache.cacheUrl("https://example.com/newer.jpg")).resolves.toBe(
      true,
    );
    expect(cache.resolveCachedUrl("https://example.com/older.jpg")).toBeNull();
    expect(cache.getSizeBytes()).toBe(8);
  });
});
