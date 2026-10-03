import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";

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
import { renderImportExportSettingsTab } from "../../../src/settings/tabs/import-export-settings-tab";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

interface VaultAdapterStub {
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
}

const metadataFolder = ".rss-dashboard-data";
const storageFolder = `${metadataFolder}/feeds`;
const userStatePath = `${metadataFolder}/user-state.json`;

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

function persistedFeed(feedId: string): Omit<Feed, "items"> {
  return {
    feedId,
    title: feedId,
    url: `https://example.com/${feedId}.xml`,
    folder: "RSS",
    lastUpdated: 0,
  };
}

describe("importing a preferences file that carries feeds (issue #374)", () => {
  let app: App;
  let plugin: RssDashboardPlugin;

  function adapter(): VaultAdapterStub {
    return app.vault.adapter as unknown as VaultAdapterStub;
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    app = App.createMock();

    // A Shard storage v2 vault with two feeds, each with a starred article.
    await app.vault.adapter.mkdir(storageFolder);
    await adapter().write(
      `${metadataFolder}/data.json`,
      JSON.stringify({
        ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        lastShownVersion: "2.7.0",
        storageMode: "vault-shards-v2",
        storageFolder,
        metadataStorageMode: "vault-location",
        metadataStorageFolder: metadataFolder,
        metadataStorageSchemaVersion: 2,
        feeds: [persistedFeed("feed-kept"), persistedFeed("feed-left-out")],
      }),
    );
    for (const feedId of ["feed-kept", "feed-left-out"]) {
      await adapter().write(
        `${storageFolder}/${feedId}.json`,
        JSON.stringify({
          version: 1,
          feedId,
          feedUrl: `https://example.com/${feedId}.xml`,
          updatedAt: 0,
          items: [
            {
              title: "Article",
              link: `https://example.com/${feedId}/1`,
              description: "",
              pubDate: "2026-01-01T00:00:00Z",
              guid: `${feedId}-guid`,
              feedTitle: feedId,
              feedUrl: `https://example.com/${feedId}.xml`,
              coverImage: "",
            },
          ],
        }),
      );
    }
    await adapter().write(
      userStatePath,
      JSON.stringify({
        version: 3,
        states: {
          "feed-kept:feed-kept-guid": { starred: true },
          "feed-left-out:feed-left-out-guid": { starred: true },
        },
      }),
    );

    plugin = new RssDashboardPlugin(app, manifest());
    plugin.loadData = vi.fn().mockResolvedValue({
      metadataStorageMode: "vault-location",
      metadataStorageFolder: metadataFolder,
      metadataStorageSchemaVersion: 2,
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    await plugin.loadSettings();
  });

  it("keeps article state for a feed the imported file leaves out", async () => {
    expect(plugin.settings.feeds.map((feed) => feed.feedId)).toEqual([
      "feed-kept",
      "feed-left-out",
    ]);

    const file = new File(
      [JSON.stringify({ feeds: [persistedFeed("feed-kept")] })],
      "rss-dashboard-user-preferences.json",
    );
    installObsidianDomPolyfills();
    const result = plugin.importUserSettingsJsonFromFile(file);
    (await findDialogButton("Replace")).click();
    await expect(result).resolves.toBe("committed");

    expect(plugin.settings.feeds.map((feed) => feed.feedId)).toEqual([
      "feed-kept",
    ]);
    const written = JSON.parse(await adapter().read(userStatePath)) as {
      states: Record<string, { starred?: boolean }>;
    };
    expect(written.states["feed-left-out:feed-left-out-guid"]?.starred).toBe(
      true,
    );
  });

  it.each([
    ["folders", { folders: [{ name: "Imported", subfolders: [] }] }],
    ["tags", { availableTags: [{ name: "imported", color: "#000000" }] }],
  ])(
    "keeps the current feeds when the imported file has %s but no feed list (issue #386)",
    async (_label, collections) => {
      const file = new File(
        [JSON.stringify({ refreshInterval: 45, ...collections })],
        "rss-dashboard-user-preferences.json",
      );
      installObsidianDomPolyfills();
      const result = plugin.importUserSettingsJsonFromFile(file);
      (await findDialogButton("Replace")).click();
      await expect(result).resolves.toBe("committed");

      expect(plugin.settings.refreshInterval).toBe(45);
      expect(plugin.settings.feeds.map((feed) => feed.feedId)).toEqual([
        "feed-kept",
        "feed-left-out",
      ]);
      const saved = JSON.parse(
        await adapter().read(`${metadataFolder}/data.json`),
      ) as { feeds?: Array<{ feedId: string }> };
      expect(saved.feeds?.map((feed) => feed.feedId)).toEqual([
        "feed-kept",
        "feed-left-out",
      ]);
    },
  );

  it("keeps article state for a feed that an imported legacy data.json leaves out", async () => {
    installObsidianDomPolyfills();
    const containerEl = (document.body as HTMLElement & {
      createDiv: () => HTMLDivElement;
    }).createDiv();
    renderImportExportSettingsTab(containerEl, plugin);

    // Capture the hidden file input the button creates, then hand it a file
    // as the browser's picker would.
    const inputClick = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    const importButton = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Import legacy data.json");
    importButton?.click();
    const fileInput = inputClick.mock.contexts[0] as HTMLInputElement | undefined;
    expect(fileInput).toBeDefined();

    const file = new File(
      [JSON.stringify({ feeds: [persistedFeed("feed-kept")] })],
      "data.json",
    );
    Object.defineProperty(fileInput, "files", { value: [file] });
    fileInput?.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(plugin.settings.feeds.map((feed) => feed.feedId)).toEqual([
        "feed-kept",
      ]),
    );
    await vi.waitFor(async () => {
      const written = JSON.parse(await adapter().read(userStatePath)) as {
        unrecognizedFeedSinceByFeedId?: Record<string, number>;
      };
      expect(written.unrecognizedFeedSinceByFeedId?.["feed-left-out"]).toEqual(
        expect.any(Number),
      );
    });

    const written = JSON.parse(await adapter().read(userStatePath)) as {
      states: Record<string, { starred?: boolean }>;
    };
    expect(written.states["feed-left-out:feed-left-out-guid"]?.starred).toBe(
      true,
    );
  });

  it("changes nothing when the user cancels the import confirmation (issue #377)", async () => {
    installObsidianDomPolyfills();
    const noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const userStateBefore = await adapter().read(userStatePath);
    const file = new File(
      [JSON.stringify({ feeds: [persistedFeed("feed-kept")] })],
      "rss-dashboard-user-preferences.json",
    );

    const result = plugin.importUserSettingsJsonFromFile(file);
    (await findDialogButton("Cancel")).click();

    await expect(result).resolves.toBe("canceled");
    expect(plugin.settings.feeds.map((feed) => feed.feedId)).toEqual([
      "feed-kept",
      "feed-left-out",
    ]);
    expect(plugin.saveData).not.toHaveBeenCalled();
    expect(await adapter().read(userStatePath)).toBe(userStateBefore);
    expect(noticeSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Import canceled. Nothing was changed.",
    );
    noticeSpy.mockRestore();
  });
});

async function findDialogButton(label: string): Promise<HTMLButtonElement> {
  let found: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    found = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === label);
    expect(found).toBeDefined();
  });
  if (!found) throw new Error(`No "${label}" button`);
  return found;
}
