/**
 * A settings save never writes over a synced `data.json` group it has not
 * loaded (#1431).
 *
 * Another device changes one settings group and the change syncs in; a local
 * save of a different group then used to write the in-memory settings over
 * it. These tests drive the plugin facade through a mocked vault with a
 * stateful `data.json` and assert what is on disk and in memory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
import { FeedParser } from "../../../src/services/feed-parser/feed-parser-class";
import type { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import type { FeedShardConflictContext } from "../../../src/services/feed-shard-reconcile";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

const SHARD_FOLDER = ".rss-dashboard-data/feeds";
const VAULT_FOLDER = "Sync/rss";
const VAULT_DATA_PATH = `${VAULT_FOLDER}/data.json`;
const RELOAD_DEBOUNCE_MS = 1_500;

interface VaultAdapterStub {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

function adapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
}

function baseSettings(
  metadataMode: "plugin-default" | "vault-location",
): RssDashboardSettings {
  const base = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  base.metadataStorageMode = metadataMode;
  base.metadataStorageFolder =
    metadataMode === "vault-location" ? VAULT_FOLDER : ".rss-dashboard-data";
  base.startupRefreshDelaySeconds = 3600;
  base.feeds = [];
  return base;
}

interface Harness {
  app: App;
  plugin: RssDashboardPlugin;
  /** The plugin-default `data.json`, as Obsidian's loadData would read it. */
  pluginFile: { current: unknown };
  /** The settings group on disk, whichever file holds the full settings. */
  diskSettings(): Record<string, unknown>;
  /** Another device's change arriving in the settings file. */
  syncIn(change: Record<string, unknown>): Promise<void>;
}

async function startPlugin(
  metadataMode: "plugin-default" | "vault-location",
): Promise<Harness> {
  const app = App.createMock();
  const settings = baseSettings(metadataMode);
  const pluginFile: { current: unknown } = {
    current:
      metadataMode === "vault-location"
        ? {
            metadataStorageMode: "vault-location",
            metadataStorageFolder: VAULT_FOLDER,
          }
        : structuredClone(settings),
  };
  if (metadataMode === "vault-location") {
    await adapter(app).mkdir(VAULT_FOLDER);
    await adapter(app).write(VAULT_DATA_PATH, JSON.stringify(settings));
  }
  const plugin = new RssDashboardPlugin(app, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: "plugins/rss-dashboard",
  } as PluginManifest);
  plugin.loadData = vi.fn(async () => structuredClone(pluginFile.current));
  plugin.saveData = vi.fn(async (data: unknown) => {
    pluginFile.current = structuredClone(data);
  });
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  await plugin.loadSettings();

  const diskSettings = (): Record<string, unknown> => {
    if (metadataMode === "vault-location") {
      const files = (
        app.vault as unknown as { adapterFiles: Map<string, string> }
      ).adapterFiles;
      return JSON.parse(files.get(VAULT_DATA_PATH) ?? "{}") as Record<
        string,
        unknown
      >;
    }
    return pluginFile.current as Record<string, unknown>;
  };
  const syncIn = async (change: Record<string, unknown>): Promise<void> => {
    const next = { ...diskSettings(), ...change };
    if (metadataMode === "vault-location") {
      await adapter(app).write(VAULT_DATA_PATH, JSON.stringify(next));
    } else {
      pluginFile.current = next;
    }
  };
  return { app, plugin, pluginFile, diskSettings, syncIn };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it("records a conflicting local shard before a subsequent settings reload", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "conflict-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "one",
          title: "Original",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/conflict-feed.json`;
  const remote = JSON.parse(await app.vault.adapter.read(path));
  remote.items[0].title = "Synced edit";
  await app.vault.adapter.write(path, JSON.stringify(remote));
  plugin.settings.feeds[0].items[0].title = "Local edit";
  await expect(plugin.saveSettings()).rejects.toThrow(
    "Conflicting article field",
  );
  const store = (
    plugin as unknown as {
      settingsStore: {
        listShardConflicts(): Promise<string[]>;
        readShardConflict(name: string): Promise<FeedShardConflictContext>;
        resolveShardConflict(
          name: string,
          choices: Record<string, "local" | "synced">,
          displayedContext?: FeedShardConflictContext,
        ): Promise<boolean>;
      };
    }
  ).settingsStore;
  const files = await store.listShardConflicts();
  expect(files).toHaveLength(1);
  const recovery = await store.readShardConflict(files[0]);
  expect(recovery.local.items[0].title).toBe("Local edit");
  expect(recovery.incoming.items[0].title).toBe("Synced edit");
  const urlChangedContext = await store.readShardConflict(files[0]);
  plugin.settings.feeds[0].url = "https://example.com/changed-feed";
  expect(
    await store.resolveShardConflict(
      files[0],
      { one: "local" },
      urlChangedContext,
    ),
  ).toBe(false);
  expect(await store.listShardConflicts()).toEqual(files);
  plugin.settings.feeds[0].url = "https://example.com/feed";
  await plugin.loadSettings();
  expect((await store.readShardConflict(files[0])).local.items[0].title).toBe(
    "Local edit",
  );
  expect(plugin.settings.feeds[0].items[0].title).toBe("Local edit");
  const names = await store.listShardConflicts();
  expect(names).toHaveLength(1);
  const displayedContext = await store.readShardConflict(names[0]);
  const newer = structuredClone(remote);
  newer.items[0].title = "Newer synced edit";
  await app.vault.adapter.write(path, JSON.stringify(newer));
  expect(
    await store.resolveShardConflict(
      names[0],
      { one: "local" },
      displayedContext,
    ),
  ).toBe(false);
  expect(await store.listShardConflicts()).toEqual(names);
  expect(JSON.parse(await app.vault.adapter.read(path)).items[0].title).toBe(
    "Newer synced edit",
  );
  await app.vault.adapter.write(path, JSON.stringify(remote));
  const originalWrite = app.vault.adapter.write.bind(app.vault.adapter);
  const failedWrite = vi
    .spyOn(app.vault.adapter, "write")
    .mockImplementation(async (candidate, content) => {
      if (candidate === path) throw new Error("write failed");
      await originalWrite(candidate, content);
    });
  await expect(
    store.resolveShardConflict(names[0], { one: "local" }),
  ).rejects.toThrow("write failed");
  expect(await store.listShardConflicts()).toEqual(names);
  expect(JSON.parse(await app.vault.adapter.read(path)).items[0].title).toBe(
    "Synced edit",
  );
  failedWrite.mockRestore();
  expect(await store.resolveShardConflict(names[0], { one: "local" })).toBe(
    true,
  );
  expect(JSON.parse(await app.vault.adapter.read(path)).items[0].title).toBe(
    "Local edit",
  );
  expect(await store.listShardConflicts()).toEqual([]);
  await plugin.loadSettings();
  expect(plugin.settings.feeds[0].items[0].title).toBe("Local edit");
});

it("protects unsaved local article edits when a synced shard triggers reload first", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "conflict-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "one",
          title: "Original",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/conflict-feed.json`;
  const remote = JSON.parse(await app.vault.adapter.read(path));
  remote.items[0].title = "Synced edit";
  await app.vault.adapter.write(path, JSON.stringify(remote));
  plugin.settings.feeds[0].items[0].title = "Local edit";
  await plugin.loadSettings();
  expect(plugin.settings.feeds[0].items[0].title).toBe("Local edit");
  expect(JSON.parse(await app.vault.adapter.read(path)).items[0].title).toBe(
    "Synced edit",
  );
  const store = (
    plugin as unknown as {
      settingsStore: {
        listShardConflicts(): Promise<string[]>;
        readShardConflict(
          name: string,
        ): Promise<{ local: { items: Feed["items"] } }>;
      };
    }
  ).settingsStore;
  const files = await store.listShardConflicts();
  expect(files).toHaveLength(1);
  expect((await store.readShardConflict(files[0])).local.items[0].title).toBe(
    "Local edit",
  );
});

