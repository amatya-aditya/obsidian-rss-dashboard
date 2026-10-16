import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { articleHtmlToMarkdown } from "../../../src/utils/article-markdown";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

type ReaderViewHarness = {
  currentFullContent: string;
  currentContentIsFullArticle: boolean;
  buildReaderSaveMarkdown(item: FeedItem): string;
};

const TABLE_HTML =
  "<table><thead><tr><th>Column A</th><th>Column B</th></tr></thead>" +
  "<tbody><tr><td>Alpha</td><td>1</td></tr><tr><td>Beta</td><td>2</td></tr></tbody></table>";

const TABLE_MARKDOWN =
  "| Column A | Column B |\n" +
  "| --- | --- |\n" +
  "| Alpha | 1 |\n" +
  "| Beta | 2 |";

function createItem(): FeedItem {
  return {
    title: "Reader save table",
    link: "https://example.com/reader-table",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "reader-save-table",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.rss",
    coverImage: "",
    mediaType: "article",
    saved: false,
  };
}

describe("ReaderView saved Markdown tables (#1193)", () => {
  let readerView: ReaderView;
  let harness: ReaderViewHarness;

  beforeEach(() => {
    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      useWebViewer: false,
    };
    readerView = new ReaderView(
      { app: {}, detach: vi.fn() } as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );
    harness = readerView as unknown as ReaderViewHarness;
  });

  afterEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  it("writes a pipe table instead of flattened cell text", () => {
    harness.currentFullContent = TABLE_HTML;
    harness.currentContentIsFullArticle = true;

    expect(harness.buildReaderSaveMarkdown(createItem())).toBe(TABLE_MARKDOWN);
  });

  it("writes the same table Markdown as the shared converter", () => {
    harness.currentFullContent = TABLE_HTML;
    harness.currentContentIsFullArticle = true;

    expect(harness.buildReaderSaveMarkdown(createItem())).toBe(
      articleHtmlToMarkdown(TABLE_HTML),
    );
  });
});
