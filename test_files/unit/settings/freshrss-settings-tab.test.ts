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
    syncFreshRssNow: vi.fn(async () => {}),
    setFreshRssAutomaticSyncEnabled: vi.fn(async (enabled: boolean) => {
      settings.freshRss.automaticSyncEnabled = enabled;
    }),
    setFreshRssAutomaticSyncIntervalMinutes: vi.fn(async (minutes: number) => {
      settings.freshRss.automaticSyncIntervalMinutes = minutes;
    }),
    exportFreshRssOpml: vi.fn(async () => {}),
    copyFreshRssOpmlToClipboard: vi.fn(async () => {}),
    getFreshRssHistoryEligibleFeeds: vi.fn(async () => []),
    fetchMoreFreshRssHistory: vi.fn(async () => {}),
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

  it("shows the subscription export section regardless of connection capability", () => {
    const containerEl = createDiv();
    const plugin = createPlugin("capability-unavailable");

    renderFreshRssSettingsTab(containerEl, plugin);

    expect(containerEl.textContent).toContain("FreshRSS subscription export");
    expect(containerEl.textContent).toContain("not an article-state backup");
  });

  describe("subscription export", () => {
    it("exports and copies the FreshRSS subscription OPML without requiring a connection", () => {
      const containerEl = createDiv();
      const plugin = createPlugin("capability-unavailable");

      renderFreshRssSettingsTab(containerEl, plugin);

      const buttons = Array.from(containerEl.querySelectorAll("button"));
      const exportButton = buttons.find((b) => b.textContent === "Export FreshRSS OPML");
      const copyButton = buttons.find((b) => b.title === "Copy FreshRSS subscription OPML to clipboard");

      exportButton?.click();
      copyButton?.click();

      expect(plugin.exportFreshRssOpml).toHaveBeenCalledTimes(1);
      expect(plugin.copyFreshRssOpmlToClipboard).toHaveBeenCalledTimes(1);
    });
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
      automaticSyncEnabled: false,
      automaticSyncIntervalMinutes: 15,
    });
    expect(containerEl.textContent).not.toContain("test-password");
  });

  describe("fetch more history", () => {
    it("renders a disabled, loading dropdown and button before the eligible-feed list resolves", () => {
      const containerEl = createDiv();
      const plugin = createPlugin();
      plugin.settings.freshRss.status = "connected";
      let resolveFeeds!: (feeds: Array<{ feedId: string; title: string }>) => void;
      plugin.getFreshRssHistoryEligibleFeeds = vi.fn(
        () => new Promise((resolve) => (resolveFeeds = resolve)),
      );

      renderFreshRssSettingsTab(containerEl, plugin);

      const select = Array.from(containerEl.querySelectorAll("select")).find((el) =>
        Array.from(el.options).some((o) => o.textContent === "Loading eligible feeds..."),
      ) as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.disabled).toBe(true);
      const buttons = Array.from(containerEl.querySelectorAll("button"));
      const fetchButton = buttons.find((b) => b.textContent === "Fetch more history");
      expect(fetchButton?.disabled).toBe(true);

      resolveFeeds([{ feedId: "feed-1", title: "Feed One" }]);
    });

    it("enables the dropdown and lists eligible feeds once the async lookup resolves, disabling the button until connected and a feed is selected", async () => {
      const containerEl = createDiv();
      const plugin = createPlugin();
      plugin.settings.freshRss.status = "connected";
      plugin.getFreshRssHistoryEligibleFeeds = vi.fn(async () => [
        { feedId: "feed-1", title: "Feed One" },
        { feedId: "feed-2", title: "Feed Two" },
      ]);

      renderFreshRssSettingsTab(containerEl, plugin);
      await Promise.resolve();
      await Promise.resolve();

      const select = Array.from(containerEl.querySelectorAll("select")).find((el) =>
        Array.from(el.options).some((o) => o.textContent === "Feed One"),
      ) as HTMLSelectElement;
      expect(select.disabled).toBe(false);
      const optionLabels = Array.from(select.options).map((o) => o.textContent);
      expect(optionLabels).toContain("Feed One");
      expect(optionLabels).toContain("Feed Two");

      const buttons = Array.from(containerEl.querySelectorAll("button"));
      const fetchButton = buttons.find((b) => b.textContent === "Fetch more history") as HTMLButtonElement;
      // The dropdown auto-selects the first eligible feed once populated, and
      // the connection is already "connected": the button is enabled.
      expect(select.value).toBe("feed-1");
      expect(fetchButton.disabled).toBe(false);

      select.value = "feed-2";
      select.dispatchEvent(new Event("change"));
      expect(fetchButton.disabled).toBe(false);
    });

    it("keeps the button disabled once a feed is selected while the connection is not connected", async () => {
      const containerEl = createDiv();
      const plugin = createPlugin();
      plugin.settings.freshRss.status = "test-required";
      plugin.getFreshRssHistoryEligibleFeeds = vi.fn(async () => [
        { feedId: "feed-1", title: "Feed One" },
      ]);

      renderFreshRssSettingsTab(containerEl, plugin);
      await Promise.resolve();
      await Promise.resolve();

      const select = Array.from(containerEl.querySelectorAll("select")).find((el) =>
        Array.from(el.options).some((o) => o.textContent === "Feed One"),
      ) as HTMLSelectElement;
      select.value = "feed-1";
      select.dispatchEvent(new Event("change"));

      const buttons = Array.from(containerEl.querySelectorAll("button"));
      const fetchButton = buttons.find((b) => b.textContent === "Fetch more history") as HTMLButtonElement;
      expect(fetchButton.disabled).toBe(true);
    });

    it("shows a disabled empty state when no feed needs more history", async () => {
      const containerEl = createDiv();
      const plugin = createPlugin();
      plugin.settings.freshRss.status = "connected";
      plugin.getFreshRssHistoryEligibleFeeds = vi.fn(async () => []);

      renderFreshRssSettingsTab(containerEl, plugin);
      await Promise.resolve();
      await Promise.resolve();

      const select = Array.from(containerEl.querySelectorAll("select")).find((el) =>
        Array.from(el.options).some((o) => o.textContent === "No feeds need more history"),
      ) as HTMLSelectElement;
      expect(select.disabled).toBe(true);
      const buttons = Array.from(containerEl.querySelectorAll("button"));
      const fetchButton = buttons.find((b) => b.textContent === "Fetch more history");
      expect(fetchButton?.disabled).toBe(true);
    });

    it("invokes fetchMoreFreshRssHistory with the selected feed id when clicked", async () => {
      const containerEl = createDiv();
      const plugin = createPlugin();
      plugin.settings.freshRss.status = "connected";
      plugin.getFreshRssHistoryEligibleFeeds = vi.fn(async () => [
        { feedId: "feed-1", title: "Feed One" },
      ]);

      renderFreshRssSettingsTab(containerEl, plugin);
      await Promise.resolve();
      await Promise.resolve();

      const select = Array.from(containerEl.querySelectorAll("select")).find((el) =>
        Array.from(el.options).some((o) => o.textContent === "Feed One"),
      ) as HTMLSelectElement;
      select.value = "feed-1";
      select.dispatchEvent(new Event("change"));

      const buttons = Array.from(containerEl.querySelectorAll("button"));
      const fetchButton = buttons.find((b) => b.textContent === "Fetch more history") as HTMLButtonElement;
      fetchButton.click();
      await Promise.resolve();

      expect(plugin.fetchMoreFreshRssHistory).toHaveBeenCalledWith("feed-1");
    });
  });

  it("offers the existing storage migration choice without enumerating SecretStorage entries", () => {
    const containerEl = createDiv();
    const plugin = createPlugin("storage-migration-required");

    renderFreshRssSettingsTab(containerEl, plugin);

    expect(containerEl.textContent).toContain("FreshRSS requires Vault Shards v2");
    const buttonTexts = Array.from(containerEl.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(buttonTexts).toContain("Choose storage upgrade");
    expect(plugin.getFreshRssSecretReferences).not.toHaveBeenCalled();
  });
});
