import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "../../../src/views/video-player";
import { resolveReaderMediaRoute } from "../../../src/utils/reader-article-render";
import { shouldRenderVideoSourceBanner } from "../../../src/utils/reader-article-fetch";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { FeedItem } from "../../../src/types/types";

const VOD_ID = "2904335457";
const VOD_LINK = `https://www.twitch.tv/videos/${VOD_ID}`;

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

  it("still refuses an item that is neither YouTube nor a Twitch VOD", () => {
    const container = getObsidianBody().createDiv({ text: "keep" });
    new VideoPlayer(container).loadVideo(
      vodItem({ link: "https://www.twitch.tv/riotgames" }),
    );

    expect(container.querySelector(".rss-video-player")).toBeNull();
    expect(container.textContent).toContain("keep");
  });
});

describe("reader routing for a Twitch VOD", () => {
  it("opens a video item with a VOD link in the video player", () => {
    expect(resolveReaderMediaRoute(vodItem())).toBe("video");
  });

  it("keeps a video item with a non-VOD link on the article route", () => {
    expect(
      resolveReaderMediaRoute(
        vodItem({ link: "https://www.twitch.tv/riotgames" }),
      ),
    ).toBe("article");
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
