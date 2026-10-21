/**
 * A feed shard is judged by the same Own write record as `data.json` and
 * `user-state.json` (#1422): by comparable content, through the debounced
 * touched-path check. A shard that differs only in key order, `_syncNonce` or
 * `_syncPad` is this device's own content and triggers no reload.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { App } from "obsidian";

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
import { withSyncNonce } from "../../../src/services/storage-json";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

const FEED_ID = "feed-1";
const SHARD_PATH = `.rss-dashboard-data/feeds/${FEED_ID}.json`;
const RELOAD_DEBOUNCE_MS = 1_500;

type VaultHandler = (...args: unknown[]) => void;

interface VaultAdapterStub {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

function shardObject(
  items: unknown[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 2,
    feedId: FEED_ID,
    feedUrl: "https://example.com/rss.xml",
    updatedAt: 1,
    items,
    ...extra,
  };
}

function reversed(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).reverse());
}

describe("shard Own write record (#1422)", () => {
  let app: App;
  let plugin: RssDashboardPlugin;
  let handlers: Record<string, VaultHandler>;
  let loadData: ReturnType<typeof vi.fn>;
  let redraws: MockInstance;

  function adapter(): VaultAdapterStub {
    return app.vault.adapter as unknown as VaultAdapterStub;
  }

  function reloads(): number {
    return loadData.mock.calls.length - 1;
  }

  async function start(initialShard: string): Promise<void> {
    await adapter().mkdir(".rss-dashboard-data/feeds");
    await adapter().write(SHARD_PATH, initialShard);
    const feed: Feed = {
      title: "Feed 1",
      url: "https://example.com/Feed 1.xml",
      folder: "RSS",
      items: [],
      lastUpdated: 0,
      feedId: FEED_ID,
    };
    const settings = {
      ...(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings),
      lastShownVersion: "2.7.0",
      storageMode: "vault-shards-v2",
      startupRefreshDelaySeconds: 3600,
      feeds: [feed],
    } as RssDashboardSettings;
    vi.useFakeTimers();
    plugin = new RssDashboardPlugin(app, {
      id: "rss-dashboard",
      name: "RSS Dashboard",
      version: "2.7.0",
      minAppVersion: "1.8.7",
      author: "test",
      description: "test",
      dir: "plugins/rss-dashboard",
    });
    loadData = vi.fn(() =>
      Promise.resolve(JSON.parse(JSON.stringify(settings))),
    );
    plugin.loadData = loadData as unknown as typeof plugin.loadData;
    plugin.saveData = vi.fn(() => Promise.resolve());
    redraws = vi
      .spyOn(plugin, "refreshDashboardViews")
      .mockResolvedValue(undefined);
    await plugin.onload();
  }

  async function syncShardIn(text: string): Promise<void> {
    await adapter().write(SHARD_PATH, text);
    handlers.modify?.({ path: SHARD_PATH });
    await vi.advanceTimersByTimeAsync(RELOAD_DEBOUNCE_MS);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    app = App.createMock();
    handlers = {};
    app.vault.on = vi.fn((event: string, callback: VaultHandler) => {
      handlers[event] = callback;
      return {};
    }) as unknown as typeof app.vault.on;
  });

  afterEach(() => {
    plugin.onunload();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const items = [{ guid: "item-1", title: "Item 1" }];

  it("skips a shard that differs only in key order", async () => {
    await start(JSON.stringify(shardObject(items), null, 2));

    await syncShardIn(
      JSON.stringify(
        reversed(shardObject([{ title: "Item 1", guid: "item-1" }])),
      ),
    );

    expect(reloads()).toBe(0);
    expect(redraws).not.toHaveBeenCalled();
  });

  it("skips a shard that differs only in _syncNonce and _syncPad", async () => {
    await start(JSON.stringify(shardObject(items)));

    await syncShardIn(JSON.stringify(withSyncNonce(shardObject(items))));

    expect(reloads()).toBe(0);
  });

  it("reloads once when the shard really changed", async () => {
    await start(JSON.stringify(shardObject(items)));

    await syncShardIn(
      JSON.stringify(
        withSyncNonce(
          shardObject([...items, { guid: "item-2", title: "Two" }]),
        ),
      ),
    );

    expect(reloads()).toBe(1);
    expect(redraws).toHaveBeenCalledTimes(1);
  });

  it("judges a shard event after the debounce, not at event time", async () => {
    await start(JSON.stringify(shardObject(items)));
    await adapter().write(
      SHARD_PATH,
      JSON.stringify(shardObject([...items, { guid: "item-2" }])),
    );

    handlers.modify?.({ path: SHARD_PATH });
    await vi.advanceTimersByTimeAsync(RELOAD_DEBOUNCE_MS - 1);
    expect(reloads()).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(reloads()).toBe(1);
  });
});
