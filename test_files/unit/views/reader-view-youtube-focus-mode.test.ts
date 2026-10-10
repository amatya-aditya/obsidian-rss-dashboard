import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type ReaderViewInternals = {
  contentEl: HTMLElement;
  readingContainer: HTMLElement;
  fetchFullArticleContent: ReturnType<typeof vi.fn>;
};

function internals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Video Title",
    link: "https://www.youtube.com/watch?v=abc123",
    description: "<p>Promo</p>",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-video",
    read: false,
    starred: false,
    tags: [{ name: "Video", color: "#e11d48" }],
    feedTitle: "Channel",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "video",
    videoId: "abc123",
    saved: false,
    ...overrides,
  };
}

function makeArticle(): FeedItem {
  return makeItem({
    guid: "guid-article",
    mediaType: "article",
    videoId: undefined,
    link: "https://example.com/article",
    description: "Description",
    content: "Content",
  });
}

describe("ReaderView YouTube focus mode", () => {
  let view: ReaderView;
  let settings: RssDashboardSettings;

  async function open(focus: boolean): Promise<void> {
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
      media: { ...DEFAULT_SETTINGS.media, youtubeFocusMode: focus },
    };
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
    internals(view).contentEl = createDiv();
    await view.onOpen();
    internals(view).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");
  }

  const header = (): HTMLElement => {
    const el =
      internals(view).contentEl.querySelector<HTMLElement>(
        ".rss-reader-header",
      );
    if (!el) throw new Error("No reader header");
    return el;
  };
  const chips = (): string[] =>
    Array.from(
      internals(view).readingContainer.querySelectorAll(
        ".rss-video-details .rss-reader-tag",
      ),
    ).map((chip) => chip.textContent ?? "");

  beforeEach(() => {
    document.body.empty();
  });

  it("shows the tag chips and the full header for a video when focus mode is off", async () => {
    await open(false);
    await view.displayItem(makeItem());

    expect(chips()).toEqual(["Video"]);
    expect(header().classList.contains("rss-youtube-focus")).toBe(false);
  });

  it("hides the chips and marks the header as focused when focus mode is on, keeping the back button", async () => {
    await open(true);
    await view.displayItem(makeItem());

    expect(chips()).toEqual([]);
    expect(header().classList.contains("rss-youtube-focus")).toBe(true);
    expect(
      header().querySelector("button.rss-reader-back-button"),
    ).not.toBeNull();
  });

  it("applies and removes focus mode live on an open video", async () => {
    await open(false);
    await view.displayItem(makeItem());

    settings.media.youtubeFocusMode = true;
    view.setYouTubeFocusMode(true);
    expect(chips()).toEqual([]);
    expect(header().classList.contains("rss-youtube-focus")).toBe(true);

    settings.media.youtubeFocusMode = false;
    view.setYouTubeFocusMode(false);
    expect(chips()).toEqual(["Video"]);
    expect(header().classList.contains("rss-youtube-focus")).toBe(false);
  });

  it("clears the focused header when an article opens next", async () => {
    await open(true);
    await view.displayItem(makeItem());
    expect(header().classList.contains("rss-youtube-focus")).toBe(true);

    await view.displayItem(makeArticle());

    expect(header().classList.contains("rss-youtube-focus")).toBe(false);
  });

  it("does not focus the header for an article while focus mode is on", async () => {
    await open(true);
    await view.displayItem(makeArticle());

    expect(header().classList.contains("rss-youtube-focus")).toBe(false);
  });

  it("re-renders the chips when the tags change, unless focus mode is on", async () => {
    await open(false);
    await view.displayItem(makeItem());

    view.applyExternalUpdate("guid-video", {
      tags: [{ name: "Later", color: "#22c55e" }],
    });
    expect(chips()).toEqual(["Later"]);

    settings.media.youtubeFocusMode = true;
    view.setYouTubeFocusMode(true);
    view.applyExternalUpdate("guid-video", {
      tags: [{ name: "Hidden", color: "#22c55e" }],
    });
    expect(chips()).toEqual([]);

    settings.media.youtubeFocusMode = false;
    view.setYouTubeFocusMode(false);
    expect(chips()).toEqual(["Hidden"]);
  });
});
