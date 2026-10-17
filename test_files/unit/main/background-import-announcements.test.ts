/**
 * Background import failure reporting (#1308, WCAG 2.2 4.1.3).
 *
 * Drives the plugin's real BackgroundImportService with a real dashboard view
 * open, and reads both surfaces the plugin writes to: the dashboard's live
 * region (which jsdom can assert) and the Notice the Obsidian stub records.
 * Actual delivery to a screen reader is verified in the fixture vault, since
 * jsdom cannot observe it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

interface PluginSeams {
  addStatusBarItem: () => HTMLElement;
  feedParser: { parseFeed: (url: string) => Promise<Feed> };
  initializeSettingsBackedServices(): void;
  backgroundImportService: {
    isBackgroundImporting: boolean;
    startBackgroundImport(feeds: Feed[]): void;
  };
}

interface Harness {
  plugin: RssDashboardPlugin;
  seams: PluginSeams;
  view: RssDashboardView;
  /** Texts the live region announced since the view opened. */
  announced: string[];
  regionText: () => string;
}

const created: RssDashboardPlugin[] = [];
const observers: MutationObserver[] = [];

function feed(name: string): Feed {
  return {
    title: `Feed ${name}`,
    url: `https://example.com/${name}.xml`,
    folder: "Inbox",
    items: [],
    lastUpdated: 0,
    mediaType: "article",
  };
}

function createHarness(feeds: Feed[]): Harness {
  const app = App.createMock();
  const manifest: PluginManifest = {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: `${app.vault.configDir}/plugins/rss-dashboard`,
  };
  const plugin = new RssDashboardPlugin(app, manifest);
  const seams = plugin as unknown as PluginSeams;
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.storageMode = "legacy-json";
  settings.feeds = feeds;
  plugin.settings = settings;
  plugin.loadData = vi.fn().mockResolvedValue(null);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  seams.initializeSettingsBackedServices();
  seams.addStatusBarItem = () => createDiv();
  seams.feedParser = { parseFeed: vi.fn() };

  // A real dashboard view in the same app, so an announcement reaches it the
  // way it reaches an open dashboard.
  const leaf = { view: null, setViewState: vi.fn(), app } as never;
  const view = new RssDashboardView(leaf, plugin);
  document.body.appendChild(view.containerEl);
  plugin.getActiveDashboardView = vi.fn().mockResolvedValue(view);

  created.push(plugin);
  return {
    plugin,
    seams,
    view,
    announced: [],
    regionText: () =>
      view.containerEl.querySelector(".rss-dashboard-refresh-announcer")
        ?.textContent ?? "",
  };
}

/** Opens the view and starts recording what its live region announces. */
async function openView(harness: Harness): Promise<void> {
  await harness.view.onOpen();
  const region = harness.view.containerEl.querySelector(
    ".rss-dashboard-refresh-announcer",
  );
  if (!region) throw new Error("The dashboard has no live region.");
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        const text = node.textContent ?? "";
        if (text !== "") harness.announced.push(text);
      }
    }
  });
  observer.observe(region, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  observers.push(observer);
}

async function flush(): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
}

/** Runs one background import batch to completion. */
async function runImport(harness: Harness, feeds: Feed[]): Promise<void> {
  harness.seams.backgroundImportService.startBackgroundImport(feeds);
  await vi.waitFor(() =>
    expect(harness.seams.backgroundImportService.isBackgroundImporting).toBe(
      false,
    ),
  );
  await flush();
}

/** The toasts the plugin showed (the Obsidian stub logs each one). */
function toasts(): string[] {
  return (
    console.debug as unknown as { mock: { calls: unknown[][] } }
  ).mock.calls
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const plugin of created) plugin.onunload();
  created.length = 0;
  for (const observer of observers) observer.disconnect();
  observers.length = 0;
  vi.restoreAllMocks();
  document.body.empty();
});

describe("background import failure reporting", () => {
  it("announces one message per batch when several feeds fail, and shows the same notice", async () => {
    const harness = createHarness([feed("a"), feed("b"), feed("c")]);
    await openView(harness);
    harness.seams.feedParser.parseFeed = vi
      .fn()
      .mockRejectedValue(new Error("Request failed, status 500"));

    await runImport(harness, harness.plugin.settings.feeds);

    const expected =
      "Background import finished: 3 feeds failed. Last error: Request failed, status 500.";
    expect(harness.announced).toEqual([expected]);
    expect(harness.regionText()).toBe(expected);
    expect(toasts()).toEqual([expected]);
  });

  it("announces a timed-out batch as a timeout", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);
    harness.seams.feedParser.parseFeed = vi
      .fn()
      .mockRejectedValue(new Error("Timed out"));

    await runImport(harness, harness.plugin.settings.feeds);

    expect(harness.announced).toEqual([
      "Background import finished: 2 feeds timed out. Last error: Timed out.",
    ]);
  });

  it("reports the failure instead of the completion notice when only some feeds fail", async () => {
    const feeds = [feed("a"), feed("b"), feed("c")];
    const failingUrl = feeds[1].url;
    const harness = createHarness(feeds);
    await openView(harness);
    harness.seams.feedParser.parseFeed = vi.fn((url: string) =>
      url === failingUrl
        ? Promise.reject(new Error("Request failed, status 500"))
        : Promise.resolve({
            ...(harness.plugin.settings.feeds.find(
              (candidate) => candidate.url === url,
            ) as Feed),
          }),
    );

    await runImport(harness, feeds);

    const expected =
      "Background import finished: 1 feed failed. Last error: Request failed, status 500.";
    // One message per batch: the failure message replaces the completion
    // notice rather than arriving beside it.
    expect(harness.announced).toEqual([expected]);
    expect(toasts()).toEqual([expected]);
  });

  it("announces nothing and keeps only the completion notice when the import succeeds", async () => {
    const harness = createHarness([feed("a"), feed("b")]);
    await openView(harness);
    harness.seams.feedParser.parseFeed = vi.fn((url: string) =>
      Promise.resolve({
        ...(harness.plugin.settings.feeds.find(
          (candidate) => candidate.url === url,
        ) as Feed),
      }),
    );

    await runImport(harness, harness.plugin.settings.feeds);

    expect(harness.announced).toEqual([]);
    expect(harness.regionText()).toBe("");
    expect(toasts()).toEqual([
      "Background import completed. Processed 2 feeds.",
    ]);
  });
});
