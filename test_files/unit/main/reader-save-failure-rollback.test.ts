import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest, type WorkspaceLeaf } from "obsidian";

const notices = vi.hoisted(() => [] as string[]);

vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("obsidian")>();
  return {
    ...actual,
    Notice: class {
      constructor(message: string) {
        notices.push(message);
      }
      hide() {}
    },
  };
});
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

// The Reader's toggles persist through the plugin; these tests force the
// settings save to reject and check what the user and every view observe.
describe("Reader save failure rollback", () => {
  let plugin: RssDashboardPlugin | undefined;
  let reader: ReaderView;
  let backingItem: FeedItem;
  let starButton: HTMLElement;

  beforeEach(async () => {
    notices.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = App.createMock();
    const item: FeedItem = {
      title: "Article",
      link: "https://example.com/article",
      description: "Body",
      pubDate: "2026-10-07",
      guid: "article-1",
      feedTitle: "Example",
      feedUrl: "https://example.com/feed",
      coverImage: "",
      read: false,
      starred: false,
      tags: [],
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
    const current = new RssDashboardPlugin(app, manifest);
    plugin = current;
    current.loadData = vi.fn().mockResolvedValue(settings);
    current.saveData = vi.fn().mockResolvedValue(undefined);
    const factories = new Map<
      string,
      Parameters<RssDashboardPlugin["registerView"]>[1]
    >();
    vi.spyOn(current, "registerView").mockImplementation((type, factory) => {
      factories.set(type, factory);
    });
    await current.onload();
    const view = factories.get(RSS_READER_VIEW_TYPE)?.({
      app,
    } as unknown as WorkspaceLeaf);
    if (!(view instanceof ReaderView)) throw new Error("Expected Reader");
    reader = view;
    backingItem = current.settings.feeds[0].items[0];
    starButton = reader.containerEl.createEl("button");
    // Supply the selected article and toolbar button without fetching content.
    Object.assign(reader as unknown as Record<string, unknown>, {
      currentItem: backingItem,
      starToggleButton: starButton,
    });
    vi.spyOn(app.workspace, "getLeavesOfType").mockImplementation((type) =>
      type === RSS_READER_VIEW_TYPE
        ? ([
            {
              app,
              view: reader,
              loadIfDeferred: () => Promise.resolve(),
              updateHeader: () => {},
            },
          ] as unknown as ReturnType<typeof app.workspace.getLeavesOfType>)
        : [],
    );
  });

  afterEach(() => {
    plugin?.onunload();
    vi.restoreAllMocks();
  });

  it("restores the star and tells the user when the save rejects", async () => {
    vi.spyOn(plugin!, "saveSettings").mockRejectedValueOnce(
      new Error("disk full"),
    );

    reader.actionToggleStarStatus();

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toMatch(/couldn't save/i);
    expect(backingItem.starred).toBe(false);
    expect(starButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("restores the read state when the save rejects", async () => {
    vi.spyOn(plugin!, "saveSettings").mockRejectedValueOnce(
      new Error("disk full"),
    );

    reader.actionToggleReadStatus();

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(backingItem.read).toBe(false);
  });

  it("restores the tags in every open view when the save rejects", async () => {
    vi.spyOn(plugin!, "saveSettings").mockRejectedValueOnce(
      new Error("disk full"),
    );
    const applied = vi.spyOn(reader, "applyExternalUpdate");

    (
      reader as unknown as {
        toggleTag(
          i: FeedItem,
          t: { name: string; color: string },
          a: boolean,
        ): void;
      }
    ).toggleTag(backingItem, { name: "later", color: "#111111" }, true);

    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(backingItem.tags).toEqual([]);
    // The last update other views receive must carry the previous tags.
    const lastUpdate = applied.mock.calls[applied.mock.calls.length - 1][1];
    expect(lastUpdate.tags).toEqual([]);
  });

  it("keeps the star and shows no error when the save succeeds", async () => {
    reader.actionToggleStarStatus();

    await vi.waitFor(() => expect(backingItem.starred).toBe(true));
    await vi.waitFor(() =>
      expect(starButton.getAttribute("aria-pressed")).toBe("true"),
    );
    expect(notices).toEqual([]);
  });
});