it("keeps a new unsaved feed in memory when a reload starts before its first save", async () => {
  const { plugin } = await startPlugin("plugin-default");
  plugin.settings.feeds = [
    {
      feedId: "new-feed",
      title: "New feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "one",
          title: "Pending article",
          link: "https://example.com/one",
          description: "",
          pubDate: "",
          feedTitle: "New feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.loadSettings();
  expect(plugin.settings.feeds[0]?.items[0]?.title).toBe("Pending article");
  await plugin.saveSettings();
  await plugin.loadSettings();
  expect(plugin.settings.feeds[0]?.items[0]?.title).toBe("Pending article");
});

it("keeps edits made while a pre-reload shard write is in flight", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "conflict-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "one",
          title: "Original",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/conflict-feed.json`;
  plugin.settings.feeds[0].items[0].title = "First edit";
  const write = app.vault.adapter.write.bind(app.vault.adapter);
  let started!: () => void;
  let release!: () => void;
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  vi.spyOn(app.vault.adapter, "write").mockImplementation(
    async (name, content) => {
      if (name === path && !held) {
        held = true;
        started();
        await proceed;
      }
      await write(name, content);
    },
  );
  const loading = plugin.loadSettings();
  await writing;
  plugin.settings.feeds[0].items[0].title = "Later edit";
  release();
  await loading;
  expect(plugin.settings.feeds[0].items[0].title).toBe("Later edit");
  expect(JSON.parse(await app.vault.adapter.read(path)).items[0].title).toBe(
    "Later edit",
  );
});

it("persists article edits made after hydration but before a synced reload completes", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  plugin.settings.feeds = [
    {
      feedId: "reload-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "article",
          title: "Before reload",
          link: "https://example.com/article",
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const repository = (
    plugin as unknown as { feedStorageRepository: FeedStorageRepository }
  ).feedStorageRepository;
  const hydrate = repository.hydrateSettings.bind(repository);
  vi.spyOn(repository, "hydrateSettings").mockImplementation(
    async (...args) => {
      const result = await hydrate(...args);
      plugin.settings.feeds[0].items[0].title = "Edited during reload";
      return result;
    },
  );

  await plugin.loadSettings();

  expect(plugin.settings.feeds[0].items[0].title).toBe("Edited during reload");
  const disk = JSON.parse(
    await app.vault.adapter.read(`${SHARD_FOLDER}/reload-feed.json`),
  );
  expect(disk.items[0].title).toBe("Edited during reload");
});

it("keeps a retryable recovery record when a local edit arrives during resolution", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "conflict-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "one",
          title: "Original",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/conflict-feed.json`;
  const remote = JSON.parse(await app.vault.adapter.read(path));
  remote.items[0].title = "Synced edit";
  await app.vault.adapter.write(path, JSON.stringify(remote));
  plugin.settings.feeds[0].items[0].title = "Local edit";
  await expect(plugin.saveSettings()).rejects.toThrow(
    "Conflicting article field",
  );
  const store = (
    plugin as unknown as {
      settingsStore: {
        listShardConflicts(): Promise<string[]>;
        readShardConflict(name: string): Promise<{
          local: { items: Feed["items"] };
          incoming: { items: Feed["items"] };
        }>;
        resolveShardConflict(
          name: string,
          choices: Record<string, "local" | "synced">,
        ): Promise<boolean>;
      };
    }
  ).settingsStore;
  const first = (await store.listShardConflicts())[0];
  const write = app.vault.adapter.write.bind(app.vault.adapter);
  let notify!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  vi.spyOn(app.vault.adapter, "write").mockImplementation(
    async (name, content) => {
      if (name === path && !held) {
        held = true;
        notify();
        await proceed;
      }
      await write(name, content);
    },
  );
  const resolving = store.resolveShardConflict(first, { one: "local" });
  await started;
  plugin.settings.feeds[0].items[0].title = "Later local edit";
  release();
  expect(await resolving).toBe(false);
  const records = await store.listShardConflicts();
  expect(records.length).toBeGreaterThan(1);
  const latest = records[records.length - 1];
  expect((await store.readShardConflict(latest)).local.items[0].title).toBe(
    "Later local edit",
  );
  expect(await store.resolveShardConflict(latest, {})).toBe(true);
  expect(JSON.parse(await app.vault.adapter.read(path)).items[0].title).toBe(
    "Later local edit",
  );
  expect(await store.listShardConflicts()).toContain(first);
  expect((await store.readShardConflict(first)).incoming.items[0]?.title).toBe(
    "Later local edit",
  );
});

it("hydrates synced settings but skips load-triggered writes when recovery exists at startup", async () => {
  const { app, plugin, pluginFile } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "conflict-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "one",
          title: "Original",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/conflict-feed.json`;
  const remote = JSON.parse(await app.vault.adapter.read(path));
  remote.items[0].title = "Synced edit";
  await app.vault.adapter.write(path, JSON.stringify(remote));
  plugin.settings.feeds[0].items[0].title = "Local edit";
  await expect(plugin.saveSettings()).rejects.toThrow(
    "Conflicting article field",
  );

  // Force a migration-style load save. Startup must find the recovery record
  // before this normalization can rewrite the synced metadata file.
  const loaded = pluginFile.current as RssDashboardSettings;
  loaded.feeds.push(structuredClone(loaded.feeds[0]));
  pluginFile.current = structuredClone(loaded);
  const restart = new RssDashboardPlugin(app, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: "plugins/rss-dashboard",
  } as PluginManifest);
  restart.loadData = vi.fn(async () => structuredClone(pluginFile.current));
  const saveData = vi.fn(async (data: unknown) => {
    pluginFile.current = structuredClone(data);
  });
  restart.saveData = saveData;
  await restart.loadSettings();

  expect(restart.settings.feeds).toHaveLength(1);
  expect(restart.settings.feeds[0].items[0].title).toBe("Synced edit");
  expect(saveData).not.toHaveBeenCalled();
  expect((pluginFile.current as RssDashboardSettings).feeds).toHaveLength(2);
  const recovery = (
    app as unknown as { loadLocalStorage(key: string): string }
  ).loadLocalStorage("feed-shard-conflict-recovery-v1");
  expect(Object.keys(JSON.parse(recovery))).toHaveLength(1);
});

it("keeps live edits when conflict recovery cannot be written and reload begins", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "conflict-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "one",
          title: "Original",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/conflict-feed.json`;
  const remote = JSON.parse(await app.vault.adapter.read(path));
  remote.items[0].title = "Synced edit";
  await app.vault.adapter.write(path, JSON.stringify(remote));
  plugin.settings.feeds[0].items[0].title = "Local edit";
  const write = app.saveLocalStorage.bind(app);
  vi.spyOn(app, "saveLocalStorage").mockImplementation((name, content) => {
    if (name === "feed-shard-conflict-recovery-v1")
      throw new Error("storage full");
    write(name, content);
  });
  await expect(plugin.saveSettings()).rejects.toThrow("storage full");
  await plugin.loadSettings();
  expect(plugin.settings.feeds[0].items[0].title).toBe("Local edit");
  expect(JSON.parse(await app.vault.adapter.read(path)).items[0].title).toBe(
    "Synced edit",
  );
});

it("records later local edits made while conflict recovery is being written", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "conflict-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      items: [
        {
          guid: "one",
          title: "Original",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/conflict-feed.json`;
  const remote = JSON.parse(await app.vault.adapter.read(path));
  remote.items[0].title = "Synced edit";
  await app.vault.adapter.write(path, JSON.stringify(remote));
  plugin.settings.feeds[0].items[0].title = "First local edit";
  const write = app.saveLocalStorage.bind(app);
  let held = false;
  vi.spyOn(app, "saveLocalStorage").mockImplementation((name, content) => {
    write(name, content);
    if (name === "feed-shard-conflict-recovery-v1" && !held) {
      held = true;
      plugin.settings.feeds[0].items[0].title = "Later local edit";
    }
  });
  const saving = plugin.saveSettings();
  const rejection = expect(saving).rejects.toThrow("Conflicting article field");
  await rejection;
  const store = (
    plugin as unknown as {
      settingsStore: {
        listShardConflicts(): Promise<string[]>;
        readShardConflict(
          name: string,
        ): Promise<{ local: { items: Feed["items"] } }>;
        resolveShardConflict(
          name: string,
          choices: Record<string, "local" | "synced">,
        ): Promise<boolean>;
      };
    }
  ).settingsStore;
  const files = await store.listShardConflicts();
  const copies = await Promise.all(
    files.map((file) => store.readShardConflict(file)),
  );
  expect(
    copies.some((copy) => copy.local.items[0].title === "Later local edit"),
  ).toBe(true);
  expect(
    await store.resolveShardConflict(files[files.length - 1], {
      one: "local",
    }),
  ).toBe(true);
  expect(await store.listShardConflicts()).toEqual([files[0]]);
  expect((await store.readShardConflict(files[0])).local.items[0].title).toBe(
    "First local edit",
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("persists overlapping settings saves in order", async () => {
  const { plugin, pluginFile } = await startPlugin("plugin-default");
  let releaseFirst!: () => void;
  let notifyFirst!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    notifyFirst = resolve;
  });
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let calls = 0;
  plugin.saveData = vi.fn(async (data: unknown) => {
    calls++;
    if (calls === 1) {
      notifyFirst();
      await firstMayFinish;
    }
    pluginFile.current = structuredClone(data);
  });
  plugin.settings.maxItems = 100;
  const first = plugin.saveSettings();
  await firstStarted;
  plugin.settings.maxItems = 200;
  const second = plugin.saveSettings();
  // The second save must not overtake a snapshot already being written.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
  const callsBeforeRelease = calls;
  releaseFirst();
  await Promise.all([first, second]);
  expect(callsBeforeRelease).toBe(1);
  expect((pluginFile.current as RssDashboardSettings).maxItems).toBe(200);
});

it("waits for an already-started save before loading a replacement snapshot", async () => {
  const { plugin, pluginFile } = await startPlugin("plugin-default");
  let releaseWrite!: () => void;
  let notifyWrite!: () => void;
  const writing = new Promise<void>((resolve) => {
    notifyWrite = resolve;
  });
  const mayFinish = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  plugin.saveData = vi.fn(async (data: unknown) => {
    notifyWrite();
    await mayFinish;
    pluginFile.current = structuredClone(data);
  });
  const loadData = vi.mocked(plugin.loadData);
  plugin.settings.maxItems = 177;
  const saving = plugin.saveSettings();
  await writing;
  const initialLoads = loadData.mock.calls.length;
  const loading = plugin.loadSettings();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
  const loadsBeforeRelease = loadData.mock.calls.length;
  releaseWrite();
  await Promise.all([saving, loading]);
  expect(loadsBeforeRelease).toBe(initialLoads);
  expect(plugin.settings.maxItems).toBe(177);
});

it("applies an enrichment result after earlier settings writes settle", async () => {
  const { plugin, pluginFile } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "enrichment-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      refreshEnrichment: true,
      items: [
        {
          guid: "one",
          title: "One",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  let releaseWrite!: () => void;
  let notifyWrite!: () => void;
  const writing = new Promise<void>((resolve) => {
    notifyWrite = resolve;
  });
  const mayFinish = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  plugin.saveData = vi.fn(async (data: unknown) => {
    notifyWrite();
    await mayFinish;
    pluginFile.current = structuredClone(data);
  });
  plugin.settings.maxItems += 1;
  const saving = plugin.saveSettings();
  await writing;
  const store = (
    plugin as unknown as {
      settingsStore: {
        commitEnrichment(
          apply: () => {
            feed: (typeof plugin.settings.feeds)[number];
            rollback(): void;
          } | null,
        ): Promise<boolean>;
      };
    }
  ).settingsStore;
  let applied = false;
  const committing = store.commitEnrichment(() => {
    applied = true;
    const feed = plugin.settings.feeds[0];
    feed.items[0].refreshEnrichment = { url, description: "Page preview" };
    return {
      feed,
      rollback: () => {
        delete feed.items[0].refreshEnrichment;
      },
    };
  });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
  const appliedBeforeRelease = applied;
  releaseWrite();
  await saving;
  expect(await committing).toBe(true);
  expect(appliedBeforeRelease).toBe(false);
  expect(plugin.settings.feeds[0].items[0].refreshEnrichment?.description).toBe(
    "Page preview",
  );
});

it("persists an enrichment outcome in legacy JSON storage", async () => {
  const { plugin, pluginFile } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.storageMode = "legacy-json";
  plugin.settings.feeds = [
    {
      feedId: "legacy-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      refreshEnrichment: true,
      items: [
        {
          guid: "one",
          title: "One",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const store = (
    plugin as unknown as {
      settingsStore: {
        commitEnrichment(
          apply: () => { feed: Feed; rollback(): void } | null,
        ): Promise<boolean>;
      };
    }
  ).settingsStore;
  expect(
    await store.commitEnrichment(() => {
      const feed = plugin.settings.feeds[0];
      feed.items[0].refreshEnrichment = { url, description: "Legacy preview" };
      return {
        feed,
        rollback: () => {
          delete feed.items[0].refreshEnrichment;
        },
      };
    }),
  ).toBe(true);
  const saved = pluginFile.current as RssDashboardSettings;
  expect(saved.feeds[0].items[0].refreshEnrichment?.description).toBe(
    "Legacy preview",
  );
});

it.each(["plugin-default", "vault-location"] as const)(
  "discards legacy enrichment when the feed is disabled during a pending save (%s)",
  async (mode) => {
    const { plugin, diskSettings } = await startPlugin(mode);
    const url = "https://example.com/article";
    plugin.settings.storageMode = "legacy-json";
    const feed: Feed = {
      feedId: "legacy-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      refreshEnrichment: true,
      items: [
        {
          guid: "one",
          title: "One",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    };
    plugin.settings.feeds = [feed];
    await plugin.saveSettings();
    const store = (
      plugin as unknown as {
        settingsStore: {
          commitEnrichment(
            apply: () => { feed: Feed; rollback(): void } | null,
          ): Promise<boolean>;
          settleJournalAppends(): Promise<void>;
        };
      }
    ).settingsStore;
    let release!: () => void;
    let notify!: () => void;
    const started = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(store, "settleJournalAppends").mockImplementation(async () => {
      notify();
      await proceed;
    });
    const committing = store.commitEnrichment(() => {
      feed.items[0].refreshEnrichment = { url, description: "Page preview" };
      return {
        feed,
        rollback: () => {
          delete feed.items[0].refreshEnrichment;
        },
      };
    });
    await started;
    feed.refreshEnrichment = false;
    release();
    expect(await committing).toBe(false);
    expect(feed.items[0].refreshEnrichment).toBeUndefined();
    expect(
      (diskSettings() as unknown as RssDashboardSettings).feeds[0].items[0]
        .refreshEnrichment,
    ).toBeUndefined();
  },
);

it("rolls back an enrichment result when an unseen shard change arrives", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "enrichment-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      refreshEnrichment: true,
      items: [
        {
          guid: "one",
          title: "One",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/enrichment-feed.json`;
  const remote = JSON.parse(await app.vault.adapter.read(path));
  remote.items[0].title = "Synced title";
  const delivered = JSON.stringify(remote);
  await app.vault.adapter.write(path, delivered);
  const store = (
    plugin as unknown as {
      settingsStore: {
        commitEnrichment(
          apply: () => {
            feed: (typeof plugin.settings.feeds)[number];
            rollback(): void;
          } | null,
        ): Promise<boolean>;
      };
    }
  ).settingsStore;
  const committed = await store.commitEnrichment(() => {
    const feed = plugin.settings.feeds[0];
    feed.items[0].refreshEnrichment = { url, description: "Page preview" };
    return {
      feed,
      rollback: () => {
        delete feed.items[0].refreshEnrichment;
      },
    };
  });
  expect(committed).toBe(false);
  expect(plugin.settings.feeds[0].items[0].refreshEnrichment).toBeUndefined();
  expect(await app.vault.adapter.read(path)).toBe(delivered);
});

it("discards a page result if a synced opt-out starts while its shard is checked", async () => {
  const { app, plugin, pluginFile } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  plugin.settings.feeds = [
    {
      feedId: "enrichment-feed",
      title: "Feed",
      url: "https://example.com/feed",
      folder: "",
      lastUpdated: 0,
      refreshEnrichment: true,
      items: [
        {
          guid: "one",
          title: "One",
          link: url,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl: "https://example.com/feed",
          coverImage: "",
        },
      ],
    },
  ];
  await plugin.saveSettings();
  const path = `${SHARD_FOLDER}/enrichment-feed.json`;
  const vaultAdapter = adapter(app);
  const read = vaultAdapter.read.bind(vaultAdapter);
  let releaseRead!: () => void;
  let notifyRead!: () => void;
  const readStarted = new Promise<void>((resolve) => {
    notifyRead = resolve;
  });
  const readMayFinish = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let hold = true;
  vi.spyOn(vaultAdapter, "read").mockImplementation(async (candidate) => {
    if (candidate === path && hold) {
      hold = false;
      notifyRead();
      await readMayFinish;
    }
    return read(candidate);
  });
  const store = (
    plugin as unknown as {
      settingsStore: {
        commitEnrichment(
          apply: () => {
            feed: (typeof plugin.settings.feeds)[number];
            rollback(): void;
          } | null,
        ): Promise<boolean>;
      };
    }
  ).settingsStore;
  const committing = store.commitEnrichment(() => {
    const feed = plugin.settings.feeds[0];
    feed.items[0].refreshEnrichment = { url, description: "Page preview" };
    return {
      feed,
      rollback: () => {
        delete feed.items[0].refreshEnrichment;
      },
    };
  });
  await readStarted;
  const incoming = structuredClone(pluginFile.current) as RssDashboardSettings;
  incoming.feeds[0].refreshEnrichment = false;
  pluginFile.current = incoming;
  const loading = plugin.loadSettings();
  releaseRead();
  expect(await committing).toBe(false);
  await loading;
  expect(plugin.settings.feeds[0].refreshEnrichment).toBe(false);
  expect(plugin.settings.feeds[0].items[0].refreshEnrichment).toBeUndefined();
});

it("does not let a feed-bundle import overtake an enrichment write", async () => {
  const { app, plugin } = await startPlugin("plugin-default");
  const url = "https://example.com/article";
  const feed: Feed = {
    feedId: "enrichment-feed",
    title: "Feed",
    url: "https://example.com/feed",
    folder: "",
    lastUpdated: 0,
    refreshEnrichment: true,
    items: [
      {
        guid: "one",
        title: "One",
        link: url,
        description: "",
        pubDate: "",
        feedTitle: "Feed",
        feedUrl: "https://example.com/feed",
        coverImage: "",
      },
    ],
  };
  plugin.settings.feeds = [feed];
  await plugin.saveSettings();
  const bundle = plugin.getFeedBundle();
  const path = `${SHARD_FOLDER}/enrichment-feed.json`;
  const vaultAdapter = adapter(app);
  const read = vaultAdapter.read.bind(vaultAdapter);
  let releaseRead!: () => void;
  let notifyRead!: () => void;
  const readStarted = new Promise<void>((resolve) => {
    notifyRead = resolve;
  });
  const readMayFinish = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let hold = true;
  vi.spyOn(vaultAdapter, "read").mockImplementation(async (candidate) => {
    if (candidate === path && hold) {
      hold = false;
      notifyRead();
      await readMayFinish;
    }
    return read(candidate);
  });
  const seams = plugin as unknown as {
    settingsStore: {
      commitEnrichment(
        apply: () => { feed: typeof feed; rollback(): void } | null,
      ): Promise<boolean>;
    };
    settingsImportApplier: {
      applyFeedBundleImport(bundle: unknown): Promise<void>;
    };
  };
  const committing = seams.settingsStore.commitEnrichment(() => {
    feed.items[0].refreshEnrichment = { url, description: "Page preview" };
    return {
      feed,
      rollback: () => {
        delete feed.items[0].refreshEnrichment;
      },
    };
  });
  await readStarted;
  const importing = seams.settingsImportApplier.applyFeedBundleImport(bundle);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
  const importedBeforeRelease = plugin.settings.feeds[0] !== feed;
  releaseRead();
  await Promise.all([committing, importing]);
  expect(importedBeforeRelease).toBe(false);
  expect(plugin.settings.feeds[0].refreshEnrichment).toBe(false);
});

it("cancels in-flight enrichment when a preferences import replaces an enabled feed", async () => {
  const { plugin } = await startPlugin("plugin-default");
  const feed: Feed = {
    feedId: "enrichment-feed",
    title: "Feed",
    url: "https://example.com/feed",
    folder: "",
    lastUpdated: 0,
    refreshEnrichment: true,
    items: [
      {
        guid: "one",
        title: "One",
        link: "https://example.com/article",
        description: "",
        pubDate: "",
        feedTitle: "Feed",
        feedUrl: "https://example.com/feed",
        coverImage: "",
      },
    ],
  };
  plugin.settings.feeds = [feed];
  await plugin.saveSettings();
  const seams = plugin as unknown as {
    refreshEnrichment: { cancelFeed(feed: Feed): void };
    settingsImportApplier: {
      applyUserPreferencesImport(
        parsed: { feeds: Feed[] },
        kind: "replacing",
      ): Promise<void>;
    };
  };
  const cancel = vi.spyOn(seams.refreshEnrichment, "cancelFeed");
  await seams.settingsImportApplier.applyUserPreferencesImport(
    { feeds: [structuredClone(feed)] },
    "replacing",
  );
  expect(plugin.settings.feeds[0].refreshEnrichment).toBe(false);
  expect(cancel).toHaveBeenCalledWith(feed);
});

it("cancels in-flight enrichment when a feed bundle replaces an enabled feed", async () => {
  const { plugin } = await startPlugin("plugin-default");
  const feed: Feed = {
    feedId: "enrichment-feed",
    title: "Feed",
    url: "https://example.com/feed",
    folder: "",
    lastUpdated: 0,
    refreshEnrichment: true,
    items: [
      {
        guid: "one",
        title: "One",
        link: "https://example.com/article",
        description: "",
        pubDate: "",
        feedTitle: "Feed",
        feedUrl: "https://example.com/feed",
        coverImage: "",
      },
    ],
  };
  plugin.settings.feeds = [feed];
  await plugin.saveSettings();
  const bundle = plugin.getFeedBundle();
  const seams = plugin as unknown as {
    refreshEnrichment: { cancelFeed(feed: Feed): void };
    settingsImportApplier: {
      applyFeedBundleImport(bundle: unknown): Promise<void>;
    };
  };
  const cancel = vi.spyOn(seams.refreshEnrichment, "cancelFeed");
  await seams.settingsImportApplier.applyFeedBundleImport(bundle);
  expect(plugin.settings.feeds[0].refreshEnrichment).toBe(false);
  expect(cancel).toHaveBeenCalledWith(feed);
});

it("finishes a delayed feed refresh on the fully hydrated synced snapshot", async () => {
  const { plugin } = await startPlugin("plugin-default");
  const feedUrl = "https://example.com/feed.xml";
  const firstUrl = "https://example.com/one";
  const feed: Feed = {
    feedId: "sync-feed",
    title: "Feed",
    url: feedUrl,
    folder: "",
    lastUpdated: 0,
    refreshEnrichment: true,
    autoDeleteDuration: 0,
    items: [
      {
        guid: firstUrl,
        title: "One",
        link: firstUrl,
        description: "",
        pubDate: "2099-01-01T00:00:00Z",
        feedTitle: "Feed",
        feedUrl,
        coverImage: "",
        refreshEnrichment: {
          url: firstUrl,
          description: "Existing page preview",
        },
      },
    ],
  };
  plugin.settings.feeds = [feed];
  plugin.settings.display.showCoverImage = false;
  await plugin.saveSettings();
  const initialShard = JSON.parse(
    await plugin.app.vault.adapter.read(`${SHARD_FOLDER}/sync-feed.json`),
  );
  expect(initialShard.items[0].refreshEnrichment?.description).toBe(
    "Existing page preview",
  );
  plugin.feedParser = new FeedParser(
    plugin.settings.display,
    plugin.settings.availableTags,
  );
  let releaseRequest!: (response: obsidian.RequestUrlResponse) => void;
  const request = vi.spyOn(obsidian, "requestUrl").mockImplementation(() => {
    const pending = new Promise<obsidian.RequestUrlResponse>((resolve) => {
      releaseRequest = resolve;
    });
    return Object.defineProperties(pending, {
      arrayBuffer: { get: () => pending.then((value) => value.arrayBuffer) },
      json: { get: () => pending.then((value) => value.json) },
      text: { get: () => pending.then((value) => value.text) },
    }) as obsidian.RequestUrlResponsePromise;
  });
  const refresh = plugin.refreshFeeds([feed]);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const repository = (
    plugin as unknown as { feedStorageRepository: FeedStorageRepository }
  ).feedStorageRepository;
  const hydrate = repository.hydrateSettings.bind(repository);
  let releaseHydration!: () => void;
  let notifyHydration!: () => void;
  const hydrationStarted = new Promise<void>((resolve) => {
    notifyHydration = resolve;
  });
  const hydrationMayFinish = new Promise<void>((resolve) => {
    releaseHydration = resolve;
  });
  vi.spyOn(repository, "hydrateSettings").mockImplementation(
    async (...args) => {
      notifyHydration();
      await hydrationMayFinish;
      return hydrate(...args);
    },
  );
  const loading = plugin.loadSettings();
  await hydrationStarted;
  const xml = `<rss version="2.0"><channel><title>Feed</title><item><guid>${firstUrl}</guid><title>One</title><link>${firstUrl}</link><pubDate>Thu, 01 Jan 2099 00:00:00 GMT</pubDate></item><item><guid>https://example.com/two</guid><title>Two</title><link>https://example.com/two</link><pubDate>Thu, 01 Jan 2099 00:00:00 GMT</pubDate><description>New article text</description></item></channel></rss>`;
  releaseRequest({
    status: 200,
    text: xml,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: null,
  });
  let finished = false;
  void refresh.then(() => {
    finished = true;
  });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
  const finishedBeforeHydration = finished;
  releaseHydration();
  await Promise.all([loading, refresh]);
  expect(finishedBeforeHydration).toBe(false);
  expect(
    plugin.settings.feeds[0].items.map((item) => ({
      guid: item.guid,
      preview: item.refreshEnrichment?.description,
    })),
  ).toEqual(
    expect.arrayContaining([
      { guid: firstUrl, preview: "Existing page preview" },
    ]),
  );
  expect(
    plugin.settings.feeds[0].items.find((item) => item.guid === firstUrl)
      ?.refreshEnrichment?.description,
  ).toBe("Existing page preview");
  expect(
    plugin.settings.feeds[0].items.some(
      (item) => item.guid === "https://example.com/two",
    ),
  ).toBe(true);
  const finalShard = JSON.parse(
    await plugin.app.vault.adapter.read(`${SHARD_FOLDER}/sync-feed.json`),
  );
  expect(
    finalShard.items.find((item: { guid: string }) => item.guid === firstUrl)
      ?.refreshEnrichment?.description,
  ).toBe("Existing page preview");
  expect(
    finalShard.items.some(
      (item: { guid: string }) => item.guid === "https://example.com/two",
    ),
  ).toBe(true);
});

it("waits for a reload before finalizing an already-parsed feed result", async () => {
  const { plugin } = await startPlugin("plugin-default");
  const feedUrl = "https://example.com/feed.xml";
  const firstUrl = "https://example.com/one";
  const first = {
    guid: firstUrl,
    title: "One",
    link: firstUrl,
    description: "",
    pubDate: "2099-01-01T00:00:00Z",
    feedTitle: "Feed",
    feedUrl,
    coverImage: "",
    refreshEnrichment: { url: firstUrl, description: "Existing page preview" },
  };
  const feed: Feed = {
    feedId: "sync-feed",
    title: "Feed",
    url: feedUrl,
    folder: "",
    lastUpdated: 0,
    refreshEnrichment: true,
    autoDeleteDuration: 0,
    items: [first],
  };
  plugin.settings.feeds = [feed];
  plugin.settings.display.showCoverImage = false;
  await plugin.saveSettings();
  let releaseFetch!: (result: Feed) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Feed>((resolve) => {
        releaseFetch = resolve;
      }),
  );
  plugin.feedParser = { refreshFeed: fetch } as unknown as FeedParser;
  const refresh = plugin.refreshFeeds([feed]);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  const repository = (
    plugin as unknown as { feedStorageRepository: FeedStorageRepository }
  ).feedStorageRepository;
  const hydrate = repository.hydrateSettings.bind(repository);
  let releaseHydration!: () => void;
  let notifyHydration!: () => void;
  const hydrationStarted = new Promise<void>((resolve) => {
    notifyHydration = resolve;
  });
  const hydrationMayFinish = new Promise<void>((resolve) => {
    releaseHydration = resolve;
  });
  vi.spyOn(repository, "hydrateSettings").mockImplementation(
    async (...args) => {
      notifyHydration();
      await hydrationMayFinish;
      return hydrate(...args);
    },
  );
  const loading = plugin.loadSettings();
  await hydrationStarted;
  releaseFetch({
    ...feed,
    items: [
      first,
      {
        ...first,
        guid: "https://example.com/two",
        link: "https://example.com/two",
        title: "Two",
        description: "New article text",
        refreshEnrichment: undefined,
      },
    ],
  });
  let finished = false;
  void refresh.then(() => {
    finished = true;
  });
  await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
  const finishedBeforeHydration = finished;
  releaseHydration();
  await Promise.all([loading, refresh]);
  expect(finishedBeforeHydration).toBe(false);
  const items = plugin.settings.feeds[0].items;
  expect(
    items.find((item) => item.guid === firstUrl)?.refreshEnrichment
      ?.description,
  ).toBe("Existing page preview");
  expect(items.some((item) => item.guid === "https://example.com/two")).toBe(
    true,
  );
});

