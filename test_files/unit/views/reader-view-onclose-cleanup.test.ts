import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
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
  currentItem: { guid: string } | null;
  podcastPlayer: { destroy: ReturnType<typeof vi.fn> } | null;
  videoPlayer: { destroy: ReturnType<typeof vi.fn> } | null;
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

describe("ReaderView onClose cleanup", () => {
  let readerView: ReaderView;
  let mockApp: {
    workspace: {
      getLeavesOfType: ReturnType<typeof vi.fn>;
      setActiveLeaf: ReturnType<typeof vi.fn>;
      revealLeaf: ReturnType<typeof vi.fn>;
    };
    vault: {
      getAbstractFileByPath: ReturnType<typeof vi.fn>;
    };
  };
  let mockLeaf: MockLeaf;

  beforeEach(async () => {
    mockApp = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn(),
      },
    };
    mockLeaf = new MockLeaf(mockApp);

    readerView = new ReaderView(
      mockLeaf as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false },
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("destroys players and closes reader format portal", async () => {
    // Open the portal via UI click
    const btn = getInternals(readerView).contentEl.querySelector<HTMLElement>(
      ".rss-reader-format-button",
    );
    expect(btn).toBeTruthy();
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(
      document.body.querySelector(".rss-reader-format-dropdown-portal"),
    ).toBeTruthy();

    const podcastPlayer = { destroy: vi.fn() };
    const videoPlayer = { destroy: vi.fn() };
    getInternals(readerView).podcastPlayer = podcastPlayer;
    getInternals(readerView).videoPlayer = videoPlayer;

    await readerView.onClose();

    expect(podcastPlayer.destroy).toHaveBeenCalled();
    expect(videoPlayer.destroy).toHaveBeenCalled();
    expect(
      document.body.querySelector(".rss-reader-format-dropdown-portal"),
    ).toBeNull();
  });

  it("flushes inline video progress on close", async () => {
    const onPlaybackProgress = vi.fn();
    const inlineReaderView = new ReaderView(
      mockLeaf as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false },
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
      { onPlaybackProgress },
    );

    getInternals(inlineReaderView).contentEl = document.createElement("div");
    await inlineReaderView.onOpen();

    const readingContainer = getInternals(inlineReaderView).readingContainer;
    const video = document.createElement("video");
    video.className = "rss-reader-video";
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 180,
    });
    video.currentTime = 36;
    readingContainer.appendChild(video);

    getInternals(inlineReaderView).currentItem = {
      guid: "inline-video-guid",
    } as never;

    await inlineReaderView.onClose();

    expect(onPlaybackProgress).toHaveBeenCalledWith(
      expect.objectContaining({ guid: "inline-video-guid" }),
      36,
      180,
      true,
    );
  });
});
