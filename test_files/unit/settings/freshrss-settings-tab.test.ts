import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderFreshRssSettingsTab,
  type FreshRssCapability,
  type FreshRssSettingsPlugin,
} from "../../../src/settings/tabs/freshrss-settings-tab";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function createPlugin(capability: FreshRssCapability = "available") {
  const settings = cloneSettings();
  const plugin = {
    settings,
    getFreshRssCapability: () => capability,
    getFreshRssSecretReferences: vi.fn(() => ["freshrss-primary"]),
    saveFreshRssEndpoint: vi.fn(async (endpoint: string) => {
      settings.freshRss.endpoint = endpoint;
      settings.freshRss.status = "test-required";
    }),
    saveFreshRssCredentialReference: vi.fn(async (reference: string) => {
      settings.freshRss.credentialReference = reference;
      settings.freshRss.status = "test-required";
    }),
    testFreshRssConnection: vi.fn(async (): Promise<"connected"> => "connected"),
    openFreshRssStorageMigrationChoice: vi.fn(),
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
  it("stays visible but disabled without reading SecretStorage when the capability is unavailable", () => {
    const containerEl = createDiv();
    const plugin = createPlugin("capability-unavailable");

    renderFreshRssSettingsTab(containerEl, plugin);

    expect(containerEl.textContent).toContain("FreshRSS requires Obsidian 1.11.4 or newer");
    expect(plugin.getFreshRssSecretReferences).not.toHaveBeenCalled();
    expect(containerEl.querySelector("input")).toBeNull();
  });

  it("persists only the canonical endpoint and selected SecretStorage reference", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin();

    renderFreshRssSettingsTab(containerEl, plugin);

    const endpointInput = containerEl.querySelector("input") as HTMLInputElement;
    endpointInput.value = "https://reader.example.test/api/greader.php";
    endpointInput.dispatchEvent(new Event("input"));
    await Promise.resolve();

    const secretSelect = containerEl.querySelector("select") as HTMLSelectElement;
    secretSelect.value = "freshrss-primary";
    secretSelect.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.settings.freshRss).toEqual({
      endpoint: "https://reader.example.test/api/greader.php",
      credentialReference: "freshrss-primary",
      status: "test-required",
    });
    expect(containerEl.textContent).not.toContain("test-password");
  });

  it("offers the existing storage migration choice without enumerating SecretStorage entries", () => {
    const containerEl = createDiv();
    const plugin = createPlugin("storage-migration-required");

    renderFreshRssSettingsTab(containerEl, plugin);

    expect(containerEl.textContent).toContain("FreshRSS requires Vault Shards v2");
    expect(containerEl.querySelector("button")?.textContent).toBe(
      "Choose storage upgrade",
    );
    expect(plugin.getFreshRssSecretReferences).not.toHaveBeenCalled();
  });
});
