// Characterization (#983 slice 2): pins how the dedicated reader resolves the
// fetch arguments, survives a throwing fetch, and gates metadata persistence
// before fetch/persist/banner code moves into reader-article-fetch. Read-only
// during the extraction.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import type { RawArticleMetadata } from "../../../src/utils/article-metadata";
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

const LONG_BODY = `<p>${"A substantial opening paragraph that differs from the feed blurb. ".repeat(5)}</p>`;
const SHORT_BODY = "<p>Too short.</p>";

const PAGE_METADATA: RawArticleMetadata = {
  metaDescription:
    "Unique publisher summary with enough detail to pass the description guard.",
  ogDescription: "",
  twitterDescription: "",
  htmlLang: "en",
  metaAuthor: "Ada Author",
  jsonLdAuthors: [],
  microdataAuthors: [],
  relAuthors: [],
  ogImage: "",
  twitterImage: "",
  readabilityExcerpt: "",
  canonicalUrl: "https://example.com/canonical",
};

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Fetch Article",
    link: "https://example.com/article",
    description: "<p>Short feed blurb</p>",
    content: "",
    pubDate: "2026-10-06T00:00:00Z",
    guid: "fetch-article",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ReaderView full-article fetch pipeline", () => {
  let onArticleUpdate: Mock<
    (item: FeedItem, updates: Partial<FeedItem>, rerender?: boolean) => void
  >;
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
        ...settings,
      } as RssDashboardSettings,
      {
        saveArticle: vi.fn(),
        checkSavedFileExists: vi.fn().mockReturnValue(true),
      } as never,
      vi.fn(),
      onArticleUpdate,
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = createDiv();
    await view.onOpen();
  }

  const reading = () =>
    (view as unknown as { readingContainer: HTMLElement }).readingContainer;

  beforeEach(() => {
    fetchMock.mockReset();
    document.body.empty();
    onArticleUpdate = vi.fn();
  });

  afterEach(() => {
    document.body.empty();
  });

  it("passes the proxy and fetch timeout from settings when the proxy is on", async () => {
    fetchMock.mockResolvedValue({ content: LONG_BODY, failureType: "none" });
    const item = makeItem();
    await open({
      corsProxyEnabled: true,
      corsProxyUrl: "https://proxy.example/?u=",
      articleSaving: { ...DEFAULT_SETTINGS.articleSaving, fetchTimeout: 25 },
    });

    await view.displayItem(item);

    expect(fetchMock).toHaveBeenCalledWith(
      item.link,
      "https://proxy.example/?u=",
      25,
    );
  });

  it("passes no proxy when the proxy is off, whatever its URL", async () => {
    fetchMock.mockResolvedValue({ content: LONG_BODY, failureType: "none" });
    const item = makeItem();
    await open({
      corsProxyEnabled: false,
      corsProxyUrl: "https://proxy.example/?u=",
    });

    await view.displayItem(item);

    expect(fetchMock).toHaveBeenCalledWith(
      item.link,
      undefined,
      expect.any(Number),
    );
  });

  it("passes no proxy for an empty proxy URL when the proxy is on", async () => {
    // Pinned divergence from ArticleRenderer, which passes "" here; the fetch
    // util treats both as "no proxy", so nothing observable differs.
    fetchMock.mockResolvedValue({ content: LONG_BODY, failureType: "none" });
    const item = makeItem();
    await open({ corsProxyEnabled: true, corsProxyUrl: "" });

    await view.displayItem(item);

    expect(fetchMock).toHaveBeenCalledWith(
      item.link,
      undefined,
      expect.any(Number),
    );
  });

  it("survives a throwing fetch without remembering a failure", async () => {
    // A thrown error says nothing about the page, so it is not remembered.
    fetchMock.mockRejectedValue(new Error("boom"));
    const item = makeItem();
    await open();

    await view.displayItem(item);

    expect(item.fullContentFetchFailure).toBeUndefined();
    expect(onArticleUpdate).not.toHaveBeenCalled();
    expect(
      reading().querySelector(".rss-reader-fetch-failure-banner"),
    ).toBeNull();
    expect(reading().textContent).toContain("Short feed blurb");
  });

  it("persists page metadata once when the fetched body is substantial", async () => {
    fetchMock.mockResolvedValue({
      content: LONG_BODY,
      failureType: "none",
      pageMetadata: PAGE_METADATA,
    });
    const item = makeItem();
    await open();

    await view.displayItem(item);

    expect(onArticleUpdate).toHaveBeenCalledTimes(1);
    expect(onArticleUpdate).toHaveBeenCalledWith(
      item,
      expect.objectContaining({
        canonicalUrl: "https://example.com/canonical",
        publisherDescription: PAGE_METADATA.metaDescription,
        authors: ["Ada Author"],
        metadataFetchedAt: expect.any(Number),
      }),
      false,
    );
    expect(item.metadataFetchedAt).toEqual(expect.any(Number));
  });

  it("does not persist page metadata when the fetched body is short", async () => {
    fetchMock.mockResolvedValue({
      content: SHORT_BODY,
      failureType: "none",
      pageMetadata: PAGE_METADATA,
    });
    const item = makeItem();
    await open();

    await view.displayItem(item);

    expect(item.metadataFetchedAt).toBeUndefined();
    expect(onArticleUpdate).not.toHaveBeenCalled();
  });

  it("does not persist page metadata when the item already holds it", async () => {
    fetchMock.mockResolvedValue({
      content: LONG_BODY,
      failureType: "none",
      pageMetadata: PAGE_METADATA,
    });
    const item = makeItem({ metadataFetchedAt: 123 });
    await open();

    await view.displayItem(item);

    expect(item.metadataFetchedAt).toBe(123);
    expect(onArticleUpdate).not.toHaveBeenCalled();
  });

  it("does not call the fetch for an item without a link", async () => {
    const item = makeItem({ link: "" });
    await open();

    await view.displayItem(item);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the restricted banner into the reading container current when the fetch settles", async () => {
    // Pinned: the banner target is read when the fetch settles, not captured
    // when the display starts.
    let settle: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    const item = makeItem();
    await open();

    const pending = view.displayItem(item);
    const original = reading();
    const replacement = createDiv();
    (view as unknown as { readingContainer: HTMLElement }).readingContainer =
      replacement;
    settle({ content: "", failureType: "restricted" });
    await pending;

    expect(
      replacement.querySelector(".rss-reader-paywall-banner"),
    ).not.toBeNull();
    expect(original.querySelector(".rss-reader-paywall-banner")).toBeNull();
  });
});
