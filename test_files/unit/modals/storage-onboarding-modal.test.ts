import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import {
  StorageOnboardingModal,
  type StorageOnboardingPlugin,
} from "../../../src/modals/storage-onboarding-modal";
import { StorageTransitionModal } from "../../../src/settings/modals/storage-settings-modals";
import { ShardFolderDeletionError } from "../../../src/services/feed-storage-repository";
import type { FeedStorageMode } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function createPlugin(): StorageOnboardingPlugin {
  return {
    configureLocalStorageForFirstRun: vi.fn(async () => {}),
    createSyncV3Set: vi.fn(async () => {}),
    prepareSyncV3Join: vi.fn(async () => {}),
    migrateToVaultStorage: vi.fn(async () => {}),
    revertToLegacyJsonStorageWithOptions: vi.fn(async () => {}),
    exportDataJson: vi.fn(async () => {}),
    isShardFolderDeletionError: (
      error: unknown,
    ): error is ShardFolderDeletionError =>
      error instanceof ShardFolderDeletionError,
    openStorageFolderInSystem: vi.fn(async () => {}),
  };
}

function openAdvancedLegacyDisclosure(modal: StorageOnboardingModal): void {
  const details = modal.contentEl.querySelector<HTMLDetailsElement>(
    ".rss-dashboard-storage-legacy-disclosure",
  );
  if (details) {
    details.open = true;
  }
}

async function flushAsyncWork(cycles = 2): Promise<void> {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve();
  }
}

