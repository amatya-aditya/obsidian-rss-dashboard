import { afterEach, describe, expect, it, vi } from "vitest";
import { findContentToggle } from "../test-reader-toggle-helpers";
import { ReaderView } from "../../../src/views/reader-view";
import { App } from "../../stubs/obsidian";
import { DEFAULT_SETTINGS, type FeedItem } from "../../../src/types/types";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../../src/utils/full-article-fetch", async () => ({
  ...(await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch")),
  fetchFullArticleContentWithOutcome: fetchMock,
}));

function item(coverImage = ""): FeedItem {
  return {
    title: "Ad page article",
    link: "https://example.com/ad-page",
    description: "<p>Short feed blurb</p>",
    content: "",
    pubDate: "2026-10-06",
    guid: "ad-page",
    feedTitle: "Example",
    feedUrl: "https://example.com/feed",
    coverImage,
  };
}

const FETCHED: FullArticleFetchResult = {
  content:
    '<div class="ad-300"><p>Sponsored placement</p></div>' +
    `<p>${"A substantial opening paragraph which differs from the publisher summary. ".repeat(5)}</p>`,
  failureType: "none",
};

describe("Reader save strips ad containers from fetched content (#1195)", () => {
  let view: ReaderView | undefined;

  afterEach(async () => {
    await view?.onClose();
    view?.unload();
    document.body.empty();
    vi.restoreAllMocks();
  });

  const openWithFetched = async (
    fetched: FullArticleFetchResult,
    options: { defaultTemplate?: string; coverImage?: string } = {},
  ): Promise<ReturnType<typeof vi.fn>> => {
    const app = App.createMock();
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.useWebViewer = false;
    settings.articleSaving.saveVersion = "fetched";
    if (options.defaultTemplate !== undefined) {
      settings.articleSaving.defaultTemplate = options.defaultTemplate;
    }
    const save = vi.fn().mockResolvedValue(null);
    view = new ReaderView(
      { app, detach: vi.fn() } as never,
      settings,
      {
        saveArticleWithContentPolicy: save,
        checkSavedFileExists: vi.fn(),
      } as never,
      vi.fn(),
      vi.fn(),
    );
    const container = createDiv();
    (view as unknown as { contentEl: HTMLElement }).contentEl = container;
    await view.onOpen();
    fetchMock.mockResolvedValueOnce(fetched);

    await view.displayItem(item(options.coverImage));
    // The Reader only saves its own Markdown once the fetched version is shown.
    const toggle = findContentToggle(container);
    if (!toggle) throw new Error("Missing content toggle");
    toggle.click();
    await view.actionSaveCurrentArticle();
    return save;
  };

  it("hands the saver Markdown without ad containers", async () => {
    const save = await openWithFetched(FETCHED);

    expect(save).toHaveBeenCalledOnce();
    const readerContent = save.mock.calls[0]?.[4] as { markdown?: string };
    expect(readerContent.markdown).toContain("A substantial opening paragraph");
    expect(readerContent.markdown).not.toContain("Sponsored placement");
  });

  it("hands the saver the fetched body's pictures (#1361)", async () => {
    const save = await openWithFetched({
      content:
        `<p>${"A substantial opening paragraph which differs from the publisher summary. ".repeat(5)}</p>` +
        '<figure><img src="https://cdn.example.com/figure-1-1400.jpg" alt="Figure 1"></figure>' +
        '<figure><img src="https://cdn.example.com/figure-2-1400.jpg" alt="Figure 2"></figure>',
      failureType: "none",
    });

    const readerContent = save.mock.calls[0]?.[4] as { markdown?: string };
    expect(readerContent.markdown).toContain(
      "https://cdn.example.com/figure-1-1400.jpg",
    );
    expect(readerContent.markdown).toContain(
      "https://cdn.example.com/figure-2-1400.jpg",
    );
  });

  describe("hero lead and a template's {{image}}", () => {
    const COVER = "https://img.example.com/cover.jpg?quality=85&w=640";

    it("leads the Markdown with the hero when the template never names the image", async () => {
      const save = await openWithFetched(FETCHED, {
        defaultTemplate: "{{content}}",
        coverImage: COVER,
      });

      const readerContent = save.mock.calls[0]?.[4] as { markdown?: string };
      expect(readerContent.markdown).toContain(`![Hero image](${COVER})`);
    });

    it("adds no hero lead when the template places {{image}} in the note body", async () => {
      const save = await openWithFetched(FETCHED, {
        defaultTemplate: "![]({{image}})\n\n{{content}}",
        coverImage: COVER,
      });

      const readerContent = save.mock.calls[0]?.[4] as { markdown?: string };
      expect(readerContent.markdown).toContain("A substantial opening");
      expect(readerContent.markdown).not.toContain("Hero image");
      expect(readerContent.markdown).not.toContain(COVER);
    });
  });
});
