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

  it("finds no player for a link that is not a VOD", () => {
    expect(
      resolveVideoSource({ link: "https://www.twitch.tv/riotgames" }),
    ).toBeNull();
  });
});
