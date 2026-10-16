import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
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

const VIDEO_ID = "z9TFdTqkbPk";
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

function createItem(): FeedItem {
  return {
    title: "Reader save embed",
    link: "https://example.com/reader-embed",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "reader-save-embed",
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

describe("ReaderView saved Markdown (#1168)", () => {
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

  it("writes the native embed and the plain watch link for a recognized iframe in the page", () => {
    harness.currentFullContent = `<p>Intro</p><iframe src="https://www.youtube.com/embed/${VIDEO_ID}"></iframe><p>Outro</p>`;
    harness.currentContentIsFullArticle = true;

    const markdown = harness.buildReaderSaveMarkdown(createItem());

    expect(markdown).toContain(
      `![](${WATCH_URL})\n\n[Watch on YouTube](${WATCH_URL})`,
    );
    expect(markdown).toContain("Intro");
    expect(markdown).toContain("Outro");
  });

  it("still drops an iframe from another host", () => {
    harness.currentFullContent = `<p>Intro</p><iframe src="https://evil.example/embed/AAAAAAAAAAA"></iframe>`;
    harness.currentContentIsFullArticle = true;

    const markdown = harness.buildReaderSaveMarkdown(createItem());

    expect(markdown).toBe("Intro");
  });
});
