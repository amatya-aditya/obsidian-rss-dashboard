import { afterEach, describe, expect, it, vi } from "vitest";
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

function item(): FeedItem {
  return {
    title: "Ad page article",
    link: "https://example.com/ad-page",
    description: "<p>Short feed blurb</p>",
    content: "",
    pubDate: "2026-10-06",
    guid: "ad-page",
    feedTitle: "Example",
    feedUrl: "https://example.com/feed",
    coverImage: "",
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

  it("hands the saver Markdown without ad containers", async () => {
    const app = App.createMock();
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.useWebViewer = false;
    settings.articleSaving.saveVersion = "fetched";
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
    fetchMock.mockResolvedValueOnce(FETCHED);

    const article = item();
    await view.displayItem(article);
    // The Reader only saves its own Markdown once the fetched version is shown.
    const toggle = container.querySelector<HTMLButtonElement>(
      ".rss-reader-content-toggle",
    );
    if (!toggle) throw new Error("Missing content toggle");
    toggle.click();
    await view.actionSaveCurrentArticle();

    expect(save).toHaveBeenCalledOnce();
    const readerContent = save.mock.calls[0]?.[4] as { markdown?: string };
    expect(readerContent.markdown).toContain("A substantial opening paragraph");
    expect(readerContent.markdown).not.toContain("Sponsored placement");
  });
});
