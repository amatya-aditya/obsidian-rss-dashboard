import { describe, expect, it } from "vitest";
import {
  parseTwitchVodId,
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
