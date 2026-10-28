// Regression: an image that fails and is recovered by the Substack image
// recovery path must keep its lightbox wiring. The recovery replaces the
// <img> with a clone, and a clone loses event listeners, so the reader
// re-decorates the replacement.
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

const BAD_CANDIDATE = "https://noahpinion.substack.com/w_424";
const S3_IMAGE =
  "https://substack-post-media.s3.amazonaws.com/public/images/aaa_761x852.jpeg";
const CDN_IMAGE = `https://substackcdn.com/image/fetch/$s_!VrzG!,f_auto,q_auto:good,fl_progressive:steep/${encodeURIComponent(S3_IMAGE)}`;

// Mirrors a stored Noahpinion item: the <source> srcset is corrupted with the
// bogus host fragments (both 404), which makes the chosen source fail and the
// recovery path clone the <img>.
const CORRUPTED_PICTURE = `<div class="captioned-image-container"><figure><a class="image-link image2 is-viewable-img" target="_blank" href="${CDN_IMAGE}" data-component-name="Image2ToDOM"><div class="image2-inset"><picture><source type="image/webp" srcset="${BAD_CANDIDATE}, https://noahpinion.substack.com/fl_progressive:steep/${encodeURIComponent(S3_IMAGE)} 424w"><img src="${S3_IMAGE}" width="526" height="588" alt=""></picture></div></a></figure></div>`;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "The anti-American Right",
    link: "https://www.noahpinion.blog/p/the-anti-american-right",
    description: "",
    content: `${CORRUPTED_PICTURE}<p>${"Body text. ".repeat(40)}</p>${CORRUPTED_PICTURE}`,
    pubDate: "2024-03-05T10:20:30.000Z",
    guid: "guid-recovery",
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

describe("ReaderView recovered image keeps its lightbox", () => {
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

  it("re-wires the replacement image after a failed Substack image", async () => {
    const internals = view as unknown as Internals;
    await internals.displayItem(makeItem());

    const reading = internals.readingContainer;
    const images = Array.from(
      reading.querySelectorAll<HTMLImageElement>("img"),
    );
    expect(images.length).toBeGreaterThanOrEqual(2);

    // The body image (index 1) chose a 404 source in the real app.
    const failing = images[1];
    Object.defineProperty(failing, "currentSrc", {
      value: BAD_CANDIDATE,
      configurable: true,
    });
    failing.dispatchEvent(new Event("error"));

    const replacement = Array.from(
      reading.querySelectorAll<HTMLImageElement>("img"),
    )[1];
    expect(replacement).not.toBe(failing);
    expect(replacement.dataset.rssSubstackRecoverAttempted).toBe("true");

    // Re-decorated for a fresh pass, without a nested tooltip host.
    expect(replacement.classList.contains("rss-reader-responsive-img")).toBe(
      true,
    );
    expect(replacement.classList.contains("rss-reader-zoomable-img")).toBe(
      true,
    );
    expect(
      replacement.closest(".rss-reader-image-tooltip-host"),
    ).not.toBeNull();
    expect(
      reading.querySelectorAll(".rss-reader-image-tooltip-host").length,
    ).toBe(2);

    // Clicking the recovered image must open the lightbox, not follow the
    // enclosing image link.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    replacement.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(
      document.querySelector(".rss-reader-lightbox-backdrop"),
    ).not.toBeNull();

    // It is keyboard-operable again as well.
    document.querySelector(".rss-reader-lightbox-backdrop")?.remove();
    const key = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    replacement.dispatchEvent(key);
    expect(
      document.querySelector(".rss-reader-lightbox-backdrop"),
    ).not.toBeNull();
  });
});
