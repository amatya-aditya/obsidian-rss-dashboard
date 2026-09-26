import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";

import RssDashboardPlugin from "../../../main";
import type { FeedItem, Folder } from "../../../src/types/types";
import { MastodonService } from "../../../src/services/mastodon-service";
import { MediaService } from "../../../src/services/media-service";
import {
  PLUGIN_DATA_PATH,
  TEMPLATE_DIR,
} from "../../../scripts/generate-fixture-vault.mjs";
import { convertStorage } from "../../../scripts/setup-fixture-vault.mjs";

// Loads the committed fixture vault through the plugin's real startup path
// (loadSettings: bootstrap pointer, vault metadata, shard hydration, and
// user-state), so the fixture cannot silently drift from the schema.

// The template keeps Obsidian's config in the default folder; the mock vault
// names its config folder differently, so paths under it are remapped.
const TEMPLATE_CONFIG_DIR = PLUGIN_DATA_PATH.split("/")[0];
const SHARD_FOLDER = "rss-dashboard-data/feeds";

// The seeded scenario counts documented in docs/development/fixture-vault.md.
const EXPECTED = {
  feeds: 11,
  articles: 153,
  read: 48,
  starred: 9,
  tagged: 9,
  saved: 1,
  withPlaybackProgress: 2,
  tags: ["Important", "Read later", "Video", "Podcast", "Research", "Reference", "RSS", "Unused"],
};

const temporaryDirectories: string[] = [];

function manifest(app: App): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: `${app.vault.configDir}/plugins/rss-dashboard`,
  };
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Copies every file of a vault folder on disk into the mock vault. */
async function mountVault(app: App, vaultDir: string): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const file of listFiles(vaultDir)) {
    const templatePath = relative(vaultDir, file).replace(/\\/g, "/");
    const vaultPath = templatePath.startsWith(`${TEMPLATE_CONFIG_DIR}/`)
      ? `${app.vault.configDir}${templatePath.slice(TEMPLATE_CONFIG_DIR.length)}`
      : templatePath;
    const parent = vaultPath.includes("/")
      ? vaultPath.slice(0, vaultPath.lastIndexOf("/"))
      : "";
    if (parent) await app.vault.adapter.mkdir(parent);
    const content = readFileSync(file, "utf8");
    await app.vault.adapter.write(vaultPath, content);
    contents.set(vaultPath, content);
  }
  return contents;
}

interface LoadedVault {
  plugin: RssDashboardPlugin;
  app: App;
  files: Map<string, string>;
}

/** Starts the plugin's settings load against a vault folder on disk. */
async function loadVault(vaultDir: string): Promise<LoadedVault> {
  const app = App.createMock();
  const files = await mountVault(app, vaultDir);
  const plugin = new RssDashboardPlugin(app, manifest(app));
  const pluginData = files.get(`${manifest(app).dir}/data.json`);
  plugin.loadData = vi.fn().mockResolvedValue(pluginData ? JSON.parse(pluginData) : null);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  await plugin.loadSettings();
  return { plugin, app, files };
}

function allArticles(plugin: RssDashboardPlugin): FeedItem[] {
  return plugin.settings.feeds.flatMap((feed) => feed.items);
}

function countWhere(plugin: RssDashboardPlugin, predicate: (item: FeedItem) => boolean) {
  return allArticles(plugin).filter(predicate).length;
}

function folderPaths(folders: Folder[], parent = ""): string[] {
  return folders.flatMap((folder) => {
    const path = parent ? `${parent}/${folder.name}` : folder.name;
    return [path, ...folderPaths(folder.subfolders, path)];
  });
}

function copyTemplateAs(storage: "shard-v1" | "legacy-json"): string {
  const directory = mkdtempSync(join(tmpdir(), "rss-dashboard-fixture-vault-"));
  temporaryDirectories.push(directory);
  cpSync(TEMPLATE_DIR, directory, { recursive: true });
  convertStorage(directory, storage);
  return directory;
}

function expectSeededContent(plugin: RssDashboardPlugin): void {
  expect(plugin.settings.feeds).toHaveLength(EXPECTED.feeds);
  expect(allArticles(plugin)).toHaveLength(EXPECTED.articles);
  expect(countWhere(plugin, (item) => item.read === true)).toBe(EXPECTED.read);
  expect(countWhere(plugin, (item) => item.starred === true)).toBe(EXPECTED.starred);
  expect(countWhere(plugin, (item) => (item.tags ?? []).length > 0)).toBe(EXPECTED.tagged);
  expect(countWhere(plugin, (item) => item.saved === true)).toBe(EXPECTED.saved);
  expect(countWhere(plugin, (item) => item.playbackProgress !== undefined)).toBe(
    EXPECTED.withPlaybackProgress,
  );
  expect(plugin.settings.availableTags.map((tag) => tag.name)).toEqual(EXPECTED.tags);
}

let notices: string[];
let errors: unknown[][];

