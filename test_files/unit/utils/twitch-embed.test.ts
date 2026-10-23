import { describe, expect, it } from "vitest";
import {
  parseTwitchChannel,
  parseTwitchVodId,
  twitchChannelFor,
  twitchChannelWatchUrl,
  twitchLivePlayerSourceUrl,
  twitchPlayerSourceUrl,
  twitchVodIdFor,
  twitchVodWatchUrl,
} from "../../../src/utils/twitch-embed";

describe("parseTwitchVodId", () => {
  it.each([
    ["https://www.twitch.tv/videos/2345678901", "2345678901"],
    ["https://twitch.tv/videos/123", "123"],
    ["https://m.twitch.tv/videos/123/", "123"],
    ["http://www.twitch.tv/videos/123", "123"],
    ["https://www.twitch.tv/videos/123?t=1h2m", "123"],
    ["  https://www.twitch.tv/videos/123  ", "123"],
  ])("reads the VOD id from %s", (link, id) => {
    expect(parseTwitchVodId(link)).toBe(id);
  });

  it.each([
    undefined,
    "",
    "not a url",
    "https://www.twitch.tv/riotgames",
    "https://www.twitch.tv/videos/",
    "https://www.twitch.tv/videos/abc",
    "https://www.twitch.tv/riotgames/clip/Slug",
    "https://evil.example/videos/123",
    "https://twitch.tv.evil.example/videos/123",
    "javascript:alert(1)",
  ])("returns null for %s", (link) => {
    expect(parseTwitchVodId(link)).toBeNull();
  });
});

describe("twitchVodIdFor", () => {
  it("finds the VOD id from the item's link", () => {
    expect(
      twitchVodIdFor({ link: "https://www.twitch.tv/videos/42", videoId: "" }),
    ).toBe("42");
  });

  it("never treats an item with a YouTube video id as a Twitch VOD", () => {
    expect(
      twitchVodIdFor({
        link: "https://www.twitch.tv/videos/42",
        videoId: "abcdefghijk",
      }),
    ).toBeNull();
  });
});

describe("twitchPlayerSourceUrl", () => {
  it("names both Obsidian parents so desktop and mobile can play", () => {
    expect(twitchPlayerSourceUrl("2345678901", { autoplay: true })).toBe(
      "https://player.twitch.tv/?video=v2345678901&parent=localhost&parent=obsidian.md&autoplay=true",
    );
  });

  it("does not autoplay unless asked", () => {
    expect(twitchPlayerSourceUrl("1")).toContain("autoplay=false");
  });

  it.each(["", "abc", "12&parent=evil.example", "1 2"])(
    "refuses the id %j so nothing else reaches the iframe",
    (id) => {
      expect(() => twitchPlayerSourceUrl(id)).toThrow();
    },
  );
});

describe("twitchVodWatchUrl", () => {
  it("builds the canonical VOD page", () => {
    expect(twitchVodWatchUrl("42")).toBe("https://www.twitch.tv/videos/42");
  });
});

describe("parseTwitchChannel", () => {
  it.each([
    ["https://www.twitch.tv/riotgames", "riotgames"],
    ["https://twitch.tv/riotgames", "riotgames"],
    ["https://m.twitch.tv/riotgames", "riotgames"],
    ["http://www.twitch.tv/riotgames", "riotgames"],
    ["https://www.twitch.tv/riotgames/", "riotgames"],
    ["https://www.twitch.tv/riotgames?sr=a", "riotgames"],
    ["https://www.twitch.tv/riotgames#top", "riotgames"],
    ["  https://www.twitch.tv/riotgames  ", "riotgames"],
    ["https://www.twitch.tv/RiotGames", "riotgames"],
    ["https://WWW.TWITCH.TV/Some_User_1", "some_user_1"],
    [`https://www.twitch.tv/${"a".repeat(25)}`, "a".repeat(25)],
  ])("reads the channel login from %s", (link, login) => {
    expect(parseTwitchChannel(link)).toBe(login);
  });

  it.each([
    undefined,
    "",
    "   ",
    "not a url",
    "javascript:alert(1)",
    "ftp://www.twitch.tv/riotgames",
    "https://www.twitch.tv",
    "https://www.twitch.tv/",
    "https://evil.example/riotgames",
    "https://twitch.tv.evil.example/riotgames",
    "https://www.twitch.tv.evil.example/riotgames",
    "https://nottwitch.tv/riotgames",
    "https://www.twitch.tv/riotgames/videos",
    "https://www.twitch.tv/riotgames/clip/Slug",
    "https://www.twitch.tv/riotgames/about",
    "https://www.twitch.tv/videos/2345678901",
    `https://www.twitch.tv/${"a".repeat(26)}`,
    "https://www.twitch.tv/riot-games",
    "https://www.twitch.tv/riot.games",
    "https://www.twitch.tv/riot%67ames",
  ])("returns null for %s", (link) => {
    expect(parseTwitchChannel(link)).toBeNull();
  });

  it.each([
    "videos",
    "directory",
    "downloads",
    "jobs",
    "p",
    "settings",
    "subscriptions",
    "wallet",
    "turbo",
    "friends",
    "inventory",
    "drops",
    "search",
    "popout",
    "embed",
    "store",
    "moderator",
    "broadcast",
  ])("treats /%s as a Twitch page, not a channel", (segment) => {
    expect(parseTwitchChannel(`https://www.twitch.tv/${segment}`)).toBeNull();
    expect(parseTwitchChannel(`https://www.twitch.tv/${segment}/`)).toBeNull();
    expect(
      parseTwitchChannel(`https://www.twitch.tv/${segment.toUpperCase()}`),
    ).toBeNull();
  });
});

describe("twitchChannelFor", () => {
  it("finds the channel from the item's link", () => {
    expect(
      twitchChannelFor({
        link: "https://www.twitch.tv/RiotGames",
        videoId: "",
      }),
    ).toBe("riotgames");
  });

  it("never treats an item with a YouTube video id as a live channel", () => {
    expect(
      twitchChannelFor({
        link: "https://www.twitch.tv/riotgames",
        videoId: "abcdefghijk",
      }),
    ).toBeNull();
  });

  it("never treats a VOD link as a live channel", () => {
    expect(
      twitchChannelFor({ link: "https://www.twitch.tv/videos/42" }),
    ).toBeNull();
  });
});

describe("twitchLivePlayerSourceUrl", () => {
  it("names the channel, both Obsidian parents, and autoplays muted", () => {
    expect(twitchLivePlayerSourceUrl("riotgames")).toBe(
      "https://player.twitch.tv/?channel=riotgames&parent=localhost&parent=obsidian.md&autoplay=true&muted=true",
    );
  });

  it.each(["", "a b", "x&parent=evil.example", "../x", "a".repeat(26), "a-b"])(
    "refuses the login %j so nothing else reaches the iframe",
    (login) => {
      expect(() => twitchLivePlayerSourceUrl(login)).toThrow();
    },
  );
});

describe("twitchChannelWatchUrl", () => {
  it("builds the canonical channel page", () => {
    expect(twitchChannelWatchUrl("riotgames")).toBe(
      "https://www.twitch.tv/riotgames",
    );
  });

  it.each(["", "a b", "x/y", "x?y=1"])("refuses the login %j", (login) => {
    expect(() => twitchChannelWatchUrl(login)).toThrow();
  });
});
