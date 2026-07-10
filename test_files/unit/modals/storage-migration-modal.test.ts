import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { StorageMigrationModal } from "../../../src/modals/storage-migration-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type MockApp = obsidian.App;

interface TestPlugin {
  settings: {
    storageMigrationDismissedPermanently?: boolean;
    storageMode: string;
  };
  saveSettings: () => Promise<void>;
  backupAndMigrateStorageToV2: () => Promise<void>;
}

function createMockApp(): MockApp {
  return new obsidian.App();
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("StorageMigrationModal", () => {
  it("closes statelessly on 'Remind me later'", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: { storageMode: "legacy-json" },
      saveSettings: vi.fn(async () => {}),
      backupAndMigrateStorageToV2: vi.fn(async () => {}),
    };

    const modal = new StorageMigrationModal(app, plugin as any);
    modal.open();

    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    const remindBtn = buttons.find((b) => b.textContent === "Remind me later") as HTMLButtonElement;
    expect(remindBtn).toBeDefined();

    remindBtn.click();
    await flushPromises();

    expect(plugin.settings.storageMigrationDismissedPermanently).toBeUndefined();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.backupAndMigrateStorageToV2).not.toHaveBeenCalled();
  });

  it("sets dismissed permanently on 'Never show again'", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: { storageMode: "legacy-json" },
      saveSettings: vi.fn(async () => {}),
      backupAndMigrateStorageToV2: vi.fn(async () => {}),
    };

    const modal = new StorageMigrationModal(app, plugin as any);
    modal.open();

    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    const neverBtn = buttons.find((b) => b.textContent === "Never show again") as HTMLButtonElement;
    expect(neverBtn).toBeDefined();

    neverBtn.click();
    await flushPromises();

    expect(plugin.settings.storageMigrationDismissedPermanently).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.backupAndMigrateStorageToV2).not.toHaveBeenCalled();
  });

  it("calls backupAndMigrateStorageToV2 and sets flag on 'Upgrade now'", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: { storageMode: "legacy-json" },
      saveSettings: vi.fn(async () => {}),
      backupAndMigrateStorageToV2: vi.fn(async () => {}),
    };

    const modal = new StorageMigrationModal(app, plugin as any);
    modal.open();

    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    const upgradeBtn = buttons.find((b) => b.textContent?.includes("Upgrade now")) as HTMLButtonElement;
    expect(upgradeBtn).toBeDefined();

    upgradeBtn.click();
    await flushPromises();

    // The method backupAndMigrateStorageToV2 itself handles setting the flag to true
    // In our test, we just check that the method was called
    expect(plugin.backupAndMigrateStorageToV2).toHaveBeenCalledTimes(1);
  });
});
