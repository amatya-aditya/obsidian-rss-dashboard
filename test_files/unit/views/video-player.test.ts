import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "../../../src/views/video-player";
import { youTubeWatchUrl } from "../../../src/utils/youtube-embed";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { FeedItem, Tag } from "../../../src/types/types";

const VIDEO_ID = "abcdefghijk";

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
      videoId: VIDEO_ID,
      ...overrides,
    };
  }

  it("emits a Notice and does not render when videoId is missing", () => {
    const container = createContainer({ text: "keep" });
    const player = new VideoPlayer(container);

    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    player.loadVideo(baseItem({ videoId: undefined }));

    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "No video id provided",
    );
    expect(container.querySelector(".rss-video-player")).toBeNull();
    expect(container.textContent).toContain("keep");
  });

  it("plays through Obsidian's embed host so desktop and iOS can load it", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem());

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe(
      `https://releases.obsidian.md/youtube?v=${VIDEO_ID}&enablejsapi=1&autoplay=1`,
    );
    expect(iframe?.getAttribute("allow")).toContain("autoplay");
    expect(iframe?.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(iframe?.allowFullscreen).toBe(true);
  });

  it("resumes from the saved position through the host's start parameter", () => {
    const container = createContainer();
    const player = new VideoPlayer(container, undefined, undefined, true);

    player.loadVideo(
      baseItem({
        playbackProgress: { position: 42.7, duration: 300, lastUpdated: 0 },
      }),
    );

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    expect(iframe?.getAttribute("src")).toBe(
      `https://releases.obsidian.md/youtube?v=${VIDEO_ID}&enablejsapi=1&autoplay=1&start=42`,
    );
  });

  it("does not request a resume position when progress tracking is off", () => {
    const container = createContainer();
    const player = new VideoPlayer(container, undefined, undefined, false);

    player.loadVideo(
      baseItem({
        playbackProgress: { position: 42, duration: 300, lastUpdated: 0 },
      }),
    );

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    expect(iframe?.getAttribute("src")).not.toContain("start=");
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

  it("shows 'Unknown date', not 'Invalid Date', for an undated video when the first-seen fallback is off", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    player.loadVideo(
      baseItem({ description: "", pubDate: "", firstSeenMs: Date.now() }),
    );

    const date = container.querySelector<HTMLElement>(".rss-video-date");
    expect(date?.textContent).toBe("Unknown date");
  });

  it("shows the first-seen date for an undated video when the fallback is on", () => {
    const container = createContainer();
    const player = new VideoPlayer(container, undefined, undefined, true, true);
    const firstSeenMs = Date.parse("2026-01-01T00:00:00Z");

    player.loadVideo(baseItem({ description: "", pubDate: "", firstSeenMs }));

    const date = container.querySelector<HTMLElement>(".rss-video-date");
    expect(date?.textContent).toBe(new Date(firstSeenMs).toLocaleDateString());
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

  it("shows a Watch on YouTube link beside the player", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    player.loadVideo(baseItem());

    const link = container.querySelector<HTMLAnchorElement>(".rss-video-watch");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(youTubeWatchUrl(VIDEO_ID));
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toContain("noopener");
    expect(link?.textContent).toContain("Watch on YouTube");
    // Only a Twitch link swaps the play glyph to Twitch purple.
    expect(link?.classList.contains("rss-video-watch--twitch")).toBe(false);

    expect(container.querySelector(".rss-video-links")).toBeNull();
    expect(container.querySelector(".rss-video-youtube-button")).toBeNull();
    expect(container.querySelector(".rss-video-tos-link")).toBeNull();
    expect(container.textContent).not.toContain("YouTube terms of service");
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

  // The player posts from the window inside the iframe; jsdom loads no
  // nested frame, so the iframe's own window stands in for the player.
  function postFromPlayer(
    iframe: HTMLIFrameElement | null,
    message: Record<string, unknown>,
    origin = "https://www.youtube-nocookie.com",
  ): void {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source: iframe?.contentWindow ?? null,
        data: JSON.stringify({ channel: "widget", ...message }),
      }),
    );
  }

  it("saves the exact position the player reports while it plays", () => {
    vi.useFakeTimers();

    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const item = baseItem();
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(item);
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { duration: 120, currentTime: 3, playerState: 1 },
    });
    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { currentTime: 7.5 },
    });
    vi.advanceTimersByTime(5000);
    expect(onPlaybackProgress).toHaveBeenNthCalledWith(
      1,
      item,
      7.5,
      120,
      false,
    );

    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { currentTime: 12.25 },
    });
    vi.advanceTimersByTime(5000);
    expect(onPlaybackProgress).toHaveBeenNthCalledWith(
      2,
      item,
      12.25,
      120,
      false,
    );

    player.destroy();
    vi.useRealTimers();
  });

  it("saves the paused position once and does not advance it while paused", () => {
    vi.useFakeTimers();

    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const item = baseItem();
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(item);
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { duration: 120, currentTime: 40, playerState: 1 },
    });
    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { currentTime: 41.5, playerState: 2 },
    });
    expect(onPlaybackProgress).toHaveBeenCalledTimes(1);
    expect(onPlaybackProgress).toHaveBeenCalledWith(item, 41.5, 120, true);

    vi.advanceTimersByTime(60000);
    expect(onPlaybackProgress).toHaveBeenCalledTimes(1);

    player.destroy();
    vi.useRealTimers();
  });

  it("saves a seek made inside the player", () => {
    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const item = baseItem();
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(item);
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { duration: 120, currentTime: 100 },
    });
    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { currentTime: 30 },
    });
    player.destroy();

    expect(onPlaybackProgress).toHaveBeenCalledWith(item, 30, 120, true);
  });

  it("saves nothing until the player reports a position", () => {
    vi.useFakeTimers();

    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const item = baseItem({
      playbackProgress: { position: 33, duration: 120, lastUpdated: 0 },
    });
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(item);
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    postFromPlayer(iframe, { event: "onStateChange", info: 1 });
    vi.advanceTimersByTime(30000);
    player.destroy();

    expect(onPlaybackProgress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("ignores messages from other frames and non-YouTube origins", () => {
    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(baseItem());
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    const other = container.createEl("iframe");

    postFromPlayer(
      iframe,
      { event: "infoDelivery", info: { duration: 120, currentTime: 50 } },
      "https://example.com",
    );
    postFromPlayer(other, {
      event: "infoDelivery",
      info: { duration: 120, currentTime: 60 },
    });
    player.destroy();

    expect(onPlaybackProgress).not.toHaveBeenCalled();
  });

  it("saves the previous video's position when another video loads", () => {
    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const first = baseItem();
    const second = baseItem({ guid: "guid-2", videoId: "bcdefghijkl" });
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(first);
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { duration: 120, currentTime: 64 },
    });
    player.loadVideo(second);

    expect(onPlaybackProgress).toHaveBeenCalledWith(first, 64, 120, true);
    player.destroy();
  });

  it("does not save another video picked inside the player onto this item", () => {
    vi.useFakeTimers();

    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const item = baseItem();
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(item);
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: {
        videoData: { video_id: VIDEO_ID },
        duration: 120,
        currentTime: 90,
        playerState: 1,
      },
    });
    // The viewer clicks an end-screen suggestion; its first report names it.
    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: {
        videoData: { video_id: "jNQXAC9IVRw" },
        duration: 19,
        currentTime: 0,
        playerState: 2,
      },
    });
    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { currentTime: 4, playerState: 1 },
    });
    vi.advanceTimersByTime(20000);
    player.destroy();

    expect(onPlaybackProgress).toHaveBeenCalledTimes(1);
    expect(onPlaybackProgress).toHaveBeenCalledWith(item, 90, 120, true);
    vi.useRealTimers();
  });

  it("saves a repeated paused state only once", () => {
    const container = createContainer();
    const onPlaybackProgress = vi.fn();
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(baseItem());
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    for (let i = 0; i < 3; i += 1) {
      postFromPlayer(iframe, {
        event: "infoDelivery",
        info: { duration: 120, currentTime: 20, playerState: 2 },
      });
    }

    expect(onPlaybackProgress).toHaveBeenCalledTimes(1);
    player.destroy();
  });

  it("still loads the next video when saving the previous one fails", () => {
    const container = createContainer();
    const onPlaybackProgress = vi.fn(() => {
      throw new Error("feed removed");
    });
    const player = new VideoPlayer(container, undefined, onPlaybackProgress);
    player.loadVideo(baseItem());
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { duration: 120, currentTime: 20 },
    });

    player.loadVideo(baseItem({ guid: "guid-2", videoId: "bcdefghijkl" }));

    const next = container.querySelector<HTMLIFrameElement>("iframe");
    expect(next?.getAttribute("src")).toContain("v=bcdefghijkl");
    player.destroy();
  });

  it("does not track progress when playback progress is disabled", () => {
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
    player.loadVideo(item);
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { duration: 120, currentTime: 50, playerState: 1 },
    });
    vi.advanceTimersByTime(10000);
    player.destroy();

    expect(onPlaybackProgress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("destroy clears the iframe and removes it from DOM without throwing", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

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

    player.loadVideo(item);
    const iframe = container.querySelector<HTMLIFrameElement>("iframe");

    postFromPlayer(iframe, {
      event: "infoDelivery",
      info: { duration: 120, currentTime: 42 },
    });

    player.destroy();

    expect(onPlaybackProgress).toHaveBeenCalledWith(item, 42, 120, true);
  });

  it("emits a Notice when the video id is invalid (loadVideo catch path)", () => {
    const container = createContainer();
    const player = new VideoPlayer(container);

    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    player.loadVideo(baseItem({ videoId: "short" }));

    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      expect.stringContaining("Error loading video:"),
    );
  });

  describe("focus mode", () => {
    const withDescription = (): FeedItem =>
      baseItem({
        description: '<p>Promo <a href="https://x.test">link</a></p>',
      });

    it("shows the description and related list by default", () => {
      const container = createContainer();
      new VideoPlayer(container).loadVideo(withDescription());

      expect(container.querySelector(".rss-video-description")).not.toBeNull();
      expect(container.querySelector(".rss-video-related")).not.toBeNull();
    });

    it("shows only the video: no watch link, title, channel, date, tags, description or related list", () => {
      const container = createContainer();
      const item = withDescription();
      new VideoPlayer(
        container,
        undefined,
        undefined,
        true,
        false,
        true,
      ).loadVideo(item);

      expect(container.querySelector(".rss-video-watch")).toBeNull();
      expect(container.querySelector(".rss-video-description")).toBeNull();
      expect(container.querySelector(".rss-video-related")).toBeNull();
      expect(container.textContent).not.toContain("Promo");
      expect(container.textContent).not.toContain("From the same channel");
      expect(container.querySelector(".rss-video-details")).toBeNull();
      expect(container.querySelector(".rss-video-title")).toBeNull();
      expect(container.querySelector(".rss-video-channel")).toBeNull();
      expect(container.querySelector(".rss-video-date")).toBeNull();
      expect(container.textContent).not.toContain("Video Title");
      expect(container.textContent).not.toContain("Channel Name");
      expect(container.querySelector("iframe")).not.toBeNull();
      expect(item.description).toContain("Promo");
    });

    it("toggles all blocks live without recreating the iframe", () => {
      const container = createContainer();
      const player = new VideoPlayer(container);
      player.loadVideo(withDescription());
      const iframe = container.querySelector("iframe");

      player.setFocusMode(true);
      expect(container.querySelector(".rss-video-watch")).toBeNull();
      expect(container.querySelector(".rss-video-details")).toBeNull();
      expect(container.querySelector(".rss-video-description")).toBeNull();
      expect(container.querySelector(".rss-video-related")).toBeNull();
      expect(container.querySelector("iframe")).toBe(iframe);

      player.setFocusMode(true);
      player.setFocusMode(false);
      expect(container.querySelectorAll(".rss-video-watch")).toHaveLength(1);
      expect(container.querySelector(".rss-video-title")).not.toBeNull();
      expect(container.querySelector(".rss-video-channel")?.textContent).toBe(
        "Channel Name",
      );
      expect(container.querySelector(".rss-video-date")).not.toBeNull();
      expect(container.querySelectorAll(".rss-video-description")).toHaveLength(
        1,
      );
      const order = Array.from(
        container.querySelector(".rss-video-player")?.children ?? [],
      ).map((child) => child.className.split(" ")[0]);
      expect(order.indexOf("rss-video-container")).toBeLessThan(
        order.indexOf("rss-video-watch"),
      );
      expect(order.indexOf("rss-video-watch")).toBeLessThan(
        order.indexOf("rss-video-details"),
      );
      expect(order.indexOf("rss-video-details")).toBeLessThan(
        order.indexOf("rss-video-related"),
      );
      expect(container.querySelectorAll(".rss-video-related")).toHaveLength(1);
      expect(container.querySelector("iframe")).toBe(iframe);
    });

    it("hides and restores the watch link for a Twitch VOD on the same iframe", () => {
      const container = createContainer();
      const player = new VideoPlayer(
        container,
        undefined,
        undefined,
        true,
        false,
        true,
      );
      const twitchItem = baseItem({
        link: "https://www.twitch.tv/videos/2904335457",
        videoId: undefined,
      });
      player.loadVideo(twitchItem);

      expect(container.querySelector(".rss-video-watch")).toBeNull();
      const iframe = container.querySelector("iframe");
      expect(iframe).not.toBeNull();

      player.setFocusMode(false);
      const watchLink =
        container.querySelector<HTMLAnchorElement>(".rss-video-watch");
      expect(watchLink).not.toBeNull();
      expect(watchLink?.textContent).toContain("Watch on Twitch");
      expect(container.querySelector("iframe")).toBe(iframe);
    });

    it("moves focus to fallback when watch link was focused", () => {
      const container = createContainer();
      const fallback = document.body.createEl("button");
      const player = new VideoPlayer(container);
      player.loadVideo(withDescription());

      const watchLink =
        container.querySelector<HTMLAnchorElement>(".rss-video-watch");
      expect(watchLink).not.toBeNull();
      watchLink?.focus();
      expect(document.activeElement).toBe(watchLink);

      player.setFocusMode(true, fallback);
      expect(container.querySelector(".rss-video-watch")).toBeNull();
      expect(document.activeElement).toBe(fallback);

      // Turning focus mode off never moves focus
      const other = document.body.createEl("button");
      other.focus();
      player.setFocusMode(false, fallback);
      expect(document.activeElement).toBe(other);
    });

    it("leaves focus alone when activeElement is outside the watch link", () => {
      const container = createContainer();
      const fallback = document.body.createEl("button");
      const other = document.body.createEl("button");
      const player = new VideoPlayer(container);
      player.loadVideo(withDescription());

      other.focus();
      expect(document.activeElement).toBe(other);

      player.setFocusMode(true, fallback);
      expect(document.activeElement).toBe(other);
    });

    it("restores related videos supplied while focus mode was on", () => {
      const container = createContainer();
      const player = new VideoPlayer(container);
      player.setFocusMode(true);
      player.loadVideo(withDescription());
      player.setRelatedVideos([
        baseItem({ guid: "other", videoId: "other-id", title: "Other" }),
      ]);
      expect(container.querySelector(".rss-video-related")).toBeNull();

      player.setFocusMode(false);

      expect(
        container.querySelectorAll(".rss-video-related-item"),
      ).toHaveLength(1);
    });

    describe("tag chips", () => {
      const tagged = (): FeedItem =>
        baseItem({
          tags: [
            { name: "Video", color: "#e11d48" },
            { name: "Watch later", color: "#22c55e" },
          ],
        });

      it("renders a chip for each tag with its color", () => {
        const container = createContainer();
        new VideoPlayer(container).loadVideo(tagged());

        const chips = container.querySelectorAll<HTMLElement>(
          ".rss-video-details .rss-reader-tag",
        );
        expect(Array.from(chips).map((chip) => chip.textContent)).toEqual([
          "Video",
          "Watch later",
        ]);
        expect(chips[0]?.style.getPropertyValue("--tag-color")).toBe("#e11d48");
      });

      it("places the chips after the channel and date line, before the description", () => {
        const container = createContainer();
        new VideoPlayer(container).loadVideo({
          ...tagged(),
          description: "<p>Promo</p>",
        });

        const details = container.querySelector(".rss-video-details");
        const order = Array.from(details?.children ?? []).map((child) =>
          child.classList.contains("rss-video-meta")
            ? "meta"
            : child.classList.contains("rss-video-tags")
              ? "tags"
              : child.classList.contains("rss-video-description")
                ? "description"
                : "other",
        );
        expect(order.filter((name) => name !== "other")).toEqual([
          "meta",
          "tags",
          "description",
        ]);
      });

      it("renders no chips for an untagged video", () => {
        const container = createContainer();
        new VideoPlayer(container).loadVideo(baseItem({ tags: [] }));

        expect(container.querySelector(".rss-reader-tag")).toBeNull();
      });

      it("omits the chips in focus mode and restores them live on the same iframe", () => {
        const container = createContainer();
        const player = new VideoPlayer(container);
        player.loadVideo(tagged());
        const iframe = container.querySelector("iframe");

        player.setFocusMode(true);
        expect(container.querySelector(".rss-reader-tag")).toBeNull();
        expect(container.querySelector("iframe")).toBe(iframe);

        player.setFocusMode(false);
        expect(container.querySelectorAll(".rss-reader-tag")).toHaveLength(2);
        expect(container.querySelector("iframe")).toBe(iframe);
      });

      it("setTags replaces the chips, and shows none while focus mode is on", () => {
        const container = createContainer();
        const player = new VideoPlayer(container);
        player.loadVideo(tagged());

        player.setTags([{ name: "Only", color: "#3b82f6" }]);
        expect(
          Array.from(container.querySelectorAll(".rss-reader-tag")).map(
            (chip) => chip.textContent,
          ),
        ).toEqual(["Only"]);

        player.setTags([]);
        expect(container.querySelector(".rss-reader-tag")).toBeNull();

        player.setFocusMode(true);
        player.setTags([{ name: "Hidden", color: "#3b82f6" }]);
        expect(container.querySelector(".rss-reader-tag")).toBeNull();

        player.setFocusMode(false);
        expect(container.querySelector(".rss-reader-tag")?.textContent).toBe(
          "Hidden",
        );
      });
    });

    it("applies focus mode set before the next video loads", () => {
      const container = createContainer();
      const player = new VideoPlayer(container);
      player.setFocusMode(true);
      player.loadVideo(withDescription());

      expect(container.querySelector(".rss-video-description")).toBeNull();
      expect(container.querySelector(".rss-video-related")).toBeNull();
    });
  });
});
