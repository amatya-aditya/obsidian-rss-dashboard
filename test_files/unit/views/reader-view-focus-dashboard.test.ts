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
    const saveArticleSpy = vi.fn(async () => null);
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
      { saveArticle: saveArticleSpy } as never,
      vi.fn(),
      vi.fn(),
    );

    return { app, leaf, view, workspace, saveArticleSpy };
  }

  function getSavedMarkdownArg(saveArticleSpy: ReturnType<typeof vi.fn>): string {
    const calls = saveArticleSpy.mock.calls as unknown[][];
    const call = calls.length > 0 ? calls[calls.length - 1] : undefined;
    expect(call).toBeDefined();
    const markdownArg = call?.[3];
    expect(typeof markdownArg).toBe("string");
    return markdownArg as string;
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

  it("prepends fallback hero image when saving from reader and content has no image", async () => {
    const { view, saveArticleSpy } = createReaderView([]);

    (
      view as unknown as {
        currentItem: {
          saved: boolean;
          title: string;
          link: string;
          guid: string;
          description: string;
          content?: string;
          pubDate: string;
          read: boolean;
          starred: boolean;
          tags: [];
          feedTitle: string;
          feedUrl: string;
          coverImage: string;
        };
        currentFullContent: string;
        currentContentIsFullArticle: boolean;
      }
    ).currentItem = {
      saved: false,
      title: "Part-time owners, full-time debt",
      link: "https://behzodsirjani.substack.com/p/part-time-owners-full-time-debt",
      guid: "substack-guid-1",
      description: "<p>Short summary.</p>",
      content: "",
      pubDate: new Date().toISOString(),
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Behzod Notes",
      feedUrl: "https://behzodsirjani.substack.com/feed",
      coverImage:
        "https://substack-post-media.s3.amazonaws.com/public/images/b83cfdcd-1a21-49a0-943f-977022ed4b0a_2160x1131.png",
    };

    (
      view as unknown as {
        currentFullContent: string;
        currentContentIsFullArticle: boolean;
      }
    ).currentFullContent =
      "<p>Organizations are accumulating a type of debt that no one has been hired to pay down.</p>";
    (
      view as unknown as {
        currentContentIsFullArticle: boolean;
      }
    ).currentContentIsFullArticle = false;

    await view.actionSaveCurrentArticle();

    expect(saveArticleSpy).toHaveBeenCalled();
    const markdownArg = getSavedMarkdownArg(saveArticleSpy);
    expect(markdownArg).toContain(
      "![Hero image](https://substack-post-media.s3.amazonaws.com/public/images/b83cfdcd-1a21-49a0-943f-977022ed4b0a_2160x1131.png)",
    );
    expect(markdownArg).toContain(
      "Organizations are accumulating a type of debt that no one has been hired to pay down.",
    );
  });

  it("prepends enclosure image when saving from reader and coverImage is missing", async () => {
    const { view, saveArticleSpy } = createReaderView([]);

    (
      view as unknown as {
        currentItem: {
          saved: boolean;
          title: string;
          link: string;
          guid: string;
          description: string;
          content?: string;
          pubDate: string;
          read: boolean;
          starred: boolean;
          tags: [];
          feedTitle: string;
          feedUrl: string;
          coverImage: string;
          image?: string;
          enclosure?: {
            url: string;
            type: string;
            length: string;
          };
        };
        currentFullContent: string;
        currentContentIsFullArticle: boolean;
      }
    ).currentItem = {
      saved: false,
      title: "Part-time owners, full-time debt",
      link: "https://behzodsirjani.substack.com/p/part-time-owners-full-time-debt",
      guid: "substack-guid-2",
      description: "<p>Short summary.</p>",
      content: "",
      pubDate: new Date().toISOString(),
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Behzod Notes",
      feedUrl: "https://behzodsirjani.substack.com/feed",
      coverImage: "",
      image: "",
      enclosure: {
        url: "https://substack-post-media.s3.amazonaws.com/public/images/b83cfdcd-1a21-49a0-943f-977022ed4b0a_2160x1131.png",
        type: "image/jpeg",
        length: "0",
      },
    };

    (
      view as unknown as {
        currentFullContent: string;
        currentContentIsFullArticle: boolean;
      }
    ).currentFullContent =
      "<p>Organizations are accumulating a type of debt that no one has been hired to pay down.</p>";
    (
      view as unknown as {
        currentContentIsFullArticle: boolean;
      }
    ).currentContentIsFullArticle = false;

    await view.actionSaveCurrentArticle();

    expect(saveArticleSpy).toHaveBeenCalled();
    const markdownArg = getSavedMarkdownArg(saveArticleSpy);
    expect(markdownArg).toContain(
      "![Hero image](https://substack-post-media.s3.amazonaws.com/public/images/b83cfdcd-1a21-49a0-943f-977022ed4b0a_2160x1131.png)",
    );
  });

  it("uses enclosure image when coverImage is only the feed icon", async () => {
    const { view, saveArticleSpy } = createReaderView([]);

    (
      view as unknown as {
        settings: {
          feeds: Array<{
            title: string;
            url: string;
            folder: string;
            items: unknown[];
            lastUpdated: number;
            iconUrl?: string;
          }>;
        };
      }
    ).settings.feeds = [
      {
        title: "Behzod Notes",
        url: "https://behzodsirjani.substack.com/feed",
        folder: "",
        items: [],
        lastUpdated: Date.now(),
        iconUrl:
          "https://substack-post-media.s3.amazonaws.com/public/images/0106493f-8cf8-4dd9-81ac-5cc72d628f1c_919x919.png",
      },
    ];

    (
      view as unknown as {
        currentItem: {
          saved: boolean;
          title: string;
          link: string;
          guid: string;
          description: string;
          content?: string;
          pubDate: string;
          read: boolean;
          starred: boolean;
          tags: [];
          feedTitle: string;
          feedUrl: string;
          coverImage: string;
          image?: string;
          enclosure?: {
            url: string;
            type: string;
            length: string;
          };
        };
        currentFullContent: string;
        currentContentIsFullArticle: boolean;
      }
    ).currentItem = {
      saved: false,
      title: "Part-time owners, full-time debt",
      link: "https://behzodsirjani.substack.com/p/part-time-owners-full-time-debt",
      guid: "substack-guid-3",
      description: "<p>Short summary.</p>",
      content: "",
      pubDate: new Date().toISOString(),
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Behzod Notes",
      feedUrl: "https://behzodsirjani.substack.com/feed",
      coverImage:
        "https://substack-post-media.s3.amazonaws.com/public/images/0106493f-8cf8-4dd9-81ac-5cc72d628f1c_919x919.png",
      image: "",
      enclosure: {
        url: "https://substack-post-media.s3.amazonaws.com/public/images/b83cfdcd-1a21-49a0-943f-977022ed4b0a_2160x1131.png",
        type: "image/jpeg",
        length: "0",
      },
    };

    (
      view as unknown as {
        currentFullContent: string;
        currentContentIsFullArticle: boolean;
      }
    ).currentFullContent =
      "<p>Organizations are accumulating a type of debt that no one has been hired to pay down.</p>";
    (
      view as unknown as {
        currentContentIsFullArticle: boolean;
      }
    ).currentContentIsFullArticle = false;

    await view.actionSaveCurrentArticle();

    expect(saveArticleSpy).toHaveBeenCalled();
    const markdownArg = getSavedMarkdownArg(saveArticleSpy);
    expect(markdownArg).toContain(
      "![Hero image](https://substack-post-media.s3.amazonaws.com/public/images/b83cfdcd-1a21-49a0-943f-977022ed4b0a_2160x1131.png)",
    );
    expect(markdownArg).not.toContain(
      "![Hero image](https://substack-post-media.s3.amazonaws.com/public/images/0106493f-8cf8-4dd9-81ac-5cc72d628f1c_919x919.png)",
    );
  });

  it("normalizes image-only links when saving from reader", async () => {
    const { view, saveArticleSpy } = createReaderView([]);

    (
      view as unknown as {
        currentItem: {
          saved: boolean;
          title: string;
          link: string;
          guid: string;
          description: string;
          content?: string;
          pubDate: string;
          read: boolean;
          starred: boolean;
          tags: [];
          feedTitle: string;
          feedUrl: string;
          coverImage: string;
        };
        currentFullContent: string;
        currentContentIsFullArticle: boolean;
      }
    ).currentItem = {
      saved: false,
      title: "Substack Linked Image",
      link: "https://behzodsirjani.substack.com/p/another-post",
      guid: "substack-guid-4",
      description: "<p>Summary.</p>",
      content: "",
      pubDate: new Date().toISOString(),
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Behzod Notes",
      feedUrl: "https://behzodsirjani.substack.com/feed",
      coverImage: "",
    };

    (
      view as unknown as {
        currentFullContent: string;
        currentContentIsFullArticle: boolean;
      }
    ).currentFullContent =
      '<figure><a href="https://substackcdn.com/image/fetch/$s_!GtED!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F108fc67d-1f88-4d55-bb47-e44613e67b2a_1632x656.png"><img src="https://substack-post-media.s3.amazonaws.com/public/images/108fc67d-1f88-4d55-bb47-e44613e67b2a_1632x656.png" alt="" /></a></figure><p>Body text.</p>';
    (
      view as unknown as {
        currentContentIsFullArticle: boolean;
      }
    ).currentContentIsFullArticle = false;

    await view.actionSaveCurrentArticle();

    expect(saveArticleSpy).toHaveBeenCalled();
    const markdownArg = getSavedMarkdownArg(saveArticleSpy);
    expect(markdownArg).toContain(
      "![](https://substack-post-media.s3.amazonaws.com/public/images/108fc67d-1f88-4d55-bb47-e44613e67b2a_1632x656.png)",
    );
    expect(markdownArg).not.toContain("Link to image");
    expect(markdownArg).not.toContain("[\n\n![](");
  });
});
