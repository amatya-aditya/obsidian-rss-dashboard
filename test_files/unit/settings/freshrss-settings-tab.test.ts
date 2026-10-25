import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderFreshRssSettingsTab,
  type FreshRssCapability,
  type FreshRssSettingsPlugin,
} from "../../../src/settings/tabs/freshrss-settings-tab";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function createPlugin(capability: FreshRssCapability = "available") {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  const plugin = {
    settings,
    getFreshRssCapability: vi.fn(() => capability),
    getFreshRssSecretReferences: vi.fn(() => ["freshrss-primary"]),
    saveFreshRssEndpoint: vi.fn(async (endpoint: string) => {
      settings.freshRss.endpoint = endpoint;
      settings.freshRss.status = "test-required";
    }),
    saveFreshRssCredentialReference: vi.fn(async (reference: string) => {
      settings.freshRss.credentialReference = reference;
      settings.freshRss.status = "test-required";
    }),
    openFreshRssStorageMigrationChoice: vi.fn(),
    testFreshRssConnection: vi.fn(async () => "connected" as const),
  };
  plugin satisfies FreshRssSettingsPlugin;
  return plugin;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("FreshRSS settings", () => {
  it("does not list or read secrets when the Obsidian capability is unavailable", () => {
    const containerEl = createDiv();
    const plugin = createPlugin("capability-unavailable");

    renderFreshRssSettingsTab(containerEl, plugin);

    expect(containerEl.textContent).toContain("Obsidian 1.11.5 or newer");
    expect(plugin.getFreshRssSecretReferences).not.toHaveBeenCalled();
    expect(containerEl.querySelector("input")).toBeNull();
  });

  it("asks users to migrate storage before exposing credential controls", () => {
    const containerEl = createDiv();
    const plugin = createPlugin("storage-migration-required");

    renderFreshRssSettingsTab(containerEl, plugin);

    expect(containerEl.textContent).toContain("Vault Shards v2");
    expect(plugin.getFreshRssSecretReferences).not.toHaveBeenCalled();
    expect(containerEl.querySelector("select")).toBeNull();
    const upgradeButton = Array.from(
      containerEl.querySelectorAll("button"),
    ).find((button) => button.textContent === "Choose storage upgrade");
    upgradeButton?.click();
    expect(plugin.openFreshRssStorageMigrationChoice).toHaveBeenCalledTimes(1);
  });

  it("stores the endpoint and selected secret reference without rendering credential values", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin();
    renderFreshRssSettingsTab(containerEl, plugin);

    const endpointInput = containerEl.querySelector(
      "input",
    ) as HTMLInputElement;
    endpointInput.value = "https://reader.example.test/greader.php";
    endpointInput.dispatchEvent(new Event("input"));
    await Promise.resolve();

    const secretSelect = containerEl.querySelector(
      "select",
    ) as HTMLSelectElement;
    secretSelect.value = "freshrss-primary";
    secretSelect.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.saveFreshRssEndpoint).toHaveBeenCalledWith(
      "https://reader.example.test/greader.php",
    );
    expect(plugin.saveFreshRssCredentialReference).toHaveBeenCalledWith(
      "freshrss-primary",
    );
    expect(containerEl.textContent).not.toContain("test-password");
  });

  it("allows a connection test only after an endpoint and credential entry are selected", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin();
    plugin.settings.freshRss.endpoint =
      "https://reader.example.test/greader.php";
    plugin.settings.freshRss.credentialReference = "freshrss-primary";
    renderFreshRssSettingsTab(containerEl, plugin);

    const button = Array.from(containerEl.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Test connection",
    );
    expect(button?.disabled).toBe(false);
    button?.click();
    await Promise.resolve();

    expect(plugin.testFreshRssConnection).toHaveBeenCalledTimes(1);
  });
});
