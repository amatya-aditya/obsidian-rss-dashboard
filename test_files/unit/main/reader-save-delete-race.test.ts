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

function createDeferredCompletion() {
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
    document.body.empty();
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
    ["overlapping label update", "dashboard", true],
    ["overlapping label update", "reader", true],
    ["overlapping label update", "dashboard", false],
    ["overlapping label update", "reader", false],
  ] as const)(
    "keeps a deleted note unsaved after %s in a %s leaf (delete while pending=%s)",
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
        availableTags: [],
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
      const saveButton = source.containerEl.createEl("button");
      // Supply the Reader's selected article and button without fetching content.
      Object.assign(
        source as unknown as {
          currentItem: FeedItem;
          currentDisplayTitle: string;
          saveButton: HTMLElement;
        },
        {
          currentItem: backingItem,
          currentDisplayTitle: "Reader title",
          saveButton,
        },
      );
      const targetType =
        target === "dashboard" ? RSS_DASHBOARD_VIEW_TYPE : RSS_READER_VIEW_TYPE;
      const otherView = createView(targetType);
      if (otherView instanceof ReaderView) {
        (otherView as unknown as { currentItem: FeedItem }).currentItem =
          backingItem;
      }
      const hold = createDeferredCompletion();
      const persistence = createDeferredCompletion();
      let deferLoading = delay === "overlapping label update";
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
      expect(saveButton.classList.contains("saved")).toBe(true);
      await vi.waitFor(() => {
        expect(saved).toHaveBeenCalledOnce();
        expect(persistenceHeld).toBe(true);
      });
      // Keep any label-update callback pending when the leaf was deferred
      // before Save; the other schedules isolate the older save notification.
      if (delay !== "overlapping label update") {
        await Promise.all(
          readerUpdated.mock.results.map((result) => result.value),
        );
      }
      const saveCompletion = saved.mock.results[0].value;
      if (delay === "leaf load") {
        load.mockClear();
        deferLoading = true;
        persistence.release();
        await vi.waitFor(() => expect(load).toHaveBeenCalled());
      }
      const expectedSaveLoads =
        delay === "overlapping label update"
          ? 1 + readerUpdated.mock.calls.length
          : 1;
      if (delay === "overlapping label update") {
        persistence.release();
        await vi.waitFor(() =>
          expect(load.mock.calls.length).toBeGreaterThanOrEqual(
            expectedSaveLoads,
          ),
        );
      }
      const path = backingItem.savedFilePath;
      if (!path) throw new Error("Save did not produce a note path");
      const file = app.vault.getAbstractFileByPath(path);
      if (!file) throw new Error("Save did not create a vault note");
      if (!deleteWhilePending) {
        hold.release();
        persistence.release();
        await saveCompletion;
        await Promise.all(
          readerUpdated.mock.results.map((result) => result.value),
        );
        expect(backingItem).toMatchObject({ saved: true, savedFilePath: path });
        expect(backingItem.tags).toContainEqual({
          name: "Saved",
          color: "#3498db",
        });
      }
      await app.vault.delete(file as never);
      const deleteHandler = handlers.get("delete");
      if (!deleteHandler) throw new Error("Delete handler was not registered");
      deleteHandler(file);
      expect(backingItem.saved).toBe(false);
      if (delay !== "persistence" && deleteWhilePending) {
        // Both the older save and the deletion now wait on the same leaf.
        await vi.waitFor(() =>
          expect(load.mock.calls.length).toBeGreaterThanOrEqual(
            expectedSaveLoads + 1,
          ),
        );
      }
      hold.release();
      persistence.release();
      await saveCompletion;
      await deleted.mock.results[0].value;
      await Promise.all(
        readerUpdated.mock.results.map((result) => result.value),
      );
      expect(app.vault.getAbstractFileByPath(path)).toBeNull();
      expect(saveButton.classList.contains("saved")).toBe(false);
      expect(saveButton.getAttribute("aria-label")).toBe("Save article");
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

  it.each([
    ["an empty feedUrl", ""],
    ["a stale feedUrl", "https://example.com/old-feed-url"],
  ] as const)(
    "persists Saved state for an article saved with %s",
    async (_label, feedUrl) => {
      const app = App.createMock();
      const manifest: PluginManifest = {
        id: "rss-dashboard",
        name: "RSS Dashboard",
        version: "2.7.0",
        minAppVersion: "1.8.7",
        author: "test",
        description: "test",
        dir: ".",
      };
      const item: FeedItem = {
        title: "Fallback article",
        link: "https://example.com/fallback",
        description: "Article body",
        pubDate: "2026-10-07",
        guid: "fallback-article",
        feedTitle: "Example",
        feedUrl: "https://example.com/feed",
        coverImage: "",
      };
      const settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        storageMode: "legacy-json",
        availableTags: [],
        lastShownVersion: "2.7.0",
        autoBackup: {
          backupDataJson: false,
          backupOpml: false,
          backupUserdata: false,
        },
        feeds: [
          {
            title: "Example",
            url: "https://example.com/feed",
            folder: "",
            lastUpdated: 0,
            items: [item],
          },
        ],
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
      const reader = factories.get(RSS_READER_VIEW_TYPE)?.({
        app,
      } as unknown as WorkspaceLeaf);
      if (!(reader instanceof ReaderView)) throw new Error("Expected Reader");
      const applyExternalUpdate = vi
        .spyOn(reader, "applyExternalUpdate")
        .mockImplementation(() => {});
      vi.spyOn(app.workspace, "getLeavesOfType").mockImplementation((type) =>
        type === RSS_READER_VIEW_TYPE
          ? [
              {
                app,
                view: reader,
                loadIfDeferred: () => Promise.resolve(),
              } as unknown as WorkspaceLeaf,
            ]
          : [],
      );

      const readerCopy: FeedItem = {
        ...currentPlugin.settings.feeds[0].items[0],
        feedUrl,
        saved: true,
        savedFilePath: "Saved/Fallback article.md",
      };
      await (currentPlugin as unknown as SaveCallbacks).onArticleSaved(
        readerCopy,
      );

      const backingItem = currentPlugin.settings.feeds[0].items[0];
      expect(backingItem).toMatchObject({
        saved: true,
        savedFilePath: "Saved/Fallback article.md",
      });
      const persisted = saveData.mock.lastCall?.[0];
      expect(persisted.feeds[0].items[0]).toMatchObject({
        saved: true,
        savedFilePath: "Saved/Fallback article.md",
      });
      // Open views are told about the article under its owning feed.
      expect(applyExternalUpdate).toHaveBeenCalledWith(
        "fallback-article",
        expect.objectContaining({
          saved: true,
          savedFilePath: "Saved/Fallback article.md",
        }),
        "https://example.com/feed",
      );
    },
  );
});
