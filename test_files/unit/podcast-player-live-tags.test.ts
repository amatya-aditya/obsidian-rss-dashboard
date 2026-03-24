import { describe, expect, it, beforeEach } from "vitest";
import { App } from "obsidian";
import { PodcastPlayer } from "../../src/views/podcast-player";
import { installMediaElementPolyfills, installObsidianDomPolyfills } from "./test-dom-polyfills";
import type { FeedItem, Tag } from "../../src/types/types";

describe("PodcastPlayer live tag updates", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installMediaElementPolyfills();
    document.body.empty();
  });

  it("refreshTags + refreshPlaylistTags update player strip and playlist row", () => {
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
      tags: [{ name: "initial", color: "#00ff00" }],
      audioUrl: "https://example.com/2.mp3",
    };

    player.loadEpisode(ep1, [ep1, ep2]);

    expect(container.querySelector(".podcast-tag-strip")).toBeNull();
    const row = container.querySelector<HTMLElement>(
      `.playlist-episode-row[data-episode-guid="${ep1.guid}"]`,
    );
    expect(row).not.toBeNull();

    // Add tag assignment
    ep1.tags.push({ name: "NewTag", color: "#ff0000" });
    player.refreshTags();
    player.refreshPlaylistTags(ep1.guid);

    const playerTag = container.querySelector(".podcast-tag-strip .podcast-tag");
    expect(playerTag?.textContent).toBe("NewTag");

    const rowTag = container.querySelector(
      `.playlist-episode-row[data-episode-guid="${ep1.guid}"] .playlist-ep-tag`,
    );
    expect(rowTag?.textContent).toBe("NewTag");

    // Remove tag assignment
    ep1.tags = [];
    player.refreshTags();
    player.refreshPlaylistTags(ep1.guid);

    expect(container.querySelector(".podcast-tag-strip")).toBeNull();
    const rowTagsAfter = container.querySelector(
      `.playlist-episode-row[data-episode-guid="${ep1.guid}"] .playlist-ep-meta-tags`,
    );
    expect(rowTagsAfter).toBeNull();
  });
});
