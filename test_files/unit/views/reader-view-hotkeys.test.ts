import { describe, it, expect, vi, beforeEach } from "vitest";
import { App, Scope, WorkspaceLeaf } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { ReaderView } from "../../../src/views/reader-view";
import { RssDashboardSettings } from "../../../src/types/types";
import { ArticleSaver } from "../../../src/services/article-saver";

describe("ReaderView Hotkeys", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  function createMockApp(): App {
    return {
      scope: new Scope(),
      workspace: {
        on: vi.fn(),
      },
    } as unknown as App;
  }

  function createMockLeaf(app: App): WorkspaceLeaf {
    return {
      app,
      view: { app },
      onClose: vi.fn(),
      onContextMenu: vi.fn(),
    } as unknown as WorkspaceLeaf;
  }

  function createMockArticleSaver(app: App): ArticleSaver {
    return {
      app,
    } as unknown as ArticleSaver;
  }

  it("registers a custom scope for the reader view", () => {
    const app = createMockApp();
    const leaf = createMockLeaf(app);
    const saver = createMockArticleSaver(app);
    const settings = {
      readerFormat: {
        fontScalePct: 100,
      },
    } as unknown as RssDashboardSettings;

    const view = new ReaderView(
      leaf,
      settings,
      saver,
      vi.fn(),
      vi.fn()
    );

    const viewScope = (view as unknown as { scope: Scope }).scope;
    expect(viewScope).toBeInstanceOf(Scope);

    const scopeHandlers = (viewScope as unknown as { handlers: { key: string }[] }).handlers;
    expect(scopeHandlers.length).toBeGreaterThan(0);
  });

  it("registers hotkeys for zoom in, zoom out, reset, and help modal", () => {
    const app = createMockApp();
    const leaf = createMockLeaf(app);
    const saver = createMockArticleSaver(app);
    const settings = {
      readerFormat: {
        fontScalePct: 100,
      },
    } as unknown as RssDashboardSettings;

    const view = new ReaderView(
      leaf,
      settings,
      saver,
      vi.fn(),
      vi.fn()
    );

    const viewScope = (view as unknown as { scope: Scope }).scope;
    const scopeHandlers = (viewScope as unknown as { handlers: { key: string, modifiers: string[] }[] }).handlers;

    const zoomInHandler = scopeHandlers.find((h) => h.key === "+" && (!h.modifiers || h.modifiers.length === 0));
    expect(zoomInHandler).toBeDefined();

    const zoomInShiftPlus = scopeHandlers.find((h) => h.key === "+" && h.modifiers?.includes("Shift"));
    expect(zoomInShiftPlus).toBeDefined();

    const zoomInEquals = scopeHandlers.find((h) => h.key === "=" && (!h.modifiers || h.modifiers.length === 0));
    expect(zoomInEquals).toBeDefined();

    const zoomInShiftEquals = scopeHandlers.find((h) => h.key === "=" && h.modifiers?.includes("Shift"));
    expect(zoomInShiftEquals).toBeDefined();

    const zoomOutHandler = scopeHandlers.find((h) => h.key === "-" && (!h.modifiers || h.modifiers.length === 0));
    expect(zoomOutHandler).toBeDefined();

    const zoomOutShiftMinus = scopeHandlers.find((h) => h.key === "-" && h.modifiers?.includes("Shift"));
    expect(zoomOutShiftMinus).toBeDefined();

    const zoomResetHandler = scopeHandlers.find((h) => h.key === "0" && (!h.modifiers || h.modifiers.length === 0));
    expect(zoomResetHandler).toBeDefined();

    const helpHandler = scopeHandlers.find((h) => h.key === "?" && h.modifiers?.includes("Shift"));
    expect(helpHandler).toBeDefined();

    // New Article Manipulation Hotkeys
    const jHandler = scopeHandlers.find((h) => h.key === "j" && (!h.modifiers || h.modifiers.length === 0));
    expect(jHandler).toBeDefined();

    const spaceHandler = scopeHandlers.find((h) => h.key === " " && (!h.modifiers || h.modifiers.length === 0));
    expect(spaceHandler).toBeDefined();

    const kHandler = scopeHandlers.find((h) => h.key === "k" && (!h.modifiers || h.modifiers.length === 0));
    expect(kHandler).toBeDefined();

    const shiftSpaceHandler = scopeHandlers.find((h) => h.key === " " && h.modifiers?.includes("Shift"));
    expect(shiftSpaceHandler).toBeDefined();

    const oHandler = scopeHandlers.find((h) => h.key === "o" && (!h.modifiers || h.modifiers.length === 0));
    expect(oHandler).toBeDefined();

    const enterHandler = scopeHandlers.find((h) => h.key === "Enter" && (!h.modifiers || h.modifiers.length === 0));
    expect(enterHandler).toBeDefined();

    const mHandler = scopeHandlers.find((h) => h.key === "m" && (!h.modifiers || h.modifiers.length === 0));
    expect(mHandler).toBeDefined();

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
