import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refilter(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelectedArticle(..._args: any[]): void {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateHeaderTitle(..._args: any[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

describe("Dashboard card layout filter batch", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("persists card layout values from a batch and rerenders once", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.display.cardColumnsPerRow = 0;
    settings.display.cardSpacing = 15;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    view.render = vi.fn(async () => {}) as unknown as typeof view.render;

    await (view as any).handleFilterChange({
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
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.display.cardColumnsPerRow = 3;
    settings.display.cardSpacing = 18;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    view.render = vi.fn(async () => {}) as unknown as typeof view.render;
    (view as any).schedulePersistDashboardMultiFilters = vi.fn();
    (view as any).getFilteredArticles = vi.fn(() => []);
    (view as any).refreshFilterStatusBarOnly = vi.fn();
    (view as any).articleList = {
      refilter: vi.fn(),
      updateHeaderTitle: vi.fn(),
    };

    await (view as any).handleFilterChange({
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

    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.display.cardSpacing = 15;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    view.render = vi.fn(async () => {}) as unknown as typeof view.render;
    const updateCardSpacingLayout = vi.fn();
    const refreshCardTagLayout = vi.fn();
    (view as any).articleList = {
      updateCardSpacingLayout,
      refreshCardTagLayout,
    };

    (view as any).handleFilterChange({
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

    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    settings.display.cardSpacing = 15;

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);
    view.render = vi.fn(async () => {}) as unknown as typeof view.render;
    const updateCardSpacingLayout = vi.fn();
    const refreshCardTagLayout = vi.fn();
    (view as any).articleList = {
      updateCardSpacingLayout,
      refreshCardTagLayout,
    };

    (view as any).handleFilterChange({
      type: "card-spacing-live",
      value: 24,
    });

    expect(refreshCardTagLayout).not.toHaveBeenCalled();

    await (view as any).handleFilterChange({
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
