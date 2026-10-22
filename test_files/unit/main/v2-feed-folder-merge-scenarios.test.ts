/**
 * Per-entry feed and folder merge under Sync arrival patterns (#1497).
 *
 * #1439 merges a delivered settings file into this device's feeds and folders
 * one entry at a time. Two plugins run through `onload()` on two mock vaults,
 * and a `SyncSimulator` delivers one's files to the other, so Obsidian's own
 * vault events and `onExternalSettingsChange` reach the real watcher wiring.
 * Fake timers decide when each file lands relative to the 1.5 s reload
 * debounce. Every scenario runs in `vault-location` mode (settings in a
 * visible `data.json`) and `plugin-default` mode (settings in the plugin's own
 * `data.json`), because the save guard has a separate writer for each.
 *
 * Not covered, because no mock can show it (DEC-008 of #1401): whether Sync's
 * JSON key merge collapses `feeds` before the plugin sees the file, and
 * bootstrap-pointer delivery. Those need a Real Sync pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type MockApp, type PluginManifest } from "obsidian";

vi.mock("../../../src/modals/whats-new-modal", () => ({
  WhatsNewModal: class {
    open = vi.fn();
  },
}));

vi.mock("../../../src/modals/storage-migration-modal", () => ({
  StorageMigrationModal: class {
    open = vi.fn();
  },
}));

import RssDashboardPlugin from "../../../main";
import { SyncSimulator } from "../sync-simulator";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type Folder,
  type RssDashboardSettings,
} from "../../../src/types/types";

type Mode = "vault-location" | "plugin-default";

const CONFIG_DIR = ".vault-config";
const PLUGIN_DIR = `${CONFIG_DIR}/plugins/rss-dashboard`;
const POINTER_PATH = `${PLUGIN_DIR}/data.json`;
const METADATA_FOLDER = "rss-dashboard-data";
const SHARD_FOLDER = `${METADATA_FOLDER}/feeds`;
const DATA_PATH = `${METADATA_FOLDER}/data.json`;
const RELOAD_MS = 1_500;
const VERSION = "2.7.0";

/** Where each mode keeps the settings Sync carries to the other device. */
function settingsPath(mode: Mode): string {
  return mode === "vault-location" ? DATA_PATH : POINTER_PATH;
}

function shardPath(feedId: string): string {
  return `${SHARD_FOLDER}/${feedId}.json`;
}

function feedUrl(feedId: string): string {
  return `https://example.com/${feedId}.xml`;
}

function item(feedId: string, guid: string): FeedItem {
  return {
    title: guid,
    link: `https://example.com/${feedId}/${guid}`,
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: feedId,
    feedUrl: feedUrl(feedId),
    coverImage: "",
  };
}

function feed(feedId: string, guids: string[], folder = ""): Feed {
  return {
    title: feedId,
    url: feedUrl(feedId),
    folder,
    lastUpdated: 0,
    feedId,
    items: guids.map((guid) => item(feedId, guid)),
  };
}

function v2Settings(
  mode: Mode,
  feeds: Feed[],
  folders: Folder[] = [],
): RssDashboardSettings {
  const base = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  base.lastShownVersion = VERSION;
  base.storageMode = "vault-shards-v2";
  base.storageFolder = SHARD_FOLDER;
  base.metadataStorageMode = mode;
  if (mode === "vault-location") base.metadataStorageFolder = METADATA_FOLDER;
  base.startupRefreshDelaySeconds = 3600;
  base.feeds = feeds;
  base.folders = folders;
  return base;
}

interface Device {
  app: MockApp;
  plugin: RssDashboardPlugin;
}

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: VERSION,
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: PLUGIN_DIR,
  };
}

/**
 * Starts a plugin through `onload()` on `app`. `loadData`/`saveData` read and
 * write the plugin folder's `data.json` on that vault's disk, as Obsidian does,
 * so a delivered file is what the next load reads.
 */
