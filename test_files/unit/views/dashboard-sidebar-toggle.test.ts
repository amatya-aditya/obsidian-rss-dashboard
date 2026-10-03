import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
  setCssProps: (el: HTMLElement, props: Record<string, string>) => {
    for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
  },
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: any[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: any[]): void {}
    setSelectedArticle(..._args: any[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: any[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: any[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
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
    constructor(..._args: any[]) {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

interface ToggleHarness {
  view: {
    handleToggleSidebar: () => void;
    handleBatchToggleFolders: (collapse: string[], expand: string[]) => void;
    handleToggleTagsCollapse: () => void;
    collapsedFolders: string[];
    tagsCollapsed: boolean;
    render: () => void;
    containerEl: HTMLElement;
    articleList: unknown;
    sidebar: unknown;
    sidebarContainer: HTMLElement;
    resizeHandle: HTMLElement;
  };
  settings: RssDashboardSettings;
  renderSpy: ReturnType<typeof vi.fn>;
  articleListDestroy: ReturnType<typeof vi.fn>;
  sidebarRender: ReturnType<typeof vi.fn>;
  saveSettings: ReturnType<typeof vi.fn>;
}

async function createHarness(): Promise<ToggleHarness> {
  const { RssDashboardView } = await import(
    "../../../src/views/dashboard-view"
  );
  const settings = cloneSettings();
  const saveSettings = vi.fn(async () => {});
  const plugin = { settings, saveSettings };
  const leaf = { app: new App() } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  const internals = view as unknown as ToggleHarness["view"];

  const renderSpy = vi.fn();
  internals.render = renderSpy;

  const articleListDestroy = vi.fn();
  internals.articleList = { destroy: articleListDestroy };
  const sidebarRender = vi.fn();
  internals.sidebar = { render: sidebarRender, clearFolderPathCache: vi.fn() };

  // Minimal DOM mirroring the structure render() builds.
  document.body.appendChild(internals.containerEl);
  const layout = internals.containerEl.createDiv({
    cls: "rss-dashboard-layout",
  });
  internals.sidebarContainer = layout.createDiv({
    cls: "rss-dashboard-sidebar-container",
  });
  internals.resizeHandle = layout.createDiv({
    cls: "rss-dashboard-sidebar-resize-handle",
  });

  return {
    view: internals,
    settings,
    renderSpy,
    articleListDestroy,
    sidebarRender,
    saveSettings,
  };
}

describe("Sidebar collapse toggle only touches the sidebar", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not run a full dashboard render", async () => {
    const h = await createHarness();

    h.view.handleToggleSidebar();
    vi.runAllTimers();

    expect(h.renderSpy).not.toHaveBeenCalled();
    expect(h.articleListDestroy).not.toHaveBeenCalled();
  });

  it("does not rebuild the sidebar contents", async () => {
    const h = await createHarness();

    h.view.handleToggleSidebar();
    vi.runAllTimers();

    expect(h.sidebarRender).not.toHaveBeenCalled();
  });

  it("collapses: persists the setting and updates sidebar chrome", async () => {
    const h = await createHarness();

    h.view.handleToggleSidebar();
    vi.runAllTimers();

    expect(h.settings.sidebarCollapsed).toBe(true);
    expect(h.saveSettings).toHaveBeenCalledTimes(1);
    expect(h.view.containerEl.classList.contains("sidebar-collapsed")).toBe(
      true,
    );
    expect(h.view.sidebarContainer.classList.contains("sidebar-hidden")).toBe(
      true,
    );
    expect(
      h.view.resizeHandle.classList.contains("resize-handle-hidden"),
    ).toBe(true);
  });

  it("expands again: restores width and clears collapsed classes", async () => {
    const h = await createHarness();
    h.settings.sidebarWidth = 350;

    h.view.handleToggleSidebar();
    h.view.handleToggleSidebar();
    vi.runAllTimers();

    expect(h.settings.sidebarCollapsed).toBe(false);
    expect(h.view.containerEl.classList.contains("sidebar-collapsed")).toBe(
      false,
    );
    expect(h.view.sidebarContainer.classList.contains("sidebar-hidden")).toBe(
      false,
    );
    expect(
      h.view.resizeHandle.classList.contains("resize-handle-hidden"),
    ).toBe(false);
    expect(
      h.view.sidebarContainer.style.getPropertyValue("--rss-sidebar-width"),
    ).toBe("350px");
    expect(h.view.resizeHandle.style.left).toBe("350px");
  });

  it("collapse-all updates folder state without a full render", async () => {
    const h = await createHarness();

    h.view.handleBatchToggleFolders(["A", "B"], []);

    expect(h.view.collapsedFolders).toEqual(["A", "B"]);
    expect(h.settings.collapsedFolders).toEqual(["A", "B"]);
    expect(h.saveSettings).toHaveBeenCalledTimes(1);
    expect(h.renderSpy).not.toHaveBeenCalled();
    expect(h.articleListDestroy).not.toHaveBeenCalled();
    expect(h.sidebarRender).toHaveBeenCalledTimes(1);
  });

  it("tags collapse toggles without a full render", async () => {
    const h = await createHarness();
    const before = h.view.tagsCollapsed;

    h.view.handleToggleTagsCollapse();

    expect(h.view.tagsCollapsed).toBe(!before);
    expect(h.renderSpy).not.toHaveBeenCalled();
    expect(h.sidebarRender).toHaveBeenCalledTimes(1);
  });
});
