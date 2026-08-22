import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedItem } from "../../../src/types/types";
import { PodcastPlaylist } from "../../../src/components/podcast-playlist";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function episode(index: number): FeedItem {
  return {
    title: `Episode ${index}`,
    link: `https://example.com/${index}`,
    description: "",
    pubDate: `2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    guid: `episode-${index}`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    mediaType: "podcast",
  };
}

describe("PodcastPlaylist", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("renders an active-centered five-episode window and an accessible range", () => {
    const container = document.body.createDiv();
    new PodcastPlaylist(container, {
      episodes: Array.from({ length: 9 }, (_, index) => episode(index + 1)),
      activeEpisodeGuid: "episode-5",
      theme: "obsidian",
      isAutoplayEnabled: false,
      sortOrder: "recent",
      onEpisodeSelected: vi.fn(),
      onAutoplayChanged: vi.fn(),
      onSortRequested: vi.fn(),
    }).render();

    expect(container.querySelectorAll(".playlist-episode-row")).toHaveLength(5);
    expect(
      Array.from(container.querySelectorAll(".playlist-episode-row")).map((row) =>
        row.getAttribute("data-episode-guid"),
      ),
    ).toEqual(["episode-3", "episode-4", "episode-5", "episode-6", "episode-7"]);
    expect(container.querySelector(".playlist-window-range")?.textContent).toBe(
      "Episodes 3–7 of 9",
    );
  });

  it("edge-fills, pages without selecting an episode, and recenters on request", () => {
    const container = document.body.createDiv();
    const onEpisodeSelected = vi.fn();
    const playlist = new PodcastPlaylist(container, {
      episodes: Array.from({ length: 9 }, (_, index) => episode(index + 1)),
      activeEpisodeGuid: "episode-1",
      theme: "obsidian",
      isAutoplayEnabled: false,
      sortOrder: "recent",
      onEpisodeSelected,
      onAutoplayChanged: vi.fn(),
      onSortRequested: vi.fn(),
    });
    playlist.render();

    expect(container.querySelector(".playlist-window-range")?.textContent).toBe(
      "Episodes 1–5 of 9",
    );
    (container.querySelector(".playlist-next-window") as HTMLButtonElement).click();
    expect(container.querySelector(".playlist-window-range")?.textContent).toBe(
      "Episodes 6–9 of 9",
    );
    expect(onEpisodeSelected).not.toHaveBeenCalled();

    (container.querySelector(".playlist-return-to-current") as HTMLButtonElement).click();
    expect(container.querySelector(".playlist-window-range")?.textContent).toBe(
      "Episodes 1–5 of 9",
    );
  });
});
