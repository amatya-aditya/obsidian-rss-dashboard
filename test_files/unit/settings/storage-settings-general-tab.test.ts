import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { renderStorageSettingsTab } from "../../../src/settings/tabs/storage-settings-tab";
import { StorageOnboardingModal } from "../../../src/modals/storage-onboarding-modal";
import {
  ShardFolderDeletionError,
  type FeedStorageStatus,
} from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { JSDOM } from "jsdom";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

async function flushAsyncWork(cycles = 6) {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve();
  }
}

function resetDocumentBody(): void {
  document.body.innerHTML = "";
}

function createTestContainer(): HTMLDivElement {
  const containerEl = createDiv();
  document.body.appendChild(containerEl);
  return containerEl;
}

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const settingEls = Array.from(containerEl.querySelectorAll(".setting-item"));
  const match = settingEls.find((el) => {
    const nameEl = el.querySelector(".setting-item-name");
    return nameEl?.textContent === name;
  });

  if (!match) {
    throw new Error(`Setting not found: ${name}`);
  }

  return match as HTMLElement;
}

function findSettingByName(
  containerEl: HTMLElement,
  name: string,
): HTMLElement | null {
  const settingEls = Array.from(containerEl.querySelectorAll(".setting-item"));
  const match = settingEls.find((el) => {
    const nameEl = el.querySelector(".setting-item-name");
    return nameEl?.textContent === name;
  });
  return (match as HTMLElement) ?? null;
}

