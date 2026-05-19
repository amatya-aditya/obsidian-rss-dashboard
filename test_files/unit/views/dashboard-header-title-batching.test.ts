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
    constructor(..._args: unknown[]) {}
    render(): void {
      sidebarRenderSpy();
    }
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor(..._args: unknown[]) {}
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
    constructor(..._args: unknown[]) {}
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
    interface RssDashboardViewWithPrivates {
      schedulePersistDashboardMultiFilters: ReturnType<typeof vi.fn>;
      getFilteredArticles: ReturnType<typeof vi.fn>;
      refreshFilterStatusBarOnly: ReturnType<typeof vi.fn>;
      articleList: {
        refilter: ReturnType<typeof vi.fn>;
        updateHeaderTitle: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      };
      handleFilterChange: (opts: unknown) => void;
      sidebar: {
        clearFolderPathCache: ReturnType<typeof vi.fn>;
        render: ReturnType<typeof vi.fn>;
      };
    }

    const view = new RssDashboardView(leaf, plugin as never) as unknown as RssDashboardViewWithPrivates;

    view.schedulePersistDashboardMultiFilters = vi.fn();
    view.getFilteredArticles = vi.fn(() => []);
    view.refreshFilterStatusBarOnly = vi.fn();

    const updateHeaderTitle = vi.fn();
    view.articleList = {
      refilter: vi.fn(),
      updateHeaderTitle,
      destroy: vi.fn(),
    };

    view.handleFilterChange({ type: "unread", value: null, checked: true });
    view.handleFilterChange({ type: "starred", value: null, checked: true });

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

    interface RssDashboardViewWithPrivates {
      sidebar: {
        clearFolderPathCache: ReturnType<typeof vi.fn>;
        render: ReturnType<typeof vi.fn>;
      };
      articleList: {
        destroy: ReturnType<typeof vi.fn>;
      };
      refreshSidebarOnly: () => void;
    }

    const view = new RssDashboardView(leaf, plugin as never) as unknown as RssDashboardViewWithPrivates;

    view.sidebar = {
      clearFolderPathCache: vi.fn(),
      render: sidebarRenderSpy,
    };
    view.articleList = {
      destroy: vi.fn(),
    };

    view.refreshSidebarOnly();

    expect(view.sidebar.clearFolderPathCache).toHaveBeenCalledTimes(1);
    expect(sidebarRenderSpy).toHaveBeenCalledTimes(1);
    expect(view.articleList.destroy).not.toHaveBeenCalled();
  });
});

