import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    clearFolderPathCache(): void {}
  },
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

interface PrivateView {
  handleFolderClick: (folder: string | null) => void;
  handleFilterChange: (filter: unknown) => void;
  handleClearTags: () => void;
  selectedTags: string[];
  sidebar: unknown;
}

describe("dashboard actions behind palette commands", () => {
  let view: RssDashboardView;
  let privateView: PrivateView;

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    const app = {
      workspace: {
        on: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        getMostRecentLeaf: vi.fn(),
      },
      vault: { on: vi.fn() },
    } as unknown as App;
    const leaf = {
      app,
      view: null,
      onClose: vi.fn(),
      onContextMenu: vi.fn(),
    } as unknown as WorkspaceLeaf;
    const plugin = {
      app,
      settings: structuredClone(DEFAULT_SETTINGS),
      saveSettings: vi.fn(),
    } as unknown as RssDashboardPlugin;
    view = new RssDashboardView(leaf, plugin);
    privateView = view as unknown as PrivateView;
  });

  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("actionShowStarred opens the Starred view the sidebar entry opens", () => {
    const spy = vi.spyOn(privateView, "handleFolderClick").mockReturnValue();

    view.actionShowStarred();

    expect(spy).toHaveBeenCalledWith("starred");
  });

  it("actionClearFilters resets the status and tag filters and the tag selection", () => {
    const filterSpy = vi
      .spyOn(privateView, "handleFilterChange")
      .mockReturnValue();
    const clearTagsSpy = vi
      .spyOn(privateView, "handleClearTags")
      .mockReturnValue();
    privateView.selectedTags = ["news"];

    view.actionClearFilters();

    expect(filterSpy).toHaveBeenCalledWith({
      type: "batch",
      value: null,
      batch: { statusFilters: new Set(), tagFilters: new Set() },
    });
    expect(clearTagsSpy).toHaveBeenCalledTimes(1);
  });

  it("actionClearFilters leaves the tag selection alone when none is set", () => {
    vi.spyOn(privateView, "handleFilterChange").mockReturnValue();
    const clearTagsSpy = vi
      .spyOn(privateView, "handleClearTags")
      .mockReturnValue();

    view.actionClearFilters();

    expect(clearTagsSpy).not.toHaveBeenCalled();
  });

  it("actionFocusSearch focuses and selects the article search input", () => {
    const input = view.containerEl.createEl("input", {
      cls: "rss-dashboard-article-search-input",
    });
    document.body.appendChild(view.containerEl);
    input.value = "query";

    view.actionFocusSearch();

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
  });

  it("actionSetAllFoldersCollapsed delegates to the sidebar", () => {
    const setAllFoldersCollapsed = vi.fn();
    privateView.sidebar = { setAllFoldersCollapsed };

    view.actionSetAllFoldersCollapsed(true);
    view.actionSetAllFoldersCollapsed(false);

    expect(setAllFoldersCollapsed.mock.calls).toEqual([[true], [false]]);
  });

  it("actionSetAllFoldersCollapsed is a no-op without a sidebar", () => {
    privateView.sidebar = undefined;

    expect(() => view.actionSetAllFoldersCollapsed(true)).not.toThrow();
  });
});
