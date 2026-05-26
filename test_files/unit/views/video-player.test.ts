import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "../../../src/views/video-player";
import {
  MediaService,
  type YouTubeEmbedConfig,
} from "../../../src/services/media-service";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { FeedItem, Tag } from "../../../src/types/types";

type ObsidianBody = HTMLElement & {
  empty: () => void;
  createDiv: (options?: { text?: string }) => HTMLDivElement;
};

function getObsidianBody(): ObsidianBody {
  return document.body as ObsidianBody;
}

function createContainer(options?: { text?: string }): HTMLDivElement {
  return getObsidianBody().createDiv(options);
}

describe("VideoPlayer", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    getObsidianBody().empty();
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
    const container = createContainer({ text: "keep" });
    const player = new VideoPlayer(container);

    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    player.loadVideo(baseItem({ videoId: undefined }));

    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "No video ID provided",
    );
    expect(container.querySelector(".rss-video-player")).toBeNull();
    expect(container.textContent).toContain("keep");
  });

  it("renders iframe attributes using MediaService.buildYouTubeEmbed", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    const embed = fixedEmbed();
    vi.spyOn(MediaService, "buildYouTubeEmbed").mockReturnValue(embed);

    player.loadVideo(baseItem());

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    expect(iframe).not.toBeNull();
    // src has &id=<iframeId> appended for postMessage routing, so check prefix
    expect(iframe?.getAttribute("src")).toContain(embed.embedUrl);
    expect(iframe?.getAttribute("allow")).toBe(embed.allow);
    expect(iframe?.getAttribute("referrerpolicy")).toBe(embed.referrerPolicy);
    expect(iframe?.allowFullscreen).toBe(true);
  });

  it("renders title, channel, and date metadata", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem({ description: "" }));

    const titleName = container.querySelector<HTMLElement>(
      ".rss-video-title .setting-item-name",
    );
    expect(titleName?.textContent).toBe("Video Title");

    const channel = container.querySelector<HTMLElement>(".rss-video-channel");
    expect(channel?.textContent).toBe("Channel Name");

    const date = container.querySelector<HTMLElement>(".rss-video-date");
    expect(date?.textContent).toBe(
      new Date("2026-03-01T12:34:56.000Z").toLocaleDateString(),
    );
  });

  it("sanitizes description by removing scripts and constraining anchor attributes (current behavior)", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    player.loadVideo(
      baseItem({
        description:
          '<p>Hello</p><script>alert(1)</script><a href="https://example.com">Link</a>',
      }),
    );

    const description = container.querySelector<HTMLElement>(
      ".rss-video-description",
    );
    expect(description).not.toBeNull();
    expect(description?.innerHTML).not.toContain("<script");
    expect(description?.innerHTML).toContain('target="_blank"');
    expect(description?.innerHTML).toContain('rel="noopener noreferrer"');
  });

  it("renders the YouTube watch button using embed.watchUrl and sets icon dataset", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    const embed = fixedEmbed();
    vi.spyOn(MediaService, "buildYouTubeEmbed").mockReturnValue(embed);

    player.loadVideo(baseItem());

    const button = container.querySelector<HTMLAnchorElement>(
      ".rss-video-youtube-button",
    );
    expect(button).not.toBeNull();
    expect(button?.getAttribute("href")).toBe(embed.watchUrl);
    expect(button?.target).toBe("_blank");
    expect(button?.rel).toBe("noopener noreferrer");

    const icon = container.querySelector<HTMLElement>(
      ".rss-video-youtube-button-icon",
    );
    expect(icon?.getAttribute("data-icon")).toBe("youtube");
  });

  it("renders related videos empty state initially (findRelatedVideos returns [])", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem());

    expect(
      container.querySelector(".rss-video-related-empty")?.textContent,
    ).toContain("No related videos found");
  });

  it("setRelatedVideos filters, excludes current, and caps at 5", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem());

    const base = baseItem();
    const candidates: FeedItem[] = [
      base, // excluded (same guid)
      baseItem({ guid: "no-video-id", videoId: undefined }), // excluded (no videoId)
      baseItem({
        guid: "wrong-feed",
        feedUrl: "https://elsewhere/feed.xml",
        videoId: "x1",
      }), // excluded
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
    expect(
      items[0]?.querySelector(".rss-video-related-title")?.textContent,
    ).toBe("Rel 0");
  });

  it("clicking a related item calls onVideoSelect when provided", () => {
    const container = createContainer();
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
    const container = createContainer();
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

  it("starts polling progress once the YouTube player is ready", () => {
    vi.useFakeTimers();

    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const item = baseItem();

    const player = new VideoPlayer(container, undefined, onPlaybackProgress);

    vi.spyOn(MediaService, "buildYouTubeEmbed").mockReturnValue(fixedEmbed());

    player.loadVideo(item);

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    const iframeId = iframe?.id;

    // Send onReady event
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube-nocookie.com",
        data: JSON.stringify({
          event: "onReady",
          id: iframeId,
        }),
      })
    );

    // Send infoDelivery event to set duration
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube-nocookie.com",
        data: JSON.stringify({
          event: "infoDelivery",
          info: { duration: 120 },
          id: iframeId,
        }),
      })
    );

    // Send stateChange playing (1) event
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube-nocookie.com",
        data: JSON.stringify({
          event: "onStateChange",
          info: 1,
          id: iframeId,
        }),
      })
    );

    // Now timers advance by 5 seconds
    vi.advanceTimersByTime(5000);
    expect(onPlaybackProgress).toHaveBeenNthCalledWith(1, item, 5, 120, false);

    vi.advanceTimersByTime(5000);
    expect(onPlaybackProgress).toHaveBeenNthCalledWith(2, item, 10, 120, false);

    player.destroy();
    vi.useRealTimers();
  });

  it("does not restore or track progress when playback progress is disabled", () => {
    vi.useFakeTimers();

    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const item = baseItem({
      playbackProgress: {
        position: 33,
        duration: 120,
        lastUpdated: Date.now(),
      },
    });

    const player = new VideoPlayer(
      container,
      undefined,
      onPlaybackProgress,
      false,
    );

    vi.spyOn(MediaService, "buildYouTubeEmbed").mockReturnValue(fixedEmbed());

    player.loadVideo(item);

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    const iframeId = iframe?.id;

    // Send onReady event
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube-nocookie.com",
        data: JSON.stringify({
          event: "onReady",
          id: iframeId,
        }),
      })
    );

    // Send infoDelivery event to set duration
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube-nocookie.com",
        data: JSON.stringify({
          event: "infoDelivery",
          info: { duration: 120 },
          id: iframeId,
        }),
      })
    );

    // Send stateChange playing (1) event
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube-nocookie.com",
        data: JSON.stringify({
          event: "onStateChange",
          info: 1,
          id: iframeId,
        }),
      })
    );

    vi.advanceTimersByTime(10000);

    expect(onPlaybackProgress).not.toHaveBeenCalled();

    player.destroy();
    vi.useRealTimers();
  });

  it("destroy clears the iframe and removes it from DOM without throwing", () => {
    const container = createContainer();
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

  it("flushes playback progress before destroy tears down the player", () => {
    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    const item = baseItem();

    vi.spyOn(MediaService, "buildYouTubeEmbed").mockReturnValue(fixedEmbed());

    player.loadVideo(item);

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    const iframeId = iframe?.id;

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://www.youtube-nocookie.com",
        data: JSON.stringify({
          event: "infoDelivery",
          info: { duration: 120, currentTime: 42 },
          id: iframeId,
        }),
      })
    );

    player.destroy();

    expect(onPlaybackProgress).toHaveBeenCalledWith(item, 42, 120, true);
  });

  it("emits a Notice when render throws (loadVideo catch path)", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    vi.spyOn(MediaService, "buildYouTubeEmbed").mockImplementation(() => {
      throw new Error("boom");
    });

    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    player.loadVideo(baseItem());

    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Error loading video: boom",
    );
  });
});
