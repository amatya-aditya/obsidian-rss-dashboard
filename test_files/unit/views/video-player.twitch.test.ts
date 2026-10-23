import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "../../../src/views/video-player";
import { resolveReaderMediaRoute } from "../../../src/utils/reader-article-render";
import { shouldRenderVideoSourceBanner } from "../../../src/utils/reader-article-fetch";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { FeedItem } from "../../../src/types/types";

const VOD_ID = "2904335457";
const VOD_LINK = `https://www.twitch.tv/videos/${VOD_ID}`;
const LIVE_LINK = "https://www.twitch.tv/riotgames";
// A Twitch page that is neither a VOD nor a channel, so it has no player.
const NON_PLAYABLE_LINK = "https://www.twitch.tv/directory";

type ObsidianBody = HTMLElement & {
  empty: () => void;
  createDiv: (options?: { text?: string }) => HTMLDivElement;
};

function getObsidianBody(): ObsidianBody {
  return document.body as ObsidianBody;
}

function vodItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Finals day 2",
    link: VOD_LINK,
    description: "",
    pubDate: "2026-03-01T12:34:56.000Z",
    guid: "vod-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Riot Games",
    feedUrl: "https://twitchrss.appspot.com/vod/riotgames",
    coverImage: "",
    mediaType: "video" as const,
    ...overrides,
  };
}

describe("VideoPlayer with a Twitch VOD", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    getObsidianBody().empty();
    vi.restoreAllMocks();
  });

  it("plays the VOD in Twitch's player with both Obsidian parents", () => {
    const container = getObsidianBody().createDiv();
    new VideoPlayer(container).loadVideo(vodItem());

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    expect(iframe?.getAttribute("src")).toBe(
      `https://player.twitch.tv/?video=v${VOD_ID}&parent=localhost&parent=obsidian.md&autoplay=true`,
    );
    expect(iframe?.getAttribute("allow")).toContain("autoplay");
    expect(iframe?.allowFullscreen).toBe(true);
  });

  it("offers a Watch on Twitch link that works without the player", () => {
    const container = getObsidianBody().createDiv();
    new VideoPlayer(container).loadVideo(vodItem());

    const link = container.querySelector<HTMLAnchorElement>(".rss-video-watch");
    expect(link?.getAttribute("href")).toBe(VOD_LINK);
    expect(link?.textContent).toContain("Watch on Twitch");
    expect(link?.classList.contains("rss-video-watch--twitch")).toBe(true);
  });

  it("lists other VODs from the same channel using their cover images", () => {
    const container = getObsidianBody().createDiv();
    const player = new VideoPlayer(container);
    player.loadVideo(vodItem());

    player.setRelatedVideos([
      vodItem({
        guid: "vod-2",
        title: "Finals day 1",
        link: "https://www.twitch.tv/videos/111",
        coverImage: "https://static-cdn.jtvnw.net/cover.jpg",
      }),
    ]);

    const related = container.querySelectorAll(".rss-video-related-item");
    expect(related).toHaveLength(1);
    expect(
      container
        .querySelector(".rss-video-related-thumbnail img")
        ?.getAttribute("src"),
    ).toBe("https://static-cdn.jtvnw.net/cover.jpg");
  });

  it("does not wait for progress reports a Twitch embed cannot send", () => {
    const onProgress = vi.fn();
    const container = getObsidianBody().createDiv();
    const player = new VideoPlayer(container, undefined, onProgress, true);

    player.loadVideo(vodItem());
    player.destroy();

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("still refuses an item that is neither YouTube, a Twitch VOD nor a channel", () => {
    const container = getObsidianBody().createDiv({ text: "keep" });
    new VideoPlayer(container).loadVideo(vodItem({ link: NON_PLAYABLE_LINK }));

    expect(container.querySelector(".rss-video-player")).toBeNull();
    expect(container.textContent).toContain("keep");
  });
});

describe("reader routing for a Twitch VOD", () => {
  it("opens a video item with a VOD link in the video player", () => {
    expect(resolveReaderMediaRoute(vodItem())).toBe("video");
  });

  it("keeps a video item with a non-playable Twitch link on the article route", () => {
    expect(resolveReaderMediaRoute(vodItem({ link: NON_PLAYABLE_LINK }))).toBe(
      "article",
    );
  });

  it("does not show the missing-source banner for a playable VOD", () => {
    expect(shouldRenderVideoSourceBanner(vodItem())).toBe(false);
  });

  it("still explains a missing player for a VOD link on an item not typed as video", () => {
    // The route only opens the player for mediaType "video", so the banner
    // must not claim a player is coming for an item that will not get one.
    const item = vodItem({ mediaType: undefined });

    expect(resolveReaderMediaRoute(item)).toBe("article");
    expect(shouldRenderVideoSourceBanner(item)).toBe(true);
  });
});

function liveItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return vodItem({
    title: "riotgames is live",
    link: LIVE_LINK,
    guid: "live-1",
    ...overrides,
  });
}

