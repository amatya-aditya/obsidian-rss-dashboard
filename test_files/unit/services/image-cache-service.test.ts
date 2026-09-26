import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ImageCacheService,
  type ImageCacheAdapter,
  type ImageCacheFetchResponse,
} from "../../../src/services/image-cache-service";

interface FakeImageCacheAdapter extends ImageCacheAdapter {
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
    exists: vi.fn(async (path: string) =>
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

describe("ImageCacheService", () => {
  it("preserves an explicit unlimited aggregate limit during initialization", () => {
    const cache = new ImageCacheService({
      adapter: createAdapter(),
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage: async () => jpegResponse(),
      maxCacheBytes: null,
    });

    expect(
      (cache as unknown as { maxCacheBytes: number | null }).maxCacheBytes,
    ).toBeNull();
  });

  it("uses one cache entry for URLs that differ only by fragment", async () => {
    const adapter = createAdapter();
    const fetchImage = vi.fn(async () => jpegResponse());
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage,
      now: () => 100,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/cover.jpg?size=large#first");

    expect(
      cache.resolveCachedUrl("https://example.com/cover.jpg?size=large#second"),
    ).toContain(".jpg");
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it("does not store responses larger than one MiB", async () => {
    const adapter = createAdapter();
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage: async () => jpegResponse(1_048_577),
      now: () => 100,
    });

    await cache.initialize();

    await expect(cache.cacheUrl("https://example.com/large.jpg")).resolves.toBe(
      false,
    );
    expect(cache.getSizeBytes()).toBe(0);
    expect(cache.resolveCachedUrl("https://example.com/large.jpg")).toBeNull();
  });

  it("rejects an HTML response that claims to be a preview image", async () => {
    const adapter = createAdapter();
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage: async () => ({
        status: 200,
        headers: { "content-type": "image/jpeg" },
        arrayBuffer: new TextEncoder().encode("<html>not an image</html>").buffer,
      }),
      now: () => 100,
    });

    await cache.initialize();

    await expect(cache.cacheUrl("https://example.com/error.jpg")).resolves.toBe(
      false,
    );
    expect(cache.getSizeBytes()).toBe(0);
  });

  it("evicts the least recently used entry before exceeding its total limit", async () => {
    const adapter = createAdapter();
    let currentTime = 100;
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
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

  it("trims least recently used entries immediately when a lower finite limit is saved", async () => {
    const adapter = createAdapter();
    let currentTime = 100;
    const fetchImage = vi.fn(async () => jpegResponse(8));
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage,
      maxCacheBytes: 24,
      now: () => currentTime,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/older.jpg");
    currentTime = 200;
    await cache.cacheUrl("https://example.com/newer.jpg");

    await cache.setMaxCacheBytes(8);

    expect(cache.resolveCachedUrl("https://example.com/older.jpg")).toBeNull();
    expect(cache.resolveCachedUrl("https://example.com/newer.jpg")).toContain(
      ".jpg",
    );
    expect(cache.getSizeBytes()).toBe(8);
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  it("supports an unlimited aggregate limit without refetching fresh entries", async () => {
    const adapter = createAdapter();
    const fetchImage = vi.fn(async () => jpegResponse(8));
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage,
      maxCacheBytes: 8,
      now: () => 100,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/first.jpg");
    await cache.setMaxCacheBytes(null);
    await cache.cacheUrl("https://example.com/second.jpg");
    await cache.cacheUrl("https://example.com/first.jpg");

    expect(cache.getSizeBytes()).toBe(16);
    expect(cache.resolveCachedUrl("https://example.com/first.jpg")).toContain(
      ".jpg",
    );
    expect(cache.resolveCachedUrl("https://example.com/second.jpg")).toContain(
      ".jpg",
    );
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  it("clears only indexed image files and resets the cache size", async () => {
    const adapter = createAdapter();
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage: async () => jpegResponse(),
      now: () => 100,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/cover.jpg");

    await expect(cache.clear()).resolves.toEqual({ cleared: 1, failed: 0 });
    expect(cache.getSizeBytes()).toBe(0);
    expect(cache.resolveCachedUrl("https://example.com/cover.jpg")).toBeNull();
  });

  it("removes only the requested cached preview URLs", async () => {
    const adapter = createAdapter();
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage: async () => jpegResponse(),
      now: () => 100,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/deleted.jpg");
    await cache.cacheUrl("https://example.com/retained.jpg");

    await expect(
      cache.removeUrls(["https://example.com/deleted.jpg#fragment"]),
    ).resolves.toEqual({ cleared: 1, failed: 0 });
    expect(cache.resolveCachedUrl("https://example.com/deleted.jpg")).toBeNull();
    expect(cache.resolveCachedUrl("https://example.com/retained.jpg")).toContain(
      ".jpg",
    );
  });

  it("replaces an aged entry only when refresh work explicitly requests it", async () => {
    const adapter = createAdapter();
    let currentTime = 100;
    const fetchImage = vi.fn(async () => jpegResponse());
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
      fetchImage,
      now: () => currentTime,
    });

    await cache.initialize();
    await cache.cacheUrl("https://example.com/cover.jpg");
    currentTime += 31 * 24 * 60 * 60 * 1_000;

    expect(cache.isStale("https://example.com/cover.jpg")).toBe(true);
    await cache.cacheUrl("https://example.com/cover.jpg");
    await cache.cacheUrl("https://example.com/cover.jpg", true);

    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  it("does not write a response that completes after pending writes are cancelled", async () => {
    const adapter = createAdapter();
    const fetchControl: {
      resolve?: (response: ImageCacheFetchResponse) => void;
    } = {};
    const cache = new ImageCacheService({
      adapter,
      cacheRoot: "config/plugins/rss-dashboard/image-cache",
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
  });

  describe("when a cached file was deleted during the session", () => {
    const cacheRoot = "config/plugins/rss-dashboard/image-cache";

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("evicts the missing entry and keeps caching new images", async () => {
      const adapter = createAdapter();
      let currentTime = 100;
      const cache = new ImageCacheService({
        adapter,
        cacheRoot,
        fetchImage: async () => jpegResponse(8),
        maxCacheBytes: 12,
        now: () => currentTime,
      });

      await cache.initialize();
      await cache.cacheUrl("https://example.com/older.jpg");
      const [olderPath] = adapter.binaryPaths();
      adapter.deleteExternally(olderPath);
      currentTime = 200;

      await expect(cache.cacheUrl("https://example.com/newer.jpg")).resolves.toBe(true);
      expect(cache.resolveCachedUrl("https://example.com/older.jpg")).toBeNull();
      currentTime = 300;
      await expect(cache.cacheUrl("https://example.com/latest.jpg")).resolves.toBe(true);
      expect(cache.resolveCachedUrl("https://example.com/latest.jpg")).toContain(".jpg");
      expect(cache.getSizeBytes()).toBe(8);
    });

    it("drops the missing entry when a lower limit is saved", async () => {
      const adapter = createAdapter();
      let currentTime = 100;
      const cache = new ImageCacheService({
        adapter,
        cacheRoot,
        fetchImage: async () => jpegResponse(8),
        maxCacheBytes: 24,
        now: () => currentTime,
      });

      await cache.initialize();
      await cache.cacheUrl("https://example.com/older.jpg");
      const [olderPath] = adapter.binaryPaths();
      currentTime = 200;
      await cache.cacheUrl("https://example.com/newer.jpg");
      adapter.deleteExternally(olderPath);

      await expect(cache.setMaxCacheBytes(8)).resolves.toBeUndefined();
      expect(cache.resolveCachedUrl("https://example.com/older.jpg")).toBeNull();
      expect(cache.getSizeBytes()).toBe(8);
    });

    it("counts the missing file as cleared on clear()", async () => {
      const adapter = createAdapter();
      const cache = new ImageCacheService({
        adapter,
        cacheRoot,
        fetchImage: async () => jpegResponse(),
        now: () => 100,
      });

      await cache.initialize();
      await cache.cacheUrl("https://example.com/deleted.jpg");
      const [deletedPath] = adapter.binaryPaths();
      await cache.cacheUrl("https://example.com/present.jpg");
      adapter.deleteExternally(deletedPath);

      await expect(cache.clear()).resolves.toEqual({ cleared: 2, failed: 0 });
      expect(cache.getSizeBytes()).toBe(0);
      expect(cache.resolveCachedUrl("https://example.com/deleted.jpg")).toBeNull();
    });

    it("counts the missing file as cleared on removeUrls()", async () => {
      const adapter = createAdapter();
      const cache = new ImageCacheService({
        adapter,
        cacheRoot,
        fetchImage: async () => jpegResponse(),
        now: () => 100,
      });

      await cache.initialize();
      await cache.cacheUrl("https://example.com/deleted.jpg");
      const [deletedPath] = adapter.binaryPaths();
      await cache.cacheUrl("https://example.com/retained.jpg");
      adapter.deleteExternally(deletedPath);

      await expect(
        cache.removeUrls(["https://example.com/deleted.jpg"]),
      ).resolves.toEqual({ cleared: 1, failed: 0 });
      expect(cache.resolveCachedUrl("https://example.com/deleted.jpg")).toBeNull();
      expect(cache.resolveCachedUrl("https://example.com/retained.jpg")).toContain(".jpg");
    });

    it("still reports other removal errors as failures and keeps the entry", async () => {
      const adapter = createAdapter();
      const cache = new ImageCacheService({
        adapter,
        cacheRoot,
        fetchImage: async () => jpegResponse(),
        now: () => 100,
      });
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await cache.initialize();
      await cache.cacheUrl("https://example.com/locked.jpg");
      vi.mocked(adapter.remove).mockRejectedValueOnce(
        Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" }),
      );

      await expect(cache.clear()).resolves.toEqual({ cleared: 0, failed: 1 });
      expect(cache.resolveCachedUrl("https://example.com/locked.jpg")).toContain(".jpg");
    });
  });
});
