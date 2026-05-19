import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { PodcastPlayer } from "../../../src/views/podcast-player";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "../test-dom-polyfills";
import type { FeedItem, Tag } from "../../../src/types/types";

describe("PodcastPlayer", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installMediaElementPolyfills();
    document.body.empty();
  });

  function baseEpisode(): FeedItem {
    return {
      title: "Ep 1",
      link: "https://example.com/ep1",
      description: "<p>desc</p>",
      pubDate: "2026-03-01T12:34:56.000Z",
      guid: "guid-ep1",
      read: false,
      starred: false,
      tags: [] as Tag[],
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed.xml",
      coverImage: "",
      mediaType: "podcast" as const,
      audioUrl: "https://example.com/ep1.mp3",
    };
  }

  describe("sorting", () => {
    it("does not recreate the audio element when sorting the playlist", () => {
      const container: HTMLDivElement = document.createElement("div");
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep1 = baseEpisode();
      const ep2 = {
        ...ep1,
        title: "Ep 2",
        guid: "guid-2",
        audioUrl: "https://example.com/2.mp3",
      };

      player.loadEpisode(ep1, [ep1, ep2]);

      const audioBefore = (
        player as unknown as { audioElement: HTMLAudioElement }
      ).audioElement;
      const audioDomBefore = container.querySelector("audio");
      expect(audioBefore).toBeTruthy();
      expect(audioDomBefore).toBe(audioBefore);

      (
        player as unknown as { sortPlaylist: (o: "recent" | "oldest") => void }
      ).sortPlaylist("oldest");

      const audioAfter = (
        player as unknown as { audioElement: HTMLAudioElement }
      ).audioElement;
      const audioDomAfter = container.querySelector("audio");
      expect(audioAfter).toBe(audioBefore);
      expect(audioDomAfter).toBe(audioBefore);
    });
  });

  describe("live tag updates", () => {
    it("refreshTags + refreshPlaylistTags update player strip and playlist row", () => {
      const container: HTMLDivElement = document.createElement("div");
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep1 = baseEpisode();
      const ep2 = {
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

      const playerTag = container.querySelector(
        ".podcast-tag-strip .podcast-tag",
      );
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

  describe("episode details section", () => {
    it("renders the collapsible details section when notes exist", () => {
      const container: HTMLDivElement = document.createElement("div");
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep = baseEpisode();
      ep.content = "<p>hello</p>";
      player.loadEpisode(ep);

      const details = container.querySelector(".podcast-episode-details");
      expect(details).not.toBeNull();
      expect(details?.querySelector("summary")?.textContent).toContain(
        "Episode details",
      );
    });

    it("prefers content over description when meaningfully different", () => {
      const container: HTMLDivElement = document.createElement("div");
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep = baseEpisode();
      ep.description = "<p>DESC_UNIQUE</p>";
      ep.content = "<p>CONTENT_UNIQUE</p><p>" + "x".repeat(80) + "</p>"; // ensure length > 40
      player.loadEpisode(ep);

      const notesBody = container.querySelector<HTMLElement>(
        ".podcast-episode-notes-body",
      );
      expect(notesBody).not.toBeNull();
      expect(notesBody?.textContent).toContain("CONTENT_UNIQUE");
      expect(notesBody?.textContent).not.toContain("DESC_UNIQUE");
    });

    it("sanitizes show notes (removes scripts/events, blocks javascript: links)", () => {
      const container: HTMLDivElement = document.createElement("div");
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep = baseEpisode();
      ep.content = `
        <p>
          Hi
          <a href="https://example.com/a" onclick="evil()">safe link</a>
          <a href="javascript:alert(1)">bad link</a>
          <img src="https://example.com/x.png" />
          <script>alert("x")</script>
        </p>
      `;
      player.loadEpisode(ep);

      const notesBody = container.querySelector<HTMLElement>(
        ".podcast-episode-notes-body",
      );
      expect(notesBody).not.toBeNull();
      expect(notesBody?.querySelector("script")).toBeNull();
      expect(notesBody?.querySelector("img")).toBeNull();

      const links = notesBody?.querySelectorAll<HTMLAnchorElement>("a") || [];
      expect(links.length).toBeGreaterThanOrEqual(1);

      const safe = links[0];
      expect(safe.getAttribute("href")).toBe("https://example.com/a");
      expect(safe.getAttribute("target")).toBe("_blank");
      expect(safe.getAttribute("rel")).toBe("noopener noreferrer");
      expect(safe.getAttribute("onclick")).toBeNull();

      const bad = Array.from(links).find((l) =>
        (l.textContent || "").includes("bad link"),
      );
      expect(bad).toBeTruthy();
      expect(bad?.getAttribute("href")).toBeNull();
    });

    it("renders metadata rows only when fields exist", () => {
      const container: HTMLDivElement = document.createElement("div");
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep = baseEpisode();
      ep.content = "<p>notes</p>";
      ep.duration = "1:23";
      ep.explicit = true;
      ep.season = 2;
      ep.episode = 7;
      ep.episodeType = "full";
      ep.category = "Tech";
      ep.enclosure = {
        url: "https://example.com/ep1.mp3",
        type: "audio/mpeg",
        length: "1048576",
      };
      player.loadEpisode(ep);

      const grid = container.querySelector(".podcast-episode-meta-grid");
      expect(grid).not.toBeNull();
      const text = grid?.textContent || "";
      expect(text).toContain("Published");
      expect(text).toContain("Duration");
      expect(text).toContain("1:23");
      expect(text).toContain("Explicit");
      expect(text).toContain("Yes");
      expect(text).toContain("Season");
      expect(text).toContain("2");
      expect(text).toContain("Episode");
      expect(text).toContain("7");
      expect(text).toContain("Type");
      expect(text).toContain("full");
      expect(text).toContain("Category");
      expect(text).toContain("Tech");
      expect(text).toContain("Link");
      expect(text).toContain("Size");

      const link = container.querySelector<HTMLAnchorElement>(
        ".podcast-episode-meta-value a",
      );
      expect(link?.getAttribute("href")).toBe("https://example.com/ep1");
    });
  });

  describe("autoplay", () => {
    it("updates play button icon to pause when autoplay advances", async () => {
      const container: HTMLDivElement = document.createElement("div");
      document.body.appendChild(container);
      const app = new App();
      const player = new PodcastPlayer(container, app, "obsidian");

      const ep1 = baseEpisode();
      const ep2 = {
        ...ep1,
        title: "Ep 2",
        guid: "guid-2",
        audioUrl: "https://example.com/2.mp3",
      };

      player.loadEpisode(ep1, [ep1, ep2]);

      const playBtn = container.querySelector<HTMLElement>(".rss-play-pause");
      expect(playBtn?.dataset.icon).toBe("play");

      (
        player as unknown as { handleEpisodeEnd: () => void }
      ).handleEpisodeEnd();
      await Promise.resolve();

      const playBtnAfter =
        container.querySelector<HTMLElement>(".rss-play-pause");
      expect(playBtnAfter?.dataset.icon).toBe("pause");
    });
  });

  describe("playback progress persistence", () => {
    it("starts tracking on play and flushes on pause", () => {
      vi.useFakeTimers();

      const container: HTMLDivElement = document.createElement("div");
      document.body.appendChild(container);
      const app = new App();
      const onPlaybackProgress = vi.fn();
      const player = new PodcastPlayer(
        container,
        app,
        "obsidian",
        undefined,
        undefined,
        onPlaybackProgress,
      );

      const ep = baseEpisode();
      player.loadEpisode(ep);

      const audio = container.querySelector<HTMLAudioElement>("audio");
      expect(audio).not.toBeNull();

      Object.defineProperty(audio, "duration", {
        configurable: true,
        value: 120,
      });
      if (audio) {
        audio.currentTime = 12;
        audio.dispatchEvent(new Event("play"));
      }

      vi.advanceTimersByTime(1000);

      expect(onPlaybackProgress).toHaveBeenCalledWith(ep, 12, 120, false);

      if (audio) {
        audio.dispatchEvent(new Event("pause"));
      }

      expect(onPlaybackProgress).toHaveBeenCalledWith(ep, 12, 120, true);

      player.destroy();
      vi.useRealTimers();
    });
  });
});
