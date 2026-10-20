/**
 * Coalesced article-state persistence (#1384).
 *
 * Article-state changes are queued through the plugin facade and written once
 * per coalescing window, after the interaction that made them. These tests
 * drive the settings-store save/load surface through the plugin facade with a
 * mocked vault adapter and fake timers, and assert what changes on disk.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from "vitest";
import { App, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

const METADATA_FOLDER = "rss-dashboard-data";
const SHARD_FOLDER = `${METADATA_FOLDER}/feeds`;
const SHARD_PATH = `${SHARD_FOLDER}/feed-1.json`;
const USER_STATE_PATH = `${METADATA_FOLDER}/user-state.json`;
// The snapshot is written through this sibling temporary file and renamed
// into place (#1387), so write spies see the temporary path.
const USER_STATE_TEMP_PATH = `${USER_STATE_PATH}.tmp`;
const FEED_URL = "https://example.com/feed.xml";
const GUID = "guid-1";
const WINDOW_MS = 2_000;

interface VaultAdapterStub {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}

/**
 * Observed on Obsidian 1.14.4 desktop: `adapter.rename` refuses an existing
 * destination with "Destination file already exists!", unlike Node's
 * `fs.rename`. The fixture vault already holds a snapshot and a journal, so
 * every atomic write replaces an existing file.
 */
function refuseRenameOntoExisting(app: App): void {
  const files = adapterFiles(app);
  vi.spyOn(adapter(app), "rename").mockImplementation(
    async (oldPath, newPath) => {
      if (files.has(newPath)) {
        throw new Error("Destination file already exists!");
      }
      const content = files.get(oldPath);
      if (content === undefined) {
        throw new Error(`ENOENT: ${oldPath}`);
      }
      files.delete(oldPath);
      files.set(newPath, content);
    },
  );
}

/** Members that stay on the plugin, reached here as test seams. */
interface PluginSeams {
  backupService: { performAutoBackups(): Promise<void> };
  initializeSettingsBackedServices(): void;
  ensureAutoRefreshScheduler(): { reschedule(): void };
}

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: "plugins/rss-dashboard",
  };
}

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article",
    link: "https://example.com/a",
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid: GUID,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: FEED_URL,
    coverImage: "",
    ...overrides,
  };
}

function feed(items: FeedItem[]): Feed {
  return {
    title: "Example Feed",
    url: FEED_URL,
    folder: "",
    lastUpdated: 0,
    feedId: "feed-1",
    items,
  };
}

function settings(
  overrides: Partial<RssDashboardSettings> = {},
): RssDashboardSettings {
  const base = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  base.metadataStorageMode = "plugin-default";
  base.metadataStorageFolder = METADATA_FOLDER;
  base.startupRefreshDelaySeconds = 3600;
  base.media.rememberPlaybackProgress = true;
  base.feeds = [feed([item()])];
  return { ...base, ...overrides };
}

function adapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
}

/** The mock vault keeps adapter-written files in a private map. */
function adapterFiles(app: App): Map<string, string> {
  return (app.vault as unknown as { adapterFiles: Map<string, string> })
    .adapterFiles;
}

function shardJson(items: FeedItem[]): string {
  return JSON.stringify({
    version: 1,
    feedId: "feed-1",
    feedUrl: FEED_URL,
    updatedAt: 0,
    items,
  });
}

interface UserStateStub {
  states: Record<
    string,
    { read?: boolean; playbackProgress?: { position: number } }
  >;
}

function userState(): UserStateStub {
  return JSON.parse(
    adapterFiles(app).get(USER_STATE_PATH) ?? "{}",
  ) as UserStateStub;
}

function userStateWrites(spy: MockInstance): unknown[][] {
  return spy.mock.calls.filter(([path]) => path === USER_STATE_TEMP_PATH);
}

function shardCalls(spy: MockInstance): string[] {
  return spy.mock.calls
    .map(([path]) => String(path))
    .filter((path) => path.startsWith(SHARD_FOLDER));
}

let app: App;

