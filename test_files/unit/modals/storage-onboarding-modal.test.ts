import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import {
  StorageOnboardingModal,
  type StorageOnboardingPlugin,
} from "../../../src/modals/storage-onboarding-modal";
import type { FeedStorageMode } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function createPlugin(): StorageOnboardingPlugin {
  return {
    configureLocalStorageForFirstRun: vi.fn(async () => {}),
    createSyncV3Set: vi.fn(async () => {}),
    prepareSyncV3Join: vi.fn(async () => {}),
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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

  it("lets the first sync device create a set explicitly", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin);
    modal.open();

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Create sync v3 set")?.click();
    await flushAsyncWork();

    expect(plugin.createSyncV3Set).toHaveBeenCalledTimes(1);
    expect(plugin.prepareSyncV3Join).not.toHaveBeenCalled();
  });

  it("puts an additional device into a non-writing wait state", async () => {
    const plugin = createPlugin();
    const modal = new StorageOnboardingModal(App.createMock(), plugin);
    modal.open();

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Set up sync v3")?.click();
    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Wait to join sync v3")?.click();
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

  it("asks for confirmation before a reopened wizard sets up Sync v3", async () => {
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
    expect(modal.contentEl.textContent).toContain("Confirm storage change");

    Array.from(modal.contentEl.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Change storage")?.click();
    await flushAsyncWork();

    expect(plugin.createSyncV3Set).toHaveBeenCalledTimes(1);
  });
});