describe.each(["plugin-default", "vault-location"] as const)(
  "save against an unseen synced settings change (%s) (#1431)",
  (mode) => {
    it("keeps a synced group when another group is saved", async () => {
      const { plugin, diskSettings, syncIn } = await startPlugin(mode);
      const syncedInterval = plugin.settings.refreshInterval + 30;
      const localMaxItems = plugin.settings.maxItems + 10;

      await syncIn({ refreshInterval: syncedInterval });
      plugin.settings.maxItems = localMaxItems;
      await plugin.saveSettings();

      expect(diskSettings().refreshInterval).toBe(syncedInterval);
      expect(diskSettings().maxItems).toBe(localMaxItems);
      // Memory and disk agree, without a full reload.
      expect(plugin.settings.refreshInterval).toBe(syncedInterval);
      expect(plugin.settings.maxItems).toBe(localMaxItems);
    });

    it("lets memory win a group both sides changed", async () => {
      const { plugin, diskSettings, syncIn } = await startPlugin(mode);

      await syncIn({ refreshInterval: 111 });
      plugin.settings.refreshInterval = 222;
      await plugin.saveSettings();

      expect(diskSettings().refreshInterval).toBe(222);
      expect(plugin.settings.refreshInterval).toBe(222);
    });

    it("keeps unsaved edits and the settings object while adopting", async () => {
      const { plugin, syncIn } = await startPlugin(mode);
      const settingsObject = plugin.settings;
      const load = vi.spyOn(plugin, "loadSettings");

      await syncIn({ refreshInterval: 77 });
      plugin.settings.maxItems += 1;
      await plugin.saveSettings();

      expect(plugin.settings).toBe(settingsObject);
      expect(load).not.toHaveBeenCalled();
    });

    it("cancels the pending reload and refreshes the views after adopting", async () => {
      const { plugin, syncIn } = await startPlugin(mode);
      vi.useFakeTimers();
      const load = vi.spyOn(plugin, "loadSettings");
      const refresh = vi
        .spyOn(plugin, "refreshDashboardViews")
        .mockResolvedValue(undefined);
      const store = (
        plugin as unknown as {
          settingsStore: { handleExternalSettingsChange(): Promise<void> };
        }
      ).settingsStore;

      await syncIn({ refreshInterval: 77 });
      if (mode === "plugin-default") await store.handleExternalSettingsChange();
      plugin.settings.maxItems += 1;
      await plugin.saveSettings();
      expect(refresh).toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(RELOAD_DEBOUNCE_MS * 2);
      expect(load).not.toHaveBeenCalled();
    });

    it("writes memory untouched when the disk still matches the last write", async () => {
      const { plugin, diskSettings } = await startPlugin(mode);
      const refresh = vi
        .spyOn(plugin, "refreshDashboardViews")
        .mockResolvedValue(undefined);

      plugin.settings.maxItems += 3;
      await plugin.saveSettings();

      expect(diskSettings().maxItems).toBe(plugin.settings.maxItems);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("keeps a feed added on another device and a rename made here", async () => {
      const { plugin, diskSettings, syncIn } = await startPlugin(mode);
      const feed = {
        feedId: "feed-1",
        title: "First",
        url: "https://a.test/feed.xml",
        folder: "",
        lastUpdated: 1,
        items: [],
      };
      plugin.settings.feeds = [structuredClone(feed)];
      await plugin.saveSettings();

      await syncIn({
        feeds: [
          { ...feed, items: undefined },
          {
            feedId: "feed-2",
            title: "Added",
            url: "https://b.test/feed.xml",
            folder: "",
            lastUpdated: 1,
            items: undefined,
          },
        ],
      });
      plugin.settings.feeds[0].title = "Renamed here";
      await plugin.saveSettings();

      const persisted = diskSettings().feeds as { feedId: string }[];
      expect(persisted.map((entry) => entry.feedId)).toEqual([
        "feed-1",
        "feed-2",
      ]);
      expect(plugin.settings.feeds.map((entry) => entry.feedId)).toEqual([
        "feed-1",
        "feed-2",
      ]);
      expect(plugin.settings.feeds[0].title).toBe("Renamed here");
      expect(plugin.settings.feeds[0].items).toEqual([]);
    });

    it("keeps a folder added on another device and a rename made here", async () => {
      const { plugin, diskSettings, syncIn } = await startPlugin(mode);
      plugin.settings.folders = [{ name: "Local", subfolders: [] }];
      await plugin.saveSettings();

      await syncIn({
        folders: [
          { name: "Local", subfolders: [] },
          { name: "Remote", subfolders: [] },
        ],
      });
      plugin.settings.folders[0].name = "Local2";
      await plugin.saveSettings();

      const persisted = diskSettings().folders as { name: string }[];
      expect(persisted.map((entry) => entry.name)).toEqual([
        "Local2",
        "Remote",
      ]);
      expect(plugin.settings.folders.map((entry) => entry.name)).toEqual([
        "Local2",
        "Remote",
      ]);
    });

    it("still writes memory when the settings file cannot be read", async () => {
      const { app, plugin, pluginFile, diskSettings } = await startPlugin(mode);

      if (mode === "vault-location") {
        await adapter(app).write(VAULT_DATA_PATH, "{ not json");
      } else {
        plugin.loadData = vi.fn(async () => {
          throw new Error("unreadable");
        });
      }
      void pluginFile;
      plugin.settings.maxItems += 5;
      await plugin.saveSettings();

      expect(diskSettings().maxItems).toBe(plugin.settings.maxItems);
    });
  },
);

describe("settings save guard re-entrancy (#1431)", () => {
  it("does not read the settings file again for a save a load triggers", async () => {
    const { plugin, pluginFile } = await startPlugin("plugin-default");
    // Make the next load find something to normalize, so it saves.
    (pluginFile.current as Record<string, unknown>).maxItems = 50;
    const loadData = plugin.loadData as unknown as ReturnType<typeof vi.fn>;
    loadData.mockClear();

    await plugin.loadSettings();

    // One read for the load itself; the follow-up save adds none.
    expect(loadData).toHaveBeenCalledTimes(1);
  });
});

describe("settings save guard edge cases (#1431)", () => {
  it("adopts a synced feed list and keeps the items already in memory", async () => {
    const { plugin, diskSettings, syncIn } =
      await startPlugin("plugin-default");
    const feed = {
      title: "Kept",
      url: "https://example.com/feed.xml",
      folder: "",
      lastUpdated: 0,
      feedId: "feed-1",
    };
    plugin.settings.feeds = [
      {
        ...feed,
        items: [
          {
            guid: "g1",
          } as unknown as RssDashboardSettings["feeds"][0]["items"][0],
        ],
      },
    ];
    await plugin.saveSettings();

    await syncIn({
      feeds: [
        feed,
        { ...feed, title: "Added", url: "https://b.test/f", feedId: "feed-2" },
      ],
    });
    plugin.settings.maxItems += 1;
    await plugin.saveSettings();

    expect(plugin.settings.feeds.map((f) => f.feedId)).toEqual([
      "feed-1",
      "feed-2",
    ]);
    expect(plugin.settings.feeds[0].items).toHaveLength(1);
    expect(plugin.settings.feeds[1].items).toEqual([]);
    expect((diskSettings().feeds as unknown[]).length).toBe(2);
  });

  it("keeps an in-place edit to a group after an earlier save", async () => {
    const { plugin, diskSettings, syncIn } =
      await startPlugin("plugin-default");
    plugin.settings.maxItems += 1;
    await plugin.saveSettings();

    // Edited in place and not yet saved, while the other device edits it too.
    plugin.settings.folders.push({ name: "Local", subfolders: [] });
    await syncIn({ folders: [{ name: "Remote", subfolders: [] }] });
    await plugin.saveSettings();

    const names = (diskSettings().folders as { name: string }[]).map(
      (f) => f.name,
    );
    // Per-entry folder merging keeps both unrelated folders (#1439).
    expect(names).toContain("Local");
    expect(names).toContain("Remote");
  });

  it("keeps loaded articles when a synced feed is adopted per feed", async () => {
    const { plugin, diskSettings, syncIn } =
      await startPlugin("plugin-default");
    const item = {
      guid: "g1",
    } as unknown as RssDashboardSettings["feeds"][0]["items"][0];
    const feed = (feedId: string, title: string) => ({
      feedId,
      title,
      url: `https://${feedId}.test/feed.xml`,
      folder: "",
      lastUpdated: 1,
    });
    plugin.settings.feeds = [
      { ...feed("feed-1", "First"), items: [item] },
      { ...feed("feed-2", "Second"), items: [] },
    ];
    await plugin.saveSettings();

    // The other device renames feed-1 while this device renames feed-2, so the
    // entries merge individually and feed-1 is taken from disk.
    await syncIn({
      feeds: [feed("feed-1", "Renamed remotely"), feed("feed-2", "Second")],
    });
    plugin.settings.feeds[1].title = "Renamed here";
    await plugin.saveSettings();

    expect(plugin.settings.feeds[0].title).toBe("Renamed remotely");
    expect(plugin.settings.feeds[0].items).toHaveLength(1);
    expect(plugin.settings.feeds[1].title).toBe("Renamed here");
    const persisted = diskSettings().feeds as Record<string, unknown>[];
    expect(persisted[0].items).toBeUndefined();
    expect(persisted[1].items).toBeUndefined();
  });

  it("treats an empty settings file as unreadable and writes memory", async () => {
    const { plugin, diskSettings, pluginFile } =
      await startPlugin("plugin-default");
    const before = plugin.settings.refreshInterval;
    pluginFile.current = {};

    plugin.settings.maxItems += 1;
    await plugin.saveSettings();

    expect(plugin.settings.refreshInterval).toBe(before);
    expect(diskSettings().refreshInterval).toBe(before);
  });

  it("does not recurse into the guard for a load-triggered save in vault-location mode", async () => {
    const { app, plugin } = await startPlugin("vault-location");
    const reads = vi.spyOn(adapter(app), "read");
    const files = (
      app.vault as unknown as { adapterFiles: Map<string, string> }
    ).adapterFiles;
    const data = JSON.parse(files.get(VAULT_DATA_PATH) ?? "{}") as Record<
      string,
      unknown
    >;
    data.maxItems = 50;
    await adapter(app).write(VAULT_DATA_PATH, JSON.stringify(data));
    reads.mockClear();

    await plugin.loadSettings();

    const dataReads = reads.mock.calls.filter(([p]) => p === VAULT_DATA_PATH);
    expect(dataReads).toHaveLength(1);
  });
});
