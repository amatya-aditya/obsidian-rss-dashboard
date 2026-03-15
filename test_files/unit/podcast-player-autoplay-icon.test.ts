import { describe, expect, it, beforeEach } from "vitest";
import { App } from "obsidian";
import { PodcastPlayer } from "../../src/views/podcast-player";
import { installMediaElementPolyfills, installObsidianDomPolyfills } from "./test-dom-polyfills";
import type { FeedItem } from "../../src/types/types";

describe("PodcastPlayer autoplay", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installMediaElementPolyfills();
    document.body.empty();
  });

  it("updates play button icon to pause when autoplay advances", async () => {
    const container = document.body.createDiv();
    const app = new App();
    const player = new PodcastPlayer(container, app, "obsidian");

    const ep1: FeedItem = {
      title: "Ep 1",
      link: "https://example.com/1",
      description: "<p>one</p>",
      pubDate: new Date().toISOString(),
      guid: "guid-1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
      mediaType: "podcast" as const,
      audioUrl: "https://example.com/1.mp3",
    };

    const ep2: FeedItem = {
      ...ep1,
      title: "Ep 2",
      guid: "guid-2",
      audioUrl: "https://example.com/2.mp3",
    };

    player.loadEpisode(ep1, [ep1, ep2]);

    const playBtn = container.querySelector<HTMLElement>(".rss-play-pause");
    expect(playBtn?.dataset.icon).toBe("play");

    (player as unknown as { handleEpisodeEnd: () => void }).handleEpisodeEnd();
    await Promise.resolve();

    const playBtnAfter = container.querySelector<HTMLElement>(".rss-play-pause");
    expect(playBtnAfter?.dataset.icon).toBe("pause");
  });
});
