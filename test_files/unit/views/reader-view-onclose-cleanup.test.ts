import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: any;
  view: any;
  constructor(app: any) {
    this.app = app;
  }
  detach = vi.fn();
}

describe("ReaderView onClose cleanup", () => {
  let readerView: any;
  let mockApp: any;
  let mockLeaf: any;

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
      mockLeaf as any,
      { ...DEFAULT_SETTINGS, useWebViewer: false },
      ({ saveArticle: vi.fn() } as any),
      vi.fn(),
      vi.fn(),
    );

    (readerView as any).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("destroys players and closes reader format portal", async () => {
    // Open the portal via UI click
    const btn = (readerView as any).contentEl.querySelector(
      ".rss-reader-format-button",
    ) as HTMLElement | null;
    expect(btn).toBeTruthy();
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.body.querySelector(".rss-reader-format-dropdown-portal")).toBeTruthy();

    const podcastPlayer = { destroy: vi.fn() };
    const videoPlayer = { destroy: vi.fn() };
    (readerView as any).podcastPlayer = podcastPlayer;
    (readerView as any).videoPlayer = videoPlayer;

    await readerView.onClose();

    expect(podcastPlayer.destroy).toHaveBeenCalled();
    expect(videoPlayer.destroy).toHaveBeenCalled();
    expect(document.body.querySelector(".rss-reader-format-dropdown-portal")).toBeNull();
  });
});
