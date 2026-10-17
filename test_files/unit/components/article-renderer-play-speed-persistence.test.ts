// The dashboard's inline reader persists a speed chosen in its podcast player
// through the renderer's settings-persistence callback (#1269).
import { describe, expect, it, vi } from "vitest";
import { Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import { DEFAULT_SETTINGS, FeedItem } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const players = vi.hoisted(() => ({
  podcasts: [] as Array<{ args: unknown[] }>,
}));

vi.mock("../../../src/views/podcast-player", () => ({
  PodcastPlayer: class {
    loadEpisode = vi.fn();
    destroy = vi.fn();
    updateTheme = vi.fn();
    constructor(...args: unknown[]) {
      players.podcasts.push({ args });
    }
  },
}));

installObsidianDomPolyfills();

function makePodcastEpisode(): FeedItem {
  return {
    title: "Episode",
    link: "https://example.com/episode",
    description: "",
    pubDate: "2026-03-01T12:34:56.000Z",
    guid: "ep-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "podcast",
    audioUrl: "https://example.com/ep-1.mp3",
  };
}

describe("ArticleRenderer podcast play speed persistence", () => {
  it("persists the speed chosen in the inline player", async () => {
    players.podcasts.length = 0;
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.feeds = [];
    const onPersistSettings = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);

    const renderer = new ArticleRenderer({
      app: {} as never,
      component: new Component(),
      settings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
      onPersistSettings,
    });

    const container = createDiv();
    await renderer.render(container, makePodcastEpisode());

    const player = players.podcasts[players.podcasts.length - 1];
    expect(player).toBeDefined();
    const onPlaySpeedChange = player.args[9] as (speed: number) => void;
    expect(typeof onPlaySpeedChange).toBe("function");

    onPlaySpeedChange(2);

    expect(settings.media.defaultPlaySpeed).toBe(2);
    expect(onPersistSettings).toHaveBeenCalledTimes(1);
  });
});
