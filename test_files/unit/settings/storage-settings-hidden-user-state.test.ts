import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  getHiddenUserStateHint,
  renderStorageSettingsTab,
} from "../../../src/settings/tabs/storage-settings-tab";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type HintSettings = Pick<
  RssDashboardSettings,
  "storageMode" | "storageFolder" | "metadataStorageFolder"
>;

function hintSettings(overrides: Partial<HintSettings> = {}): HintSettings {
  return {
    storageMode: "vault-shards-v2",
    storageFolder: "feeds5",
    metadataStorageFolder: ".rss-dashboard-data",
    ...overrides,
  };
}

function createPlugin(overrides: Partial<HintSettings> = {}) {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  Object.assign(settings, overrides);
  return {
    app: obsidian.App.createMock(),
    settingTab: { display: vi.fn() },
    settings,
    saveSettings: vi.fn(async () => {}),
    getActiveDashboardView: vi.fn(async () => null),
    getOrphanedUserStatePath: vi.fn(async () => null),
    getMetadataFilePath: vi.fn(() => "data.json"),
    getStorageStatus: vi.fn(() => ({
      mode: settings.storageMode,
      folder: settings.storageFolder,
      shardCount: 0,
      feedCount: 0,
      migrationReady: false,
      lastRepairResult: "Not yet run",
    })),
    getUnloadedShardFeedCount: vi.fn(() => 0),
    repairVaultStorage: vi.fn(async () => ({ skippedFeedCount: 0 })),
  };
}

function findByText(root: HTMLElement, selector: string, text: string) {
  return Array.from(root.querySelectorAll(selector)).find(el =>
    el.textContent?.includes(text),
  ) as HTMLElement | undefined;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("getHiddenUserStateHint()", () => {
  it("names the hidden metadata folder when storage is visible and mode is v2", () => {
    const hint = getHiddenUserStateHint(hintSettings());
    expect(hint).toContain("user-state.json");
    expect(hint).toContain(".rss-dashboard-data");
    expect(hint).toContain("Metadata data.json location");
  });

  it("treats a hidden segment anywhere in the metadata path as hidden", () => {
    const hint = getHiddenUserStateHint(
      hintSettings({ metadataStorageFolder: "Notes/.state" }),
    );
    expect(hint).toContain("Notes/.state");
  });

  it("falls back to the default hidden folder when metadata folder is empty", () => {
    expect(
      getHiddenUserStateHint(hintSettings({ metadataStorageFolder: " " })),
    ).toContain(".rss-dashboard-data");
  });

  it("gives no hint when both folders are visible", () => {
    expect(
      getHiddenUserStateHint(hintSettings({ metadataStorageFolder: "state" })),
    ).toBeNull();
  });

  it("gives no hint when both folders are hidden", () => {
    expect(
      getHiddenUserStateHint(
        hintSettings({ storageFolder: ".rss-dashboard-data/feeds" }),
      ),
    ).toBeNull();
  });

  it.each(["legacy-json", "vault-shards"] as const)(
    "gives no hint in %s mode",
    storageMode => {
      expect(getHiddenUserStateHint(hintSettings({ storageMode }))).toBeNull();
    },
  );
});

describe("renderStorageSettingsTab() - hidden user-state hint", () => {
  it("shows the hint next to the metadata location while the mismatch holds", () => {
    const containerEl = document.body.appendChild(createDiv());
    renderStorageSettingsTab(
      containerEl,
      createPlugin({ storageFolder: "feeds5" }) as never,
    );
    expect(
      findByText(containerEl, ".rss-dashboard-hidden-user-state-hint", "user-state.json"),
    ).toBeDefined();
  });

  it("omits the persistent hint when the storage folder is hidden", () => {
    const containerEl = document.body.appendChild(createDiv());
    renderStorageSettingsTab(containerEl, createPlugin() as never);
    expect(
      containerEl.querySelector(".rss-dashboard-hidden-user-state-hint"),
    ).toBeNull();
  });

  it("shows a notice after moving the storage folder to a visible path", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const containerEl = document.body.appendChild(createDiv());
    const plugin = createPlugin();
    renderStorageSettingsTab(containerEl, plugin as never);

    const input = findByText(containerEl, ".setting-item", "Vault folder for per-feed")!.querySelector(
      "input",
    ) as HTMLInputElement;
    input.value = "feeds5";
    input.dispatchEvent(new Event("input"));
    (
      Array.from(containerEl.querySelectorAll("button")).find(
        b => b.textContent === "Apply",
      ) as HTMLButtonElement
    ).click();
    for (let i = 0; i < 10; i++) await Promise.resolve();

    const messages = debug.mock.calls.map(call => String(call[1]));
    expect(messages.some(m => m.includes("user-state.json") && m.includes(".rss-dashboard-data"))).toBe(true);
  });
});

describe("renderStorageSettingsTab() - metadata location hint", () => {
  function metadataInput(containerEl: HTMLElement): HTMLInputElement {
    return findByText(
      containerEl,
      ".setting-item",
      "Metadata data.json location",
    )!.querySelector("input")!;
  }

  it("shows the plugin folder a fresh install actually uses", () => {
    const containerEl = document.body.appendChild(createDiv());
    renderStorageSettingsTab(
      containerEl,
      createPlugin({
        metadataStorageFolder: "my-config/plugins/rss-dashboard/data",
      }) as never,
    );
    expect(metadataInput(containerEl).placeholder).toBe(
      "my-config/plugins/rss-dashboard/data",
    );
  });

  it("keeps showing the vault folder an existing install uses", () => {
    const containerEl = document.body.appendChild(createDiv());
    renderStorageSettingsTab(containerEl, createPlugin() as never);
    expect(metadataInput(containerEl).placeholder).toBe(".rss-dashboard-data");
  });
});
