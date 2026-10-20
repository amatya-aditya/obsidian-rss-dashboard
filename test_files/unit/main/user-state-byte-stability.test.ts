/**
 * `user-state.json` stays byte-identical when nothing changed (#1411).
 *
 * Every snapshot write stamps a fresh sync nonce, so a load or reload that
 * rewrote an unchanged snapshot made Obsidian Sync see a changed file. These
 * tests drive the plugin facade and assert on the bytes in the vault.
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
  remove(path: string): Promise<void>;
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

/** Records every vault call that would touch the snapshot's bytes. */
function spyOnSnapshotWrites() {
  const write = vi.spyOn(adapter(app), "write");
  const rename = vi.spyOn(adapter(app), "rename");
  const remove = vi.spyOn(adapter(app), "remove");
  return {
    count(): number {
      const wrote = write.mock.calls.filter(
        ([path]) => path === USER_STATE_TEMP_PATH || path === USER_STATE_PATH,
      );
      const renamed = rename.mock.calls.filter(
        ([, to]) => to === USER_STATE_PATH,
      );
      const removed = remove.mock.calls.filter(
        ([path]) => path === USER_STATE_PATH || path === USER_STATE_TEMP_PATH,
      );
      return wrote.length + renamed.length + removed.length;
    },
  };
}

describe("user-state.json byte stability (#1411)", () => {
  it("leaves the snapshot byte-identical when a save changes no state", async () => {
    const { plugin } = await startPlugin();
    await plugin.queueArticleStateSave([
      { feedUrl: FEED_URL, guid: GUID, changes: { read: true } },
    ]);
    await plugin.flushPendingWrites();
    const before = adapterFiles(app).get(USER_STATE_PATH);
    const writes = spyOnSnapshotWrites();

    await plugin.saveSettings();
    await plugin.saveSettings();

    expect(adapterFiles(app).get(USER_STATE_PATH)).toBe(before);
    expect(writes.count()).toBe(0);
  });

  it("leaves the snapshot byte-identical across a plugin reload", async () => {
    const first = await startPlugin();
    await first.plugin.queueArticleStateSave([
      { feedUrl: FEED_URL, guid: GUID, changes: { read: true } },
    ]);
    await first.plugin.flushPendingWrites();
    const before = adapterFiles(app).get(USER_STATE_PATH);

    const second = await startPlugin();
    await second.plugin.saveSettings();
    await second.plugin.flushPendingWrites();

    expect(adapterFiles(app).get(USER_STATE_PATH)).toBe(before);
  });

  it("still truncates the journal through the on-disk checkpoint when the write is skipped", async () => {
    const { plugin } = await startPlugin();
    await plugin.queueArticleStateSave([
      { feedUrl: FEED_URL, guid: GUID, changes: { read: true } },
    ]);
    await plugin.flushPendingWrites();
    // The checkpoint is kept in the journal until a later save reads it back.
    expect(journalRecords(app)).toHaveLength(1);
    const before = adapterFiles(app).get(USER_STATE_PATH);

    await plugin.saveSettings();

    expect(adapterFiles(app).get(USER_STATE_PATH)).toBe(before);
    expect(journalRecords(app)).toEqual([]);
  });

  it("still writes when an article's state really changes", async () => {
    const { plugin } = await startPlugin();
    await plugin.saveSettings();
    const before = adapterFiles(app).get(USER_STATE_PATH);

    plugin.settings.feeds[0].items[0].starred = true;
    await plugin.queueArticleStateSave([
      { feedUrl: FEED_URL, guid: GUID, changes: { starred: true } },
    ]);
    await plugin.flushPendingWrites();

    expect(adapterFiles(app).get(USER_STATE_PATH)).not.toBe(before);
    expect(snapshot(app).states["feed-1:" + GUID]).toMatchObject({
      starred: true,
    });
  });

  it("still writes when a journal fold advances the checkpoint", async () => {
    const { plugin } = await startPlugin();
    await plugin.saveSettings();
    expect(snapshot(app).checkpointSequence).toBeUndefined();

    await plugin.queueArticleStateSave([
      { feedUrl: FEED_URL, guid: GUID, changes: { read: true } },
    ]);
    await plugin.flushPendingWrites();

    expect(snapshot(app).checkpointSequence).toBe(1);
  });
});
