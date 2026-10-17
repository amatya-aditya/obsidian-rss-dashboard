// Regression coverage for the Aeon feed (https://aeon.co/feed.rss).
//
// Aeon's feed ships only a teaser: a lead image, a one-sentence blurb, and a
// "Read on Aeon" link. The full essay lives on the article page. The reader is
// expected to fetch that page on open and offer it as the "Fetched content"
// version, exactly like any other article host.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => ({
  ...(await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch")),
  fetchFullArticleContentWithOutcome: fetchMock,
}));

installObsidianDomPolyfills();

class MockLeaf {
  constructor(public app: unknown) {}
  detach = vi.fn();
}

// The real shape of an Aeon feed item's <description> (feed.rss, 2026-10-16).
const AEON_FEED_TEASER =
  '<p><img src="https://images.aeonmedia.co/images/x/hero.jpg?width=1200" /></p>' +
  "<p>Cicero’s ideal of manly virtue stressed the performance of self-control and bravery</p>" +
  "<p><em>- by Catharine Edwards</em></p>" +
  '<p><a href="https://aeon.co/essays/the-politics-of-masculinity">Read on Aeon</a></p>';

function makeAeonItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "How to be a (Roman) man",
    link: "https://aeon.co/essays/the-politics-of-masculinity-at-the-end-of-the-roman-republic",
    description: AEON_FEED_TEASER,
    content: "",
    pubDate: "2026-10-16T10:00:00Z",
    guid: "urn:id:9148",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Aeon | a world of ideas",
    feedUrl: "https://aeon.co/feed.rss",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ReaderView Aeon feed full-article fetch", () => {
  let view: ReaderView;

  async function open(settings: Partial<RssDashboardSettings> = {}) {
    view = new ReaderView(
      new MockLeaf({
        workspace: {
          getLeavesOfType: vi.fn().mockReturnValue([]),
          setActiveLeaf: vi.fn(),
          revealLeaf: vi.fn(),
        },
        vault: { getAbstractFileByPath: vi.fn() },
      }) as never,
      {
        ...DEFAULT_SETTINGS,
        useWebViewer: false,
        corsProxyEnabled: false,
        ...settings,
      } as RssDashboardSettings,
      {
        saveArticle: vi.fn(),
        checkSavedFileExists: vi.fn().mockReturnValue(true),
      } as never,
      vi.fn(),
      vi.fn(),
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = createDiv();
    await view.onOpen();
  }

  beforeEach(() => {
    fetchMock.mockReset();
    document.body.empty();
  });

  afterEach(() => {
    document.body.empty();
  });

  it("attempts the full-article fetch for an Aeon essay, direct (no proxy)", async () => {
    fetchMock.mockResolvedValue({
      content: `<p>${"Full essay body text. ".repeat(40)}</p>`,
      failureType: "none",
    });
    const item = makeAeonItem();
    await open({ corsProxyEnabled: false });

    await view.displayItem(item);

    expect(fetchMock).toHaveBeenCalledWith(
      item.link,
      undefined,
      expect.any(Number),
    );
  });
});