function getButtonByText(
  containerEl: HTMLElement,
  text: string,
): HTMLButtonElement {
  const button = Array.from(
    containerEl.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent === text);
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

function createPlugin() {
  return {
    app: obsidian.App.createMock() as unknown as obsidian.App,
    settingTab: {
      display: vi.fn(),
    },
    settings: cloneSettings(),
    saveSettings: vi.fn(async () => {}),
    getActiveDashboardView: vi.fn(async () => null),
    getOrphanedUserStatePath: vi.fn(async () => null),
    getMetadataFilePath: vi.fn(() => "rss-dashboard-data/data.json"),
    getStorageStatus: vi.fn(
      (): FeedStorageStatus => ({
        mode: "legacy-json" as const,
        folder: ".rss-dashboard-data/feeds",
        shardCount: 0,
        feedCount: 0,
        migrationReady: true,
        lastRepairResult: "Not yet run",
      }),
    ),
    getSyncV3Status: vi.fn(async () => ({
      health: "not-adopted" as const,
      root: "rss-dashboard-data/sync-v3",
      deviceId: "device-123456789",
      epochId: null,
      replicaCount: 0,
      invalidReplicaCount: 0,
      conflictCopyPaths: [],
      localCachePath: ".rss-dashboard-cache-v3/runtime.json",
      lastLocalWrite: null,
      lastIncomingMerge: null,
    })),
    migrateToVaultStorage: vi.fn(async () => {}),
    revertToLegacyJsonStorageWithOptions: vi.fn(async () => {}),
    isShardFolderDeletionError: (
      error: unknown,
    ): error is ShardFolderDeletionError =>
      error instanceof ShardFolderDeletionError,
    openStorageFolderInSystem: vi.fn(async () => {}),
    repairVaultStorage: vi.fn(async () => {}),
    exportDataJson: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
    exportPortableDataBundleChecked: vi.fn(async () => true),
    createSyncV3Set: vi.fn(async () => {}),
    joinSyncV3Set: vi.fn(async () => true),
    deleteSyncV3Set: vi.fn(async () => true),
    isSyncV3SetAlreadyExistsError: () => false,
    exportSyncV3HealthReport: vi.fn(async () => {}),
    recoverSyncV3: vi.fn(async () => ({
      recovered: true,
      reason: "re-adopted",
      clearedConflictCopies: 0,
    })),
    configureLocalStorageForFirstRun: vi.fn(async () => {}),
    prepareSyncV3Join: vi.fn(async () => {}),
    migrateMetadataToVaultLocation: vi.fn(async () => {}),
    revertMetadataToPluginDefault: vi.fn(async () => {}),
    applyFeedLimitsToAllFeeds: vi.fn(async () => {}),
    refreshFeeds: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  resetDocumentBody();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("General settings storage section", () => {
  it("renders the Storage mode description as rich text for only the active mode", () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "legacy-json";

    renderStorageSettingsTab(containerEl, plugin as never);

    const storageModeSetting = getSettingByName(containerEl, "Storage mode");
    const descEl = storageModeSetting.querySelector(
      ".setting-item-description",
    ) as HTMLElement;

    expect(descEl.textContent).not.toContain("[object DocumentFragment]");
    expect(descEl.querySelector("strong")?.textContent).toBe("Legacy JSON:");
    expect(descEl.textContent).not.toContain("Shard storage v2:");
    expect(descEl.textContent).not.toContain("shard storage v1");
  });

  it("shows the Shard storage v2 description when it is the active mode", () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "vault-shards-v2";

    renderStorageSettingsTab(containerEl, plugin as never);

    const storageModeSetting = getSettingByName(containerEl, "Storage mode");
    const descEl = storageModeSetting.querySelector(
      ".setting-item-description",
    ) as HTMLElement;

    expect(descEl.querySelector("strong")?.textContent).toBe(
      "Shard storage v2:",
    );
    expect(descEl.textContent).not.toContain("Legacy JSON:");
  });

  it("renders the Storage mode description correctly when containerEl.win resolves to a different window realm (e.g. a popped-out window)", () => {
    // Issue #248: Obsidian's Setting.setDesc(desc) does
    // `descEl.setText(desc)`, which only appends a DocumentFragment when
    // `desc instanceof DocumentFragment` succeeds. `instanceof` is
    // realm-sensitive: a DocumentFragment created via a *different*
    // window's `createFragment()` fails that check against this window's
    // DocumentFragment constructor and silently stringifies to
    // "[object DocumentFragment]". Simulate that by pointing
    // containerEl.win at a genuinely separate JSDOM realm.
    const containerEl = createTestContainer();
    const foreignDom = new JSDOM(`<!doctype html><html><body></body></html>`);
    const foreignWindow = foreignDom.window;
    const foreignDoc = foreignWindow.document;
    const foreignDocAsRecord = foreignDoc as unknown as Record<
      string,
      (...args: never[]) => never
    >;
    const nativeCreateElement = foreignDocAsRecord["createElement"] as unknown as (
      this: Document,
      tag: string,
    ) => HTMLElement;
    const nativeCreateDocumentFragment = foreignDocAsRecord[
      "createDocumentFragment"
    ] as unknown as (this: Document) => DocumentFragment;
    const nativeCreateTextNode = foreignDocAsRecord[
      "createTextNode"
    ] as unknown as (this: Document, text: string) => Text;

    (foreignWindow as unknown as { createFragment: () => DocumentFragment })
      .createFragment = () => nativeCreateDocumentFragment.call(foreignDoc);
    (
      foreignWindow as unknown as {
        createDiv: () => InstanceType<typeof foreignWindow.HTMLDivElement>;
      }
    ).createDiv = () =>
      nativeCreateElement.call(
        foreignDoc,
        "div",
      ) as InstanceType<typeof foreignWindow.HTMLDivElement>;
    const foreignElementProto = foreignWindow.Element.prototype as unknown as Record<
      string,
      unknown
    >;
    const foreignNodeProto = foreignWindow.Node.prototype as unknown as Record<
      string,
      unknown
    >;
    foreignElementProto.setText = function (this: Element, text: unknown) {
      this.textContent = String(text);
    };
    foreignNodeProto.appendText = function (this: Node, text: string) {
      this.appendChild(nativeCreateTextNode.call(foreignDoc, text));
    };
    foreignNodeProto.createEl = function (
      this: Element,
      tag: string,
      opts?: { text?: string },
    ) {
      const el = nativeCreateElement.call(foreignDoc, tag);
      if (opts?.text !== undefined) el.textContent = opts.text;
      this.appendChild(el);
      return el;
    };

    Object.defineProperty(containerEl, "win", {
      configurable: true,
      value: foreignWindow,
    });

    const plugin = createPlugin();
    plugin.settings.storageMode = "legacy-json";
    renderStorageSettingsTab(containerEl, plugin as never);

    const storageModeSetting = getSettingByName(containerEl, "Storage mode");
    const descEl = storageModeSetting.querySelector(
      ".setting-item-description",
    ) as HTMLElement;

    expect(descEl.textContent).not.toContain("[object DocumentFragment]");
    expect(descEl.querySelector("strong")?.textContent).toBe("Legacy JSON:");
  });

  it("opens the Storage onboarding modal when Change storage mode is clicked", () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "vault-shards-v2";

    const openSpy = vi
      .spyOn(StorageOnboardingModal.prototype, "open")
      .mockImplementation(() => {});

    renderStorageSettingsTab(containerEl, plugin as never);

    getButtonByText(containerEl, "Change storage mode").click();

    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the Storage folder field only for Shard storage v1/v2", () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "vault-shards-v2";

    renderStorageSettingsTab(containerEl, plugin as never);

    expect(findSettingByName(containerEl, "Storage folder")).not.toBeNull();
  });

  it("hides the Storage folder field for Legacy JSON", () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "legacy-json";

    renderStorageSettingsTab(containerEl, plugin as never);

    expect(findSettingByName(containerEl, "Storage folder")).toBeNull();
  });

  it("hides the Storage folder field for Sync v3 replicas", () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "replicated-v3";

    renderStorageSettingsTab(containerEl, plugin as never);

    expect(findSettingByName(containerEl, "Storage folder")).toBeNull();
  });

  it("updates the storage folder setting through a standard text input", async () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "vault-shards-v2";

    renderStorageSettingsTab(containerEl, plugin as never);

    const storageFolderSetting = getSettingByName(
      containerEl,
      "Storage folder",
    );
    const input = storageFolderSetting.querySelector(
      "input",
    ) as HTMLInputElement;

    input.value = ".rss-dashboard-data/custom-feeds";
    input.dispatchEvent(new Event("input"));

    const applyButton = getButtonByText(containerEl, "Apply");
    applyButton.click();
    await flushAsyncWork();

    expect(plugin.settings.storageFolder).toBe(
      ".rss-dashboard-data/custom-feeds",
    );
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("repairs vault storage instead of saving when applying a folder change in Shard storage v1", async () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "vault-shards";

    renderStorageSettingsTab(containerEl, plugin as never);

    const storageFolderSetting = getSettingByName(
      containerEl,
      "Storage folder",
    );
    const input = storageFolderSetting.querySelector(
      "input",
    ) as HTMLInputElement;
    input.value = ".rss-dashboard-data/custom-feeds";
    input.dispatchEvent(new Event("input"));

    getButtonByText(containerEl, "Apply").click();
    await flushAsyncWork();

    expect(plugin.repairVaultStorage).toHaveBeenCalledTimes(1);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("does nothing when Apply is clicked without a folder change", async () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "vault-shards-v2";

    renderStorageSettingsTab(containerEl, plugin as never);

    getButtonByText(containerEl, "Apply").click();
    await flushAsyncWork();

    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.repairVaultStorage).not.toHaveBeenCalled();
  });

  it("runs storage repair from the Repair/rebuild storage button", async () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "vault-shards-v2";

    renderStorageSettingsTab(containerEl, plugin as never);

    getButtonByText(containerEl, "Repair/rebuild storage").click();
    await flushAsyncWork();

    expect(plugin.repairVaultStorage).toHaveBeenCalledTimes(1);
  });

  it("hides the Storage actions row (Apply/Repair) for Legacy JSON and Sync v3", () => {
    for (const mode of ["legacy-json", "replicated-v3"] as const) {
      const containerEl = createTestContainer();
      const plugin = createPlugin();
      plugin.settings.storageMode = mode;

      renderStorageSettingsTab(containerEl, plugin as never);

      expect(findSettingByName(containerEl, "Storage actions")).toBeNull();
      resetDocumentBody();
    }
  });

  it("no longer renders the duplicated portable/feed/settings bundle import-export buttons", () => {
    const containerEl = createTestContainer();
    const plugin = createPlugin();
    plugin.settings.storageMode = "vault-shards-v2";

    renderStorageSettingsTab(containerEl, plugin as never);

    const buttons = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>("button"),
    ).map((button) => button.textContent?.trim());

    expect(buttons).not.toContain("Import portable data bundle");
    expect(buttons).not.toContain("Export portable data bundle");
    expect(buttons).not.toContain("Import feed bundle");
    expect(buttons).not.toContain("Export feed bundle");
    expect(buttons).not.toContain("Import settings bundle");
    expect(buttons).not.toContain("Export settings bundle");
  });

  describe("Sync v3 mode scoping", () => {
    it("shows the full replica health/setup/recovery sections when Sync v3 is the active mode", async () => {
      const containerEl = createTestContainer();
      const plugin = createPlugin();
      plugin.settings.storageMode = "replicated-v3";

      renderStorageSettingsTab(containerEl, plugin as never);
      await flushAsyncWork();

      expect(getSettingByName(containerEl, "Sync v3 replica health").textContent)
        .toContain("rss-dashboard-data/sync-v3");
      expect(findSettingByName(containerEl, "Sync v3 setup")).not.toBeNull();
      expect(findSettingByName(containerEl, "Sync v3 recovery")).not.toBeNull();
      expect(
        containerEl.querySelector(".rss-dashboard-sync-v3-departed-disclosure"),
      ).toBeNull();
    });

    it("collapses only the recovery actions behind a disclosure when Sync v3 is not active", () => {
      const containerEl = createTestContainer();
      const plugin = createPlugin();
      plugin.settings.storageMode = "vault-shards-v2";

      renderStorageSettingsTab(containerEl, plugin as never);

      expect(findSettingByName(containerEl, "Sync v3 replica health")).toBeNull();
      expect(findSettingByName(containerEl, "Sync v3 setup")).toBeNull();

      const disclosure = containerEl.querySelector(
        ".rss-dashboard-sync-v3-departed-disclosure",
      );
      expect(disclosure).not.toBeNull();
      expect(
        disclosure?.querySelector(".setting-item-name")?.textContent,
      ).toBe("Sync v3 recovery");
    });

    it("still exports the sync v3 health report from inside the collapsed disclosure", () => {
      const containerEl = createTestContainer();
      const plugin = createPlugin();
      plugin.settings.storageMode = "vault-shards-v2";

      renderStorageSettingsTab(containerEl, plugin as never);

      getButtonByText(containerEl, "Export sync v3 health report").click();

      expect(plugin.exportSyncV3HealthReport).toHaveBeenCalledTimes(1);
    });

    it("shows the existing set's status inside the collapsed disclosure even when not adopted", async () => {
      const containerEl = createTestContainer();
      const plugin = createPlugin();
      plugin.settings.storageMode = "vault-shards-v2";
      plugin.getSyncV3Status = vi.fn(async () => ({
        health: "not-adopted" as const,
        root: "rss-dashboard-data/sync-v3",
        deviceId: "device-987654321",
        epochId: "epoch-orphaned",
        replicaCount: 1,
        invalidReplicaCount: 0,
        conflictCopyPaths: [],
        localCachePath: ".rss-dashboard-cache-v3/runtime.json",
        lastLocalWrite: null,
        lastIncomingMerge: null,
      }));

      renderStorageSettingsTab(containerEl, plugin as never);
      await flushAsyncWork();

      const disclosure = containerEl.querySelector(
        ".rss-dashboard-sync-v3-departed-disclosure",
      );
      expect(disclosure?.textContent).toContain("epoch-orphaned");
    });

    it("deletes an existing sync v3 set through a confirmed, backup-first action", async () => {
      const containerEl = createTestContainer();
      const plugin = createPlugin();
      plugin.settings.storageMode = "vault-shards-v2";
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderStorageSettingsTab(containerEl, plugin as never);

      getButtonByText(containerEl, "Delete existing set").click();
      await flushAsyncWork();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(plugin.exportPortableDataBundleChecked).toHaveBeenCalledTimes(1);
      expect(plugin.deleteSyncV3Set).toHaveBeenCalledTimes(1);
      confirmSpy.mockRestore();
    });

    it("does not delete the sync v3 set when the destructive confirm is declined", async () => {
      const containerEl = createTestContainer();
      const plugin = createPlugin();
      plugin.settings.storageMode = "vault-shards-v2";
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      renderStorageSettingsTab(containerEl, plugin as never);

      getButtonByText(containerEl, "Delete existing set").click();
      await flushAsyncWork();

      expect(plugin.deleteSyncV3Set).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe("Storage status and leftover state", () => {
    it("always renders storage status regardless of active mode", () => {
      const containerEl = createTestContainer();
      const plugin = createPlugin();
      plugin.settings.storageMode = "replicated-v3";

      renderStorageSettingsTab(containerEl, plugin as never);

      expect(findSettingByName(containerEl, "Storage status")).not.toBeNull();
    });
  });
});
