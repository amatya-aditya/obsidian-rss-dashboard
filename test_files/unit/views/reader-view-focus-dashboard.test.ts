import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scope, WorkspaceLeaf } from "obsidian";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  view: unknown;

  constructor(app: unknown) {
    this.app = app;
    this.view = { app };
  }

  detach = vi.fn();
}

describe("ReaderView dashboard refocus", () => {
  beforeEach(() => {
    document.body.empty();
  });

  function createReaderView(dashboardLeaves: WorkspaceLeaf[]) {
    const workspace = {
      getLeavesOfType: vi.fn().mockReturnValue(dashboardLeaves),
      setActiveLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
      on: vi.fn(),
    };
    const app = {
      scope: new Scope(),
      workspace,
      vault: {
        getAbstractFileByPath: vi.fn(),
      },
    };
    const leaf = new MockLeaf(app);
    const view = new ReaderView(
      leaf as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false },
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    return { app, leaf, view, workspace };
  }

  async function flushAsyncFocusHandoff(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  it("prefers returnLeaf when it is still an active dashboard leaf", async () => {
    const focus = vi.fn();
    const preferredLeaf = {
      id: "preferred",
      view: {
        containerEl: { focus },
      },
    } as unknown as WorkspaceLeaf;
    const fallbackLeaf = { id: "fallback" } as unknown as WorkspaceLeaf;
    const { leaf, view, workspace } = createReaderView([
      preferredLeaf,
      fallbackLeaf,
    ]);

    view.setReturnLeaf(preferredLeaf);
    view.actionFocusDashboard();

    await flushAsyncFocusHandoff();

    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(preferredLeaf, {
      focus: true,
    });
    expect(workspace.revealLeaf).toHaveBeenCalledWith(preferredLeaf);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(leaf.detach).not.toHaveBeenCalled();
  });

  it("falls back to the first dashboard leaf when returnLeaf is stale", async () => {
    const staleLeaf = { id: "stale" } as unknown as WorkspaceLeaf;
    const fallbackLeaf = { id: "fallback" } as unknown as WorkspaceLeaf;
    const { leaf, view, workspace } = createReaderView([fallbackLeaf]);

    view.setReturnLeaf(staleLeaf);
    view.actionFocusDashboard();

    await flushAsyncFocusHandoff();

    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(fallbackLeaf, {
      focus: true,
    });
    expect(workspace.revealLeaf).toHaveBeenCalledWith(fallbackLeaf);
    expect(leaf.detach).not.toHaveBeenCalled();
  });
});
