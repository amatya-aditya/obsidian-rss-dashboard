/**
 * Device-local user-state journal (#1386).
 *
 * Pending article-state changes are appended to a device-local journal and
 * replayed over the shared `user-state.json` snapshot on the next load. These
 * tests drive the settings-store load/save surface through the plugin facade,
 * seeding the snapshot and the journal file, and assert what survives a
 * reload and what the export and migration surfaces contain.
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
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  UserStateJournal,
  articleStateFromUpdates,
  foldUserStateJournalRecords,
} from "../../../src/services/user-state-journal";
import {
  DEFAULT_SETTINGS,
  type ArticleUserState,
  type Feed,
  type FeedItem,
  type PortableDataBundle,
  type RssDashboardSettings,
} from "../../../src/types/types";

const METADATA_FOLDER = "rss-dashboard-data";
const SHARD_FOLDER = `${METADATA_FOLDER}/feeds`;
const SHARD_PATH = `${SHARD_FOLDER}/feed-1.json`;
const USER_STATE_PATH = `${METADATA_FOLDER}/user-state.json`;
const PLUGIN_DIR = "plugins/rss-dashboard";
// The journal is device-local, so it lives in the plugin folder rather than in
// the shared metadata folder or the feed shards folder.
const JOURNAL_PATH = `${PLUGIN_DIR}/device-local/user-state-journal.jsonl`;
const FEED_URL = "https://example.com/feed.xml";
const GUID = "guid-1";
const SECOND_GUID = "guid-2";

interface VaultAdapterStub {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}

interface RepositorySeam extends FeedStorageRepository {
  recordArticleStateChanges(
    changes: {
      feedId: string;
      guid: string;
      changes: {
        read?: boolean;
        starred?: boolean;
        tags?: { name: string; color: string }[];
        saved?: boolean;
        savedFilePath?: string;
        playbackProgress?: {
          position: number;
          duration: number;
          lastUpdated: number;
        };
      };
    }[],
  ): Promise<void>;
}

interface PluginSeams {
  feedStorageRepository: RepositorySeam;
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
  checkpointByDevice?: Record<string, number>;
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

function journalRecord(
  seq: number,
  guid: string,
  changes: Record<string, unknown>,
): string {
  return JSON.stringify({
    seq,
    deviceId: "device-test",
    timestamp: 1_760_000_000_000,
    feedId: "feed-1",
    guid,
    changes,
  });
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

function repository(plugin: RssDashboardPlugin): RepositorySeam {
  return (plugin as unknown as PluginSeams).feedStorageRepository;
}

function readOf(plugin: RssDashboardPlugin, guid = GUID): boolean | undefined {
  return plugin.settings.feeds[0].items.find((entry) => entry.guid === guid)
    ?.read;
}

function starredOf(
  plugin: RssDashboardPlugin,
  guid = GUID,
): boolean | undefined {
  return plugin.settings.feeds[0].items.find((entry) => entry.guid === guid)
    ?.starred;
}

async function seedJournal(app: App, lines: string[]): Promise<void> {
  await adapter(app).mkdir(`${PLUGIN_DIR}/device-local`);
  await adapter(app).write(JOURNAL_PATH, `${lines.join("\n")}\n`);
}

async function seedRawJournal(app: App, raw: string): Promise<void> {
  await adapter(app).mkdir(`${PLUGIN_DIR}/device-local`);
  await adapter(app).write(JOURNAL_PATH, raw);
}

/**
 * Observed on Obsidian 1.14.4 desktop: `adapter.rename` refuses an existing
 * destination with "Destination file already exists!". A rewrite of an existing
 * journal replaces one, so it cannot rely on rename overwriting it.
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

describe("device-local user-state journal (#1386)", () => {
  it("keeps the journal out of the shared metadata and shard folders", async () => {
    const { plugin } = await startPlugin();

    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);

    expect(JOURNAL_PATH.startsWith(`${METADATA_FOLDER}/`)).toBe(false);
    expect(JOURNAL_PATH.startsWith(`${SHARD_FOLDER}/`)).toBe(false);
    expect(await adapter(app).exists(JOURNAL_PATH)).toBe(true);
  });

  it("writes self-contained records with an ordered sequence, device, time, identity and changed fields", async () => {
    const { plugin } = await startPlugin();

    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
      { feedId: "feed-1", guid: SECOND_GUID, changes: { starred: true } },
    ]);

    const records = journalRecords(app);
    expect(records).toHaveLength(2);
    expect(Object.keys(records[0]).sort()).toEqual(
      ["changes", "deviceId", "feedId", "guid", "seq", "timestamp"].sort(),
    );
    expect(records.map((record) => record.seq)).toEqual([1, 2]);
    expect(records[0]).toMatchObject({
      feedId: "feed-1",
      guid: GUID,
      changes: { read: true },
    });
    expect(typeof records[0].deviceId).toBe("string");
    expect(String(records[0].deviceId).length).toBeGreaterThan(0);
    expect(typeof records[0].timestamp).toBe("number");
  });

  it("applies a record written before a crash on the next load", async () => {
    const { plugin } = await startPlugin();
    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true, starred: true } },
    ]);
    expect(readOf(plugin)).toBe(false);

    // The process ends before the snapshot is written; only the journal
    // record is durable.
    const { plugin: reloaded } = await startPlugin();

    expect(readOf(reloaded)).toBe(true);
    expect(starredOf(reloaded)).toBe(true);
  });

  it("ignores a truncated final record and keeps the earlier valid ones", async () => {
    await seedJournal(app, [
      journalRecord(1, GUID, { read: true }),
      journalRecord(2, SECOND_GUID, { starred: true }),
      '{"seq":3,"deviceId":"device-test","timestamp":1760000000',
    ]);

    const { plugin } = await startPlugin();

    expect(readOf(plugin)).toBe(true);
    expect(starredOf(plugin, SECOND_GUID)).toBe(true);
  });

  it("applies only records newer than this device's checkpoint", async () => {
    await adapter(app).write(
      USER_STATE_PATH,
      JSON.stringify({
        version: 5,
        checkpointSequence: 2,
        checkpointByDevice: { "device-test": 2 },
        states: {
          "feed-1:guid-1": { read: false, starred: false, saved: false },
        },
      }),
    );
    await seedJournal(app, [
      journalRecord(1, GUID, { starred: true }),
      journalRecord(2, GUID, { starred: false }),
      journalRecord(3, GUID, { read: true }),
    ]);

    const { plugin } = await startPlugin();

    expect(starredOf(plugin)).toBe(false);
    expect(readOf(plugin)).toBe(true);
  });

  it("tombstones a field a failed change added to a previously-absent article", () => {
    const states: Record<string, ArticleUserState> = {};
    const compensating = articleStateFromUpdates({ tags: undefined });
    expect(compensating.clearedFields).toContain("tags");

    foldUserStateJournalRecords(
      states,
      [
        {
          seq: 1,
          deviceId: "device-test",
          timestamp: 0,
          feedId: "feed-1",
          guid: GUID,
          changes: { tags: [{ name: "new", color: "#f00" }] },
        },
        {
          seq: 2,
          deviceId: "device-test",
          timestamp: 0,
          feedId: "feed-1",
          guid: GUID,
          changes: compensating,
        },
      ],
      {},
    );

    expect(states["feed-1:guid-1"]?.tags).toBeUndefined();
  });

  it("numbers a new record above the snapshot checkpoint even with an empty journal", async () => {
    await adapter(app).write(
      USER_STATE_PATH,
      JSON.stringify({
        version: 4,
        checkpointSequence: 5,
        states: {
          "feed-1:guid-1": { read: false, starred: false, saved: false },
        },
      }),
    );
    const { plugin } = await startPlugin();

    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);

    // The journal starts empty, so it has no record to derive the sequence
    // from; the snapshot's checkpoint is the floor (#1380).
    expect(journalRecords(app).map((record) => record.seq)).toEqual([6]);

    const { plugin: reloaded } = await startPlugin();
    expect(readOf(reloaded)).toBe(true);
  });

  it("raises the sequence floor when a checkpoint truncates past the journal", async () => {
    const journal = new UserStateJournal(app, { pluginDir: PLUGIN_DIR });
    await journal.append([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);

    await journal.truncateThrough(9);
    await journal.append([
      { feedId: "feed-1", guid: SECOND_GUID, changes: { starred: true } },
    ]);

    expect(journal.lastSequence).toBe(10);
    expect(journalRecords(app).map((record) => record.seq)).toEqual([10]);
  });

  it("truncates a journal file that already exists", async () => {
    await seedJournal(app, [
      journalRecord(1, GUID, { read: true }),
      journalRecord(2, SECOND_GUID, { starred: true }),
    ]);
    refuseRenameOntoExisting(app);
    const journal = new UserStateJournal(app, { pluginDir: PLUGIN_DIR });

    await journal.truncateThrough(1);

    expect(journalRecords(app).map((record) => record.seq)).toEqual([2]);
    expect(adapterFiles(app).has(`${JOURNAL_PATH}.tmp`)).toBe(false);
  });

  it("repairs a torn final line before appending so both records survive", async () => {
    await seedRawJournal(
      app,
      `${journalRecord(1, GUID, { read: true })}\n` +
        '{"seq":2,"deviceId":"device-test","timestamp":1760000000',
    );
    const { plugin } = await startPlugin();

    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: SECOND_GUID, changes: { starred: true } },
    ]);

    const raw = adapterFiles(app).get(JOURNAL_PATH) ?? "";
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).not.toContain('"timestamp":1760000000{"seq"');
    const records = journalRecords(app);
    expect(records[records.length - 1]?.seq).toBeGreaterThan(1);
    expect(records[records.length - 1]).toMatchObject({
      guid: SECOND_GUID,
      changes: { starred: true },
    });

    const { plugin: reloaded } = await startPlugin();
    expect(readOf(reloaded)).toBe(true);
    expect(starredOf(reloaded, SECOND_GUID)).toBe(true);
  });

  it("replaying the same journal twice produces the same state", async () => {
    await seedJournal(app, [
      journalRecord(1, GUID, {
        read: true,
        tags: [{ name: "later", color: "#f00" }],
      }),
      journalRecord(2, GUID, { starred: true }),
      journalRecord(3, SECOND_GUID, { saved: true, savedFilePath: "RSS/A.md" }),
    ]);

    const { plugin: first } = await startPlugin();
    const { plugin: second } = await startPlugin();

    expect(second.settings.feeds[0].items).toEqual(
      first.settings.feeds[0].items,
    );
    // The second start reads the first start's checkpoint back, which is the
    // point at which the journal may drop the records it covers (#1380); it
    // never invents or rewrites one.
    expect(journalRecords(app).every((record) => Number(record.seq) <= 3)).toBe(
      true,
    );
  });

  it("writes the shared snapshot with a bumped schema version and the journal checkpoint", async () => {
    const { plugin } = await startPlugin();
    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);
    plugin.settings.feeds[0].items[0].read = true;

    void plugin.queueArticleStateSave();
    await plugin.flushPendingWrites();

    const written = snapshot(app);
    expect(written.version).toBe(5);
    expect(written.checkpointSequence).toBe(1);
    expect(written.checkpointByDevice).toBeDefined();
    expect(written.states["feed-1:guid-1"]?.read).toBe(true);
  });

  it("keeps loading an older snapshot that has no checkpoint sequence", async () => {
    await adapter(app).write(
      USER_STATE_PATH,
      JSON.stringify({
        version: 3,
        states: {
          "feed-1:guid-1": { read: true, starred: true, saved: false },
        },
      }),
    );

    const { plugin } = await startPlugin();

    expect(readOf(plugin)).toBe(true);
    expect(starredOf(plugin)).toBe(true);
  });

  it("does not create or append to the journal when the settings load failed", async () => {
    const { plugin } = await startPlugin();
    plugin.loadData = vi.fn().mockRejectedValue(new Error("Load failed"));
    await plugin.loadSettings();
    const append = vi.spyOn(adapter(app), "append");

    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);

    expect(await adapter(app).exists(JOURNAL_PATH)).toBe(false);
    expect(append).not.toHaveBeenCalled();
  });

  it("shows one notice when journal appends keep failing", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { plugin } = await startPlugin();
    vi.spyOn(adapter(app), "append").mockRejectedValue(new Error("disk full"));

    await plugin.queueArticleStateSave([
      { feedUrl: FEED_URL, guid: GUID, changes: { read: true } },
    ]);
    await plugin.queueArticleStateSave([
      { feedUrl: FEED_URL, guid: SECOND_GUID, changes: { starred: true } },
    ]);

    const notices = debug.mock.calls
      .filter((args) => args[0] === "[Stub Notice]")
      .map((args) => String(args[1]))
      .filter((message) => message.includes("article state change"));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("disk full");
  });

  it("omits journal records from every export bundle and still round-trips article state", async () => {
    const { plugin } = await startPlugin();
    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);
    plugin.settings.feeds[0].items[0].read = true;
    void plugin.queueArticleStateSave();
    await plugin.flushPendingWrites();

    const repositoryApi = repository(plugin);
    const feedBundle = JSON.stringify(
      repositoryApi.buildFeedBundle(plugin.settings),
    );
    const settingsBundle = JSON.stringify(
      repositoryApi.buildSettingsBundle(plugin.settings),
    );
    const portableBundle = repositoryApi.buildPortableDataBundle(
      plugin.settings,
    );
    const portableJson = JSON.stringify(portableBundle);

    for (const json of [feedBundle, settingsBundle, portableJson]) {
      expect(json).not.toContain("device-test");
      expect(json).not.toContain("user-state-journal");
      expect(json).not.toContain(JOURNAL_PATH);
    }

    const roundTripped = repositoryApi.validatePortableDataBundle(
      JSON.parse(portableJson) as PortableDataBundle,
    );
    expect(roundTripped.shards[0].items[0]?.read).toBe(true);
  });

  it("folds the journal into the snapshot during a storage migration", async () => {
    const { plugin, saveData } = await startPlugin();
    await repository(plugin).recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);
    plugin.settings.feeds[0].items[0].read = true;

    await repository(plugin).migrateToVaultShardsV2(plugin.settings, saveData);

    // A migration needs one consistent snapshot, so the pending record is
    // folded in. The journal keeps it until a later load reads the checkpoint
    // back from disk (#1387, #1380).
    expect(journalRecords(app)).toHaveLength(1);
    expect(snapshot(app).states["feed-1:guid-1"]?.read).toBe(true);
    const journalPaths = [...adapterFiles(app).keys()].filter((path) =>
      path.includes("user-state-journal"),
    );
    expect(journalPaths).toEqual([JOURNAL_PATH]);
  });

  it("keeps the content-recording write wrapper off the device-local journal", async () => {
    const calls: string[] = [];
    const repositoryApi = new FeedStorageRepository(app, {
      writeWrapper: async (_target, write) => {
        calls.push("wrapped");
        return write();
      },
    });
    repositoryApi.configureDeviceLocalJournal({
      pluginDir: PLUGIN_DIR,
      isPersistenceSuppressed: () => false,
      getStorageMode: () => "vault-shards-v2",
    });

    await repositoryApi.recordArticleStateChanges([
      { feedId: "feed-1", guid: GUID, changes: { read: true } },
    ]);

    // The wrapper also suppresses the vault watcher for 3 s. A journal append
    // is device-local and must not hide a synced snapshot change (#1380).
    expect(calls).toEqual([]);
    expect(await adapter(app).exists(JOURNAL_PATH)).toBe(true);
  });
});
