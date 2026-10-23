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
    videoId: "abcdefghijk",
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

describe("ReaderView Video focus mode", () => {
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
    internals(view).contentEl = document.body.createDiv();
    await view.onOpen();
    internals(view).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue({ content: "<p>Content</p>", failureType: "none" });
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

  it("shows the tag chips, source footer, and the full header for a video when focus mode is off", async () => {
    await open(false);
    await view.displayItem(makeItem());

    expect(chips()).toEqual(["Video"]);
    expect(header().classList.contains("rss-video-focus")).toBe(false);
    expect(
      internals(view).readingContainer.querySelector(
        ".rss-reader-source-footer",
      ),
    ).not.toBeNull();
  });

  it("hides the chips and source footer and marks the header as focused when focus mode is on, keeping the back button", async () => {
    await open(true);
    await view.displayItem(makeItem());

    expect(chips()).toEqual([]);
    expect(
      internals(view).readingContainer.querySelector(".rss-video-details"),
    ).toBeNull();
    expect(
      internals(view).readingContainer.querySelector(
        ".rss-reader-source-footer",
      ),
    ).toBeNull();
    expect(header().classList.contains("rss-video-focus")).toBe(true);
    expect(
      header().querySelector("button.rss-reader-back-button"),
    ).not.toBeNull();
  });

  it("applies and removes focus mode live on an open video", async () => {
    await open(false);
    await view.displayItem(makeItem());

    settings.media.youtubeFocusMode = true;
    view.setVideoFocusMode(true);
    expect(chips()).toEqual([]);
    expect(
      internals(view).readingContainer.querySelector(
        ".rss-reader-source-footer",
      ),
    ).toBeNull();
    expect(header().classList.contains("rss-video-focus")).toBe(true);

    settings.media.youtubeFocusMode = false;
    view.setVideoFocusMode(false);
    expect(chips()).toEqual(["Video"]);
    expect(
      internals(view).readingContainer.querySelectorAll(
        ".rss-reader-source-footer",
      ),
    ).toHaveLength(1);
    expect(header().classList.contains("rss-video-focus")).toBe(false);
  });

  it("moves focus to the back button when the source link was focused and focus mode turns on", async () => {
    await open(false);
    await view.displayItem(makeItem());

    const sourceLink = internals(
      view,
    ).readingContainer.querySelector<HTMLAnchorElement>(
      ".rss-reader-source-footer a",
    );
    expect(sourceLink).not.toBeNull();
    sourceLink?.focus();

    const backButton = header().querySelector<HTMLButtonElement>(
      "button.rss-reader-back-button",
    );
    expect(backButton).not.toBeNull();

    view.setVideoFocusMode(true);
    expect(
      internals(view).readingContainer.querySelector(
        ".rss-reader-source-footer",
      ),
    ).toBeNull();
    expect(document.activeElement).toBe(backButton);

    // Turning focus mode off never moves focus
    const other = document.body.createEl("button");
    other.focus();
    view.setVideoFocusMode(false);
    expect(document.activeElement).toBe(other);
  });

  it("clears the focused header when an article opens next", async () => {
    await open(true);
    await view.displayItem(makeItem());
    expect(header().classList.contains("rss-video-focus")).toBe(true);

    await view.displayItem(makeArticle());

    expect(header().classList.contains("rss-video-focus")).toBe(false);
    expect(
      internals(view).readingContainer.querySelector(
        ".rss-reader-source-footer",
      ),
    ).not.toBeNull();
  });

  it("does not focus the header for an article while focus mode is on", async () => {
    await open(true);
    await view.displayItem(makeArticle());

    expect(header().classList.contains("rss-video-focus")).toBe(false);
  });

  it("keeps article fallback and receives no focus chrome for video without playable source", async () => {
    await open(true);
    const unplayableVideo = makeItem({
      guid: "unplayable-video",
      mediaType: "video",
      videoId: undefined,
      link: "https://example.com/not-a-video",
    });
    await view.displayItem(unplayableVideo);

    expect(header().classList.contains("rss-video-focus")).toBe(false);
    expect(
      internals(view).readingContainer.querySelector(
        ".rss-reader-source-footer",
      ),
    ).not.toBeNull();
  });

  it("re-renders the chips when the tags change, unless focus mode is on", async () => {
    await open(false);
    await view.displayItem(makeItem());

    view.applyExternalUpdate("guid-video", {
      tags: [{ name: "Later", color: "#22c55e" }],
    });
    expect(chips()).toEqual(["Later"]);

    settings.media.youtubeFocusMode = true;
    view.setVideoFocusMode(true);
    view.applyExternalUpdate("guid-video", {
      tags: [{ name: "Hidden", color: "#22c55e" }],
    });
    expect(chips()).toEqual([]);

    settings.media.youtubeFocusMode = false;
    view.setVideoFocusMode(false);
    expect(chips()).toEqual(["Hidden"]);
  });

  describe("actionToggleVideoFocusMode", () => {
    function createViewWithApp(app: unknown): ReaderView {
      return new ReaderView(
        new MockLeaf(app) as never,
        { ...DEFAULT_SETTINGS, useWebViewer: false },
        {
          saveArticle: vi.fn(),
          checkSavedFileExists: vi.fn().mockReturnValue(true),
        } as never,
        vi.fn(),
        vi.fn(),
      );
    }

    it("delegates to the plugin toggle", () => {
      const toggleVideoFocusMode = vi.fn();
      const app = {
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        vault: { getAbstractFileByPath: vi.fn() },
        plugins: {
          getPlugin: vi.fn(() => ({
            saveSettings: vi.fn(),
            toggleVideoFocusMode,
          })),
        },
      };
      const reader = createViewWithApp(app);

      reader.actionToggleVideoFocusMode();

      expect(toggleVideoFocusMode).toHaveBeenCalledTimes(1);
    });

    it("does nothing when the plugin cannot be reached", () => {
      const app = {
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        vault: { getAbstractFileByPath: vi.fn() },
      };
      const reader = createViewWithApp(app);

      expect(() => reader.actionToggleVideoFocusMode()).not.toThrow();
    });
  });
});
