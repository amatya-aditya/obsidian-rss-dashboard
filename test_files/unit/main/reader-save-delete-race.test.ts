import { afterEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest, type WorkspaceLeaf } from "obsidian";

vi.mock("obsidian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("obsidian")>()),
  // Exercise the supported API branch with controlled deferred-load timing.
  requireApiVersion: () => true,
}));
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
import { DEFAULT_SETTINGS, type FeedItem } from "../../../src/types/types";
import {
  ReaderView,
  RSS_READER_VIEW_TYPE,
} from "../../../src/views/reader-view";
import { RSS_DASHBOARD_VIEW_TYPE } from "../../../src/views/dashboard-view";

function gate() {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

interface SaveCallbacks {
  onArticleSaved(item: FeedItem): Promise<void>;
  handleSavedArticlePathDeleted(file: { path: string }): Promise<void>;
  updateArticleFromReader(
    item: FeedItem,
    updates: Partial<FeedItem>,
  ): Promise<void>;
}

describe("Reader save/delete continuations", () => {
  let plugin: RssDashboardPlugin | undefined;
  afterEach(() => {
    plugin?.onunload();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ["persistence", "dashboard", true],
    ["persistence", "reader", true],
    ["persistence", "dashboard", false],
    ["persistence", "reader", false],
    ["leaf load", "dashboard", true],
    ["leaf load", "reader", true],
    ["leaf load", "dashboard", false],
    ["leaf load", "reader", false],
  ] as const)(
    "%s with %s leaf: delete while pending=%s",
    async (delay, target, deleteWhilePending) => {
      vi.useFakeTimers();
      const app = App.createMock();
      const handlers = new Map<string, (...args: unknown[]) => void>();
      vi.spyOn(app.vault, "on").mockImplementation((event, callback) => {
        handlers.set(event, callback);
        return { name: event, e: app.vault };
      });
      const item: FeedItem = {
        title: "Race article",
        link: "https://example.com/article",
        description: "Article body",
        pubDate: "2026-10-07",
        guid: "race-article",
        feedTitle: "Example",
        feedUrl: "https://example.com/feed",
        coverImage: "",
      };
      const settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        storageMode: "legacy-json",
        lastShownVersion: "2.7.0",
        autoBackup: {
          backupDataJson: false,
          backupOpml: false,
          backupUserdata: false,
        },
        feeds: [
          {
            title: "Example",
            url: item.feedUrl,
            folder: "",
            lastUpdated: 0,
            items: [item],
          },
        ],
      };
      const manifest: PluginManifest = {
        id: "rss-dashboard",
        name: "RSS Dashboard",
        version: "2.7.0",
        minAppVersion: "1.8.7",
        author: "test",
        description: "test",
        dir: ".",
      };
      const currentPlugin = new RssDashboardPlugin(app, manifest);
      plugin = currentPlugin;
      currentPlugin.loadData = vi.fn().mockResolvedValue(settings);
      const saveData = vi.fn().mockResolvedValue(undefined);
      currentPlugin.saveData = saveData;
      const factories = new Map<
        string,
        Parameters<RssDashboardPlugin["registerView"]>[1]
      >();
      vi.spyOn(currentPlugin, "registerView").mockImplementation(
        (type, factory) => {
          factories.set(type, factory);
        },
      );
      await currentPlugin.onload();
      const createView = (type: string) => {
        const factory = factories.get(type);
        if (!factory) throw new Error(`Missing view factory: ${type}`);
        return factory({ app } as unknown as WorkspaceLeaf);
      };
      const source = createView(RSS_READER_VIEW_TYPE);
      if (!(source instanceof ReaderView))
        throw new Error("Expected source Reader");
      const backingItem = currentPlugin.settings.feeds[0].items[0];
      (source as unknown as { currentItem: FeedItem }).currentItem =
        backingItem;
      const targetType =
        target === "dashboard" ? RSS_DASHBOARD_VIEW_TYPE : RSS_READER_VIEW_TYPE;
      const otherView = createView(targetType);
      if (otherView instanceof ReaderView) {
        (otherView as unknown as { currentItem: FeedItem }).currentItem =
          backingItem;
      }
      const hold = gate();
      const persistence = gate();
      let deferLoading = false;
      const load = vi.fn(() =>
        deferLoading ? hold.pending : Promise.resolve(),
      );
      const otherLeaf = {
        app,
        view: otherView,
        loadIfDeferred: load,
        updateHeader: () => {},
      };
      const sourceLeaf = {
        app,
        view: source,
        loadIfDeferred: () => Promise.resolve(),
        updateHeader: () => {},
      };
      vi.spyOn(app.workspace, "getLeavesOfType").mockImplementation((type) => {
        const leaves: (typeof otherLeaf | typeof sourceLeaf)[] =
          type === RSS_READER_VIEW_TYPE ? [sourceLeaf] : [];
        if (type === targetType) leaves.push(otherLeaf);
        return leaves;
      });
      const callbacks = currentPlugin as unknown as SaveCallbacks;
      const saved = vi.spyOn(callbacks, "onArticleSaved");
      const deleted = vi.spyOn(callbacks, "handleSavedArticlePathDeleted");
      const readerUpdated = vi.spyOn(callbacks, "updateArticleFromReader");
      let persistenceHeld = false;
      const persist = currentPlugin.saveSettings.bind(currentPlugin);
      vi.spyOn(currentPlugin, "saveSettings").mockImplementation(async () => {
        await persist();
        if (!persistenceHeld) {
          persistenceHeld = true;
          await persistence.pending;
        }
      });
      await source.actionSaveCurrentArticle();
      await vi.waitFor(() => {
        expect(saved).toHaveBeenCalledOnce();
        expect(persistenceHeld).toBe(true);
      });
      // Finish the Reader's immediate label update before delaying the older
      // save notification. Both callbacks run their real implementations.
      await readerUpdated.mock.results[0].value;
      const saveCompletion = saved.mock.results[0].value;
      if (delay === "leaf load") {
        load.mockClear();
        deferLoading = true;
        persistence.release();
        await vi.waitFor(() => expect(load).toHaveBeenCalled());
      }
      const path = backingItem.savedFilePath;
      if (!path) throw new Error("Save did not produce a note path");
      const file = app.vault.getAbstractFileByPath(path);
      if (!file) throw new Error("Save did not create a vault note");
      if (!deleteWhilePending) {
        hold.release();
        persistence.release();
        await saveCompletion;
      }
      await app.vault.delete(file as never);
      const deleteHandler = handlers.get("delete");
      if (!deleteHandler) throw new Error("Delete handler was not registered");
      deleteHandler(file);
      expect(backingItem.saved).toBe(false);
      if (delay === "leaf load" && deleteWhilePending) {
        // Both the older save and the deletion now wait on the same leaf.
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      }
      hold.release();
      persistence.release();
      await saveCompletion;
      await deleted.mock.results[0].value;
      expect(app.vault.getAbstractFileByPath(path)).toBeNull();
      expect(backingItem).toMatchObject({
        saved: false,
        savedFilePath: undefined,
      });
      expect(
        backingItem.tags?.some((tag) => tag.name.toLowerCase() === "saved"),
      ).toBe(false);
      const persisted = saveData.mock.lastCall?.[0];
      expect(persisted.feeds[0].items[0]).toMatchObject({ saved: false });
      expect(persisted.feeds[0].items[0].savedFilePath).toBeUndefined();
    },
  );
});
