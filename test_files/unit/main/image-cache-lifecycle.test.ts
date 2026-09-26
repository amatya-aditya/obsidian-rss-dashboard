/**
 * Image cache folder lifecycle (main.ts)
 *
 * The cache directory (and its index.json) must only exist while
 * "Allow image caching" is enabled, and must live inside the folder the plugin
 * is actually installed in (manifest.dir), not a folder derived from manifest.id.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import RssDashboardPlugin from "../../../main";
import { App, type PluginManifest } from "obsidian";

const CONFIG_DIR = "custom-config";
const INSTALL_DIR = `${CONFIG_DIR}/plugins/obsidian-rss-dashboard`;

interface FakeAdapter {
  files: Map<string, string>;
  dirs: Set<string>;
  exists: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  rmdir: ReturnType<typeof vi.fn>;
  readBinary: ReturnType<typeof vi.fn>;
  writeBinary: ReturnType<typeof vi.fn>;
  getResourcePath: ReturnType<typeof vi.fn>;
}

function createFakeAdapter(): FakeAdapter {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    exists: vi.fn(async (p: string) => files.has(p) || dirs.has(p)),
    mkdir: vi.fn(async (p: string) => {
      dirs.add(p);
    }),
    read: vi.fn(async (p: string) => files.get(p) ?? ""),
    write: vi.fn(async (p: string, data: string) => {
      files.set(p, data);
    }),
    remove: vi.fn(async (p: string) => {
      files.delete(p);
    }),
    rmdir: vi.fn(async (p: string) => {
      dirs.delete(p);
      for (const key of [...files.keys()]) {
        if (key.startsWith(`${p}/`)) files.delete(key);
      }
    }),
    readBinary: vi.fn(),
    writeBinary: vi.fn(),
    getResourcePath: vi.fn((p: string) => `app://${p}`),
  };
}

function createPlugin(adapter: FakeAdapter, allowImageCaching: boolean) {
  const app = App.createMock();
  (app.vault as unknown as { adapter: unknown }).adapter = adapter;
  const manifest: PluginManifest = {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: INSTALL_DIR,
  };
  const plugin = new RssDashboardPlugin(app, manifest);
  plugin.settings = structuredClone(DEFAULT_SETTINGS);
  plugin.settings.display.allowImageCaching = allowImageCaching;
  plugin.saveSettings = vi.fn().mockResolvedValue(undefined);
  return plugin;
}

type CachePrivateAPI = { initializeImageCache: () => Promise<void> };

const allCreatedPaths = (adapter: FakeAdapter): string[] => [
  ...adapter.dirs,
  ...adapter.files.keys(),
];

describe("image cache folder lifecycle", () => {
  let adapter: FakeAdapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    adapter = createFakeAdapter();
  });

  it("creates nothing on load when image caching is disabled", async () => {
    const plugin = createPlugin(adapter, false);

    await (plugin as unknown as CachePrivateAPI).initializeImageCache();

    expect(adapter.mkdir).not.toHaveBeenCalled();
    expect(adapter.write).not.toHaveBeenCalled();
    expect(allCreatedPaths(adapter)).toEqual([]);
  });

  it("creates the cache inside the plugin install directory when enabled on load", async () => {
    const plugin = createPlugin(adapter, true);

    await (plugin as unknown as CachePrivateAPI).initializeImageCache();

    expect(adapter.dirs.has(`${INSTALL_DIR}/image-cache`)).toBe(true);
    expect(adapter.files.has(`${INSTALL_DIR}/image-cache/index.json`)).toBe(
      true,
    );
    expect(
      allCreatedPaths(adapter).filter((p) => p.startsWith("rss-dashboard")),
    ).toEqual([]);
    expect(
      allCreatedPaths(adapter).filter((p) =>
        p.startsWith(`${CONFIG_DIR}/plugins/rss-dashboard/`),
      ),
    ).toEqual([]);
  });

  it("creates the cache when the setting is switched on", async () => {
    const plugin = createPlugin(adapter, false);
    await (plugin as unknown as CachePrivateAPI).initializeImageCache();

    await plugin.setImageCachingEnabled(true);

    expect(adapter.files.has(`${INSTALL_DIR}/image-cache/index.json`)).toBe(
      true,
    );
  });

  it("removes the cache folder when the setting is switched off", async () => {
    const plugin = createPlugin(adapter, true);
    await (plugin as unknown as CachePrivateAPI).initializeImageCache();

    await plugin.setImageCachingEnabled(false);

    expect(adapter.dirs.has(`${INSTALL_DIR}/image-cache`)).toBe(false);
    expect(adapter.files.has(`${INSTALL_DIR}/image-cache/index.json`)).toBe(
      false,
    );
  });
});
