import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "../../../src/views/video-player";
import { MediaService, type YouTubeEmbedConfig } from "../../../src/services/media-service";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { FeedItem, Tag } from "../../../src/types/types";

describe("VideoPlayer", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.restoreAllMocks();
  });

  function baseItem(overrides: Partial<FeedItem> = {}): FeedItem {
    return {
      title: "Video Title",
      link: "https://example.com/v",
      description: "",
      pubDate: "2026-03-01T12:34:56.000Z",
      guid: "guid-1",
      read: false,
      starred: false,
      tags: [] as Tag[],
      feedTitle: "Channel Name",
      feedUrl: "https://example.com/feed.xml",
      coverImage: "",
      mediaType: "video" as const,
      videoId: "abc123",
      ...overrides,
    };
  }

  function fixedEmbed(): YouTubeEmbedConfig {
    return {
      videoId: "abc123",
      embedUrl: "https://example.com/embed/abc123",
      watchUrl: "https://example.com/watch?v=abc123",
      referrerPolicy: "strict-origin-when-cross-origin",
      allow: "accelerometer; encrypted-media",
    };
  }

  it("emits a Notice and does not render when videoId is missing", () => {
    const container = document.body.createDiv({ text: "keep" });
    const player = new VideoPlayer(container);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    player.loadVideo(baseItem({ videoId: undefined }));

    expect(logSpy).toHaveBeenCalledWith("[Stub Notice]", "No video ID provided");
    expect(container.querySelector(".rss-video-player")).toBeNull();
    expect(container.textContent).toContain("keep");
  });

  it("renders iframe attributes using MediaService.buildYouTubeEmbed", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    const embed = fixedEmbed();
    vi.spyOn(MediaService, "buildYouTubeEmbed").mockReturnValue(embed);

    player.loadVideo(baseItem());

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe(embed.embedUrl);
    expect(iframe?.getAttribute("allow")).toBe(embed.allow);
    expect(iframe?.getAttribute("referrerpolicy")).toBe(embed.referrerPolicy);
    expect(iframe?.allowFullscreen).toBe(true);
  });

  it("renders title, channel, and date metadata", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem({ description: "" }));

    const titleName = container.querySelector(".rss-video-title .setting-item-name");
    expect(titleName?.textContent).toBe("Video Title");

    const channel = container.querySelector(".rss-video-channel");
    expect(channel?.textContent).toBe("Channel Name");

    const date = container.querySelector(".rss-video-date");
    expect(date?.textContent).toBe(new Date("2026-03-01T12:34:56.000Z").toLocaleDateString());
  });

  it("sanitizes description by removing scripts and constraining anchor attributes (current behavior)", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    player.loadVideo(
      baseItem({
        description:
          '<p>Hello</p><script>alert(1)</script><a href="https://example.com">Link</a>',
      }),
    );

    const description = container.querySelector(".rss-video-description");
    expect(description).not.toBeNull();
    expect(description?.textContent).not.toContain("<script");
    expect(description?.textContent).toContain('target="_blank"');
    expect(description?.textContent).toContain('rel="noopener noreferrer"');
  });

  it("renders the YouTube watch button using embed.watchUrl and sets icon dataset", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    const embed = fixedEmbed();
    vi.spyOn(MediaService, "buildYouTubeEmbed").mockReturnValue(embed);

    player.loadVideo(baseItem());

    const button = container.querySelector<HTMLAnchorElement>(".rss-video-youtube-button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("href")).toBe(embed.watchUrl);
    expect(button?.target).toBe("_blank");
    expect(button?.rel).toBe("noopener noreferrer");

    const icon = container.querySelector<HTMLElement>(".rss-video-youtube-button-icon");
    expect(icon?.dataset.icon).toBe("youtube");
  });

  it("renders related videos empty state initially (findRelatedVideos returns [])", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem());

    expect(container.querySelector(".rss-video-related-empty")?.textContent).toContain(
      "No related videos found",
    );
  });

  it("setRelatedVideos filters, excludes current, and caps at 5", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem());

    const base = baseItem();
    const candidates: FeedItem[] = [
      base, // excluded (same guid)
      baseItem({ guid: "no-video-id", videoId: undefined }), // excluded (no videoId)
      baseItem({ guid: "wrong-feed", feedUrl: "https://elsewhere/feed.xml", videoId: "x1" }), // excluded
      ...Array.from({ length: 7 }, (_, idx) =>
        baseItem({
          guid: `rel-${idx}`,
          title: `Rel ${idx}`,
          pubDate: `2026-03-${String(idx + 2).padStart(2, "0")}T00:00:00.000Z`,
          videoId: `vid-${idx}`,
          feedUrl: base.feedUrl,
        }),
      ),
    ];

    player.setRelatedVideos(candidates);

    const items = container.querySelectorAll(".rss-video-related-item");
    expect(items.length).toBe(5);

    const firstImg = items[0]?.querySelector<HTMLImageElement>("img");
    expect(firstImg?.getAttribute("src")).toBe(
      "https://img.youtube.com/vi/vid-0/mqdefault.jpg",
    );
    expect(items[0]?.querySelector(".rss-video-related-title")?.textContent).toBe(
      "Rel 0",
    );
  });

  it("clicking a related item calls onVideoSelect when provided", () => {
    const container = document.body.createDiv();
    const onVideoSelect = vi.fn();
    const player = new VideoPlayer(container, onVideoSelect);

    player.loadVideo(baseItem());

    const related = baseItem({
      guid: "rel-1",
      title: "Related",
      videoId: "relvid",
      feedUrl: baseItem().feedUrl,
    });

    player.setRelatedVideos([related]);

    const row = container.querySelector<HTMLElement>(".rss-video-related-item");
    expect(row).not.toBeNull();
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onVideoSelect).toHaveBeenCalledTimes(1);
    expect(onVideoSelect).toHaveBeenCalledWith(related);
  });

  it("clicking a related item falls back to loadVideo when onVideoSelect is not provided", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem());

    const related = baseItem({
      guid: "rel-2",
      title: "Related 2",
      videoId: "relvid2",
      feedUrl: baseItem().feedUrl,
    });

    player.setRelatedVideos([related]);

    const loadSpy = vi.spyOn(player, "loadVideo").mockImplementation(() => {});

    const row = container.querySelector<HTMLElement>(".rss-video-related-item");
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(loadSpy).toHaveBeenCalledWith(related);
  });

  it("destroy clears the iframe and removes it from DOM without throwing", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    const embed = fixedEmbed();
    vi.spyOn(MediaService, "buildYouTubeEmbed").mockReturnValue(embed);

    player.loadVideo(baseItem());

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    expect(iframe).not.toBeNull();

    expect(() => player.destroy()).not.toThrow();
    expect(container.querySelector("iframe")).toBeNull();
    expect(iframe?.isConnected).toBe(false);
  });

  it("emits a Notice when render throws (loadVideo catch path)", () => {
    const container = document.body.createDiv();
    const player = new VideoPlayer(container);

    vi.spyOn(MediaService, "buildYouTubeEmbed").mockImplementation(() => {
      throw new Error("boom");
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    player.loadVideo(baseItem());

    expect(logSpy).toHaveBeenCalledWith("[Stub Notice]", "Error loading video: boom");
  });
});