function currentStorageModeValue(modal: StorageOnboardingModal): string | null {
  const setting = Array.from(
    modal.contentEl.querySelectorAll(".setting-item"),
  ).find(
    (candidate) =>
      candidate.querySelector(".setting-item-name")?.textContent ===
      "Current storage mode",
  );
  return setting?.querySelector(".setting-item-description")?.textContent ?? null;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("StorageOnboardingModal", () => {
  it("shows unassigned storage before the user makes a first-run choice", () => {
    const modal = new StorageOnboardingModal(App.createMock(), createPlugin());

    modal.open();

    expect(currentStorageModeValue(modal)).toBe("Unassigned");
  });

  it.each([
    ["legacy-json", "Legacy JSON"],
    ["vault-shards", "Vault shards v1"],
    ["vault-shards-v2", "Local vault shards v2"],
    ["replicated-v3", "Sync v3 replicas"],
  ] as Array<[FeedStorageMode, string]>)("shows %s when the wizard is reopened for a configured device", (currentStorageMode, expectedLabel) => {
    const modal = new StorageOnboardingModal(App.createMock(), createPlugin(), {
      currentStorageMode,
      isFirstRun: false,
    });

    modal.open();

    expect(currentStorageModeValue(modal)).toBe(expectedLabel);
  });

  it("configures V2 local storage when the user chooses this device only", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin);
    modal.open();

    const button = Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Use local storage");
    button?.click();
    await flushAsyncWork();

    expect(plugin.configureLocalStorageForFirstRun).toHaveBeenCalledTimes(1);
    expect(plugin.createSyncV3Set).not.toHaveBeenCalled();
  });

  it("lets the first sync device create a set explicitly after confirming the experimental warning", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin);
    modal.open();

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Create sync v3 set")?.click();

    expect(plugin.createSyncV3Set).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain("Sync v3 is experimental");

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    await flushAsyncWork();

    expect(plugin.createSyncV3Set).toHaveBeenCalledTimes(1);
    expect(plugin.prepareSyncV3Join).not.toHaveBeenCalled();
  });

  it("returns to the sync choice when the experimental warning is cancelled", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin);
    modal.open();

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Create sync v3 set")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Cancel")?.click();
    await flushAsyncWork();

    expect(plugin.createSyncV3Set).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain("Set up sync v3 (experimental)");
  });

  it("puts an additional device into a non-writing wait state after confirming the experimental warning", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin);
    modal.open();

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Wait to join sync v3")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    await flushAsyncWork();

    expect(plugin.prepareSyncV3Join).toHaveBeenCalledTimes(1);
    expect(plugin.createSyncV3Set).not.toHaveBeenCalled();
  });

  it("asks for confirmation before a reopened wizard switches Sync v3 to local storage", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin, {
      currentStorageMode: "replicated-v3",
      isFirstRun: false,
    });
    modal.open();

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Use local storage")?.click();
    await flushAsyncWork();

    expect(plugin.configureLocalStorageForFirstRun).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain("Confirm storage change");

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Change storage")?.click();
    await flushAsyncWork();

    expect(plugin.configureLocalStorageForFirstRun).toHaveBeenCalledTimes(1);
  });

  it("shows the experimental warning, not the plain change confirmation, before a reopened wizard sets up Sync v3", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin, {
      currentStorageMode: "vault-shards-v2",
      isFirstRun: false,
    });
    modal.open();

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Create sync v3 set")?.click();
    await flushAsyncWork();

    expect(plugin.createSyncV3Set).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain("Sync v3 is experimental");
    expect(modal.contentEl.textContent).not.toContain("Confirm storage change");

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    await flushAsyncWork();

    expect(plugin.createSyncV3Set).toHaveBeenCalledTimes(1);
  });

  it("shows the experimental warning when a reopened wizard switches an existing device to Sync v3", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin, {
      currentStorageMode: "legacy-json",
      isFirstRun: false,
    });
    modal.open();

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Wait to join sync v3")?.click();
    await flushAsyncWork();

    expect(plugin.prepareSyncV3Join).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain("Sync v3 is experimental");

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    await flushAsyncWork();

    expect(plugin.prepareSyncV3Join).toHaveBeenCalledTimes(1);
  });

  describe("Advanced: legacy storage destinations", () => {
    it("keeps legacy JSON and shard storage v1 out of the primary picker", () => {
      const modal = new StorageOnboardingModal(App.createMock(), createPlugin());
      modal.open();

      const disclosure = modal.contentEl.querySelector(
        ".rss-dashboard-storage-legacy-disclosure",
      );
      expect(disclosure).not.toBeNull();
      expect(disclosure?.textContent).toContain("Use shard storage v1");
      expect(disclosure?.textContent).toContain("Use legacy JSON");

      const buttonsOutsideDisclosure = Array.from(
        modal.contentEl.querySelectorAll("button"),
      ).filter((button) => !disclosure?.contains(button));
      expect(
        buttonsOutsideDisclosure.some(
          (button) => button.textContent === "Use shard storage v1",
        ),
      ).toBe(false);
      expect(
        buttonsOutsideDisclosure.some(
          (button) => button.textContent === "Use legacy JSON",
        ),
      ).toBe(false);
    });

    it("switches directly to shard storage v1 when there is no shard folder boundary to cross", async () => {
      const plugin = createPlugin();
      const modal = new StorageOnboardingModal(App.createMock(), plugin, {
        currentStorageMode: "vault-shards-v2",
        isFirstRun: false,
      });
      modal.open();
      openAdvancedLegacyDisclosure(modal);

      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Use shard storage v1")?.click();
      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Change storage")?.click();
      await flushAsyncWork();

      expect(plugin.migrateToVaultStorage).toHaveBeenCalledTimes(1);
    });

    it("routes legacy-json to shard-v1 through the transition modal's backup reminder", async () => {
      const plugin = createPlugin();
      const modal = new StorageOnboardingModal(App.createMock(), plugin, {
        currentStorageMode: "legacy-json",
        isFirstRun: false,
        storageFolder: ".rss-dashboard-data/feeds",
      });
      modal.open();
      openAdvancedLegacyDisclosure(modal);

      vi.spyOn(StorageTransitionModal.prototype, "open").mockImplementation(() => {});
      vi.spyOn(StorageTransitionModal.prototype, "waitForClose").mockResolvedValue("apply");

      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Use shard storage v1")?.click();
      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Change storage")?.click();
      await flushAsyncWork();

      expect(plugin.migrateToVaultStorage).toHaveBeenCalledTimes(1);
    });

    it("exports data.json instead of migrating when the transition modal's export action is chosen", async () => {
      const plugin = createPlugin();
      const modal = new StorageOnboardingModal(App.createMock(), plugin, {
        currentStorageMode: "legacy-json",
        isFirstRun: false,
        storageFolder: ".rss-dashboard-data/feeds",
      });
      modal.open();
      openAdvancedLegacyDisclosure(modal);

      vi.spyOn(StorageTransitionModal.prototype, "open").mockImplementation(() => {});
      vi.spyOn(StorageTransitionModal.prototype, "waitForClose").mockResolvedValue(
        "export-data-json",
      );

      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Use shard storage v1")?.click();
      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Change storage")?.click();
      await flushAsyncWork();

      expect(plugin.exportDataJson).toHaveBeenCalledTimes(1);
      expect(plugin.migrateToVaultStorage).not.toHaveBeenCalled();
    });

    it("passes the delete-shard-folder choice through to legacy JSON when applying a shards-to-legacy change", async () => {
      const plugin = createPlugin();
      const modal = new StorageOnboardingModal(App.createMock(), plugin, {
        currentStorageMode: "vault-shards",
        isFirstRun: false,
        storageFolder: ".rss-dashboard-data/feeds",
      });
      modal.open();
      openAdvancedLegacyDisclosure(modal);

      vi.spyOn(StorageTransitionModal.prototype, "open").mockImplementation(() => {});
      vi.spyOn(StorageTransitionModal.prototype, "waitForClose").mockResolvedValue(
        "apply-delete-shards",
      );

      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Use legacy JSON")?.click();
      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Change storage")?.click();
      await flushAsyncWork();

      expect(plugin.revertToLegacyJsonStorageWithOptions).toHaveBeenCalledWith({
        deleteShardFolder: true,
      });
    });

    it("recovers via the shared shard-deletion-failure flow when deleting the shard folder fails", async () => {
      const plugin = createPlugin();
      plugin.revertToLegacyJsonStorageWithOptions = vi
        .fn()
        .mockRejectedValueOnce(
          new ShardFolderDeletionError(
            ".rss-dashboard-data/feeds",
            "Shard folder still exists after delete attempt",
          ),
        )
        .mockResolvedValueOnce(undefined);

      const modal = new StorageOnboardingModal(App.createMock(), plugin, {
        currentStorageMode: "vault-shards",
        isFirstRun: false,
        storageFolder: ".rss-dashboard-data/feeds",
      });
      modal.open();
      openAdvancedLegacyDisclosure(modal);

      vi.spyOn(StorageTransitionModal.prototype, "open").mockImplementation(() => {});
      vi.spyOn(StorageTransitionModal.prototype, "waitForClose").mockResolvedValue(
        "apply-delete-shards",
      );

      const { ShardDeletionFailureModal } = await import(
        "../../../src/settings/modals/storage-settings-modals"
      );
      vi.spyOn(ShardDeletionFailureModal.prototype, "open").mockImplementation(() => {});
      vi.spyOn(ShardDeletionFailureModal.prototype, "waitForClose").mockResolvedValue(
        "apply-anyway",
      );

      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Use legacy JSON")?.click();
      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Change storage")?.click();
      await flushAsyncWork(8);

      expect(plugin.revertToLegacyJsonStorageWithOptions).toHaveBeenNthCalledWith(
        1,
        { deleteShardFolder: true },
      );
      expect(plugin.revertToLegacyJsonStorageWithOptions).toHaveBeenNthCalledWith(
        2,
        { deleteShardFolder: false },
      );
    });

    it("calls onStorageChanged after a legacy-destination switch completes", async () => {
      const plugin = createPlugin();
      const onStorageChanged = vi.fn();
      const modal = new StorageOnboardingModal(App.createMock(), plugin, {
        currentStorageMode: "vault-shards-v2",
        isFirstRun: false,
        onStorageChanged,
      });
      modal.open();
      openAdvancedLegacyDisclosure(modal);

      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Use shard storage v1")?.click();
      Array.from(modal.contentEl.querySelectorAll("button"))
        .find((candidate) => candidate.textContent === "Change storage")?.click();
      await flushAsyncWork();

      expect(onStorageChanged).toHaveBeenCalledTimes(1);
    });
  });
});
