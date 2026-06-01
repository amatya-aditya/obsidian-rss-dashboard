import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Scope, WorkspaceLeaf } from "obsidian";
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
  openFile = vi.fn(async () => {});
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

  it("routes saved article reopen through configured location helper", async () => {
    const { view, app, leaf } = createReaderView([]);
    const file = await App.createMock().vault.create(
      "RSS articles/saved.md",
      "# Saved",
    );
    const openSavedArticleInConfiguredLocation = vi.fn(async () => {});

    (
      view as unknown as {
        currentItem: {
          saved: boolean;
          savedFilePath: string;
          title: string;
          link: string;
          guid: string;
          description: string;
          pubDate: string;
          read: boolean;
          starred: boolean;
          tags: [];
          feedTitle: string;
          feedUrl: string;
          coverImage: string;
        };
        openSavedArticleInConfiguredLocation: ReturnType<typeof vi.fn>;
      }
    ).currentItem = {
      saved: true,
      savedFilePath: "RSS articles/saved.md",
      title: "Saved",
      link: "https://example.com/saved",
      guid: "saved-guid",
      description: "",
      pubDate: new Date().toISOString(),
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
    (
      view as unknown as {
        openSavedArticleInConfiguredLocation: ReturnType<typeof vi.fn>;
      }
    ).openSavedArticleInConfiguredLocation =
      openSavedArticleInConfiguredLocation;

    (
      app.vault as unknown as {
        getAbstractFileByPath: ReturnType<typeof vi.fn>;
      }
    ).getAbstractFileByPath = vi.fn(() => file);

    const leafOpenFileSpy = vi.spyOn(
      leaf as unknown as { openFile: () => void },
      "openFile",
    );

    await view.actionSaveCurrentArticle();

    expect(openSavedArticleInConfiguredLocation).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        saved: true,
        savedFilePath: "RSS articles/saved.md",
      }),
    );
    expect(leafOpenFileSpy).not.toHaveBeenCalled();
  });
});