beforeEach(() => {
  notices = [];
  errors = [];
  // The Obsidian stub reports each Notice through console.debug.
  vi.spyOn(console, "debug").mockImplementation((...args: unknown[]) => {
    if (args[0] === "[Stub Notice]") notices.push(String(args[1]));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.empty();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Fixture vault template", () => {
  it("loads its Shard storage v2 data without notices, errors, or default settings", async () => {
    const { plugin } = await loadVault(TEMPLATE_DIR);

    expect(notices).toEqual([]);
    expect(errors).toEqual([]);
    expect(plugin.settings.storageMode).toBe("vault-shards-v2");
    expect(plugin.settings.storageFolder).toBe(SHARD_FOLDER);
    expect(plugin.settings.metadataStorageMode).toBe("vault-location");
    expect(plugin.settings.metadataStorageFolder).toBe("rss-dashboard-data");
    expect(plugin.isUserStateUnreadable).toBe(false);
    expect(plugin.isShardFolderHiddenFromSync).toBe(false);
    for (const feed of plugin.settings.feeds) {
      expect(plugin.getFeedShardHealth(feed), feed.title).toBeNull();
    }
    expectSeededContent(plugin);
  });

  it("covers every feed type, the root, nested folders, and an empty folder", async () => {
    const { plugin } = await loadVault(TEMPLATE_DIR);
    const { feeds, folders, media } = plugin.settings;

    expect(feeds.some((feed) => MediaService.isYouTubeFeed(feed.url))).toBe(true);
    expect(feeds.some((feed) => feed.mediaType === "podcast")).toBe(true);
    expect(feeds.some((feed) => MastodonService.isResolvedFeedUrl(feed.url))).toBe(true);
    expect(feeds.some((feed) => feed.folder === media.defaultSmallwebFolder)).toBe(true);
    expect(feeds.some((feed) => feed.folder === "")).toBe(true);

    const paths = folderPaths(folders);
    expect(paths).toContain("News/Tech/Releases");
    for (const feed of feeds.filter((candidate) => candidate.folder)) {
      expect(paths, feed.title).toContain(feed.folder);
    }
    const emptyFolders = paths.filter(
      (path) => !feeds.some((feed) => feed.folder === path || feed.folder.startsWith(`${path}/`)),
    );
    expect(emptyFolders).toEqual(["Empty"]);

    const itemCounts = feeds.map((feed) => feed.items.length);
    expect(itemCounts).toContain(0);
    expect(itemCounts).toContain(1);
    expect(Math.max(...itemCounts)).toBeGreaterThanOrEqual(100);
  });

  it("seeds the article states the manual test scenarios rely on", async () => {
    const { plugin } = await loadVault(TEMPLATE_DIR);
    const articles = allArticles(plugin);

    expect(articles.some((item) => item.pubDate === "")).toBe(true);
    expect(articles.some((item) => item.restrictedReason)).toBe(true);
    expect(articles.some((item) => item.starredImportContentState === "unfetched")).toBe(true);
    expect(articles.some((item) => (item.content ?? "").length > 10_000)).toBe(true);
    expect(articles.some((item) => item.coverImage)).toBe(true);
    expect(articles.some((item) => !item.coverImage)).toBe(true);
    expect(
      articles.some(
        (item) => item.mediaType === "podcast" && item.playbackProgress !== undefined,
      ),
    ).toBe(true);
    expect(articles.some((item) => (item.tags ?? []).length >= 2)).toBe(true);
    expect(plugin.settings.feeds.some((feed) => feed.lastFetchError)).toBe(true);

    const saved = articles.find((item) => item.saved);
    expect(saved?.savedFilePath).toBeTruthy();
    expect(readdirSync(join(TEMPLATE_DIR, "saved-articles"))).toContain(
      saved?.savedFilePath?.split("/").pop(),
    );
  });

  it("does not rewrite its article shards when the plugin loads it", async () => {
    const { app, files } = await loadVault(TEMPLATE_DIR);

    const shardPaths = [...files.keys()].filter((path) => path.startsWith(`${SHARD_FOLDER}/`));
    expect(shardPaths).toHaveLength(EXPECTED.feeds);
    for (const path of shardPaths) {
      expect(await app.vault.adapter.read(path), path).toBe(files.get(path));
    }
  });
});

describe("Fixture vault deprecated storage variants", () => {
  it("loads the same content from Legacy JSON storage", async () => {
    const { plugin } = await loadVault(copyTemplateAs("legacy-json"));

    expect(notices).toEqual([]);
    expect(errors).toEqual([]);
    expect(plugin.settings.storageMode).toBe("legacy-json");
    expectSeededContent(plugin);
  });

  it("loads the same content from Shard storage v1", async () => {
    const { plugin } = await loadVault(copyTemplateAs("shard-v1"));

    expect(notices).toEqual([]);
    expect(errors).toEqual([]);
    expect(plugin.settings.storageMode).toBe("vault-shards");
    for (const feed of plugin.settings.feeds) {
      expect(plugin.getFeedShardHealth(feed), feed.title).toBeNull();
    }
    expectSeededContent(plugin);
  });
});
