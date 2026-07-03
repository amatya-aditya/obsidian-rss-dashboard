import { describe, it, expect, vi, beforeEach } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor() {}
    render(): void {}
    destroy(): void {}
    refilter(): void {}
    setSelectedArticle(): void {}
    updateHeaderTitle(): void {}
    updateCardSpacingLayout(): void {}
    refreshCardTagLayout(): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor() {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor() {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor() {}
    open(): void {}
    close(): void {}
  },
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaverMock {
    constructor() {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

interface MockArticleList {
  refilter: ReturnType<typeof vi.fn>;
  updateHeaderTitle: ReturnType<typeof vi.fn>;
  updateCardSpacingLayout: ReturnType<typeof vi.fn>;
  refreshCardTagLayout: ReturnType<typeof vi.fn>;
}

interface MockDashboardView {
  handleFilterChange: (change: unknown) => void;
  render: ReturnType<typeof vi.fn>;
  schedulePersistDashboardMultiFilters: ReturnType<typeof vi.fn>;
  getFilteredArticles: ReturnType<typeof vi.fn>;
  refreshFilterStatusBarOnly: ReturnType<typeof vi.fn>;
  articleList: MockArticleList;
}

describe("Dashboard card layout filter batch", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("persists card layout values from a batch and rerenders once", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new obsidian.App();
    const settings = cloneSettings();
    settings.display.cardColumnsPerRow = 0;
    settings.display.cardSpacing = 15;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    const leaf = { app } as unknown as obsidian.WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin,
    ) as unknown as MockDashboardView;
    view.render = vi.fn(async () => {});

    view.handleFilterChange({
      type: "batch",
      value: null,
      batch: {
        cardColumnsPerRow: 4,
        cardSpacing: 20,
      },
    });

    expect(settings.display.cardColumnsPerRow).toBe(4);
    expect(settings.display.cardSpacing).toBe(20);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(view.render).toHaveBeenCalledTimes(1);
  });

  it("does not save or rerender when batch card layout values are unchanged", async () => {
    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new obsidian.App();
    const settings = cloneSettings();
    settings.display.cardColumnsPerRow = 3;
    settings.display.cardSpacing = 18;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    const leaf = { app } as unknown as obsidian.WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin,
    ) as unknown as MockDashboardView;
    view.render = vi.fn(async () => {});
    view.schedulePersistDashboardMultiFilters = vi.fn();
    view.getFilteredArticles = vi.fn(() => []);
    view.refreshFilterStatusBarOnly = vi.fn();
    view.articleList = {
      refilter: vi.fn(),
      updateHeaderTitle: vi.fn(),
      updateCardSpacingLayout: vi.fn(),
      refreshCardTagLayout: vi.fn(),
    };

    view.handleFilterChange({
      type: "batch",
      value: null,
      batch: {
        cardColumnsPerRow: 3,
        cardSpacing: 18,
      },
    });

    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(view.render).not.toHaveBeenCalled();
  });

  it("updates card spacing live without a full rerender", async () => {
    vi.useFakeTimers();

    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new obsidian.App();
    const settings = cloneSettings();
    settings.display.cardSpacing = 15;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    const leaf = { app } as unknown as obsidian.WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin,
    ) as unknown as MockDashboardView;
    view.render = vi.fn(async () => {});
    const updateCardSpacingLayout = vi.fn();
    const refreshCardTagLayout = vi.fn();
    view.articleList = {
      refilter: vi.fn(),
      updateHeaderTitle: vi.fn(),
      updateCardSpacingLayout,
      refreshCardTagLayout,
    };

    view.handleFilterChange({
      type: "card-spacing-live",
      value: 24,
    });

    expect(settings.display.cardSpacing).toBe(24);
    expect(updateCardSpacingLayout).toHaveBeenCalledWith(24);
    expect(refreshCardTagLayout).not.toHaveBeenCalled();
    expect(view.render).not.toHaveBeenCalled();
    expect(plugin.saveSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(90);
    expect(refreshCardTagLayout).toHaveBeenCalledTimes(1);
    expect(view.render).not.toHaveBeenCalled();
    expect(plugin.saveSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("commits card spacing without a full rerender and refreshes visible tag layout immediately", async () => {
    vi.useFakeTimers();

    const { RssDashboardView } =
      await import("../../../src/views/dashboard-view");

    const app = new obsidian.App();
    const settings = cloneSettings();
    settings.display.cardSpacing = 15;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    const leaf = { app } as unknown as obsidian.WorkspaceLeaf;
    const view = new RssDashboardView(
      leaf,
      plugin,
    ) as unknown as MockDashboardView;
    view.render = vi.fn(async () => {});
    const updateCardSpacingLayout = vi.fn();
    const refreshCardTagLayout = vi.fn();
    view.articleList = {
      refilter: vi.fn(),
      updateHeaderTitle: vi.fn(),
      updateCardSpacingLayout,
      refreshCardTagLayout,
    };

    view.handleFilterChange({
      type: "card-spacing-live",
      value: 24,
    });

    expect(refreshCardTagLayout).not.toHaveBeenCalled();

    view.handleFilterChange({
      type: "card-spacing-commit",
      value: 24,
    });

    expect(settings.display.cardSpacing).toBe(24);
    expect(updateCardSpacingLayout).toHaveBeenCalledWith(24);
    expect(refreshCardTagLayout).toHaveBeenCalledTimes(1);
    expect(view.render).not.toHaveBeenCalled();
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
