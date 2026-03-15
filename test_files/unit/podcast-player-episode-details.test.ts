import { beforeEach, describe, expect, it } from "vitest";
import { App } from "obsidian";
import { PodcastPlayer } from "../../src/views/podcast-player";
import {
  installMediaElementPolyfills,
  installObsidianDomPolyfills,
} from "./test-dom-polyfills";
import type { FeedItem, Tag } from "../../src/types/types";

describe("PodcastPlayer episode details section", () => {
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

  it("renders the collapsible details section when notes exist", () => {
    const container = document.body.createDiv();
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
    const container = document.body.createDiv();
    const app = new App();
    const player = new PodcastPlayer(container, app, "obsidian");

    const ep = baseEpisode();
    ep.description = "<p>DESC_UNIQUE</p>";
    ep.content =
      "<p>CONTENT_UNIQUE</p><p>" + "x".repeat(80) + "</p>"; // ensure length > 40
    player.loadEpisode(ep);

    const notesBody = container.querySelector<HTMLElement>(
      ".podcast-episode-notes-body",
    );
    expect(notesBody).not.toBeNull();
    expect(notesBody?.textContent).toContain("CONTENT_UNIQUE");
    expect(notesBody?.textContent).not.toContain("DESC_UNIQUE");
  });

  it("sanitizes show notes (removes scripts/events, blocks javascript: links)", () => {
    const container = document.body.createDiv();
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
    const container = document.body.createDiv();
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