async function startDevice(app: MockApp): Promise<Device> {
  const plugin = new RssDashboardPlugin(app, manifest());
  plugin.loadData = vi.fn(async () => {
    const text = app.vault.filesOnDisk.get(POINTER_PATH);
    return text === undefined ? null : JSON.parse(text);
  });
  plugin.saveData = vi.fn(async (data: unknown) => {
    app.vault.filesOnDisk.set(POINTER_PATH, JSON.stringify(data));
  });
  plugin.refreshDashboardViews = vi.fn(async () => undefined);
  await plugin.onload();
  return { app, plugin };
}

/** A device that saved `settings` as Shard storage v2, every file written. */
async function savedDevice(
  mode: Mode,
  settings: RssDashboardSettings,
): Promise<Device> {
  const app = App.createMock();
  if (mode === "vault-location") {
    app.vault.addFolderOnDisk(METADATA_FOLDER);
    app.vault.filesOnDisk.set(DATA_PATH, JSON.stringify(settings));
    app.vault.filesOnDisk.set(
      POINTER_PATH,
      JSON.stringify({
        metadataStorageMode: settings.metadataStorageMode,
        metadataStorageFolder: settings.metadataStorageFolder,
        metadataStorageSchemaVersion: settings.metadataStorageSchemaVersion,
      }),
    );
  } else {
    app.vault.filesOnDisk.set(POINTER_PATH, JSON.stringify(settings));
  }
  const device = await startDevice(app);
  await device.plugin.saveSettings({
    forceAllShards: true,
    forceMetadata: true,
  });
  return device;
}

function feedOf(device: Device, feedId: string): Feed | undefined {
  return device.plugin.settings.feeds.find((f) => f.feedId === feedId);
}

function feedIds(device: Device): string[] {
  return device.plugin.settings.feeds.map((f) => f.feedId as string);
}

function guidsOf(device: Device, feedId: string): string[] {
  return (feedOf(device, feedId)?.items ?? []).map((i) => i.guid);
}

function folderNames(folders: Folder[], prefix = ""): string[] {
  return folders.flatMap((folder) => {
    const path = prefix ? `${prefix}/${folder.name}` : folder.name;
    return [path, ...folderNames(folder.subfolders, path)];
  });
}

/** The feeds the device last wrote to the settings file Sync carries. */
function feedsOnDisk(device: Device, mode: Mode): Feed[] {
  const text = device.app.vault.filesOnDisk.get(settingsPath(mode)) ?? "{}";
  return (JSON.parse(text) as { feeds?: Feed[] }).feeds ?? [];
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(RELOAD_MS);
}

/** Adds `added` to a device and saves, so its settings and shard are on disk. */
async function addFeed(device: Device, added: Feed): Promise<void> {
  device.plugin.settings.feeds.push(added);
  await device.plugin.saveSettings({ forceAllShards: true });
  await device.plugin.flushPendingWrites();
}

async function renameFeed(
  device: Device,
  feedId: string,
  title: string,
): Promise<void> {
  const target = feedOf(device, feedId);
  if (!target) throw new Error(`no feed ${feedId}`);
  target.title = title;
  await device.plugin.saveSettings();
  await device.plugin.flushPendingWrites();
}

