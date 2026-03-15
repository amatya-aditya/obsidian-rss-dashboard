import { describe, expect, it, beforeEach } from "vitest";
import { App } from "obsidian";
import { PodcastPlayer } from "../../src/views/podcast-player";
import { installMediaElementPolyfills, installObsidianDomPolyfills } from "./test-dom-polyfills";
import type { FeedItem, Tag } from "../../src/types/types";

describe("PodcastPlayer sorting", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installMediaElementPolyfills();
    document.body.empty();
  });

  it("does not recreate the audio element when sorting the playlist", () => {
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
      tags: [] as Tag[],
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

    const audioBefore = (player as unknown as { audioElement: HTMLAudioElement }).audioElement;
    const audioDomBefore = container.querySelector("audio");
    expect(audioBefore).toBeTruthy();
    expect(audioDomBefore).toBe(audioBefore);

    (player as unknown as { sortPlaylist: (o: "recent" | "oldest") => void }).sortPlaylist("oldest");

    const audioAfter = (player as unknown as { audioElement: HTMLAudioElement }).audioElement;
    const audioDomAfter = container.querySelector("audio");
    expect(audioAfter).toBe(audioBefore);
    expect(audioDomAfter).toBe(audioBefore);
  });
});