describe("VideoPlayer with a Twitch live channel", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    getObsidianBody().empty();
    vi.restoreAllMocks();
  });

  it("plays the channel in Twitch's live embed, muted, with both parents", () => {
    const container = getObsidianBody().createDiv();
    new VideoPlayer(container).loadVideo(liveItem());

    const iframe = container.querySelector<HTMLIFrameElement>("iframe");
    expect(iframe?.getAttribute("src")).toBe(
      "https://player.twitch.tv/?channel=riotgames&parent=localhost&parent=obsidian.md&autoplay=true&muted=true",
    );
    expect(iframe?.getAttribute("allow")).toContain("autoplay");
    expect(iframe?.allowFullscreen).toBe(true);
  });

  it("lowercases the login before it reaches the iframe", () => {
    const container = getObsidianBody().createDiv();
    new VideoPlayer(container).loadVideo(
      liveItem({ link: "https://www.twitch.tv/RiotGames" }),
    );

    expect(container.querySelector("iframe")?.getAttribute("src")).toContain(
      "channel=riotgames&",
    );
  });

  it("offers a Watch on Twitch link to the channel that works without the player", () => {
    const container = getObsidianBody().createDiv();
    new VideoPlayer(container).loadVideo(liveItem());

    const link = container.querySelector<HTMLAnchorElement>(".rss-video-watch");
    expect(link?.getAttribute("href")).toBe("https://www.twitch.tv/riotgames");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.textContent).toContain("Watch on Twitch");
    expect(link?.classList.contains("rss-video-watch--twitch")).toBe(true);
  });

  it("reports no progress, even with progress tracking on", () => {
    const onProgress = vi.fn();
    const container = getObsidianBody().createDiv();
    const player = new VideoPlayer(container, undefined, onProgress, true);

    player.loadVideo(
      liveItem({
        playbackProgress: { position: 120, duration: 600, lastUpdated: 0 },
      }),
    );
    player.destroy();

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("lists a live item from the same channel with a LIVE label instead of a cover image", () => {
    const container = getObsidianBody().createDiv();
    const player = new VideoPlayer(container);
    player.loadVideo(vodItem());

    player.setRelatedVideos([
      liveItem({ coverImage: "https://static-cdn.jtvnw.net/live.jpg" }),
    ]);

    const thumbnail = container.querySelector(".rss-video-related-thumbnail");
    expect(thumbnail?.querySelector("img")).toBeNull();
    expect(thumbnail?.textContent).toBe("LIVE");
    expect(thumbnail?.querySelector(".rss-video-live-label")?.textContent).toBe(
      "LIVE",
    );
  });

  it("keeps a VOD's cover image in the related list beside a live item", () => {
    const container = getObsidianBody().createDiv();
    const player = new VideoPlayer(container);
    player.loadVideo(liveItem());

    player.setRelatedVideos([
      vodItem({ coverImage: "https://static-cdn.jtvnw.net/cover.jpg" }),
    ]);

    expect(
      container
        .querySelector(".rss-video-related-thumbnail img")
        ?.getAttribute("src"),
    ).toBe("https://static-cdn.jtvnw.net/cover.jpg");
    expect(container.querySelector(".rss-video-live-label")).toBeNull();
  });

  it("selects a live item from the related list through the host callback", () => {
    const onSelect = vi.fn();
    const container = getObsidianBody().createDiv();
    const player = new VideoPlayer(container, onSelect);
    player.loadVideo(vodItem());
    const live = liveItem();
    player.setRelatedVideos([live]);

    container.querySelector<HTMLElement>(".rss-video-related-item")?.click();

    expect(onSelect).toHaveBeenCalledWith(live);
  });

  it("plays YouTube when an item carries both a video id and a channel link", () => {
    const container = getObsidianBody().createDiv();
    new VideoPlayer(container).loadVideo(liveItem({ videoId: "abcdefghijk" }));

    expect(
      container.querySelector("iframe")?.getAttribute("src"),
    ).not.toContain("twitch.tv");
    expect(
      container.querySelector(".rss-video-watch")?.getAttribute("href"),
    ).toContain("youtube.com");
  });
});

describe("reader routing for a Twitch live channel", () => {
  it("opens a video item with a channel link in the video player", () => {
    expect(resolveReaderMediaRoute(liveItem())).toBe("video");
  });

  it("does not show the missing-source banner for a playable channel", () => {
    expect(shouldRenderVideoSourceBanner(liveItem())).toBe(false);
  });

  it("keeps an item not typed as video on the article route", () => {
    const item = liveItem({ mediaType: undefined });

    expect(resolveReaderMediaRoute(item)).toBe("article");
    // A bare channel link is not a video-looking item, so there is no banner.
    expect(shouldRenderVideoSourceBanner(item)).toBe(false);
  });

  it("still explains a missing player for a video-looking item not typed as video", () => {
    // The route only opens the player for mediaType "video", so the banner
    // must not claim a player is coming for an item that will not get one.
    const item = liveItem({
      mediaType: undefined,
      mediaContentType: "video/mp4",
    });

    expect(resolveReaderMediaRoute(item)).toBe("article");
    expect(shouldRenderVideoSourceBanner(item)).toBe(true);
  });
});
