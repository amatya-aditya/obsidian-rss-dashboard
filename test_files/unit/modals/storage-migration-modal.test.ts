import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { StorageMigrationModal } from "../../../src/modals/storage-migration-modal";
import type RssDashboardPlugin from "../../../main";
import { MAX_VERSION_DEFERRALS } from "../../../src/utils/storage-deprecation-prompt";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

interface TestPlugin {
  settings: {
    storageMode: string;
    storageMigrationDismissedUntil?: string;
    storageMigrationDeferralCount?: number;
  };
  manifest: { version: string };
  saveSettings: () => Promise<void>;
  backupAndMigrateStorageToV2: () => Promise<void>;
}

function createPlugin(overrides: Partial<TestPlugin["settings"]> = {}): TestPlugin {
  return {
    settings: { storageMode: "legacy-json", ...overrides },
    manifest: { version: "2.7.0" },
    saveSettings: vi.fn(async () => {}),
    backupAndMigrateStorageToV2: vi.fn(async () => {}),
  };
}

function openModal(plugin: TestPlugin): StorageMigrationModal {
  const modal = new StorageMigrationModal(
    new obsidian.App(),
    plugin as unknown as RssDashboardPlugin,
  );
  modal.open();
  return modal;
}

function findButton(
  modal: StorageMigrationModal,
  label: string,
): HTMLButtonElement | undefined {
  return Array.from(modal.contentEl.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );
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
  it("names the release that turns the mode read-only", () => {
    const modal = openModal(createPlugin());
    expect(modal.contentEl.textContent).toContain("3.0");
  });

  it("closes without recording anything on 'Remind me later'", async () => {
    const plugin = createPlugin();
    const modal = openModal(plugin);

    findButton(modal, "Remind me later")?.click();
    await flushPromises();

    expect(plugin.settings.storageMigrationDismissedUntil).toBeUndefined();
    expect(plugin.settings.storageMigrationDeferralCount).toBeUndefined();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.backupAndMigrateStorageToV2).not.toHaveBeenCalled();
  });

  it("defers to the next minor and counts the deferral on 'Skip this version'", async () => {
    const plugin = createPlugin();
    const modal = openModal(plugin);

    findButton(modal, "Skip this version")?.click();
    await flushPromises();

    expect(plugin.settings.storageMigrationDismissedUntil).toBe("2.8.0");
    expect(plugin.settings.storageMigrationDeferralCount).toBe(1);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.backupAndMigrateStorageToV2).not.toHaveBeenCalled();
  });

  it("accumulates deferrals across prompts", async () => {
    const plugin = createPlugin({ storageMigrationDeferralCount: 1 });
    const modal = openModal(plugin);

    findButton(modal, "Skip this version")?.click();
    await flushPromises();

    expect(plugin.settings.storageMigrationDeferralCount).toBe(2);
  });

  it("withdraws version deferral once the cap is reached", () => {
    const plugin = createPlugin({
      storageMigrationDeferralCount: MAX_VERSION_DEFERRALS,
    });
    const modal = openModal(plugin);

    expect(findButton(modal, "Skip this version")).toBeUndefined();
    expect(findButton(modal, "Remind me later")).toBeDefined();
    expect(findButton(modal, "Upgrade now")).toBeDefined();
  });

  it("migrates on 'Upgrade now'", async () => {
    const plugin = createPlugin();
    const modal = openModal(plugin);

    findButton(modal, "Upgrade now")?.click();
    await flushPromises();

    expect(plugin.backupAndMigrateStorageToV2).toHaveBeenCalledTimes(1);
  });
});