beforeEach(async () => {
  vi.restoreAllMocks();
  app = App.createMock();
  await adapter(app).mkdir(SHARD_FOLDER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function startPlugin(
  overrides: Partial<RssDashboardSettings> = {},
): Promise<{
  plugin: RssDashboardPlugin;
  saveData: Mock<(data: unknown) => Promise<void>>;
  notices: MockInstance<typeof console.debug>;
}> {
  await adapter(app).write(SHARD_PATH, shardJson([item()]));
  await adapter(app).write(
    USER_STATE_PATH,
    JSON.stringify({ version: 3, states: {} }),
  );
  const plugin = new RssDashboardPlugin(app, manifest());
  plugin.loadData = vi
    .fn()
    .mockResolvedValue(structuredClone(settings(overrides)));
  const saveData = vi.fn<(data: unknown) => Promise<void>>();
  saveData.mockResolvedValue(undefined);
  plugin.saveData = saveData;
  const notices = vi
    .spyOn(console, "debug")
    .mockImplementation(() => undefined);
  await plugin.loadSettings();
  // A startup normalization save is not part of what each test measures.
  vi.clearAllMocks();
  return { plugin, saveData, notices };
}

function noticeTexts(spy: MockInstance<typeof console.debug>): string[] {
  return spy.mock.calls
    .filter((args) => args[0] === "[Stub Notice]")
    .map((args) => String(args[1]));
}

function seams(plugin: RssDashboardPlugin): PluginSeams {
  return plugin as unknown as PluginSeams;
}

describe("facade article-state persistence (#1385)", () => {
  it("updateArticle queues a read change without a full settings pass", async () => {
    const { plugin, saveData } = await startPlugin();
    const write = vi.spyOn(adapter(app), "write");

    await plugin.updateArticle(GUID, FEED_URL, { read: true }, false);

    // Nothing is written inside the interaction; the queue owns the timing.
    expect(saveData).not.toHaveBeenCalled();
    expect(userStateWrites(write)).toEqual([]);

    await plugin.flushPendingWrites();

    expect(userStateWrites(write)).toHaveLength(1);
    expect(userState().states[`feed-1:${GUID}`]?.read).toBe(true);
    expect(shardCalls(write)).toEqual([]);
    expect(saveData).not.toHaveBeenCalled();
  });

  it("updateArticle still writes feed content for a cover image change", async () => {
    const { plugin } = await startPlugin();
    const write = vi.spyOn(adapter(app), "write");

    await plugin.updateArticle(
      GUID,
      FEED_URL,
      { coverImage: "https://example.com/cover.jpg" },
      false,
    );

    // Cover images live in feed content, so this change needs a shard write.
    expect(shardCalls(write)).toContain(SHARD_PATH);
    expect(plugin.settings.feeds[0].items[0].coverImage).toBe(
      "https://example.com/cover.jpg",
    );
  });
});

describe("coalesced article-state persistence (#1384)", () => {
  it("an article-state-only save performs no feed-shard reads or writes", async () => {
    const { plugin, saveData } = await startPlugin();
    const write = vi.spyOn(adapter(app), "write");
    const read = vi.spyOn(adapter(app), "read");
    plugin.settings.feeds[0].items[0].read = true;

    void plugin.queueArticleStateSave();
    await plugin.flushPendingWrites();

    expect(shardCalls(write)).toEqual([]);
    expect(shardCalls(read)).toEqual([]);
    expect(userStateWrites(write)).toHaveLength(1);
    expect(userState().states[`feed-1:${GUID}`]?.read).toBe(true);
    // The shard metadata snapshot is not rewritten either.
    expect(saveData).not.toHaveBeenCalled();
  });

  it("writes once for a burst of changes inside the coalescing window", async () => {
    const { plugin } = await startPlugin();
    vi.useFakeTimers();
    const write = vi.spyOn(adapter(app), "write");

    for (let index = 0; index < 5; index += 1) {
      plugin.settings.feeds[0].items[0].read = index % 2 === 0;
      void plugin.queueArticleStateSave();
    }
    await vi.advanceTimersByTimeAsync(WINDOW_MS - 1);
    expect(userStateWrites(write)).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(userStateWrites(write)).toHaveLength(1);
  });

  it("flushes once the queued changes pass the size threshold", async () => {
    const { plugin } = await startPlugin();
    vi.useFakeTimers();
    const write = vi.spyOn(adapter(app), "write");

    for (let index = 0; index < 30; index += 1) {
      plugin.settings.feeds[0].items[0].read = index % 2 === 1;
      void plugin.queueArticleStateSave();
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(userStateWrites(write)).toHaveLength(1);
  });

  it("resolves flushPendingWrites only after the pending write landed", async () => {
    const { plugin } = await startPlugin();
    const writeToVault = adapter(app).write.bind(adapter(app));
    let releaseWrite: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const write = vi
      .spyOn(adapter(app), "write")
      .mockImplementation(async (path, content) => {
        if (path === USER_STATE_TEMP_PATH) await gate;
        await writeToVault(path, content);
      });
    plugin.settings.feeds[0].items[0].read = true;

    void plugin.queueArticleStateSave();
    let settled = false;
    const flush = plugin.flushPendingWrites().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(userStateWrites(write)).toHaveLength(1));
    expect(settled).toBe(false);

    releaseWrite?.();
    await flush;

    expect(settled).toBe(true);
    expect(userState().states[`feed-1:${GUID}`]?.read).toBe(true);
  });

  it("replaces an existing snapshot when the adapter refuses to rename onto it", async () => {
    const { plugin } = await startPlugin();
    refuseRenameOntoExisting(app);
    plugin.settings.feeds[0].items[0].read = true;

    void plugin.queueArticleStateSave();
    await plugin.flushPendingWrites();

    expect(userState().states[`feed-1:${GUID}`]?.read).toBe(true);
    expect(adapterFiles(app).has(USER_STATE_TEMP_PATH)).toBe(false);
  });

  it("shows a notice when a queued write fails and leaves no rejection", async () => {
    const { plugin, notices } = await startPlugin();
    const write = vi
      .spyOn(adapter(app), "write")
      .mockRejectedValue(new Error("disk full"));
    vi.useFakeTimers();
    plugin.settings.feeds[0].items[0].read = true;

    void plugin.queueArticleStateSave();
    await vi.advanceTimersByTimeAsync(WINDOW_MS);

    expect(userStateWrites(write)).toHaveLength(1);
    expect(noticeTexts(notices)).toEqual([
      expect.stringContaining("Failed to save article state changes"),
    ]);
    expect(noticeTexts(notices)[0]).toContain("disk full");
    await expect(plugin.flushPendingWrites()).resolves.toBeUndefined();
  });

  it("runs auto-backup and refresh rescheduling after the queued write", async () => {
    const { plugin } = await startPlugin({
      autoBackup: {
        backupDataJson: false,
        backupOpml: false,
        backupUserdata: false,
      },
    });
    seams(plugin).initializeSettingsBackedServices();
    // The first backup-enabled persistence of the session writes a snapshot.
    plugin.settings.autoBackup.backupDataJson = true;
    const order: string[] = [];
    const writeToVault = adapter(app).write.bind(adapter(app));
    vi.spyOn(adapter(app), "write").mockImplementation(
      async (path, content) => {
        if (path === USER_STATE_TEMP_PATH) order.push("write");
        await writeToVault(path, content);
      },
    );
    seams(plugin).backupService.performAutoBackups = vi.fn(() => {
      order.push("backup");
      return Promise.resolve();
    });
    vi.spyOn(
      seams(plugin).ensureAutoRefreshScheduler(),
      "reschedule",
    ).mockImplementation(() => {
      order.push("reschedule");
    });
    plugin.settings.feeds[0].items[0].read = true;

    void plugin.queueArticleStateSave();
    await plugin.flushPendingWrites();

    expect(order).toEqual(["write", "backup", "reschedule"]);
  });

  it("suppresses queued writes while the settings load has failed", async () => {
    const { plugin, saveData } = await startPlugin();
    plugin.loadData = vi.fn().mockRejectedValue(new Error("Load failed"));
    await plugin.loadSettings();
    const write = vi.spyOn(adapter(app), "write");
    const persist = vi.spyOn(
      (
        plugin as unknown as {
          feedStorageRepository: {
            persistSettings(...args: unknown[]): Promise<unknown>;
          };
        }
      ).feedStorageRepository,
      "persistSettings",
    );

    void plugin.queueArticleStateSave();
    await plugin.flushPendingWrites();

    expect(persist).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(saveData).not.toHaveBeenCalled();
  });

  it("writes a pending change on unload and leaves no timer behind", async () => {
    const { plugin } = await startPlugin();
    seams(plugin).initializeSettingsBackedServices();
    seams(plugin).backupService.performAutoBackups = vi.fn(() =>
      Promise.resolve(),
    );
    const write = vi.spyOn(adapter(app), "write");
    vi.useFakeTimers();
    plugin.settings.feeds[0].items[0].read = true;
    void plugin.queueArticleStateSave();

    plugin.onunload();
    await vi.advanceTimersByTimeAsync(0);

    expect(userStateWrites(write)).toHaveLength(1);
    expect(userState().states[`feed-1:${GUID}`]?.read).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("persists playback progress through the same queue, not a second timer", async () => {
    const { plugin } = await startPlugin();
    vi.useFakeTimers();
    const write = vi.spyOn(adapter(app), "write");

    plugin.updatePlaybackProgress(FEED_URL, GUID, 42, 100);
    expect(userStateWrites(write)).toEqual([]);

    await vi.advanceTimersByTimeAsync(WINDOW_MS);

    expect(userStateWrites(write)).toHaveLength(1);
    expect(
      userState().states[`feed-1:${GUID}`]?.playbackProgress?.position,
    ).toBe(42);
  });

  it("persists playback progress on stop without waiting for the window", async () => {
    const { plugin } = await startPlugin();
    vi.useFakeTimers();
    const write = vi.spyOn(adapter(app), "write");

    plugin.updatePlaybackProgress(FEED_URL, GUID, 42, 100, true);
    await vi.advanceTimersByTimeAsync(0);

    expect(userStateWrites(write)).toHaveLength(1);
    expect(
      userState().states[`feed-1:${GUID}`]?.playbackProgress?.position,
    ).toBe(42);
  });

  it("writes queued changes before an export snapshot", async () => {
    const { plugin } = await startPlugin();
    seams(plugin).initializeSettingsBackedServices();
    const order: string[] = [];
    const writeToVault = adapter(app).write.bind(adapter(app));
    vi.spyOn(adapter(app), "write").mockImplementation(
      async (path, content) => {
        if (path === USER_STATE_TEMP_PATH) order.push("write");
        await writeToVault(path, content);
      },
    );
    const exportService = (
      plugin as unknown as {
        importExportService: { exportDataJson(): Promise<string> };
      }
    ).importExportService;
    vi.spyOn(exportService, "exportDataJson").mockImplementation(() => {
      order.push("export");
      return Promise.resolve("downloaded");
    });
    plugin.settings.feeds[0].items[0].read = true;

    void plugin.queueArticleStateSave();
    await plugin.exportDataJson();

    expect(order).toEqual(["write", "export"]);
  });

  it("keeps a synced user-state change visible right after a journal append (#1380)", async () => {
    const handlers: Record<string, (file: { path: string }) => void> = {};
    (app.vault as unknown as { on: unknown }).on = (
      event: string,
      callback: (file: { path: string }) => void,
    ) => {
      handlers[event] = callback;
      return {};
    };
    const { plugin } = await startPlugin();
    const store = (
      plugin as unknown as {
        settingsStore: {
          registerVaultMetadataChangeListeners(
            register: (ref: unknown) => void,
          ): void;
          recordArticleStateChanges(
            changes: readonly {
              feedId: string;
              guid: string;
              changes: { read: boolean };
            }[],
          ): Promise<void>;
        };
      }
    ).settingsStore;
    store.registerVaultMetadataChangeListeners(() => undefined);
    vi.useFakeTimers();
    // Let the startup save's own writer-suppression window expire.
    await vi.advanceTimersByTimeAsync(3_001);
    const reload = vi
      .spyOn(plugin, "loadSettings")
      .mockResolvedValue(undefined);

    // The append is the change's first durable write. It must not make the
    // plugin deaf to a synced snapshot change arriving behind it, because the
    // queued checkpoint would then overwrite that change (#1380).
    await store.recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);
    // The plugin-default metadata mode watches the dot-folder alias; the
    // suppression window is what this test measures, not path resolution.
    handlers.modify?.({ path: ".rss-dashboard-data/user-state.json" });
    await vi.advanceTimersByTimeAsync(1_500);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps a full save for Shard storage v1, where state lives in shard content", async () => {
    const { plugin, saveData } = await startPlugin({
      storageMode: "vault-shards",
    });
    const write = vi.spyOn(adapter(app), "write");
    plugin.settings.feeds[0].items[0].read = true;

    void plugin.queueArticleStateSave();
    await plugin.flushPendingWrites();

    expect(write).toHaveBeenCalledWith(
      SHARD_PATH,
      expect.stringContaining('"read": true'),
    );
    // Only the shard changed; the metadata snapshot is unchanged.
    expect(saveData).not.toHaveBeenCalled();
  });
});
