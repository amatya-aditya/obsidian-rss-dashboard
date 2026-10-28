import { describe, expect, it } from "vitest";
import { resolveVideoSource } from "../../../src/utils/video-source";

describe("resolveVideoSource", () => {
  it("plays an item with a YouTube video id in YouTube's player", () => {
    expect(
      resolveVideoSource({
        link: "https://example.com/v",
        videoId: "abcdefghijk",
      }),
    ).toEqual({ kind: "youtube", id: "abcdefghijk" });
  });

  it("plays an item with a Twitch VOD link in Twitch's player", () => {
    expect(
      resolveVideoSource({ link: "https://www.twitch.tv/videos/42" }),
    ).toEqual({ kind: "twitch", id: "42" });
  });

  it("prefers the YouTube id when an item carries both", () => {
    expect(
      resolveVideoSource({
        link: "https://www.twitch.tv/videos/42",
        videoId: "abcdefghijk",
      }),
    ).toEqual({ kind: "youtube", id: "abcdefghijk" });
  });

  it("plays an item with a Twitch channel link in Twitch's live player", () => {
    expect(
      resolveVideoSource({ link: "https://www.twitch.tv/RiotGames" }),
    ).toEqual({ kind: "twitch-live", id: "riotgames" });
  });

  it("prefers the YouTube id over a channel link", () => {
    expect(
      resolveVideoSource({
        link: "https://www.twitch.tv/riotgames",
        videoId: "abcdefghijk",
      }),
    ).toEqual({ kind: "youtube", id: "abcdefghijk" });
  });

  it("never resolves a VOD link to a live channel", () => {
    expect(
      resolveVideoSource({ link: "https://www.twitch.tv/videos/42" }),
    ).toEqual({ kind: "twitch", id: "42" });
  });

  it.each([
    "https://www.twitch.tv/directory",
    "https://www.twitch.tv/riotgames/videos",
    "https://example.com/riotgames",
  ])("finds no player for %s", (link) => {
    expect(resolveVideoSource({ link })).toBeNull();
  });
});
