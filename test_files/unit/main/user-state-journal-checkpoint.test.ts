/**
 * Journal checkpoints and synced-reload preservation (#1387).
 *
 * The producer appends a device-local journal record when an article-state
 * change is queued. A coalesced checkpoint folds those records into the shared
 * `user-state.json` snapshot, advances `checkpointSequence`, and only then
 * truncates the journal. These tests drive the settings-store load/save surface
 * through the plugin facade and assert what is on disk and what survives a
 * reload.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
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
const USER_STATE_TEMP_PATH = `${USER_STATE_PATH}.tmp`;
const PLUGIN_DIR = "plugins/rss-dashboard";
const JOURNAL_PATH = `${PLUGIN_DIR}/device-local/user-state-journal.jsonl`;
const FEED_URL = "https://example.com/feed.xml";
const GUID = "guid-1";
const SECOND_GUID = "guid-2";

interface VaultAdapterStub {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: PLUGIN_DIR,
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
  base.feeds = [feed([item(), item({ guid: SECOND_GUID })])];
  return { ...base, ...overrides };
}

function adapter(app: App): VaultAdapterStub {
  return app.vault.adapter as unknown as VaultAdapterStub;
}

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

interface SnapshotStub {
  version: number;
  checkpointSequence?: number;
  states: Record<string, Record<string, unknown>>;
}

function snapshot(app: App): SnapshotStub {
  return JSON.parse(
    adapterFiles(app).get(USER_STATE_PATH) ?? "{}",
  ) as SnapshotStub;
}

function journalRecords(app: App): Record<string, unknown>[] {
  const raw = adapterFiles(app).get(JOURNAL_PATH) ?? "";
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

let app: App;

beforeEach(async () => {
  vi.restoreAllMocks();
  app = App.createMock();
  await adapter(app).mkdir(SHARD_FOLDER);
  await adapter(app).write(
    SHARD_PATH,
    shardJson([item(), item({ guid: SECOND_GUID })]),
  );
  await adapter(app).write(
    USER_STATE_PATH,
    JSON.stringify({ version: 3, states: {} }),
  );
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
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
}> {
  const plugin = new RssDashboardPlugin(app, manifest());
  plugin.loadData = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(structuredClone(settings(overrides))),
    );
  const saveData = vi.fn<(data: unknown) => Promise<void>>();
  saveData.mockResolvedValue(undefined);
  plugin.saveData = saveData;
  await plugin.loadSettings();
  return { plugin, saveData };
}

function readOf(plugin: RssDashboardPlugin): boolean | undefined {
  return plugin.settings.feeds[0].items.find((entry) => entry.guid === GUID)
    ?.read;
}

function starredOf(plugin: RssDashboardPlugin): boolean | undefined {
  return plugin.settings.feeds[0].items.find((entry) => entry.guid === GUID)
    ?.starred;
}

function playbackOf(
  plugin: RssDashboardPlugin,
  guid = SECOND_GUID,
): FeedItem["playbackProgress"] {
  return plugin.settings.feeds[0].items.find((entry) => entry.guid === guid)
    ?.playbackProgress;
}

async function drainMicrotasks(): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface SettingsStoreSeam {
  recordArticleStateChanges(
    changes: readonly {
      feedId: string;
      guid: string;
      changes: Record<string, unknown>;
    }[],
  ): Promise<void>;
}

interface PluginSeams {
  settingsStore: SettingsStoreSeam;
  feedStorageRepository: {
    persistSettings(...args: unknown[]): Promise<unknown>;
  };
}

describe("journal checkpoints (#1387)", () => {
  it("writes the shared snapshot, advances the checkpoint, and truncates the journal", async () => {
    const { plugin } = await startPlugin();
    plugin.settings.feeds[0].items[0].read = true;
    plugin.settings.feeds[0].items[1].starred = true;

    await plugin.queueArticleStateSave([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
      {
        feedId: "feed-1",
        guid: SECOND_GUID,
        changes: { starred: true },
      },
    ]);
    // The records are durable before any snapshot write.
    expect(journalRecords(app)).toHaveLength(2);

    await plugin.flushPendingWrites();

    const written = snapshot(app);
    expect(written.version).toBe(4);
    expect(written.checkpointSequence).toBe(2);
    expect(written.states["feed-1:guid-1"]?.read).toBe(true);
    expect(written.states["feed-1:guid-2"]?.starred).toBe(true);
    expect(journalRecords(app)).toEqual([]);
  });

  it("coalesces a burst of queued changes into one checkpoint", async () => {
    const { plugin } = await startPlugin();
    vi.useFakeTimers();
    const rename = vi.spyOn(adapter(app), "rename");

    for (let index = 0; index < 5; index += 1) {
      await plugin.queueArticleStateSave([
        {
          feedId: "feed-1",
          guid: `guid-burst-${index}`,
          changes: { read: true },
        },
      ]);
    }
    const snapshotWrites = () =>
      rename.mock.calls.filter(([, newPath]) => newPath === USER_STATE_PATH);
    expect(snapshotWrites()).toHaveLength(0);
    expect(journalRecords(app)).toHaveLength(5);

    await vi.advanceTimersByTimeAsync(2_000);
    await drainMicrotasks();

    expect(snapshotWrites()).toHaveLength(1);
    expect(snapshot(app).checkpointSequence).toBe(5);
    expect(journalRecords(app)).toEqual([]);
  });

  it("replays pending local records over a synced reload before the next render", async () => {
    const { plugin } = await startPlugin();
    vi.useFakeTimers();
    await plugin.queueArticleStateSave([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);

    // Another device's snapshot arrives without this device's pending read.
    await adapter(app).write(
      USER_STATE_PATH,
      JSON.stringify({
        version: 4,
        checkpointSequence: 0,
        states: {
          "feed-1:guid-1": { read: false, starred: true, saved: false },
        },
      }),
    );

    await plugin.loadSettings();

    expect(readOf(plugin)).toBe(true);
    expect(starredOf(plugin)).toBe(true);
  });

  it("never appends or checkpoints after a failed settings load", async () => {
    const { plugin } = await startPlugin();
    plugin.loadData = vi.fn().mockRejectedValue(new Error("Load failed"));
    await plugin.loadSettings();
    const before = adapterFiles(app).get(USER_STATE_PATH);
    const write = vi.spyOn(adapter(app), "write");
    const rename = vi.spyOn(adapter(app), "rename");

    await plugin.queueArticleStateSave([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);
    await plugin.flushPendingWrites();

    expect(await adapter(app).exists(JOURNAL_PATH)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(adapterFiles(app).get(USER_STATE_PATH)).toBe(before);
  });

  it("closes the load gate before settling appends so a racing save is suppressed", async () => {
    const { plugin } = await startPlugin();
    const seams = plugin as unknown as PluginSeams;
    const appendGate = deferred();
    const appendToVault = adapter(app).append.bind(adapter(app));
    const append = vi
      .spyOn(adapter(app), "append")
      .mockImplementation(async (path, content) => {
        if (path === JOURNAL_PATH) await appendGate.promise;
        await appendToVault(path, content);
      });
    const loadGate = deferred();
    plugin.loadData = vi.fn(() =>
      loadGate.promise.then(() => structuredClone(settings())),
    );

    // Accepted while the write gate is still open.
    const accepted = seams.settingsStore.recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);
    await vi.waitFor(() =>
      expect(append).toHaveBeenCalledWith(JOURNAL_PATH, expect.any(String)),
    );
    const persist = vi.spyOn(seams.feedStorageRepository, "persistSettings");

    const load = plugin.loadSettings();
    await Promise.resolve();
    const save = plugin.saveSettings();
    appendGate.resolve();
    await accepted;
    await save;

    // The append accepted by the previous state still lands...
    expect(journalRecords(app)).toHaveLength(1);
    // ...but a save requested while the load settles is suppressed instead of
    // writing the previous state over the load.
    expect(persist).not.toHaveBeenCalled();

    loadGate.resolve();
    await load;
  });

  it("flushes pending records through the unload path", async () => {
    const { plugin } = await startPlugin();
    plugin.settings.feeds[0].items[0].read = true;
    await plugin.queueArticleStateSave([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);

    plugin.onunload();

    await vi.waitFor(() => expect(snapshot(app).checkpointSequence).toBe(1));
    expect(snapshot(app).states["feed-1:guid-1"]?.read).toBe(true);
    expect(journalRecords(app)).toEqual([]);
  });

  it("writes the snapshot through a temporary file and renames it into place", async () => {
    const { plugin } = await startPlugin();
    const rename = vi.spyOn(adapter(app), "rename");
    await plugin.queueArticleStateSave([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);

    await plugin.flushPendingWrites();

    const snapshotRename = rename.mock.calls.find(
      ([, newPath]) => newPath === USER_STATE_PATH,
    );
    expect(snapshotRename?.[0]).toBe(USER_STATE_TEMP_PATH);
    expect(await adapter(app).exists(USER_STATE_TEMP_PATH)).toBe(false);
    expect(snapshot(app).checkpointSequence).toBe(1);
  });

  it("keeps the journal when the snapshot write fails", async () => {
    const { plugin } = await startPlugin();
    await plugin.queueArticleStateSave([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);
    vi.spyOn(adapter(app), "rename").mockImplementation(
      async (_oldPath, newPath) => {
        if (newPath === USER_STATE_PATH) {
          throw new Error("rename failed");
        }
      },
    );

    await plugin.flushPendingWrites();

    expect(journalRecords(app)).toHaveLength(1);
    expect(snapshot(app).checkpointSequence).toBeUndefined();
  });

  it("restores a queued read and playback position after a reload without a checkpoint", async () => {
    const { plugin } = await startPlugin();
    await plugin.queueArticleStateSave([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
      {
        feedId: "feed-1",
        guid: SECOND_GUID,
        changes: {
          playbackProgress: { position: 42, duration: 120, lastUpdated: 7 },
        },
      },
    ]);

    const { plugin: reloaded } = await startPlugin();

    expect(readOf(reloaded)).toBe(true);
    expect(playbackOf(reloaded)).toEqual({
      position: 42,
      duration: 120,
      lastUpdated: 7,
    });
  });

  it("journals playback progress from the player before any flush", async () => {
    const { plugin } = await startPlugin();
    plugin.updatePlaybackProgress(FEED_URL, SECOND_GUID, 33, 90, false);
    // Wait for the append the queue requested, without writing a snapshot.
    await plugin.queueArticleStateSave();

    const records = journalRecords(app);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      guid: SECOND_GUID,
      changes: { playbackProgress: { position: 33, duration: 90 } },
    });

    const { plugin: reloaded } = await startPlugin();
    expect(playbackOf(reloaded)?.position).toBe(33);
  });

  it("does not replay or overwrite an unreadable snapshot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await adapter(app).write(USER_STATE_PATH, "{not valid json");
    await adapter(app).mkdir(`${PLUGIN_DIR}/device-local`);
    await adapter(app).write(
      JOURNAL_PATH,
      `${JSON.stringify({
        seq: 1,
        deviceId: "device-test",
        timestamp: 1_760_000_000_000,
        feedId: "feed-1",
        guid: GUID,
        changes: { read: true },
      })}\n`,
    );

    const { plugin } = await startPlugin();

    // The snapshot cannot be saved, so its pending state is not presented as
    // durable: the item keeps the snapshot's default (unread) state.
    expect(readOf(plugin)).toBe(false);
    expect(adapterFiles(app).get(USER_STATE_PATH)).toBe("{not valid json");
    expect(journalRecords(app)).toHaveLength(1);
  });
});
