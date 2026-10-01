// Characterization tests for ReaderView.displayItem, renderArticle and
// populateArticleHtml (#601, part of #436). They pin the current behavior,
// quirks included, so the planned extraction to
// src/utils/reader-article-render.ts can be checked against it. They go
// through the view's public entry point (`displayItem`) wherever possible and
// call `populateArticleHtml` directly only for parameter combinations the
// entry point never produces.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  Feed,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import {
  RESTRICTED_ARTICLE_REASON,
  RESTRICTED_ARTICLE_BANNER,
} from "../../../src/utils/full-article-fetch";
import { normalizeSubstackImageUrl } from "../../../src/utils/substack-image-url";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Replace the two players so routing is observable without media elements.
const players = vi.hoisted(() => ({
  videos: [] as Array<{
    args: unknown[];
    loadVideo: ReturnType<typeof vi.fn>;
    setRelatedVideos: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
  podcasts: [] as Array<{
    args: unknown[];
    loadEpisode: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("../../../src/views/video-player", () => ({
  VideoPlayer: class {
    loadVideo = vi.fn();
    setRelatedVideos = vi.fn();
    destroy = vi.fn();
    constructor(...args: unknown[]) {
      players.videos.push({
        args,
        loadVideo: this.loadVideo,
        setRelatedVideos: this.setRelatedVideos,
        destroy: this.destroy,
      });
    }
  },
}));

vi.mock("../../../src/views/podcast-player", () => ({
  PodcastPlayer: class {
    loadEpisode = vi.fn();
    destroy = vi.fn();
    updateTheme = vi.fn();
    constructor(...args: unknown[]) {
      players.podcasts.push({
        args,
        loadEpisode: this.loadEpisode,
        destroy: this.destroy,
      });
    }
  },
}));

// Spy on the math schedule; everything else in the module stays real.
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
  titleElement: HTMLElement;
  currentItem: FeedItem | null;
  relatedItems: FeedItem[];
  currentFullContent?: string;
  currentDisplayTitle?: string;
  currentReaderTitle?: string;
  currentContentIsFullArticle: boolean;
  currentFullContentFailureType: string;
  lastRestrictedNoticeGuid: string | null;
  podcastPlayer: { destroy: () => void } | null;
  videoPlayer: { destroy: () => void } | null;
  webViewerIntegration: { openInWebViewer: ReturnType<typeof vi.fn> } | null;
  fetchFullArticleContent: Mock<(url: string) => Promise<string>>;
  closeTagsDropdown: ReturnType<typeof vi.fn>;
  updateToggleButtons: ReturnType<typeof vi.fn>;
  stripNavigationChromeFromDocument: ReturnType<typeof vi.fn>;
  stripTopHeadlineFromDocument: ReturnType<typeof vi.fn>;
  stripDuplicateLeadContentFromDocument: ReturnType<typeof vi.fn>;
  stripSkipLinksFromDocument: ReturnType<typeof vi.fn>;
  stripLeadMediaBeforeContent: ReturnType<typeof vi.fn>;
  stripDuplicateLeadMediaMatchingHero: ReturnType<typeof vi.fn>;
  stripDuplicateLeadCaptionBlocks: ReturnType<typeof vi.fn>;
  resolveReaderFontFamily(family: string): string;
  getReaderFormat(): { fontFamily: string };
  populateArticleHtml(
    container: HTMLElement,
    rawHtml: string,
    baseUrl: string,
    fallbackHeroUrl?: string,
    title?: string,
    heroSlot?: HTMLElement,
    stripTopHeadline?: boolean,
    feedDescriptionHtml?: string,
  ): void;
};

function internals(view: ReaderView): Internals {
  return view as unknown as Internals;
}

const LONG_TEXT = "Sentence of article body text. ".repeat(12);
const LONG_HTML = `<p>${LONG_TEXT}</p>`;
const YOUTUBE_LINK = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Feed Item Title",
    link: "https://example.com/article",
    description: "",
    content: "",
    pubDate: "2024-03-05T10:20:30.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Example Feed",
    url: "https://example.com/rss.xml",
    folder: "RSS",
    items: [],
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe("ReaderView article rendering (characterization)", () => {
  let view: ReaderView;
  let settings: RssDashboardSettings;
  let articleSaver: {
    saveArticle: ReturnType<typeof vi.fn>;
    checkSavedFileExists: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    players.videos.length = 0;
    players.podcasts.length = 0;
    activeDocument.body.empty();

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
      feeds: [],
      highlights: { ...DEFAULT_SETTINGS.highlights, words: [] },
    } as RssDashboardSettings;
    articleSaver = {
      saveArticle: vi.fn(),
      checkSavedFileExists: vi.fn().mockReturnValue(true),
    };

    view = new ReaderView(
      new MockLeaf(app) as never,
      settings,
      articleSaver as never,
      vi.fn(),
      vi.fn(),
    );
    internals(view).contentEl = createDiv();
    await view.onOpen();
    // No network: an article with a link would otherwise fetch the full page.
    internals(view).fetchFullArticleContent = vi
      .fn<(url: string) => Promise<string>>()
      .mockResolvedValue("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    activeDocument.body.empty();
  });

  const reading = () => internals(view).readingContainer;
  const q = (selector: string) => reading().querySelector<HTMLElement>(selector);
  const qa = (selector: string) =>
    Array.from(reading().querySelectorAll<HTMLElement>(selector));
  const fetchMock = () => internals(view).fetchFullArticleContent;

  describe("displayItem: state handling", () => {
    it("records the item and its related items and empties the reading pane first", async () => {
      reading().createDiv({ cls: "stale-child" });
      const item = makeItem({ mediaType: "video", videoId: "abcdefghijk" });
      const related = [makeItem({ guid: "r1" })];

      await view.displayItem(item, related);

      expect(internals(view).currentItem).toBe(item);
      expect(internals(view).relatedItems).toBe(related);
      expect(q(".stale-child")).toBeNull();
    });

    it("defaults the related items to an empty list", async () => {
      internals(view).relatedItems = [makeItem({ guid: "old" })];

      await view.displayItem(
        makeItem({ mediaType: "video", videoId: "abcdefghijk" }),
      );

      expect(internals(view).relatedItems).toEqual([]);
    });

    it("clears the previous title, full-article flag and failure type before loading", async () => {
      const state = internals(view);
      state.currentDisplayTitle = "stale display title";
      state.currentReaderTitle = "stale reader title";
      state.currentContentIsFullArticle = true;
      state.currentFullContentFailureType = "restricted";

      await view.displayItem(
        makeItem({ mediaType: "video", videoId: "abcdefghijk" }),
      );

      expect(state.currentDisplayTitle).toBeUndefined();
      expect(state.currentReaderTitle).toBeUndefined();
      expect(state.currentContentIsFullArticle).toBe(false);
      expect(state.currentFullContentFailureType).toBe("none");
    });

    it("shows the item title in the reader header as soon as the item opens", async () => {
      internals(view).titleElement.setText("Stale header");

      await view.displayItem(
        makeItem({ title: "Opened Item", mediaType: "video", videoId: "abcdefghijk" }),
      );

      expect(internals(view).titleElement.textContent).toBe("Opened Item");
    });

    it("closes the tags dropdown and refreshes the toggle buttons once", async () => {
      const state = internals(view);
      state.closeTagsDropdown = vi.fn();
      state.updateToggleButtons = vi.fn();

      await view.displayItem(
        makeItem({ mediaType: "video", videoId: "abcdefghijk" }),
      );

      expect(state.closeTagsDropdown).toHaveBeenCalledTimes(1);
      expect(state.updateToggleButtons).toHaveBeenCalledTimes(1);
    });

    it("forgets the restricted-notice guid when a different article opens", async () => {
      const state = internals(view);
      state.currentItem = makeItem({ guid: "old" });
      state.lastRestrictedNoticeGuid = "old";

      await view.displayItem(
        makeItem({
          guid: "new",
          mediaType: "video",
          videoId: "abcdefghijk",
        }),
      );

      expect(state.lastRestrictedNoticeGuid).toBeNull();
    });

    it("keeps the restricted-notice guid when the same article reopens", async () => {
      const state = internals(view);
      state.currentItem = makeItem({ guid: "same" });
      state.lastRestrictedNoticeGuid = "same";

      await view.displayItem(
        makeItem({
          guid: "same",
          mediaType: "video",
          videoId: "abcdefghijk",
        }),
      );

      expect(state.lastRestrictedNoticeGuid).toBe("same");
    });

    it("forgets the restricted-notice guid when nothing was open before", async () => {
      const state = internals(view);
      state.currentItem = null;
      state.lastRestrictedNoticeGuid = "old";

      await view.displayItem(
        makeItem({ mediaType: "video", videoId: "abcdefghijk" }),
      );

      expect(state.lastRestrictedNoticeGuid).toBeNull();
    });
  });

  describe("displayItem: stale saved state", () => {
    const savedTag = { name: "Saved", color: "#111111" };
    const otherTag = { name: "Keep", color: "#222222" };

    function openWithMissingFile(item: FeedItem) {
      articleSaver.checkSavedFileExists.mockReturnValue(false);
      return view.displayItem(item);
    }

    it("clears the saved flag, path and Saved tag when the saved note is gone", async () => {
      const item = makeItem({
        saved: true,
        savedFilePath: "Saved/note.md",
        tags: [savedTag, otherTag],
        content: LONG_HTML,
      });

      await openWithMissingFile(item);

      expect(articleSaver.checkSavedFileExists).toHaveBeenCalledWith(item);
      expect(item.saved).toBe(false);
      expect(item.savedFilePath).toBeUndefined();
      expect(item.tags).toEqual([otherTag]);
    });

    it("matches the Saved tag name without regard to case", async () => {
      const item = makeItem({
        saved: true,
        tags: [{ name: "SAVED", color: "#111111" }, otherTag],
        content: LONG_HTML,
      });

      await openWithMissingFile(item);

      expect(item.tags).toEqual([otherTag]);
    });

    it("leaves an item without tags without tags", async () => {
      const item = makeItem({ saved: true, content: LONG_HTML });
      item.tags = undefined;

      await openWithMissingFile(item);

      expect(item.saved).toBe(false);
      expect(item.tags).toBeUndefined();
    });

    it("leaves a saved item alone while its note still exists", async () => {
      const item = makeItem({
        saved: true,
        savedFilePath: "Saved/note.md",
        tags: [savedTag],
        content: LONG_HTML,
      });

      await view.displayItem(item);

      expect(item.saved).toBe(true);
      expect(item.savedFilePath).toBe("Saved/note.md");
      expect(item.tags).toEqual([savedTag]);
    });

    it("does not look for a note when the item is not saved", async () => {
      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(articleSaver.checkSavedFileExists).not.toHaveBeenCalled();
    });

    it("also clears the saved flag and Saved tag on the feed's own copy of the item", async () => {
      const original = makeItem({
        saved: true,
        savedFilePath: "Saved/note.md",
        tags: [savedTag, otherTag],
      });
      settings.feeds = [makeFeed({ items: [original] })];
      const shown = makeItem({
        saved: true,
        savedFilePath: "Saved/note.md",
        tags: [savedTag, otherTag],
        content: LONG_HTML,
      });

      await openWithMissingFile(shown);

      expect(original.saved).toBe(false);
      expect(original.tags).toEqual([otherTag]);
      // BUG: pinned, see #601 — the feed's copy keeps its savedFilePath; only
      // the displayed item's path is cleared.
      expect(original.savedFilePath).toBe("Saved/note.md");
    });

    it("tolerates a feed copy that has no tags", async () => {
      const original = makeItem({ saved: true });
      original.tags = undefined;
      settings.feeds = [makeFeed({ items: [original] })];

      await openWithMissingFile(
        makeItem({ saved: true, tags: [savedTag], content: LONG_HTML }),
      );

      expect(original.saved).toBe(false);
      expect(original.tags).toBeUndefined();
    });

    it("leaves other feeds' items and other guids alone", async () => {
      const sameGuidOtherFeed = makeItem({ saved: true, tags: [savedTag] });
      const otherGuidSameFeed = makeItem({
        guid: "other",
        saved: true,
        tags: [savedTag],
      });
      settings.feeds = [
        makeFeed({ url: "https://other.example/rss", items: [sameGuidOtherFeed] }),
        makeFeed({ items: [otherGuidSameFeed] }),
      ];

      await openWithMissingFile(
        makeItem({ saved: true, tags: [savedTag], content: LONG_HTML }),
      );

      expect(sameGuidOtherFeed.saved).toBe(true);
      expect(otherGuidSameFeed.saved).toBe(true);
    });

    it("skips the feed lookup when the item has no feed url", async () => {
      const original = makeItem({ saved: true, tags: [savedTag] });
      settings.feeds = [makeFeed({ items: [original] })];
      const shown = makeItem({
        saved: true,
        feedUrl: "",
        tags: [savedTag],
        content: LONG_HTML,
      });

      await openWithMissingFile(shown);

      expect(shown.saved).toBe(false);
      expect(original.saved).toBe(true);
    });
  });

  describe("displayItem: which view the item gets", () => {
    it("plays a video that has a video id in the video player", async () => {
      const item = makeItem({ mediaType: "video", videoId: "abcdefghijk" });
      const related = [makeItem({ guid: "r1", mediaType: "video" })];

      await view.displayItem(item, related);

      expect(players.videos).toHaveLength(1);
      expect(players.videos[0]?.loadVideo).toHaveBeenCalledWith(item);
      expect(players.videos[0]?.setRelatedVideos).toHaveBeenCalledWith(related);
      expect(q(".rss-reader-video-container")).not.toBeNull();
      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("does not hand the video player an empty related list", async () => {
      await view.displayItem(
        makeItem({ mediaType: "video", videoId: "abcdefghijk" }),
      );

      expect(players.videos[0]?.setRelatedVideos).not.toHaveBeenCalled();
    });

    it("reads the video id from a YouTube link and stores it on the item", async () => {
      const item = makeItem({ mediaType: "video", link: YOUTUBE_LINK });

      await view.displayItem(item);

      expect(item.videoId).toBe("dQw4w9WgXcQ");
      expect(players.videos).toHaveLength(1);
    });

    it("prefers the video id over a video url", async () => {
      await view.displayItem(
        makeItem({
          mediaType: "video",
          videoId: "abcdefghijk",
          videoUrl: "https://example.com/v.mp4",
        }),
      );

      expect(players.videos).toHaveLength(1);
      expect(q(".rss-reader-video-podcast-container")).toBeNull();
    });

    it("ignores a video url on an item that is not a video", async () => {
      await view.displayItem(
        makeItem({
          mediaType: "article",
          videoUrl: "https://example.com/v.mp4",
          content: LONG_HTML,
        }),
      );

      expect(q(".rss-reader-video-podcast-container")).toBeNull();
      expect(q(".rss-reader-article-header")).not.toBeNull();
    });

    it("shows a video with only a video url in a plain video element", async () => {
      await view.displayItem(
        makeItem({
          mediaType: "video",
          link: "https://example.com/clip",
          videoUrl: "https://example.com/v.mp4",
          coverImage: "https://example.com/poster.jpg",
        }),
      );

      expect(players.videos).toHaveLength(0);
      const video = q(".rss-reader-video-podcast-container video");
      expect(video?.getAttribute("poster")).toBe(
        "https://example.com/poster.jpg",
      );
      expect(video?.querySelector("source")?.getAttribute("src")).toBe(
        "https://example.com/v.mp4",
      );
      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("falls back to the article view for a video with neither id nor url", async () => {
      const item = makeItem({
        mediaType: "video",
        link: "https://example.com/clip",
        content: LONG_HTML,
      });

      await view.displayItem(item);

      expect(players.videos).toHaveLength(0);
      expect(item.videoId).toBeUndefined();
      expect(q(".rss-reader-article-header")).not.toBeNull();
      expect(q(".rss-reader-video-banner")).not.toBeNull();
    });

    it("does not look for a video id when the item has no link", async () => {
      const item = makeItem({ mediaType: "video", link: "", content: LONG_HTML });

      await view.displayItem(item);

      expect(item.videoId).toBeUndefined();
      expect(players.videos).toHaveLength(0);
    });

    it("does not read a video id for an item that is not a video", async () => {
      const item = makeItem({ mediaType: "article", link: YOUTUBE_LINK });

      await view.displayItem(item);

      expect(item.videoId).toBeUndefined();
      expect(players.videos).toHaveLength(0);
    });

    it("plays a podcast that has an audio url in the podcast player", async () => {
      const item = makeItem({
        mediaType: "podcast",
        audioUrl: "https://example.com/ep.mp3",
      });

      await view.displayItem(item);

      expect(players.podcasts).toHaveLength(1);
      expect(players.podcasts[0]?.loadEpisode).toHaveBeenCalledWith(
        item,
        undefined,
      );
      expect(q(".rss-reader-podcast-container")).not.toBeNull();
      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("hands the podcast player the feed's other podcast episodes", async () => {
      const episode = makeItem({
        guid: "ep1",
        mediaType: "podcast",
        audioUrl: "https://example.com/ep.mp3",
      });
      const article = makeItem({ guid: "a1", mediaType: "article" });
      settings.feeds = [makeFeed({ items: [episode, article] })];

      await view.displayItem(episode);

      expect(players.podcasts[0]?.loadEpisode).toHaveBeenCalledWith(episode, [
        episode,
      ]);
    });

    it("finds the audio url in the description and stores it on the item", async () => {
      const item = makeItem({
        mediaType: "podcast",
        description: '<audio controls src="https://example.com/inline.mp3"></audio>',
      });

      await view.displayItem(item);

      expect(item.audioUrl).toBe("https://example.com/inline.mp3");
      expect(players.podcasts).toHaveLength(1);
      expect(players.podcasts[0]?.loadEpisode).toHaveBeenCalledWith(
        item,
        undefined,
      );
    });

    it("shows a podcast with no audio anywhere as an article", async () => {
      const item = makeItem({
        mediaType: "podcast",
        description: "<p>No audio here</p>",
        content: LONG_HTML,
      });

      await view.displayItem(item);

      expect(players.podcasts).toHaveLength(0);
      expect(item.audioUrl).toBeUndefined();
      expect(q(".rss-reader-article-header")).not.toBeNull();
      expect(fetchMock()).toHaveBeenCalledWith(item.link);
    });

    it("ignores an audio url on an item that is not a podcast", async () => {
      await view.displayItem(
        makeItem({
          mediaType: "article",
          audioUrl: "https://example.com/ep.mp3",
          content: LONG_HTML,
        }),
      );

      expect(players.podcasts).toHaveLength(0);
      expect(q(".rss-reader-article-header")).not.toBeNull();
    });

    it("replaces the previous item's players when an article opens", async () => {
      const podcast = { destroy: vi.fn() };
      const video = { destroy: vi.fn() };
      internals(view).podcastPlayer = podcast;
      internals(view).videoPlayer = video;

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(podcast.destroy).toHaveBeenCalledTimes(1);
      expect(video.destroy).toHaveBeenCalledTimes(1);
      expect(internals(view).podcastPlayer).toBeNull();
      expect(internals(view).videoPlayer).toBeNull();
    });
  });

  describe("displayItem: loading the article body", () => {
    it("fetches the full article from the item's link", async () => {
      await view.displayItem(makeItem({ content: "<p>short</p>" }));

      expect(fetchMock()).toHaveBeenCalledTimes(1);
      expect(fetchMock()).toHaveBeenCalledWith("https://example.com/article");
    });

    it.each([
      ["a starred-import preview never fetched", { starredImportContentState: "unfetched" as const }],
      ["a starred-import preview whose fetch failed", { starredImportContentState: "failed" as const }],
      ["an item that looks like a video", { mediaType: "video" as const, link: "https://example.com/clip" }],
      ["a Kagi story", { link: "https://kite.kagi.com/story" }],
      ["a Kagi news story", { link: "https://news.kagi.com/story" }],
      ["an Aeon essay", { link: "https://aeon.co/essays/x" }],
      ["an Aeon subdomain", { link: "https://www.aeon.co/essays/x" }],
      ["a Substack post", { link: "https://substack.com/p/x" }],
      ["a Substack publication", { link: "https://writer.substack.com/p/x" }],
    ])("does not fetch for %s", async (_label, overrides) => {
      await view.displayItem(makeItem({ content: "<p>short</p>", ...overrides }));

      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it.each([
      ["data-component-name", '<div data-component-name="Image2ToDOM"></div>'],
      ["link class", '<a class="image-link image2 is-viewable-img" href="#">x</a>'],
      ["CDN url", '<img src="https://substackcdn.com/image/fetch/x.png">'],
    ])("does not fetch when the feed content has Substack %s markup", async (_label, html) => {
      await view.displayItem(makeItem({ content: html }));

      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("looks at the description when the item has no content", async () => {
      await view.displayItem(
        makeItem({
          content: "",
          description: '<img src="https://substackcdn.com/image/fetch/x.png">',
        }),
      );

      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("fetches for a host that only ends like a preferred one", async () => {
      await view.displayItem(
        makeItem({ content: "<p>short</p>", link: "https://notsubstack.com/p/x" }),
      );

      expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    it("fetches when the link is not a valid url and the content has no marker", async () => {
      await view.displayItem(
        makeItem({ content: "<p>short</p>", link: "not a url" }),
      );

      expect(fetchMock()).toHaveBeenCalledWith("not a url");
    });

    it("renders fetched content that is long enough, and marks it as the full article", async () => {
      const fetched = `<h1>A Proper Headline Here</h1>${LONG_HTML}`;
      fetchMock().mockResolvedValue(fetched);
      const item = makeItem({
        content: "<p>feed teaser</p>",
        restrictedReason: "stale reason",
      });

      await view.displayItem(item);

      const state = internals(view);
      expect(state.currentFullContent).toBe(fetched);
      expect(state.currentContentIsFullArticle).toBe(true);
      expect(state.currentDisplayTitle).toBe("A Proper Headline Here");
      expect(item.restrictedReason).toBeUndefined();
      expect(q(".rss-reader-article-content")?.textContent).toContain(
        "Sentence of article body text.",
      );
      expect(q(".rss-reader-article-content")?.textContent).not.toContain(
        "feed teaser",
      );
    });

    it("keeps the feed content when the fetched text is 200 characters or fewer", async () => {
      fetchMock().mockResolvedValue(`<p>${"x".repeat(200)}</p>`);
      const item = makeItem({ content: "<p>feed content</p>" });

      await view.displayItem(item);

      expect(internals(view).currentContentIsFullArticle).toBe(false);
      expect(internals(view).currentFullContent).toBe("<p>feed content</p>");
      expect(q(".rss-reader-article-content")?.textContent).toBe("feed content");
    });

    it("accepts fetched text of 201 characters", async () => {
      fetchMock().mockResolvedValue(`<p>${"x".repeat(201)}</p>`);

      await view.displayItem(makeItem({ content: "<p>feed content</p>" }));

      expect(internals(view).currentContentIsFullArticle).toBe(true);
    });

    it("falls back to the description when there is no content and no usable fetch", async () => {
      const item = makeItem({ content: "", description: "<p>only a description</p>" });

      await view.displayItem(item);

      expect(internals(view).currentFullContent).toBe("<p>only a description</p>");
      expect(q(".rss-reader-article-content")?.textContent).toBe(
        "only a description",
      );
    });

    it("shows an empty body when there is neither content, description nor a fetch", async () => {
      await view.displayItem(makeItem({ content: "", description: "" }));

      expect(internals(view).currentFullContent).toBe("");
      expect(q(".rss-reader-article-header")).not.toBeNull();
      expect(q(".rss-reader-article-content")).toBeNull();
    });

    it("takes the display title only from fetched full-article content", async () => {
      const item = makeItem({
        content: "<h1>Heading From The Feed Itself</h1><p>short</p>",
      });

      await view.displayItem(item);

      expect(internals(view).currentDisplayTitle).toBeUndefined();
      expect(q(".rss-reader-item-title")?.textContent).toBe("Feed Item Title");
    });

    it("shows the fetched headline in the reader header too", async () => {
      fetchMock().mockResolvedValue(
        `<h1>A Proper Headline Here</h1>${LONG_HTML}`,
      );

      await view.displayItem(makeItem());

      expect(internals(view).titleElement.textContent).toBe(
        "A Proper Headline Here",
      );
    });

    it("shows the fetched headline as the article title", async () => {
      fetchMock().mockResolvedValue(
        `<h1>A Proper Headline Here</h1>${LONG_HTML}`,
      );

      await view.displayItem(makeItem());

      expect(q(".rss-reader-item-title")?.textContent).toBe(
        "A Proper Headline Here",
      );
    });

    it("marks the item restricted when the fetch was blocked and nothing usable came back", async () => {
      fetchMock().mockImplementation(() => {
        internals(view).currentFullContentFailureType = "restricted";
        return Promise.resolve("");
      });
      const item = makeItem({ content: "<p>teaser</p>" });

      await view.displayItem(item);

      expect(item.restrictedReason).toBe(RESTRICTED_ARTICLE_REASON);
      expect(q(".rss-reader-paywall-banner-text")?.textContent).toBe(
        RESTRICTED_ARTICLE_BANNER,
      );
    });

    it("does not mark the item restricted when the blocked fetch still returned a full article", async () => {
      fetchMock().mockImplementation(() => {
        internals(view).currentFullContentFailureType = "restricted";
        return Promise.resolve(LONG_HTML);
      });
      const item = makeItem({ content: "<p>teaser</p>" });

      await view.displayItem(item);

      expect(item.restrictedReason).toBeUndefined();
      expect(q(".rss-reader-paywall-banner")).toBeNull();
    });

    it("leaves an earlier restricted reason in place when the fetch merely failed", async () => {
      const item = makeItem({
        content: "<p>teaser</p>",
        restrictedReason: "earlier reason",
      });

      await view.displayItem(item);

      expect(item.restrictedReason).toBe("earlier reason");
    });

    it("does not fetch for an item with no link, and shows its content", async () => {
      await view.displayItem(
        makeItem({ link: "", content: "<p>no link content</p>" }),
      );

      expect(q(".rss-reader-article-content")?.textContent).toBe(
        "no link content",
      );
    });
  });

  describe("displayItem: the web viewer", () => {
    function enableWebViewer(openInWebViewer: ReturnType<typeof vi.fn>) {
      settings.useWebViewer = true;
      internals(view).webViewerIntegration = { openInWebViewer };
    }

    it("opens the article there with the link and the item title, and renders nothing", async () => {
      const open = vi.fn().mockResolvedValue(true);
      enableWebViewer(open);

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(open).toHaveBeenCalledWith(
        "https://example.com/article",
        "Feed Item Title",
      );
      expect(q(".rss-reader-article-header")).toBeNull();
    });

    it("passes the fetched headline as the title", async () => {
      const open = vi.fn().mockResolvedValue(true);
      enableWebViewer(open);
      fetchMock().mockResolvedValue(
        `<h1>A Proper Headline Here</h1>${LONG_HTML}`,
      );

      await view.displayItem(makeItem());

      expect(open).toHaveBeenCalledWith(
        "https://example.com/article",
        "A Proper Headline Here",
      );
    });

    it("renders in the reader when the web viewer reports failure", async () => {
      enableWebViewer(vi.fn().mockResolvedValue(false));

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(q(".rss-reader-article-header")).not.toBeNull();
    });

    it("renders in the reader when the web viewer throws", async () => {
      enableWebViewer(vi.fn().mockRejectedValue(new Error("boom")));

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(q(".rss-reader-article-header")).not.toBeNull();
    });

    it("renders in the reader when the setting is on but the integration is missing", async () => {
      settings.useWebViewer = true;
      internals(view).webViewerIntegration = null;

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(q(".rss-reader-article-header")).not.toBeNull();
    });

    it("renders in the reader when the setting is off", async () => {
      const open = vi.fn().mockResolvedValue(true);
      internals(view).webViewerIntegration = { openInWebViewer: open };
      settings.useWebViewer = false;

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(open).not.toHaveBeenCalled();
      expect(q(".rss-reader-article-header")).not.toBeNull();
    });

    it("bypasses the web viewer for a Substack link", async () => {
      const open = vi.fn().mockResolvedValue(true);
      enableWebViewer(open);

      await view.displayItem(
        makeItem({
          link: "https://writer.substack.com/p/x",
          content: "<p>substack body</p>",
        }),
      );

      expect(open).not.toHaveBeenCalled();
      expect(q(".rss-reader-article-header")).not.toBeNull();
    });

    it("bypasses the web viewer for Substack markup in the content", async () => {
      const open = vi.fn().mockResolvedValue(true);
      enableWebViewer(open);

      await view.displayItem(
        makeItem({
          content: '<img src="https://substackcdn.com/image/fetch/x.png">',
        }),
      );

      expect(open).not.toHaveBeenCalled();
    });

    it("does not bypass the web viewer when there is no content to inspect", async () => {
      const open = vi.fn().mockResolvedValue(true);
      enableWebViewer(open);

      await view.displayItem(
        makeItem({ link: "https://writer.substack.com/p/x", content: "", description: "" }),
      );

      expect(open).toHaveBeenCalledTimes(1);
    });
  });

  describe("renderArticle: header", () => {
    it("shows the item title, the feed title and the formatted date", async () => {
      await view.displayItem(
        makeItem({ content: LONG_HTML, pubDate: "2024-03-05T10:20:30.000Z" }),
      );

      expect(q(".rss-reader-article-header .rss-reader-item-title")?.tagName).toBe("H1");
      expect(q(".rss-reader-item-title")?.textContent).toBe("Feed Item Title");
      expect(q(".rss-reader-feed-title")?.textContent).toBe("Example Feed");
      expect(q(".rss-reader-pub-date")?.textContent).toBe(
        new Date("2024-03-05T10:20:30.000Z").toLocaleString(),
      );
    });

    it("puts the feed title and date together in the meta row under the title", async () => {
      await view.displayItem(makeItem({ content: LONG_HTML }));

      const meta = q(".rss-reader-article-header > .rss-reader-meta");
      expect(meta).not.toBeNull();
      expect(meta?.querySelector(".rss-reader-feed-title")).not.toBeNull();
      expect(meta?.querySelector(".rss-reader-pub-date")).not.toBeNull();
    });

    it("prefers a reader title, then a display title, then the item title", async () => {
      const state = internals(view);
      const item = makeItem({ content: LONG_HTML });
      state.currentItem = item;
      state.currentReaderTitle = "Reader title";
      state.currentDisplayTitle = "Display title";

      // displayItem resets both titles, so call the renderer's caller directly.
      const displayArticle = (
        view as unknown as {
          displayArticle(item: FeedItem, content?: string): Promise<void>;
        }
      ).displayArticle.bind(view);
      await displayArticle(item, LONG_HTML);
      expect(q(".rss-reader-item-title")?.textContent).toBe("Reader title");

      reading().empty();
      state.currentReaderTitle = undefined;
      await displayArticle(item, LONG_HTML);
      expect(q(".rss-reader-item-title")?.textContent).toBe("Display title");

      reading().empty();
      state.currentDisplayTitle = undefined;
      await displayArticle(item, LONG_HTML);
      expect(q(".rss-reader-item-title")?.textContent).toBe("Feed Item Title");
    });

    it("applies the reader font family to the title", async () => {
      await view.displayItem(makeItem({ content: LONG_HTML }));

      const expected = internals(view).resolveReaderFontFamily(
        internals(view).getReaderFormat().fontFamily,
      );
      expect(q(".rss-reader-item-title")?.style.fontFamily).toBe(expected);
    });

    it("highlights title words when highlighting in titles is on", async () => {
      settings.highlights = {
        enabled: true,
        defaultColor: "#ffd700",
        highlightInContent: false,
        highlightInTitles: true,
        highlightInSummaries: false,
        words: [{ id: "w1", text: "Title", enabled: true, createdAt: 1 }],
      };

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(q(".rss-reader-item-title mark.rss-highlight")?.textContent).toBe(
        "Title",
      );
    });

    it("does not highlight the title when only content highlighting is on", async () => {
      settings.highlights = {
        enabled: true,
        defaultColor: "#ffd700",
        highlightInContent: true,
        highlightInTitles: false,
        highlightInSummaries: false,
        words: [{ id: "w1", text: "Title", enabled: true, createdAt: 1 }],
      };

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(q(".rss-reader-item-title mark")).toBeNull();
    });

    it("does not highlight the title when highlighting is off", async () => {
      settings.highlights = {
        enabled: false,
        defaultColor: "#ffd700",
        highlightInContent: true,
        highlightInTitles: true,
        highlightInSummaries: true,
        words: [{ id: "w1", text: "Title", enabled: true, createdAt: 1 }],
      };

      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(q(".rss-reader-item-title mark")).toBeNull();
    });

    it("schedules math rendering for the title and for the body", async () => {
      await view.displayItem(makeItem({ content: LONG_HTML }));

      const targets = mathMock.schedule.mock.calls.map((call) => call[0]);
      expect(targets).toContain(q(".rss-reader-item-title"));
      expect(targets).toContain(q(".rss-reader-article-content"));
      expect(mathMock.schedule.mock.calls[0]?.[1]).toMatchObject({
        component: view,
      });
    });

    it("says Unknown date for an item with no usable date", async () => {
      await view.displayItem(makeItem({ pubDate: "", content: LONG_HTML }));
      expect(q(".rss-reader-pub-date")?.textContent).toBe("Unknown date");

      reading().empty();
      await view.displayItem(
        makeItem({ pubDate: "not a date", content: LONG_HTML }),
      );
      expect(q(".rss-reader-pub-date")?.textContent).toBe("Unknown date");
    });

    it("says Unknown date for an undated item even if it has a first-seen time while the setting is off", async () => {
      settings.useFirstSeenDateFallback = false;

      await view.displayItem(
        makeItem({ pubDate: "", firstSeenMs: 1_700_000_000_000, content: LONG_HTML }),
      );

      expect(q(".rss-reader-pub-date")?.textContent).toBe("Unknown date");
    });

    it("labels the first-seen time for an undated item when the setting is on", async () => {
      settings.useFirstSeenDateFallback = true;

      await view.displayItem(
        makeItem({ pubDate: "", firstSeenMs: 1_700_000_000_000, content: LONG_HTML }),
      );

      expect(q(".rss-reader-pub-date")?.textContent).toBe(
        `First seen: ${new Date(1_700_000_000_000).toLocaleString()}`,
      );
    });

    it("shows the publication date, unlabeled, when the item has one and the setting is on", async () => {
      settings.useFirstSeenDateFallback = true;

      await view.displayItem(
        makeItem({
          pubDate: "2024-03-05T10:20:30.000Z",
          firstSeenMs: 1_700_000_000_000,
          content: LONG_HTML,
        }),
      );

      expect(q(".rss-reader-pub-date")?.textContent).toBe(
        new Date("2024-03-05T10:20:30.000Z").toLocaleString(),
      );
    });

    it("renders each tag with its name and color", async () => {
      await view.displayItem(
        makeItem({
          content: LONG_HTML,
          tags: [
            { name: "Alpha", color: "#ff0000" },
            { name: "Beta", color: "#00ff00" },
          ],
        }),
      );

      const tags = qa(".rss-reader-tags .rss-reader-tag");
      expect(tags.map((tag) => tag.textContent)).toEqual(["Alpha", "Beta"]);
      expect(tags.map((tag) => tag.style.getPropertyValue("--tag-color"))).toEqual([
        "#ff0000",
        "#00ff00",
      ]);
    });

    it("omits the tag row when the item has no tags", async () => {
      await view.displayItem(makeItem({ content: LONG_HTML, tags: [] }));
      expect(q(".rss-reader-tags")).toBeNull();

      reading().empty();
      const untagged = makeItem({ content: LONG_HTML });
      untagged.tags = undefined;
      await view.displayItem(untagged);
      expect(q(".rss-reader-tags")).toBeNull();
    });

    it("builds the header, then the hero slot, then the body, in that order", async () => {
      await view.displayItem(makeItem({ content: LONG_HTML }));

      const order = Array.from(reading().children).map((child) => child.className);
      expect(order.slice(0, 3)).toEqual([
        "rss-reader-article-header",
        "rss-reader-hero-slot",
        "rss-reader-article-content",
      ]);
    });
  });

  describe("renderArticle: choosing the description and the body", () => {
    it("renders only the description when the item has no content", async () => {
      await view.displayItem(
        makeItem({ content: "", description: "<p>just a description</p>" }),
      );

      expect(q(".rss-reader-description-callout")).toBeNull();
      expect(q(".rss-reader-article-content")?.textContent).toBe(
        "just a description",
      );
    });

    it("renders only the content when the item has no description", async () => {
      await view.displayItem(
        makeItem({ content: "<p>just content</p>", description: "" }),
      );

      expect(q(".rss-reader-description-callout")).toBeNull();
      expect(q(".rss-reader-article-content")?.textContent).toBe("just content");
    });

    it("shows a Feed description callout above content that differs from it", async () => {
      await view.displayItem(
        makeItem({
          description: "<p>the teaser</p>",
          content: "<p>the full story</p>",
        }),
      );

      const callout = q("details.rss-reader-description-callout");
      expect(callout).not.toBeNull();
      expect((callout as HTMLDetailsElement).open).toBe(true);
      expect(callout?.querySelector("summary")?.textContent).toBe("Feed description");
      expect(
        callout?.querySelector(
          ".rss-reader-description.rss-reader-description-body",
        )?.textContent,
      ).toBe("the teaser");
      expect(q(".rss-reader-article-content")?.textContent).toBe(
        "the full story",
      );
      expect(
        Array.from(reading().children).map((child) => child.className),
      ).toEqual([
        "rss-reader-article-header",
        "rss-reader-hero-slot",
        "rss-reader-description-callout",
        "rss-reader-article-content",
      ]);
    });

    it("trims the description and the content before rendering them", async () => {
      await view.displayItem(
        makeItem({
          description: "  \n<p>the teaser</p>\n  ",
          content: "\n\n  <p>the full story</p>  \n",
        }),
      );

      expect(q(".rss-reader-description-body")?.textContent).toBe("the teaser");
      expect(q(".rss-reader-article-content")?.textContent).toBe(
        "the full story",
      );
    });

    it("skips the callout when the content is the description, ignoring markup, case, spacing and curly quotes", async () => {
      await view.displayItem(
        makeItem({
          description: "<p>It’s  A “Test”</p>",
          content: "<div>it's a   \"test\"</div>",
        }),
      );

      expect(q(".rss-reader-description-callout")).toBeNull();
      expect(q(".rss-reader-article-content")?.textContent).toBe(
        "it's a   \"test\"",
      );
    });

    it("skips the callout for a description that is only an ellipsis", async () => {
      for (const description of ["...", "…", "[...]", "[ … ]", "   ....  "]) {
        reading().empty();
        await view.displayItem(
          makeItem({ description, content: "<p>the full story</p>" }),
        );
        expect(q(".rss-reader-description-callout")).toBeNull();
      }
    });

    it("skips the callout for a description with no text", async () => {
      await view.displayItem(
        makeItem({ description: "<img src=\"https://example.com/a.png\">", content: "<p>full</p>" }),
      );

      expect(q(".rss-reader-description-callout")).toBeNull();
    });

    it("still shows a description that only starts with an ellipsis", async () => {
      await view.displayItem(
        makeItem({ description: "<p>... and more</p>", content: "<p>full</p>" }),
      );

      expect(q(".rss-reader-description-callout")).not.toBeNull();
    });

    it("renders the description as the body when the content is only whitespace", async () => {
      await view.displayItem(
        makeItem({ description: "<p>teaser</p>", content: "   \n  " }),
      );

      expect(q(".rss-reader-description-callout")).toBeNull();
      expect(q(".rss-reader-article-content")?.textContent).toBe("teaser");
    });

    it("renders the fetched content as the body and the feed description as the callout", async () => {
      fetchMock().mockResolvedValue(LONG_HTML);

      await view.displayItem(
        makeItem({ description: "<p>the teaser</p>", content: "<p>feed content</p>" }),
      );

      expect(q(".rss-reader-description-body")?.textContent).toBe("the teaser");
      expect(q(".rss-reader-article-content")?.textContent).toContain(
        "Sentence of article body text.",
      );
    });

    it("renders nothing below the header when there is no body at all", async () => {
      await view.displayItem(makeItem({ content: "", description: "" }));

      expect(q(".rss-reader-article-content")).toBeNull();
      expect(q(".rss-reader-description-callout")).toBeNull();
    });
  });

  describe("renderArticle: banners", () => {
    it("shows the restricted banner and no other banner", async () => {
      await view.displayItem(
        makeItem({
          content: LONG_HTML,
          restrictedReason: RESTRICTED_ARTICLE_REASON,
          mediaType: "video",
          starredImportContentState: "unfetched",
        }),
      );

      expect(q(".rss-reader-paywall-banner")).not.toBeNull();
      expect(q(".rss-reader-video-banner")).toBeNull();
      expect(q(".rss-reader-starred-import-banner")).toBeNull();
    });

    it("shows the video banner for a video with no way to play it, ahead of the starred banner", async () => {
      await view.displayItem(
        makeItem({
          mediaType: "video",
          link: "https://example.com/clip",
          content: LONG_HTML,
          starredImportContentState: "unfetched",
        }),
      );

      expect(q(".rss-reader-video-banner")).not.toBeNull();
      expect(q(".rss-reader-starred-import-banner")).toBeNull();
    });

    it("shows the starred-import banner for a cached preview", async () => {
      await view.displayItem(
        makeItem({ content: LONG_HTML, starredImportContentState: "failed" }),
      );

      expect(q(".rss-reader-starred-import-banner")).not.toBeNull();
    });

    it("shows no banner for an ordinary article", async () => {
      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(q(".rss-reader-inline-banner")).toBeNull();
    });

    it("places the banner after the article body", async () => {
      await view.displayItem(
        makeItem({ content: LONG_HTML, restrictedReason: RESTRICTED_ARTICLE_REASON }),
      );

      const classes = Array.from(reading().children).map((child) => child.className);
      expect(classes[classes.length - 1]).toContain("rss-reader-paywall-banner");
    });
  });

  describe("renderArticle: the hero image", () => {
    const heroImg = () => q(".rss-reader-hero-slot img");

    it("shows the cover image as the hero, with the title as its alt text", async () => {
      await view.displayItem(
        makeItem({
          content: LONG_HTML,
          coverImage: "https://img.example.com/cover.jpg",
        }),
      );

      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/cover.jpg");
      expect(heroImg()?.getAttribute("alt")).toBe("Feed Item Title");
      expect(heroImg()?.classList.contains("rss-reader-fallback-hero")).toBe(true);
    });

    it("picks the first usable of cover image, image and iTunes image, trimmed", async () => {
      await view.displayItem(
        makeItem({
          content: LONG_HTML,
          coverImage: "   ",
          image: "  https://img.example.com/image.jpg  ",
          itunes: { image: { href: "https://img.example.com/itunes.jpg" } },
        } as Partial<FeedItem>),
      );
      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/image.jpg");

      reading().empty();
      await view.displayItem(
        makeItem({
          content: LONG_HTML,
          coverImage: "",
          image: "",
          itunes: { image: { href: "https://img.example.com/itunes.jpg" } },
        } as Partial<FeedItem>),
      );
      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/itunes.jpg");
    });

    it("skips a LaTeX formula image as the hero candidate", async () => {
      await view.displayItem(
        makeItem({
          content: LONG_HTML,
          coverImage: "https://example.com/latex.php?latex=x%5E2",
          image: "https://img.example.com/image.jpg",
        }),
      );

      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/image.jpg");
    });

    it("uses the first image in the body as the hero and removes it from the body", async () => {
      await view.displayItem(
        makeItem({
          content: `<p><img src="https://img.example.com/body-1.jpg"></p><p>${LONG_TEXT}</p><img src="https://img.example.com/body-2.jpg">`,
        }),
      );

      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/body-1.jpg");
      const bodyImages = qa(".rss-reader-article-content img").map((img) =>
        img.getAttribute("src"),
      );
      expect(bodyImages).toEqual(["https://img.example.com/body-2.jpg"]);
    });

    it("does not use a formula image from the body as the hero", async () => {
      await view.displayItem(
        makeItem({
          content: `<p>${LONG_TEXT}</p><img src="https://example.com/latex.php?latex=x">`,
        }),
      );

      expect(heroImg()).toBeNull();
    });

    it("has no hero when there is no image anywhere", async () => {
      await view.displayItem(makeItem({ content: LONG_HTML }));

      expect(heroImg()).toBeNull();
    });

    it("removes the body's lead image when it is the same picture as the hero", async () => {
      await view.displayItem(
        makeItem({
          coverImage: "https://img.example.com/photos/cover-800x600.jpg",
          content: `<p><img src="https://img.example.com/photos/cover.jpg"></p><p>${LONG_TEXT}</p>`,
        }),
      );

      expect(qa(".rss-reader-hero-slot img")).toHaveLength(1);
      expect(qa(".rss-reader-article-content img")).toHaveLength(0);
    });

    it("keeps the body's lead image when it differs from the hero", async () => {
      await view.displayItem(
        makeItem({
          coverImage: "https://img.example.com/photos/cover.jpg",
          content: `<p><img src="https://img.example.com/photos/other.jpg"></p><p>${LONG_TEXT}</p>`,
        }),
      );

      expect(
        qa(".rss-reader-article-content img").map((img) => img.getAttribute("src")),
      ).toEqual(["https://img.example.com/photos/other.jpg"]);
    });

    it("does not use the feed icon as the hero, ignoring a trailing slash and spacing", async () => {
      settings.feeds = [
        makeFeed({ iconUrl: "https://img.example.com/icon.png/" }),
      ];

      await view.displayItem(
        makeItem({
          content: LONG_HTML,
          coverImage: "  https://img.example.com/icon.png  ",
        }),
      );

      expect(heroImg()).toBeNull();
    });

    it("compares against a feed icon url with stray spaces and a trailing slash", async () => {
      settings.feeds = [
        makeFeed({ iconUrl: "  https://img.example.com/icon.png/  " }),
      ];

      await view.displayItem(
        makeItem({ content: LONG_HTML, coverImage: "https://img.example.com/icon.png" }),
      );

      expect(heroImg()).toBeNull();
    });

    it("copes with a feed icon when the item has no cover image at all", async () => {
      settings.feeds = [makeFeed({ iconUrl: "https://img.example.com/icon.png" })];

      await view.displayItem(
        makeItem({
          coverImage: "",
          content: `<p><img src="https://img.example.com/body.jpg"></p><p>${LONG_TEXT}</p>`,
        }),
      );

      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/body.jpg");
    });

    it("keeps a cover image that differs from the feed icon", async () => {
      settings.feeds = [makeFeed({ iconUrl: "https://img.example.com/icon.png" })];

      await view.displayItem(
        makeItem({ content: LONG_HTML, coverImage: "https://img.example.com/cover.png" }),
      );

      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/cover.png");
    });

    it("keeps the cover image when the feed has no icon or cannot be found", async () => {
      settings.feeds = [makeFeed({ iconUrl: undefined })];
      await view.displayItem(
        makeItem({ content: LONG_HTML, coverImage: "https://img.example.com/cover.png" }),
      );
      expect(heroImg()).not.toBeNull();

      reading().empty();
      settings.feeds = [makeFeed({ url: "https://other.example/rss", iconUrl: "https://img.example.com/cover.png" })];
      await view.displayItem(
        makeItem({ content: LONG_HTML, coverImage: "https://img.example.com/cover.png" }),
      );
      expect(heroImg()).not.toBeNull();
    });

    it("keeps the cover image when the item has no feed url, even if it matches an icon", async () => {
      settings.feeds = [makeFeed({ iconUrl: "https://img.example.com/cover.png" })];

      await view.displayItem(
        makeItem({
          feedUrl: "",
          content: LONG_HTML,
          coverImage: "https://img.example.com/cover.png",
        }),
      );

      expect(heroImg()).not.toBeNull();
    });

    it("falls back to the first body image when the cover image is the feed icon", async () => {
      settings.feeds = [makeFeed({ iconUrl: "https://img.example.com/icon.png" })];

      await view.displayItem(
        makeItem({
          coverImage: "https://img.example.com/icon.png",
          content: `<p><img src="https://img.example.com/body.jpg"></p><p>${LONG_TEXT}</p>`,
        }),
      );

      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/body.jpg");
    });

    it("lets the description fill the hero first and drops the same lead image from the body", async () => {
      await view.displayItem(
        makeItem({
          description: `<p><img src="https://img.example.com/lead.jpg"></p><p>teaser words</p>`,
          content: `<p><img src="https://img.example.com/lead.jpg"></p><p>${LONG_TEXT}</p>`,
        }),
      );

      expect(qa(".rss-reader-hero-slot img")).toHaveLength(1);
      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/lead.jpg");
      expect(qa(".rss-reader-description-body img")).toHaveLength(0);
      expect(qa(".rss-reader-article-content img")).toHaveLength(0);
    });

    it("keeps a differing lead image in the body when the description filled the hero", async () => {
      await view.displayItem(
        makeItem({
          description: `<p><img src="https://img.example.com/lead.jpg"></p><p>teaser words</p>`,
          content: `<p><img src="https://img.example.com/different.jpg"></p><p>${LONG_TEXT}</p>`,
        }),
      );

      expect(heroImg()?.getAttribute("src")).toBe("https://img.example.com/lead.jpg");
      expect(
        qa(".rss-reader-article-content img").map((img) => img.getAttribute("src")),
      ).toEqual(["https://img.example.com/different.jpg"]);
    });
  });

  describe("populateArticleHtml: preparing the HTML", () => {
    function populate(
      html: string,
      baseUrl: string,
      extra: Partial<{
        fallbackHeroUrl: string;
        title: string;
        heroSlot: HTMLElement;
        stripTopHeadline: boolean;
        feedDescriptionHtml: string;
      }> = {},
    ): HTMLElement {
      const container = createDiv();
      internals(view).populateArticleHtml(
        container,
        html,
        baseUrl,
        extra.fallbackHeroUrl,
        extra.title,
        extra.heroSlot,
        extra.stripTopHeadline,
        extra.feedDescriptionHtml,
      );
      return container;
    }

    it("adds nothing for empty HTML", () => {
      const container = populate("", "https://example.com/a");

      expect(container.childNodes).toHaveLength(0);
      expect(mathMock.schedule).not.toHaveBeenCalled();
    });

    it("resolves relative link and image urls against the base url", () => {
      const container = populate(
        '<p><a href="/path/x?y=1">a</a> <a href="rel.html">b</a> <a href="https://other.example/z">c</a> <img src="//cdn.example.com/i.png"> <img src="pic.jpg"></p>',
        "https://example.com/dir/page",
      );

      expect(
        Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href")),
      ).toEqual([
        "https://example.com/path/x?y=1",
        "https://example.com/dir/rel.html",
        "https://other.example/z",
      ]);
      expect(
        Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src")),
      ).toEqual(["https://cdn.example.com/i.png", "https://example.com/dir/pic.jpg"]);
    });

    it("does not resolve urls without a base url, so the sanitizer drops the relative ones", () => {
      const container = populate(
        '<p><a href="/path">a</a><img src="pic.jpg"><a href="https://x.example/z">z</a></p>',
        "",
      );

      const [relative, absolute] = Array.from(container.querySelectorAll("a"));
      expect(relative?.hasAttribute("href")).toBe(false);
      expect(absolute?.getAttribute("href")).toBe("https://x.example/z");
      expect(container.querySelector("img")?.hasAttribute("src")).toBe(false);
    });

    it("leaves anchors without an href and images without a src untouched", () => {
      const container = populate(
        '<p><a name="top">a</a><img alt="no source"></p>',
        "https://example.com/",
      );

      expect(container.querySelector("a")?.hasAttribute("href")).toBe(false);
      expect(container.querySelector("img")?.hasAttribute("src")).toBe(false);
    });

    it("keeps a url that cannot be resolved as it was written", () => {
      const container = populate(
        '<p><a href="http://[bad">a</a></p>',
        "https://example.com/",
      );

      expect(container.querySelector("a")?.getAttribute("href")).toBe("http://[bad");
    });

    it("skips all document cleanup when the base url is not a valid url", () => {
      // The URL constructor throws outside the per-link guards, so the whole
      // parse step falls back to the raw HTML: no URL resolution (the
      // sanitizer then drops the relative link), no hero, no headline strip,
      // no tooltip cleanup.
      const slot = createDiv();
      const container = populate(
        '<h1>Headline Words Here</h1><span aria-label="Breadcrumbs">x</span><a href="/rel">a</a><img src="https://img.example.com/first.jpg">',
        "not a url",
        { heroSlot: slot, stripTopHeadline: true },
      );

      expect(container.querySelector("a")?.hasAttribute("href")).toBe(false);
      expect(container.querySelector("h1")).not.toBeNull();
      expect(container.querySelector("span")?.getAttribute("aria-label")).toBe(
        "Breadcrumbs",
      );
      expect(slot.querySelector("img")).toBeNull();
    });

    it("rewrites Substack CDN image urls to the original image", () => {
      const original = "https://substack-post-media.s3.amazonaws.com/public/images/abc.png";
      const wrapped = `https://substackcdn.com/image/fetch/w_1456,c_limit/${encodeURIComponent(original)}`;

      const container = populate(`<p><img src="${wrapped}"></p>`, "https://example.com/");

      expect(normalizeSubstackImageUrl(wrapped)).toBe(original);
      expect(container.querySelector("img")?.getAttribute("src")).toBe(original);
    });

    it("removes Substack's expand control by class, but its restack and view buttons only as buttons", () => {
      const container = populate(
        '<div><span class="image-link-expand">x</span><span class="restack-image">r</span><span class="view-image">v</span><button class="restack-image">b</button></div>',
        "https://example.com/",
      );

      // The sanitizer drops <button> on its own, so only the span cases show
      // whether the selectors match by tag.
      expect(container.querySelector(".image-link-expand")).toBeNull();
      expect(container.querySelector("span.restack-image")).not.toBeNull();
      expect(container.querySelector("span.view-image")).not.toBeNull();
      expect(container.querySelector("button")).toBeNull();
    });

    it("removes aria-label and data-tooltip attributes so Obsidian shows no stray tooltips", () => {
      const container = populate(
        '<p><span aria-label="Breadcrumbs" data-tooltip="t" data-tooltip-position="top" data-tooltip-delay="0" data-keep="1">x</span></p>',
        "https://example.com/",
      );

      const span = container.querySelector("span");
      expect(span?.hasAttribute("aria-label")).toBe(false);
      expect(span?.hasAttribute("data-tooltip")).toBe(false);
      expect(span?.hasAttribute("data-tooltip-position")).toBe(false);
      expect(span?.hasAttribute("data-tooltip-delay")).toBe(false);
      expect(span?.getAttribute("data-keep")).toBe("1");
    });

    it("hands the sanitizer rich HTML and drops scripts", () => {
      const container = populate(
        '<p>safe</p><script>window.hacked = true</script>',
        "https://example.com/",
      );

      expect(container.querySelector("script")).toBeNull();
      expect(container.textContent).toBe("safe");
    });

    it("gives every image the responsive class and a zoomable class when eligible", () => {
      const container = populate(
        '<img src="https://img.example.com/a.jpg"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">',
        "https://example.com/",
      );

      const [normal, tracker] = Array.from(container.querySelectorAll("img"));
      expect(normal?.classList.contains("rss-reader-responsive-img")).toBe(true);
      expect(normal?.classList.contains("rss-reader-zoomable-img")).toBe(true);
      expect(tracker?.classList.contains("rss-reader-responsive-img")).toBe(true);
      expect(tracker?.classList.contains("rss-reader-zoomable-img")).toBe(false);
    });

    it("schedules math rendering for the container it filled", () => {
      const container = populate("<p>x</p>", "https://example.com/");

      expect(mathMock.schedule).toHaveBeenCalledTimes(1);
      expect(mathMock.schedule.mock.calls[0]?.[0]).toBe(container);
    });

    it("highlights words in content when highlighting in content is on", () => {
      settings.highlights = {
        enabled: true,
        defaultColor: "#ffd700",
        highlightInContent: true,
        highlightInTitles: false,
        highlightInSummaries: false,
        words: [{ id: "w1", text: "needle", enabled: true, createdAt: 1 }],
      };

      const container = populate("<p>a needle here</p>", "https://example.com/");

      expect(container.querySelector("mark.rss-highlight")?.textContent).toBe("needle");
    });

    it("does not highlight content when highlighting in content is off", () => {
      settings.highlights = {
        enabled: true,
        defaultColor: "#ffd700",
        highlightInContent: false,
        highlightInTitles: true,
        highlightInSummaries: true,
        words: [{ id: "w1", text: "needle", enabled: true, createdAt: 1 }],
      };

      const container = populate("<p>a needle here</p>", "https://example.com/");

      expect(container.querySelector("mark")).toBeNull();
    });

    it("does not highlight content when highlighting is disabled", () => {
      settings.highlights = {
        enabled: false,
        defaultColor: "#ffd700",
        highlightInContent: true,
        highlightInTitles: true,
        highlightInSummaries: true,
        words: [{ id: "w1", text: "needle", enabled: true, createdAt: 1 }],
      };

      const container = populate("<p>a needle here</p>", "https://example.com/");

      expect(container.querySelector("mark")).toBeNull();
    });

    it("logs an image that fails to load and has no recovery", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const container = populate(
        '<img src="https://img.example.com/a.jpg" srcset="https://img.example.com/a2.jpg 2x">',
        "https://example.com/",
      );

      container.querySelector("img")?.dispatchEvent(new Event("error"));

      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]?.[0])).toBe(
        "[RSS Dashboard] ReaderView img load failed src=https://img.example.com/a.jpg currentSrc= srcset=https://img.example.com/a2.jpg 2x",
      );
    });

    it("swaps in the original image once when a Substack image fails to load", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const original = "https://substack-post-media.s3.amazonaws.com/public/images/abc.png";
      const wrapped = `https://substackcdn.com/image/fetch/w_1456,c_limit/${encodeURIComponent(original)}`;
      const container = populate('<picture><source srcset="x.webp"><img src="https://img.example.com/a.jpg"></picture>', "https://example.com/");
      const img = container.querySelector("img") as HTMLImageElement;
      Object.defineProperty(img, "currentSrc", { value: wrapped });

      img.dispatchEvent(new Event("error"));

      const replacement = container.querySelector("img");
      expect(replacement).not.toBe(img);
      expect(replacement?.getAttribute("src")).toBe(original);
      expect(replacement?.dataset.rssSubstackRecoverAttempted).toBe("true");
      expect(container.querySelector("source")).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toBe(
        `[RSS Dashboard] ReaderView recovered Substack img src=https://img.example.com/a.jpg currentSrc=${wrapped}`,
      );
      expect(error).not.toHaveBeenCalled();
    });

    describe("hero placement", () => {
      it("builds no hero without a hero slot, and leaves the lead image in place", () => {
        const container = populate(
          '<p><img src="https://img.example.com/first.jpg"></p>',
          "https://example.com/",
          { fallbackHeroUrl: "https://img.example.com/first.jpg" },
        );

        expect(container.querySelectorAll("img")).toHaveLength(1);
      });

      it("fills an empty slot from the fallback hero url, with the title as alt", () => {
        const slot = createDiv();

        populate("<p>text</p>", "https://example.com/", {
          fallbackHeroUrl: "https://img.example.com/hero.jpg",
          title: "Some Title",
          heroSlot: slot,
        });

        const img = slot.querySelector("img");
        expect(img?.getAttribute("src")).toBe("https://img.example.com/hero.jpg");
        expect(img?.getAttribute("alt")).toBe("Some Title");
        expect(img?.classList.contains("rss-reader-fallback-hero")).toBe(true);
        expect(img?.classList.contains("rss-reader-zoomable-img")).toBe(true);
      });

      it("uses Hero image as the alt text when there is no title", () => {
        const slot = createDiv();

        populate("<p>text</p>", "https://example.com/", {
          fallbackHeroUrl: "https://img.example.com/hero.jpg",
          heroSlot: slot,
        });

        expect(slot.querySelector("img")?.getAttribute("alt")).toBe("Hero image");
      });

      it("normalizes a Substack fallback hero url", () => {
        const slot = createDiv();
        const original = "https://substack-post-media.s3.amazonaws.com/public/images/abc.png";

        populate("<p>text</p>", "https://example.com/", {
          fallbackHeroUrl: `https://substackcdn.com/image/fetch/w_1456/${encodeURIComponent(original)}`,
          heroSlot: slot,
        });

        expect(slot.querySelector("img")?.getAttribute("src")).toBe(original);
      });

      it("takes the lead image of the HTML as the hero when there is no fallback, and removes it", () => {
        const slot = createDiv();

        const container = populate(
          '<p><img src="https://img.example.com/first.jpg"></p><p>text</p>',
          "https://example.com/",
          { heroSlot: slot },
        );

        expect(slot.querySelector("img")?.getAttribute("src")).toBe(
          "https://img.example.com/first.jpg",
        );
        expect(container.querySelector("img")).toBeNull();
      });

      it("removes the lead image only when it matches the fallback hero", () => {
        const slot = createDiv();

        const container = populate(
          '<p><img src="https://img.example.com/a/other.jpg"></p>',
          "https://example.com/",
          { fallbackHeroUrl: "https://img.example.com/a/hero.jpg", heroSlot: slot },
        );

        expect(container.querySelectorAll("img")).toHaveLength(1);
      });

      it("treats width-suffixed copies of the same file as the same image", () => {
        const slot = createDiv();

        const container = populate(
          '<p><img src="https://img.example.com/a/hero-300x200.jpg"></p>',
          "https://example.com/",
          { fallbackHeroUrl: "https://img.example.com/a/hero.jpg", heroSlot: slot },
        );

        expect(container.querySelectorAll("img")).toHaveLength(0);
      });

      it("makes no hero when the slot is empty and there is neither a fallback nor an image", () => {
        const slot = createDiv();

        populate("<p>text</p>", "https://example.com/", { heroSlot: slot });

        expect(slot.childElementCount).toBe(0);
      });

      it("leaves a filled slot alone and drops a lead image that matches it", () => {
        const slot = createDiv();
        slot.createEl("img", { attr: { src: "https://img.example.com/a/hero.jpg" } });

        const container = populate(
          '<p><img src="https://img.example.com/a/hero.jpg"></p><p>text</p>',
          "https://example.com/",
          { fallbackHeroUrl: "https://img.example.com/other.jpg", heroSlot: slot },
        );

        expect(slot.querySelectorAll("img")).toHaveLength(1);
        expect(slot.querySelector("img")?.getAttribute("src")).toBe(
          "https://img.example.com/a/hero.jpg",
        );
        expect(container.querySelector("img")).toBeNull();
      });

      it("leaves a filled slot alone and keeps a lead image that differs", () => {
        const slot = createDiv();
        slot.createEl("img", { attr: { src: "https://img.example.com/a/hero.jpg" } });

        const container = populate(
          '<p><img src="https://img.example.com/b/different.jpg"></p>',
          "https://example.com/",
          { heroSlot: slot },
        );

        expect(container.querySelectorAll("img")).toHaveLength(1);
      });

      it("leaves a filled slot alone when the HTML has no image", () => {
        const slot = createDiv();
        slot.createEl("img", { attr: { src: "https://img.example.com/a/hero.jpg" } });

        populate("<p>text</p>", "https://example.com/", { heroSlot: slot });

        expect(slot.querySelectorAll("img")).toHaveLength(1);
      });

      it("does not take a formula image as the lead image", () => {
        const slot = createDiv();

        const container = populate(
          '<p><img src="https://example.com/latex.php?latex=x"></p>',
          "https://example.com/",
          { heroSlot: slot },
        );

        expect(slot.childElementCount).toBe(0);
        expect(container.querySelectorAll("img")).toHaveLength(1);
      });
    });

    describe("full-article cleanup", () => {
      it("runs the headline, navigation and skip-link cleanup only when asked to strip", () => {
        const state = internals(view);
        state.stripNavigationChromeFromDocument = vi.fn();
        state.stripTopHeadlineFromDocument = vi.fn();
        state.stripDuplicateLeadContentFromDocument = vi.fn();
        state.stripSkipLinksFromDocument = vi.fn();

        populate("<p>text</p>", "https://example.com/", { stripTopHeadline: false });
        expect(state.stripNavigationChromeFromDocument).not.toHaveBeenCalled();
        expect(state.stripTopHeadlineFromDocument).not.toHaveBeenCalled();
        expect(state.stripDuplicateLeadContentFromDocument).not.toHaveBeenCalled();
        expect(state.stripSkipLinksFromDocument).not.toHaveBeenCalled();

        populate("<p>text</p>", "https://example.com/", {
          stripTopHeadline: true,
          feedDescriptionHtml: "<p>feed teaser</p>",
        });
        expect(state.stripNavigationChromeFromDocument).toHaveBeenCalledTimes(1);
        expect(state.stripTopHeadlineFromDocument).toHaveBeenCalledTimes(1);
        expect(state.stripDuplicateLeadContentFromDocument).toHaveBeenCalledTimes(1);
        expect(state.stripDuplicateLeadContentFromDocument.mock.calls[0]?.[1]).toBe(
          "<p>feed teaser</p>",
        );
        expect(state.stripSkipLinksFromDocument).toHaveBeenCalledTimes(1);
      });

      it("strips lead media and captions only when there is also a fallback hero", () => {
        const state = internals(view);
        state.stripLeadMediaBeforeContent = vi.fn();
        state.stripDuplicateLeadMediaMatchingHero = vi.fn();
        state.stripDuplicateLeadCaptionBlocks = vi.fn();

        populate("<p>text</p>", "https://example.com/", { stripTopHeadline: true });
        expect(state.stripLeadMediaBeforeContent).not.toHaveBeenCalled();
        expect(state.stripDuplicateLeadMediaMatchingHero).not.toHaveBeenCalled();
        expect(state.stripDuplicateLeadCaptionBlocks).not.toHaveBeenCalled();

        populate("<p>text</p>", "https://example.com/", {
          stripTopHeadline: true,
          fallbackHeroUrl: "https://img.example.com/hero.jpg",
        });
        expect(state.stripLeadMediaBeforeContent).toHaveBeenCalledTimes(1);
        expect(state.stripDuplicateLeadMediaMatchingHero.mock.calls[0]?.[1]).toBe(
          "https://img.example.com/hero.jpg",
        );
        expect(state.stripDuplicateLeadCaptionBlocks).toHaveBeenCalledTimes(1);
      });

      it("does not strip lead media without the strip flag, even with a fallback hero", () => {
        const state = internals(view);
        state.stripLeadMediaBeforeContent = vi.fn();

        populate("<p>text</p>", "https://example.com/", {
          stripTopHeadline: false,
          fallbackHeroUrl: "https://img.example.com/hero.jpg",
        });

        expect(state.stripLeadMediaBeforeContent).not.toHaveBeenCalled();
      });

      it("cleans the document before choosing the hero from it", () => {
        const slot = createDiv();

        populate(
          '<nav><img src="https://img.example.com/nav-icon.png"></nav><h1>Headline Words Here</h1><p><img src="https://img.example.com/real.jpg"></p>',
          "https://example.com/",
          { heroSlot: slot, stripTopHeadline: true },
        );

        expect(slot.querySelector("img")?.getAttribute("src")).toBe(
          "https://img.example.com/real.jpg",
        );
      });

      it("removes the top headline from full-article HTML but not otherwise", () => {
        const stripped = populate(
          "<h1>Headline Words Here</h1><p>text</p>",
          "https://example.com/",
          { stripTopHeadline: true },
        );
        const kept = populate(
          "<h1>Headline Words Here</h1><p>text</p>",
          "https://example.com/",
          { stripTopHeadline: false },
        );

        expect(stripped.querySelector("h1")).toBeNull();
        expect(kept.querySelector("h1")).not.toBeNull();
      });
    });
  });

  describe("renderArticle: stripping the headline from the body", () => {
    it("strips it from fetched full-article content", async () => {
      fetchMock().mockResolvedValue(
        `<h1>A Proper Headline Here</h1>${LONG_HTML}`,
      );

      await view.displayItem(makeItem());

      expect(q(".rss-reader-article-content h1")).toBeNull();
    });

    it("keeps it in feed content that was not fetched", async () => {
      await view.displayItem(
        makeItem({ content: "<h1>A Proper Headline Here</h1><p>short body</p>" }),
      );

      expect(q(".rss-reader-article-content h1")).not.toBeNull();
    });

    it("keeps it in the Feed description callout even when the body is a full article", async () => {
      fetchMock().mockResolvedValue(LONG_HTML);

      await view.displayItem(
        makeItem({
          description: "<h1>Teaser Headline Words</h1><p>teaser</p>",
          content: "<p>feed content</p>",
        }),
      );

      expect(q(".rss-reader-description-body h1")).not.toBeNull();
    });

    it("keeps it when the body shown is the feed description, not a fetched article", async () => {
      await view.displayItem(
        makeItem({
          content: "",
          description: "<h1>Teaser Headline Words</h1><p>teaser</p>",
        }),
      );

      expect(q(".rss-reader-article-content h1")).not.toBeNull();
    });
  });
});
