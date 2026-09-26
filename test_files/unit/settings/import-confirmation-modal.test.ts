/**
 * Import confirmation modal (issue #377): the last-chance prompt shown
 * before a Replacing or Overwriting import writes anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { ImportConfirmationModal } from "../../../src/settings/modals/import-confirmation-modal";
import type { ImportConfirmation } from "../../../src/services/import-confirmation-model";

function feedBundleConfirmation(
  overrides: Partial<ImportConfirmation> = {},
): ImportConfirmation {
  return {
    kind: "replacing",
    bundleType: "feed-bundle",
    fileName: "rss-dashboard-feed-bundle.json",
    feedData: {
      current: { feeds: 60, articles: 1241, starred: 12, folders: 5, tags: 8 },
      incoming: { feeds: 27, articles: 412, starred: 3, folders: 2, tags: 4 },
    },
    unloadedFeedCount: 0,
    preferences: null,
    storageLocationChange: null,
    ...overrides,
  };
}

function settingsBundleConfirmation(
  overrides: Partial<ImportConfirmation> = {},
): ImportConfirmation {
  return {
    kind: "overwriting",
    bundleType: "settings-bundle",
    fileName: "rss-dashboard-settings-bundle.json",
    feedData: null,
    unloadedFeedCount: 0,
    preferences: {
      changedCount: 7,
      highImpactChanges: [
        { label: "Protect starred articles", before: "On", after: "Off" },
      ],
    },
    storageLocationChange: null,
    ...overrides,
  };
}

const folderMove = {
  feedStorage: {
    before: { mode: "vault-shards-v2", folder: ".rss-dashboard-data/feeds" },
    after: { mode: "vault-shards-v2", folder: "RSS/feeds" },
  },
  metadataStorage: null,
};

function openModal(
  confirmation: ImportConfirmation,
  exportBackup: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
) {
  const modal = new ImportConfirmationModal({} as unknown as App, {
    confirmation,
    exportBackup,
  });
  const decision = modal.waitForClose();
  modal.open();
  return { modal, decision };
}

function text(modal: ImportConfirmationModal): string {
  return modal.contentEl.textContent ?? "";
}

function button(modal: ImportConfirmationModal, label: string) {
  const found = Array.from(modal.contentEl.querySelectorAll("button")).find(
    (el) => el.textContent?.trim() === label,
  );
  if (!found) throw new Error(`No "${label}" button`);
  return found;
}

function isDestructive(el: HTMLElement): boolean {
  return (
    el.classList.contains("mod-warning") ||
    el.classList.contains("mod-destructive")
  );
}

describe("ImportConfirmationModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  describe("Replacing import", () => {
    it("asks to replace the feeds, comparing current and incoming data from the named file", () => {
      const { modal } = openModal(feedBundleConfirmation());

      expect(text(modal)).toContain("Replace your feeds?");
      expect(text(modal)).toContain("rss-dashboard-feed-bundle.json");
      expect(text(modal)).toContain("can't be undone");
      expect(text(modal)).toContain("Feeds: 60 → 27");
      expect(text(modal)).toContain("Articles: 1241 → 412");
      expect(text(modal)).toContain("Starred articles: 12 → 3");
      expect(text(modal)).toContain("Folders: 5 → 2");
      expect(text(modal)).toContain("Tags: 8 → 4");
    });

    it("says how many feeds have not loaded their articles on this device", () => {
      const { modal } = openModal(
        feedBundleConfirmation({ unloadedFeedCount: 4 }),
      );

      expect(text(modal)).toContain(
        "4 feeds haven't loaded their articles on this device",
      );
    });

    it("leaves out the unloaded-feed note when every feed has loaded", () => {
      const { modal } = openModal(feedBundleConfirmation());

      expect(text(modal)).not.toContain("haven't loaded");
    });

    it("styles Replace as destructive and focuses Cancel", () => {
      const { modal } = openModal(feedBundleConfirmation());

      expect(isDestructive(button(modal, "Replace"))).toBe(true);
      expect(document.activeElement).toBe(button(modal, "Cancel"));
    });

    it("summarizes preferences too when the import carries them", () => {
      const { modal } = openModal(
        feedBundleConfirmation({
          bundleType: "portable-data-bundle",
          preferences: { changedCount: 3, highImpactChanges: [] },
        }),
      );

      expect(text(modal)).toContain("3 preferences will change.");
    });
  });

  describe("Overwriting import", () => {
    it("asks to overwrite preferences, with the change count and high-impact lines", () => {
      const { modal } = openModal(settingsBundleConfirmation());

      expect(text(modal)).toContain("Overwrite your preferences?");
      expect(text(modal)).toContain("rss-dashboard-settings-bundle.json");
      expect(text(modal)).toContain("7 preferences will change.");
      expect(text(modal)).toContain("Protect starred articles: On → Off");
      expect(text(modal)).not.toContain("Feeds:");
    });

    it("says so when no preferences differ, and still offers to overwrite", () => {
      const { modal } = openModal(
        settingsBundleConfirmation({
          preferences: { changedCount: 0, highImpactChanges: [] },
        }),
      );

      expect(text(modal)).toContain(
        "No preferences differ from your current ones",
      );
      expect(button(modal, "Overwrite")).toBeDefined();
    });

    it("styles Overwrite as a normal primary action when storage stays put", () => {
      const { modal } = openModal(settingsBundleConfirmation());

      const overwrite = button(modal, "Overwrite");
      expect(overwrite.classList.contains("mod-cta")).toBe(true);
      expect(isDestructive(overwrite)).toBe(false);
      expect(document.activeElement).toBe(button(modal, "Cancel"));
    });

    it("styles Overwrite as destructive when the storage location changes", () => {
      const { modal } = openModal(
        settingsBundleConfirmation({ storageLocationChange: folderMove }),
      );

      expect(isDestructive(button(modal, "Overwrite"))).toBe(true);
    });
  });

  describe("storage location", () => {
    it("names the old and new storage folder, and that the setting syncs", () => {
      const { modal } = openModal(
        settingsBundleConfirmation({ storageLocationChange: folderMove }),
      );

      expect(text(modal)).toContain(
        "Storage folder changes from .rss-dashboard-data/feeds to RSS/feeds.",
      );
      expect(text(modal)).toContain("syncs to every device");
    });

    it("names a storage mode change", () => {
      const { modal } = openModal(
        settingsBundleConfirmation({
          storageLocationChange: {
            feedStorage: {
              before: { mode: "vault-shards-v2", folder: "RSS" },
              after: { mode: "legacy-json", folder: "RSS" },
            },
            metadataStorage: null,
          },
        }),
      );

      expect(text(modal)).toContain(
        "Storage mode changes from shard storage v2 to legacy data.json.",
      );
    });

    it("names a change to where data.json is stored", () => {
      const { modal } = openModal(
        settingsBundleConfirmation({
          storageLocationChange: {
            feedStorage: null,
            metadataStorage: {
              before: { mode: "plugin-default", folder: ".rss-dashboard-data" },
              after: { mode: "vault-location", folder: "RSS" },
            },
          },
        }),
      );

      expect(text(modal)).toContain(
        "data.json location changes from the plugin folder to RSS.",
      );
    });

    it("says nothing about storage when the location stays put", () => {
      const { modal } = openModal(settingsBundleConfirmation());

      expect(text(modal)).not.toContain("syncs to every device");
    });
  });

  describe("decisions", () => {
    it("resolves to confirm when the user clicks Replace", async () => {
      const { modal, decision } = openModal(feedBundleConfirmation());

      button(modal, "Replace").click();

      await expect(decision).resolves.toBe("confirm");
    });

    it("resolves to cancel when the user clicks Cancel", async () => {
      const { modal, decision } = openModal(feedBundleConfirmation());

      button(modal, "Cancel").click();

      await expect(decision).resolves.toBe("cancel");
    });

    it("treats closing the dialog any other way as cancel", async () => {
      const { modal, decision } = openModal(feedBundleConfirmation());

      modal.close();

      await expect(decision).resolves.toBe("cancel");
    });
  });

  describe("Export backup first", () => {
    it("exports a backup and keeps the dialog open", async () => {
      const exportBackup = vi.fn().mockResolvedValue(undefined);
      const { modal, decision } = openModal(
        feedBundleConfirmation(),
        exportBackup,
      );

      button(modal, "Export backup first").click();
      await vi.waitFor(() => expect(exportBackup).toHaveBeenCalledTimes(1));

      expect(modal.containerEl.isConnected).toBe(true);
      button(modal, "Replace").click();
      await expect(decision).resolves.toBe("confirm");
    });

    it("reports a failed export and keeps Replace available", async () => {
      const noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const exportBackup = vi.fn().mockRejectedValue(new Error("disk full"));
      const { modal, decision } = openModal(
        feedBundleConfirmation(),
        exportBackup,
      );

      button(modal, "Export backup first").click();
      await vi.waitFor(() =>
        expect(noticeSpy).toHaveBeenCalledWith(
          "[Stub Notice]",
          "Backup export failed: disk full",
        ),
      );

      expect(modal.containerEl.isConnected).toBe(true);
      button(modal, "Replace").click();
      await expect(decision).resolves.toBe("confirm");
    });
  });
});
