import { describe, expect, it } from "vitest";
import { APPLE_PODCASTS } from "../../../src/utils/podcast-platforms";

describe("APPLE_PODCASTS.detect host handling", () => {
  it.each([
    "https://podcasts.apple.com/us/podcast/show/id123456789",
    "http://podcasts.apple.com/us/podcast/show/id123456789",
    "https://podcasts.apple.com:8443/us/podcast/show/id123456789?i=1",
    "https://podcasts.apple.com/us/podcast/show/id123456789#frag",
  ])("detects %s", (url) => {
    expect(APPLE_PODCASTS.detect(url)).toBe(true);
  });

  it("does not detect an unrelated apple.com page", () => {
    expect(APPLE_PODCASTS.detect("https://www.apple.com/podcasts")).toBe(false);
  });

  it("does not detect an uppercase host", () => {
    // Pinned as-is: matches by substring; replaced by hostname matching
    expect(
      APPLE_PODCASTS.detect("https://PODCASTS.APPLE.COM/us/podcast/x/id1"),
    ).toBe(false);
  });

  it("detects a host that contains the domain as a prefix", () => {
    // Pinned as-is: matches by substring; replaced by hostname matching
    expect(
      APPLE_PODCASTS.detect("https://podcasts.apple.com.example.net/id1"),
    ).toBe(true);
  });

  it("detects a host that ends with the domain preceded by other text", () => {
    // Pinned as-is: matches by substring; replaced by hostname matching
    expect(APPLE_PODCASTS.detect("https://xpodcasts.apple.com/id1")).toBe(true);
  });

  it("detects a URL whose query merely mentions the domain", () => {
    // Pinned as-is: matches by substring; replaced by hostname matching
    expect(
      APPLE_PODCASTS.detect("https://example.net/?u=podcasts.apple.com"),
    ).toBe(true);
  });
});
