/**
 * Regression tests: activateDiscoverView() and activateSmallwebView() must
 * always open in a new main-area tab, regardless of the dashboard's
 * `viewLocation` setting.
 *
 * Background: The Dashboard view correctly follows `settings.viewLocation`
 * (e.g. opens in the right sidebar when the user sets that preference).
 * Discover and Smallweb are standalone content-browser views — they should
 * never open in a sidebar panel, even when the dashboard is set to do so.
 *
 * Regression introduced when "Fixed Reader View Location" separated
 * `readerViewLocation` from `viewLocation`; `activateDiscoverView()` and
 * `activateSmallwebView()` were left still following the dashboard setting.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type { RssDashboardSettings } from "../../../src/types/types";

// ─── Module mocks (must precede the main.ts import) ──────────────────────────

vi.mock("../../../src/services/feed-parser", () => ({
  FeedParser: class FeedParser {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_media?: any, _availableTags?: any) {}
    parseFeed = vi.fn();
    refreshAllFeeds = vi.fn();
  },
  applyFeedRetentionLimits: vi.fn((feed: unknown) => feed),
  formatFeedParseNoticeMessage: vi.fn((e: Error) => e.message),
  getFeedErrorMessage: vi.fn((e: Error) => e.message),
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaver {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_app?: any, _settings?: any) {}
    fixSavedFilePaths = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("../../../src/utils/settings-migration", () => ({
  migrateDisplaySettings: vi.fn(),
  migrateDefaultFilterToDashboardMultiFilters: vi.fn(),
  migrateKeywordRulesSettings: vi.fn().mockReturnValue(false),
  migrateMediaVideoTagSettings: vi.fn().mockReturnValue(false),
}));

// Import main AFTER mocks are registered
import RssDashboardPlugin from "../../../main";
import { App } from "obsidian";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MANIFEST = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "1.0.0",
  author: "Test",
  description: "Test",
  dir: ".",
};

/** A minimal leaf stub that satisfies the `setViewState` contract. */
function makeMockLeaf() {
  return { setViewState: vi.fn(async () => {}) };
}

/**
 * Build a plugin instance whose workspace methods are fully spied on.
 * `viewLocation` controls `settings.viewLocation` (the dashboard placement).
 * `existingLeaves` simulates leaves already open for the view type being tested.
 */
async function createPlugin(
  viewLocation: RssDashboardSettings["viewLocation"],
  existingLeaves: unknown[] = [],
) {
  const app = (App as any).createMock();

  // Concrete leaf returned by getLeaf / sidebar helpers
  const mockLeaf = makeMockLeaf();

  // Override workspace spies
  Object.assign(app.workspace, {
    getLeavesOfType: vi.fn(() => existingLeaves),
    getLeaf: vi.fn(() => mockLeaf),
    getLeftLeaf: vi.fn(() => mockLeaf),
    getRightLeaf: vi.fn(() => mockLeaf),
    revealLeaf: vi.fn(async () => {}),
  });

  const plugin = new RssDashboardPlugin(app as any, MANIFEST as any);
  plugin.loadData = vi.fn().mockResolvedValue({ viewLocation });
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  plugin.registerView = vi.fn();
  plugin.addRibbonIcon = vi.fn().mockReturnValue({ onClick: vi.fn() });
  plugin.addCommand = vi.fn();
  plugin.addSettingTab = vi.fn();
  plugin.registerInterval = vi.fn((id: number) => id);

  await plugin.loadSettings();

  // Initialize folderService after loadSettings
  const { FolderService } =
    await import("../../../src/services/folder-service");
  (plugin as any).folderService = new FolderService(plugin.settings);

  return { plugin, app, mockLeaf };
}

// ─── activateDiscoverView() ──────────────────────────────────────────────────

describe("activateDiscoverView()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a new tab (getLeaf='tab') even when viewLocation is right-sidebar", async () => {
    const { plugin, app } = await createPlugin("right-sidebar");

    await plugin.activateDiscoverView();

    expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
    expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
  });

  it("opens a new tab (getLeaf='tab') even when viewLocation is left-sidebar", async () => {
    const { plugin, app } = await createPlugin("left-sidebar");

    await plugin.activateDiscoverView();

    expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
    expect(app.workspace.getLeftLeaf).not.toHaveBeenCalled();
  });

  it("opens a new tab (getLeaf='tab') when viewLocation is main (positive baseline)", async () => {
    const { plugin, app } = await createPlugin("main");

    await plugin.activateDiscoverView();

    expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
  });

  it("reuses an existing discover leaf without calling getLeaf", async () => {
    const existingLeaf = makeMockLeaf();
    const { plugin, app } = await createPlugin("right-sidebar", [existingLeaf]);

    await plugin.activateDiscoverView();

    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
    // The existing leaf is revealed/activated
    expect(app.workspace.revealLeaf).toHaveBeenCalled();
  });
});

// ─── activateSmallwebView() ───────────────────────────────────────────────────

describe("activateSmallwebView()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a new tab (getLeaf='tab') even when viewLocation is right-sidebar", async () => {
    const { plugin, app } = await createPlugin("right-sidebar");

    await plugin.activateSmallwebView();

    expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
    expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
  });

  it("opens a new tab (getLeaf='tab') even when viewLocation is left-sidebar", async () => {
    const { plugin, app } = await createPlugin("left-sidebar");

    await plugin.activateSmallwebView();

    expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
    expect(app.workspace.getLeftLeaf).not.toHaveBeenCalled();
  });

  it("opens a new tab (getLeaf='tab') when viewLocation is main (positive baseline)", async () => {
    const { plugin, app } = await createPlugin("main");

    await plugin.activateSmallwebView();

    expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
  });

  it("reuses an existing smallweb leaf without calling getLeaf", async () => {
    const existingLeaf = makeMockLeaf();
    const { plugin, app } = await createPlugin("right-sidebar", [existingLeaf]);

    await plugin.activateSmallwebView();

    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
    expect(app.workspace.revealLeaf).toHaveBeenCalled();
  });
});

// ─── activateView() regression guard ─────────────────────────────────────────
// The dashboard view SHOULD still follow viewLocation — this must not regress.

describe("activateView() regression guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the dashboard in the right sidebar when viewLocation is right-sidebar", async () => {
    const { plugin, app } = await createPlugin("right-sidebar");

    await plugin.activateView();

    expect(app.workspace.getRightLeaf).toHaveBeenCalledWith(false);
    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
  });

  it("opens the dashboard in the left sidebar when viewLocation is left-sidebar", async () => {
    const { plugin, app } = await createPlugin("left-sidebar");

    await plugin.activateView();

    expect(app.workspace.getLeftLeaf).toHaveBeenCalledWith(false);
    expect(app.workspace.getLeaf).not.toHaveBeenCalled();
  });

  it("opens the dashboard as a tab when viewLocation is main", async () => {
    const { plugin, app } = await createPlugin("main");

    await plugin.activateView();

    expect(app.workspace.getLeaf).toHaveBeenCalledWith("tab");
    expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
    expect(app.workspace.getLeftLeaf).not.toHaveBeenCalled();
  });
});