describe.each(["vault-location", "plugin-default"] as const)(
  "per-entry feed and folder merge under Sync arrival patterns (%s) (#1497)",
  (mode) => {
    let devices: Device[];

    /** Two devices holding the first sync of `baseline`, joined both ways. */
    async function pair(
      baseline: Feed[],
      folders: Folder[] = [],
    ): Promise<{
      a: Device;
      b: Device;
      aToB: SyncSimulator;
      bToA: SyncSimulator;
    }> {
      const a = await savedDevice(mode, v2Settings(mode, baseline, folders));
      const bApp = App.createMock();
      const aToB = new SyncSimulator(a.app, bApp);
      await aToB.deliver();
      const b = await startDevice(bApp);
      const bToA = new SyncSimulator(b.app, a.app);
      devices.push(a, b);
      return { a, b, aToB, bToA };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(console, "debug").mockImplementation(() => undefined);
      devices = [];
    });

    afterEach(() => {
      for (const device of devices) device.plugin.onunload();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    describe("delivery inside the debounce window", () => {
      it.each([
        ["B adds a feed while A renames one", "a"],
        ["A adds a feed while B renames one", "b"],
      ] as const)(
        "%s: both entries survive a save made while the reload is pending",
        async (_label, adder) => {
          const { a, b, aToB, bToA } = await pair([feed("feed-a", ["a1"])]);
          const [from, to, send] = adder === "a" ? [a, b, aToB] : [b, a, bToA];
          await addFeed(from, feed("feed-b", ["b1", "b2"]));

          // The delivery starts a 1.5 s reload on the receiver; its own save
          // lands inside that window.
          await send.deliver({
            order: [settingsPath(mode), shardPath("feed-b")],
          });
          await vi.advanceTimersByTimeAsync(RELOAD_MS / 3);
          await renameFeed(to, "feed-a", "Renamed here");
          await settle();

          expect(feedIds(to)).toEqual(["feed-a", "feed-b"]);
          expect(feedOf(to, "feed-a")?.title).toBe("Renamed here");
          // BUG: pinned, see #1501. The save drops the shard's pending reload,
          // so the adopted feed stays empty in memory; the shard on disk is whole.
          expect(guidsOf(to, "feed-b")).toEqual([]);
          expect(
            JSON.parse(
              to.app.vault.filesOnDisk.get(shardPath("feed-b")) ?? "{}",
            ).items,
          ).toHaveLength(2);
          expect(feedIds(from)).toEqual(["feed-a", "feed-b"]);
          expect(feedsOnDisk(to, mode).map((entry) => entry.feedId)).toEqual([
            "feed-a",
            "feed-b",
          ]);
        },
      );
    });

    describe("delivery between a save and its write", () => {
      it("keeps both feeds when a file lands between two saves of the receiver", async () => {
        const { a, b, aToB } = await pair([feed("feed-a", ["a1"])]);
        await addFeed(a, feed("feed-b", ["b1", "b2"]));
        const delivery = aToB.startDelivery({
          order: [settingsPath(mode), shardPath("feed-b")],
        });

        expect(delivery.next()).toBe(settingsPath(mode));
        await renameFeed(b, "feed-a", "Renamed on the receiver");
        expect(delivery.next()).toBe(shardPath("feed-b"));
        await settle();

        expect(feedIds(b)).toEqual(["feed-a", "feed-b"]);
        expect(feedOf(b, "feed-a")?.title).toBe("Renamed on the receiver");
        expect(guidsOf(b, "feed-b")).toEqual(["b1", "b2"]);
        expect(feedIds(a)).toEqual(["feed-a", "feed-b"]);
      });

      it("keeps both feeds when a file lands while the receiver's save is in flight", async () => {
        const { a, b, aToB } = await pair([feed("feed-a", ["a1"])]);
        await addFeed(a, feed("feed-b", ["b1", "b2"]));
        const delivery = aToB.startDelivery({
          order: [settingsPath(mode), shardPath("feed-b")],
        });
        feedOf(b, "feed-a")!.title = "Renamed on the receiver";

        const saving = b.plugin.saveSettings();
        delivery.next();
        await saving;
        delivery.next();
        await b.plugin.flushPendingWrites();
        await settle();

        expect(feedIds(b)).toEqual(["feed-a", "feed-b"]);
        expect(feedOf(b, "feed-a")?.title).toBe("Renamed on the receiver");
        expect(feedIds(a)).toEqual(["feed-a", "feed-b"]);
      });

      it("writes the receiver's own feeds when the arriving file is half written, and takes the whole file when it lands", async () => {
        const { a, b, aToB } = await pair([feed("feed-a", ["a1"])]);
        await addFeed(a, feed("feed-b", ["b1"]));
        // The fail-open path: a file Sync has not finished writing is unreadable.
        b.app.vault.externalWrite(settingsPath(mode), '{"feeds": [{"feedId"');
        feedOf(b, "feed-a")!.title = "Renamed on the receiver";

        await expect(b.plugin.saveSettings()).resolves.toBeUndefined();
        await b.plugin.flushPendingWrites();
        expect(feedIds(b)).toEqual(["feed-a"]);
        expect(feedsOnDisk(b, mode).map((entry) => entry.feedId)).toEqual([
          "feed-a",
        ]);
        expect(feedIds(a)).toEqual(["feed-a", "feed-b"]);

        await aToB.deliver({
          order: [settingsPath(mode), shardPath("feed-b")],
        });
        await settle();
        expect(feedIds(b)).toEqual(["feed-a", "feed-b"]);
        expect(feedOf(b, "feed-a")?.title).toBe("Renamed on the receiver");
        expect(feedIds(a)).toEqual(["feed-a", "feed-b"]);
      });
    });

    describe("rename-shaped delivery", () => {
      const tree = (): Folder[] => [{ name: "A", subfolders: [] }];

      it("keeps a folder renamed here and drops the subfolder another device made under its old name", async () => {
        const { a, b, aToB } = await pair(
          [feed("feed-a", ["a1"], "A")],
          tree(),
        );
        a.plugin.settings.folders[0].subfolders.push({
          name: "Sub",
          subfolders: [],
        });
        await a.plugin.saveSettings();
        await a.plugin.flushPendingWrites();
        b.plugin.settings.folders[0].name = "A2";
        feedOf(b, "feed-a")!.folder = "A2";
        await b.plugin.saveSettings();
        await b.plugin.flushPendingWrites();

        // The file arrives the way a renamed one does (DEC-004 of #1401): its
        // new path is created, then the staged old path is deleted ~100 ms
        // later, and no `rename` event fires.
        const staged = settingsPath(mode).replace(
          /data\.json$/,
          "data.incoming",
        );
        b.app.vault.filesOnDisk.set(staged, "{}");
        await aToB.deliver({ only: [settingsPath(mode)] });
        await vi.advanceTimersByTimeAsync(100);
        b.app.vault.externalDelete(staged);
        await settle();

        expect(folderNames(b.plugin.settings.folders)).toEqual(["A2"]);
        expect(feedOf(b, "feed-a")?.folder).toBe("A2");
        expect(
          folderNames(
            JSON.parse(b.app.vault.filesOnDisk.get(settingsPath(mode)) ?? "{}")
              .folders ?? [],
          ),
        ).toEqual(["A2"]);
      });

      it("takes a folder the other device renamed, without leaving the old tree beside it", async () => {
        const { a, b, aToB } = await pair(
          [feed("feed-a", ["a1"], "A")],
          tree(),
        );
        a.plugin.settings.folders[0].name = "A2";
        feedOf(a, "feed-a")!.folder = "A2";
        await a.plugin.saveSettings();
        await a.plugin.flushPendingWrites();

        await aToB.deliver({ only: [settingsPath(mode)] });
        await settle();

        expect(folderNames(b.plugin.settings.folders)).toEqual(["A2"]);
        expect(feedOf(b, "feed-a")?.folder).toBe("A2");
      });
    });

    describe("order and delay permutations of the same two changes", () => {
      const deliveries: [
        string,
        (sim: SyncSimulator, files: string[]) => Promise<void> | void,
      ][] = [
        ["in order", (sim) => void sim.deliver({ order: "in-order" })],
        ["reversed", (sim) => void sim.deliver({ order: "reverse" })],
        [
          "an explicit order, shard first",
          (sim, [data, shard]) => void sim.deliver({ order: [shard, data] }),
        ],
        [
          "with a delay between files",
          async (sim, [data, shard]) => {
            const done = sim.deliver({ order: [data, shard], delayMs: 4_000 });
            await vi.advanceTimersByTimeAsync(4_000);
            await done;
          },
        ],
        [
          "one file per step",
          async (sim, [data, shard]) => {
            const delivery = sim.startDelivery({ order: [data, shard] });
            delivery.next();
            await vi.advanceTimersByTimeAsync(RELOAD_MS);
            delivery.next();
          },
        ],
        [
          "as one wave",
          (sim, [data, shard]) =>
            void sim.deliverWave({ order: [shard, data] }),
        ],
      ];

      it.each(deliveries)(
        "keeps both changes when A's files arrive %s",
        async (_label, deliver) => {
          const { a, b, aToB } = await pair([feed("feed-a", ["a1"])]);
          await addFeed(a, feed("feed-b", ["b1", "b2"]));
          await renameFeed(b, "feed-a", "Renamed on the receiver");

          await deliver(aToB, [settingsPath(mode), shardPath("feed-b")]);
          await settle();

          expect(feedIds(b)).toEqual(["feed-a", "feed-b"]);
          expect(feedOf(b, "feed-a")?.title).toBe("Renamed on the receiver");
          expect(guidsOf(b, "feed-b")).toEqual(["b1", "b2"]);
        },
      );

      it("shows the added feed empty when only the settings file arrives, and fills it when the shard follows", async () => {
        const { a, b, aToB } = await pair([feed("feed-a", ["a1"])]);
        await addFeed(a, feed("feed-b", ["b1", "b2"]));
        await renameFeed(b, "feed-a", "Renamed on the receiver");

        await aToB.deliver({ only: [settingsPath(mode)] });
        await settle();
        expect(feedIds(b)).toEqual(["feed-a", "feed-b"]);
        expect(feedOf(b, "feed-a")?.title).toBe("Renamed on the receiver");
        expect(guidsOf(b, "feed-b")).toEqual([]);

        await aToB.deliver({ only: [shardPath("feed-b")] });
        await settle();
        expect(guidsOf(b, "feed-b")).toEqual(["b1", "b2"]);
        expect(feedOf(b, "feed-a")?.title).toBe("Renamed on the receiver");
      });
    });

    describe("articles on an adopted feed", () => {
      it("keeps the loaded articles and the feed's id when a delivery changes its config", async () => {
        const { a, b, aToB } = await pair([feed("feed-a", ["a1", "a2"])]);
        await renameFeed(a, "feed-a", "Renamed on the sender");
        expect(guidsOf(b, "feed-a")).toEqual(["a1", "a2"]);

        await aToB.deliver({ only: [settingsPath(mode)] });
        await settle();

        expect(feedOf(b, "feed-a")?.title).toBe("Renamed on the sender");
        expect(feedOf(b, "feed-a")?.feedId).toBe("feed-a");
        expect(guidsOf(b, "feed-a")).toEqual(["a1", "a2"]);
      });

      it("keeps the loaded articles and the feed's id when the delivered entry has no id", async () => {
        const { a, b, aToB } = await pair([feed("feed-a", ["a1", "a2"])]);
        await renameFeed(a, "feed-a", "Renamed on the sender");
        // An older device wrote the entry without its id.
        const text = a.app.vault.filesOnDisk.get(settingsPath(mode)) ?? "{}";
        const parsed = JSON.parse(text) as { feeds: Partial<Feed>[] };
        for (const entry of parsed.feeds) delete entry.feedId;
        a.app.vault.filesOnDisk.set(settingsPath(mode), JSON.stringify(parsed));

        await aToB.deliver({ only: [settingsPath(mode)] });
        await settle();

        expect(feedOf(b, "feed-a")?.title).toBe("Renamed on the sender");
        expect(feedOf(b, "feed-a")?.feedId).toBe("feed-a");
        expect(guidsOf(b, "feed-a")).toEqual(["a1", "a2"]);
      });
    });
  },
);
