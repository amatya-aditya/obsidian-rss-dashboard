import { describe, expect, it } from "vitest";
import {
  APPLE_PODCASTS,
  GOOGLE_PODCASTS,
  POCKET_CASTS,
  SPOTIFY,
  detectPodcastPlatform,
  isPodcastPlatformUrl,
} from "../../../src/utils/podcast-platforms";

describe("podcast-platforms.detectPodcastPlatform", () => {
  it("detects Apple Podcasts and extracts id", () => {
    const url = "https://podcasts.apple.com/us/podcast/some-show/id123456789?i=1";
    const platform = detectPodcastPlatform(url);
    expect(platform?.id).toBe("apple");
    expect(platform?.extractId(url)).toBe("123456789");
  });

  it("detects Spotify and extracts show id", () => {
    const url = "https://open.spotify.com/show/AbC123xyz";
    const platform = detectPodcastPlatform(url);
    expect(platform?.id).toBe("spotify");
    expect(platform?.extractId(url)).toBe("AbC123xyz");
  });

  it("detects Google Podcasts and extracts feed id", () => {
    const url = "https://podcasts.google.com/feed/aBcD_123-XYZ";
    const platform = detectPodcastPlatform(url);
    expect(platform?.id).toBe("google");
    expect(platform?.extractId(url)).toBe("aBcD_123-XYZ");
  });

  it("detects Pocket Casts and extracts uuid", () => {
    const url =
      "https://pocketcasts.com/podcast/some/123e4567-e89b-12d3-a456-426614174000";
    const platform = detectPodcastPlatform(url);
    expect(platform?.id).toBe("pocketcasts");
    expect(platform?.extractId(url)).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("returns null when no platform matches", () => {
    expect(detectPodcastPlatform("https://example.com")).toBeNull();
  });
});

describe("podcast-platforms.platform helpers", () => {
  it("platform detect() returns false for non-matching urls", () => {
    expect(APPLE_PODCASTS.detect("https://example.com")).toBe(false);
    expect(SPOTIFY.detect("https://example.com")).toBe(false);
    expect(GOOGLE_PODCASTS.detect("https://example.com")).toBe(false);
    expect(POCKET_CASTS.detect("https://example.com")).toBe(false);
  });

  it("extractId() returns null when the expected pattern is missing", () => {
    expect(APPLE_PODCASTS.extractId("https://podcasts.apple.com/us/podcast/x")).toBeNull();
    expect(SPOTIFY.extractId("https://open.spotify.com/episode/AbC123")).toBeNull();
    expect(GOOGLE_PODCASTS.extractId("https://podcasts.google.com/feed/")).toBeNull();
    expect(POCKET_CASTS.extractId("https://pocketcasts.com/podcast/some/not-a-uuid")).toBeNull();
  });

  it("isPodcastPlatformUrl mirrors detectPodcastPlatform", () => {
    expect(isPodcastPlatformUrl("https://open.spotify.com/show/AbC123xyz")).toBe(true);
    expect(isPodcastPlatformUrl("https://example.com")).toBe(false);
  });
});

