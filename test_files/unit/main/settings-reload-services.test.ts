import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest, type WorkspaceLeaf } from "obsidian";

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
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import {
  ReaderView,
  RSS_READER_VIEW_TYPE,
} from "../../../src/views/reader-view";

type VaultEventHandler = (...args: unknown[]) => void;

interface VaultAdapterStub {
  read(path: string): Promise<string>;
}

function manifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "test",
    description: "test",
    dir: ".",
  };
}

function feed(title: string, folder: string): Feed {
  return {
    title,
    url: `https://example.com/${title}.xml`,
    folder,
    items: [],
    lastUpdated: 0,
  };
}

function savedSettings(
  feeds: Feed[],
  folderNames: string[],
): RssDashboardSettings {
  return {
    ...(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings),
    lastShownVersion: "2.7.0",
    autoBackup: {
      backupDataJson: false,
      backupOpml: true,
      backupUserdata: false,
    },
    feeds,
    folders: folderNames.map((name) => ({
      name,
      subfolders: [],
      createdAt: 0,
      modifiedAt: 0,
    })),
  };
}

describe("services after settings are reloaded from another device", () => {
  let app: App;
  let plugin: RssDashboardPlugin;
  let handlers: Record<string, VaultEventHandler>;
  let storedData: RssDashboardSettings;
  let createReaderView: ((leaf: WorkspaceLeaf) => ReaderView) | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    app = App.createMock();
    handlers = {};
    // Capture the vault watcher so the test can simulate a synced data.json.
    app.vault.on = vi.fn((event: string, callback: VaultEventHandler) => {
      handlers[event] = callback;
      return {};
    }) as unknown as typeof app.vault.on;

    storedData = savedSettings([feed("before-sync", "Local")], ["Local"]);
    plugin = new RssDashboardPlugin(app, manifest());
    plugin.loadData = vi.fn(() =>
      Promise.resolve(JSON.parse(JSON.stringify(storedData)) as unknown),
    );
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(plugin, "registerView").mockImplementation((type, creator) => {
      if (type === RSS_READER_VIEW_TYPE) {
        createReaderView = (leaf) => creator(leaf) as ReaderView;
      }
    });
    await plugin.onload();
  });

  afterEach(() => {
    plugin.onunload();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function syncFromAnotherDevice(
    next: RssDashboardSettings,
  ): Promise<void> {
    storedData = next;
    handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
    await vi.advanceTimersByTimeAsync(1_500);
  }

  it("backs up the reloaded feed list, not the one from before the sync", async () => {
    await syncFromAnotherDevice(
      savedSettings([feed("after-sync", "Synced")], ["Synced"]),
    );

    await plugin.performAutoBackups();

    const opml = await (
      app.vault.adapter as unknown as VaultAdapterStub
    ).read("./feeds.opml.backup");
    expect(opml).toContain("after-sync");
    expect(opml).not.toContain("before-sync");
  });

  it("saves from an open reader with the reloaded folder and template", async () => {
    const existingFeed = storedData.feeds[0];
    existingFeed.customTemplate = "old-template";
    storedData.articleSaving = {
      ...storedData.articleSaving,
      defaultFolder: "Old articles",
      defaultTemplate: "# Old {{title}}\n\n{{content}}",
      savedTemplates: [
        {
          id: "old-template",
          name: "Old template",
          template: "# Old custom {{title}}\n\n{{content}}",
        },
      ],
    };
    await plugin.loadSettings();
    const reader = createReaderView!({ app } as never);
    const item: FeedItem = {
      title: "Reloaded article",
      link: "https://example.com/article",
      description: "Article body",
      pubDate: "2026-09-28",
      guid: "reloaded-article",
      feedTitle: "Example feed",
      feedUrl: existingFeed.url,
      coverImage: "",
    };
    (reader as unknown as { currentItem: FeedItem | null }).currentItem = item;

    const oldArticleSaver = plugin.articleSaver;
    const updatedFeed = feed("before-sync", "Synced");
    updatedFeed.customTemplate = "new-template";
    await syncFromAnotherDevice({
      ...savedSettings([updatedFeed], ["Synced"]),
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        defaultFolder: "Updated articles",
        defaultTemplate: "# Updated {{title}}\n\n{{content}}",
        savedTemplates: [
          {
            id: "new-template",
            name: "Updated template",
            template: "# Updated custom {{title}}\n\n{{content}}",
          },
        ],
      },
    });
    expect(plugin.articleSaver).not.toBe(oldArticleSaver);

    await reader.actionSaveCurrentArticle();

    expect(item.savedFilePath).toBe("Updated articles/Reloaded article.md");
    const savedArticle = await (
      app.vault.adapter as unknown as VaultAdapterStub
    ).read(item.savedFilePath!);
    expect(savedArticle).toContain("# Updated custom Reloaded article");
  });

  it("adds new folders to the reloaded folder list", async () => {
    await syncFromAnotherDevice(
      savedSettings([feed("after-sync", "Synced")], ["Synced"]),
    );

    await plugin.ensureFolderExists("Added after sync", {
      saveSettings: false,
    });

    expect(plugin.settings.folders.map((folder) => folder.name)).toEqual([
      "Synced",
      "Added after sync",
    ]);
  });

  it("keeps settings-backed services aligned after a reload failure", async () => {
    (plugin.loadData as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Reload failed"),
    );
    handlers.modify?.({ path: ".rss-dashboard-data/data.json" });
    await vi.advanceTimersByTimeAsync(1_500);

    await plugin.ensureFolderExists("Added after failed sync", {
      saveSettings: false,
    });

    expect(plugin.settings.folders.map((folder) => folder.name)).toContain(
      "Added after failed sync",
    );
  });

  it("keeps a queued background import through the reload", async () => {
    plugin.backgroundImportQueue = [
      {
        title: "queued",
        url: "https://example.com/queued.xml",
        folder: "Synced",
        lastUpdated: 0,
      },
    ];

    await syncFromAnotherDevice(
      savedSettings([feed("after-sync", "Synced")], ["Synced"]),
    );

    expect(plugin.backgroundImportQueue.map((entry) => entry.url)).toEqual([
      "https://example.com/queued.xml",
    ]);
  });

  it("repairs a missing folder for a feed that arrived in the sync", async () => {
    await syncFromAnotherDevice(
      savedSettings([feed("after-sync", "Only on the other device")], []),
    );

    expect(plugin.settings.folders.map((folder) => folder.name)).toContain(
      "Only on the other device",
    );
  });
});
