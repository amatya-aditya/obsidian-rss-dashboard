import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { Component } from "obsidian";

installObsidianDomPolyfills();

type PlayerSlots = {
  videoPlayer: { destroy: ReturnType<typeof vi.fn> } | null;
};

// The dashboard calls cancelPendingDisplay() when it leaves the inline Reader
// (Back to dashboard, a sidebar click) and when the view closes. A player left
// alive there keeps its timers and message listener and never saves the
// position it last heard (#1236).
describe("ArticleRenderer players when the inline Reader is left", () => {
  let renderer: ArticleRenderer;
  let slots: PlayerSlots;

  beforeEach(() => {
    document.body.empty();
    renderer = new ArticleRenderer({
      app: {
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        vault: { getAbstractFileByPath: vi.fn() },
      } as never,
      component: new Component(),
      settings: {
        ...DEFAULT_SETTINGS,
        corsProxyEnabled: false,
      } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });
    slots = renderer as unknown as PlayerSlots;
  });

  afterEach(() => {
    document.body.empty();
  });

  it("destroys the video player so it saves its last position", () => {
    const video = { destroy: vi.fn() };
    slots.videoPlayer = video;

    renderer.cancelPendingDisplay();

    expect(video.destroy).toHaveBeenCalledTimes(1);
    expect(slots.videoPlayer).toBeNull();
  });

  it("does nothing when no video player is open", () => {
    expect(() => renderer.cancelPendingDisplay()).not.toThrow();
    expect(slots.videoPlayer).toBeNull();
  });
});
