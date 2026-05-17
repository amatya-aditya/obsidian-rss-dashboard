import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Scope, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor() {}
    render() {}
    destroy() {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor() {}
    render() {}
    destroy() {}
  },
}));

describe("DashboardView Hotkeys", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  function createMockApp(): App {
    return {
      scope: new Scope(),
      workspace: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        on: vi.fn(),
      },
    } as unknown as App;
  }

  function createMockLeaf(app: App): WorkspaceLeaf {
    return {
      app,
      view: { app },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onClose: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onContextMenu: vi.fn(),
    } as unknown as WorkspaceLeaf;
  }

  function createMockPlugin(app: App): RssDashboardPlugin {
    return {
      app,
      settings: {
        feeds: [],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      saveSettings: vi.fn(),
    } as unknown as RssDashboardPlugin;
  }

  it("registers a custom scope for the dashboard view", () => {
    const app = createMockApp();
    const leaf = createMockLeaf(app);
    const plugin = createMockPlugin(app);
    
    const view = new RssDashboardView(leaf, plugin);
    
    const viewScope = (view as unknown as { scope: Scope }).scope;
    expect(viewScope).toBeInstanceOf(Scope);
    
    const scopeHandlers = (viewScope as unknown as { handlers: { key: string }[] }).handlers;
    expect(scopeHandlers.length).toBeGreaterThan(0);
  });

  it("registers hotkeys for refresh, navigation, filters, and view styles", () => {
    const app = createMockApp();
    const leaf = createMockLeaf(app);
    const plugin = createMockPlugin(app);
    
    const view = new RssDashboardView(leaf, plugin);
    
    const viewScope = (view as unknown as { scope: Scope }).scope;
    const scopeHandlers = (viewScope as unknown as { handlers: { key: string, modifiers: string[] }[] }).handlers;
    
    const refreshHandler = scopeHandlers.find((h) => h.key === "r" && (!h.modifiers || h.modifiers.length === 0));
    expect(refreshHandler).toBeDefined();

    const nextHandler = scopeHandlers.find((h) => h.key === "j" && (!h.modifiers || h.modifiers.length === 0));
    expect(nextHandler).toBeDefined();

    const markHandler = scopeHandlers.find((h) => h.key === "m" && (!h.modifiers || h.modifiers.length === 0));
    expect(markHandler).toBeDefined();

    const shiftHelpHandler = scopeHandlers.find((h) => h.key === "?" && h.modifiers?.includes("Shift"));
    expect(shiftHelpHandler).toBeDefined();

    // Filters (Shift + 1/2/3)
    const allArticlesHandler = scopeHandlers.find((h) => h.key === "1" && h.modifiers?.includes("Shift"));
    expect(allArticlesHandler).toBeDefined();

    const unreadArticlesHandler = scopeHandlers.find((h) => h.key === "2" && h.modifiers?.includes("Shift"));
    expect(unreadArticlesHandler).toBeDefined();

    const readArticlesHandler = scopeHandlers.find((h) => h.key === "3" && h.modifiers?.includes("Shift"));
    expect(readArticlesHandler).toBeDefined();

    // View Styles (1/2/3)
    const listViewHandler = scopeHandlers.find((h) => h.key === "1" && (!h.modifiers || h.modifiers.length === 0));
    expect(listViewHandler).toBeDefined();

    const cardViewHandler = scopeHandlers.find((h) => h.key === "2" && (!h.modifiers || h.modifiers.length === 0));
    expect(cardViewHandler).toBeDefined();

    const feedViewHandler = scopeHandlers.find((h) => h.key === "3" && (!h.modifiers || h.modifiers.length === 0));
    expect(feedViewHandler).toBeDefined();

    // New Article Manipulation Hotkeys
    const spaceHandler = scopeHandlers.find((h) => h.key === " " && (!h.modifiers || h.modifiers.length === 0));
    expect(spaceHandler).toBeDefined();

    const prevKHandler = scopeHandlers.find((h) => h.key === "k" && (!h.modifiers || h.modifiers.length === 0));
    expect(prevKHandler).toBeDefined();

    const shiftSpaceHandler = scopeHandlers.find((h) => h.key === " " && h.modifiers?.includes("Shift"));
    expect(shiftSpaceHandler).toBeDefined();

    const arrowLeftHandler = scopeHandlers.find((h) => h.key === "ArrowLeft" && (!h.modifiers || h.modifiers.length === 0));
    expect(arrowLeftHandler).toBeDefined();

    const arrowRightHandler = scopeHandlers.find((h) => h.key === "ArrowRight" && (!h.modifiers || h.modifiers.length === 0));
    expect(arrowRightHandler).toBeDefined();

    const arrowUpHandler = scopeHandlers.find((h) => h.key === "ArrowUp" && (!h.modifiers || h.modifiers.length === 0));
    expect(arrowUpHandler).toBeDefined();

    const arrowDownHandler = scopeHandlers.find((h) => h.key === "ArrowDown" && (!h.modifiers || h.modifiers.length === 0));
    expect(arrowDownHandler).toBeDefined();

    const oHandler = scopeHandlers.find((h) => h.key === "o" && (!h.modifiers || h.modifiers.length === 0));
    expect(oHandler).toBeDefined();

    const enterHandler = scopeHandlers.find((h) => h.key === "Enter" && (!h.modifiers || h.modifiers.length === 0));
    expect(enterHandler).toBeDefined();

    const shiftAHandler = scopeHandlers.find((h) => h.key === "a" && h.modifiers?.includes("Shift"));
    expect(shiftAHandler).toBeDefined();

    const fHandler = scopeHandlers.find((h) => h.key === "f" && (!h.modifiers || h.modifiers.length === 0));
    expect(fHandler).toBeDefined();

    const tHandler = scopeHandlers.find((h) => h.key === "t" && (!h.modifiers || h.modifiers.length === 0));
    expect(tHandler).toBeDefined();

    const sHandler = scopeHandlers.find((h) => h.key === "s" && (!h.modifiers || h.modifiers.length === 0));
    expect(sHandler).toBeDefined();
  });
});
