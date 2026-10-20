// A rich Substack item skips the automatic full-article fetch. It must still
// offer the RSS/fetched toggle, and run the fetch only when the reader asks for
// the fetched version.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";
import {
  DEFAULT_SETTINGS,
  Feed,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

vi.mock("../../../src/views/video-player", () => ({
  VideoPlayer: class {
    loadVideo = vi.fn();
    setRelatedVideos = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock("../../../src/views/podcast-player", () => ({
  PodcastPlayer: class {
    loadEpisode = vi.fn();
    destroy = vi.fn();
    updateTheme = vi.fn();
  },
}));

const mathMock = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock("../../../src/utils/math-rendering", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/math-rendering")
  >("../../../src/utils/math-rendering");
  return { ...actual, scheduleProcessMathElements: mathMock.schedule };
});

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type Internals = {
  contentEl: HTMLElement;
  readingContainer: HTMLElement;
  fetchFullArticleContent: unknown;
  displayItem(item: FeedItem): Promise<void>;
};

const RSS_BODY = "RSS body marker.";
const FETCHED_BODY = "Fetched body marker.";
const LONG = "Sentence of article body text. ".repeat(12);

const RICH_CONTENT = `<p>${RSS_BODY} ${LONG}</p><div class="captioned-image-container"><figure><a class="image-link image2 is-viewable-img" target="_blank" href="https://substackcdn.com/image/fetch/$s_!VrzG!,f_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Faaa_761x852.jpeg" data-component-name="Image2ToDOM"><div class="image2-inset"><picture><img src="https://substack-post-media.s3.amazonaws.com/public/images/aaa_761x852.jpeg" width="526" height="588" alt=""></picture></div></a></figure></div>`;

const PLAIN_CONTENT = `<p>${RSS_BODY} ${LONG}</p>`;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "The anti-American Right",
    link: "https://www.noahpinion.blog/p/the-anti-american-right",
    description: "",
    content: RICH_CONTENT,
    pubDate: "2024-03-05T10:20:30.000Z",
    guid: "guid-on-demand-toggle",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Noahpinion",
    feedUrl: "https://noahpinion.substack.com/feed",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Noahpinion",
    url: "https://noahpinion.substack.com/feed",
    folder: "RSS",
    items: [],
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe("ReaderView on-demand fetched-content toggle", () => {
  let view: ReaderView;
  let settings: RssDashboardSettings;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.empty();

    const app = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: { getAbstractFileByPath: vi.fn() },
    };

    settings = {
      ...DEFAULT_SETTINGS,
      useWebViewer: false,
      feeds: [makeFeed()],
      highlights: { ...DEFAULT_SETTINGS.highlights, words: [] },
    } as RssDashboardSettings;

    view = new ReaderView(
      new MockLeaf(app) as never,
      settings,
      {
        saveArticle: vi.fn(),
        checkSavedFileExists: vi.fn().mockReturnValue(true),
      } as never,
      vi.fn(),
      vi.fn(),
    );
    const internals = view as unknown as Internals;
    internals.contentEl = createDiv();
    await view.onOpen();
    internals.fetchFullArticleContent = vi
      .fn<(url: string) => Promise<FullArticleFetchResult>>()
      .mockResolvedValue({ content: "", failureType: "none" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  const internals = () => view as unknown as Internals;
  const reading = () => internals().readingContainer;
  const toggle = () =>
    reading().querySelector<HTMLButtonElement>(".rss-reader-content-toggle");

  it("offers the toggle before fetching and fetches only on request", async () => {
    const fetch = vi.fn().mockResolvedValue({
      content: `<p>${FETCHED_BODY} ${LONG}</p>`,
      failureType: "none",
    });
    internals().fetchFullArticleContent = fetch;

    await internals().displayItem(makeItem());

    expect(toggle()).not.toBeNull();
    expect(toggle()?.textContent).toBe("Show fetched content");
    expect(fetch).not.toHaveBeenCalled();
    expect(reading().textContent).toContain(RSS_BODY);

    toggle()?.click();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(reading().textContent).toContain(FETCHED_BODY),
    );
    expect(toggle()?.textContent).toBe("Show RSS content");

    toggle()?.click();
    await vi.waitFor(() => expect(reading().textContent).toContain(RSS_BODY));
    expect(reading().textContent).not.toContain(FETCHED_BODY);
  });

  it("keeps the toggle's purpose name and exposes busy state while fetching", async () => {
    let resolveFetch!: (result: FullArticleFetchResult) => void;
    const fetch = vi.fn(
      () =>
        new Promise<FullArticleFetchResult>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    internals().fetchFullArticleContent = fetch;

    await internals().displayItem(makeItem());
    toggle()?.click();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(toggle()?.textContent).toBe("Show fetched content");
    expect(toggle()?.getAttribute("aria-busy")).toBe("true");
    expect(toggle()?.getAttribute("aria-disabled")).toBe("true");

    resolveFetch({
      content: `<p>${FETCHED_BODY} ${LONG}</p>`,
      failureType: "none",
    });
    await vi.waitFor(() =>
      expect(reading().textContent).toContain(FETCHED_BODY),
    );
    expect(toggle()?.textContent).toBe("Show RSS content");
    expect(toggle()?.getAttribute("aria-busy")).toBeNull();
    expect(toggle()?.getAttribute("aria-disabled")).toBeNull();
  });

  it("keeps RSS and re-enables the toggle when the on-demand fetch fails", async () => {
    const fetch = vi.fn().mockResolvedValue({
      content: "",
      failureType: "network",
      failureReason: "unexpected",
    });
    internals().fetchFullArticleContent = fetch;

    await internals().displayItem(makeItem());
    toggle()?.click();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(toggle()?.textContent).toBe("Show fetched content"),
    );
    expect(toggle()?.getAttribute("aria-busy")).toBeNull();
    expect(toggle()?.getAttribute("aria-disabled")).toBeNull();
    expect(reading().textContent).toContain(RSS_BODY);
    expect(reading().textContent).not.toContain(FETCHED_BODY);
  });

  it("still offers the toggle when the item is opened again after a failure", async () => {
    const fetch = vi.fn().mockResolvedValue({
      content: "",
      failureType: "network",
      failureReason: "unexpected",
    });
    internals().fetchFullArticleContent = fetch;
    const item = makeItem();

    await internals().displayItem(item);
    toggle()?.click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await internals().displayItem(item);
    expect(toggle()).not.toBeNull();
    expect(toggle()?.textContent).toBe("Show fetched content");
    await vi.waitFor(() => expect(reading().textContent).toContain(RSS_BODY));
  });

  it("leaves the starred-import preview path alone when its body is rich", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ content: "", failureType: "none" });
    internals().fetchFullArticleContent = fetch;

    await internals().displayItem(
      makeItem({
        content: RICH_CONTENT,
        starredImportContentState: "unfetched",
      }),
    );

    expect(toggle()).toBeNull();
    expect(
      reading().querySelector(".rss-reader-starred-import-banner"),
    ).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the eager fetch for items whose feed is not rich content", async () => {
    const fetch = vi.fn().mockResolvedValue({
      content: `<p>${FETCHED_BODY} ${LONG}</p>`,
      failureType: "none",
    });
    internals().fetchFullArticleContent = fetch;

    await internals().displayItem(makeItem({ content: PLAIN_CONTENT }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toggle()).not.toBeNull();
    expect(toggle()?.textContent).toBe("Show fetched content");
  });
});
