import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";

const sidebarRenderSpy = vi.fn();

// Keep platform-utils mocked so other tests that expect robustFetch to be a vi.fn
// don't end up importing the real module first.
vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    render(): void {
      sidebarRenderSpy();
    }
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

describe("Dashboard header title batching", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    sidebarRenderSpy.mockReset();
  });

  it("coalesces Apply's batch of filter updates into a single header title update", async () => {
    vi.useFakeTimers();

    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };
    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);

    (view as any).schedulePersistDashboardMultiFilters = vi.fn();
    (view as any).getFilteredArticles = vi.fn(() => []);
    (view as any).refreshFilterStatusBarOnly = vi.fn();

    const updateHeaderTitle = vi.fn();
    (view as any).articleList = {
      refilter: vi.fn(),
      updateHeaderTitle,
    };

    (view as any).handleFilterChange({ type: "unread", value: null, checked: true });
    (view as any).handleFilterChange({ type: "starred", value: null, checked: true });

    // Run the coalesced setTimeout(0)
    await vi.runAllTimersAsync();

    expect(updateHeaderTitle).toHaveBeenCalledTimes(1);
    expect(updateHeaderTitle).toHaveBeenCalledWith(
      "All Unread or Starred articles",
      "Active filters (OR): Unread, Starred",
    );

    vi.useRealTimers();
  });

  it("refreshSidebarOnly rerenders the sidebar without rebuilding the article list", async () => {
    const { RssDashboardView } = await import("../../../src/views/dashboard-view");

    const app = new App();
    const settings = cloneSettings();
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
    };
    const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new RssDashboardView(leaf, plugin as never);

    (view as any).sidebar = {
      clearFolderPathCache: vi.fn(),
      render: sidebarRenderSpy,
    };
    (view as any).articleList = {
      destroy: vi.fn(),
    };

    view.refreshSidebarOnly();

    expect((view as any).sidebar.clearFolderPathCache).toHaveBeenCalledTimes(1);
    expect(sidebarRenderSpy).toHaveBeenCalledTimes(1);
    expect((view as any).articleList.destroy).not.toHaveBeenCalled();
  });
});

