import { describe, expect, it } from "vitest";
import {
  APPLE_PODCASTS,
  GOOGLE_PODCASTS,
  POCKET_CASTS,
  SPOTIFY,
} from "../../../src/utils/podcast-platforms";

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

  it("detects an uppercase host", () => {
    expect(
      APPLE_PODCASTS.detect("https://PODCASTS.APPLE.COM/us/podcast/x/id1"),
    ).toBe(true);
  });

  it("does not detect a host that contains the domain as a prefix", () => {
    expect(
      APPLE_PODCASTS.detect("https://podcasts.apple.com.example.net/id1"),
    ).toBe(false);
  });

  it("does not detect a host that ends with the domain preceded by other text", () => {
    expect(APPLE_PODCASTS.detect("https://xpodcasts.apple.com/id1")).toBe(
      false,
    );
  });

  it("does not detect a URL whose query merely mentions the domain", () => {
    expect(
      APPLE_PODCASTS.detect("https://example.net/?u=podcasts.apple.com"),
    ).toBe(false);
  });
});

const UUID = "01234567-89ab-cdef-0123-456789abcdef";

describe.each([
  {
    label: "SPOTIFY",
    platform: SPOTIFY,
    host: "open.spotify.com",
    path: "/show/4rOoJ6Egrf8K2IrywzwOMk",
    otherHost: "www.spotify.com",
  },
  {
    label: "GOOGLE_PODCASTS",
    platform: GOOGLE_PODCASTS,
    host: "podcasts.google.com",
    path: "/feed/aHR0cHM6Ly9leGFtcGxl",
    otherHost: "www.google.com",
  },
  {
    label: "POCKET_CASTS",
    platform: POCKET_CASTS,
    host: "pocketcasts.com",
    path: `/podcast/show/${UUID}`,
    otherHost: "example.com",
  },
])("$label.detect host handling", ({ platform, host, path, otherHost }) => {
  it.each([
    `https://${host}${path}`,
    `http://${host}${path}`,
    `https://${host}${path}?si=1`,
    `https://${host}${path}#frag`,
    `https://m.${host}${path}`,
  ])("detects %s", (url) => {
    expect(platform.detect(url)).toBe(true);
  });

  it("detects an address with an explicit port", () => {
    expect(platform.detect(`https://${host}:8443${path}`)).toBe(true);
  });

  it("does not detect an unrelated host with the same path", () => {
    expect(platform.detect(`https://${otherHost}${path}`)).toBe(false);
  });

  it("does not detect the host without the platform path", () => {
    expect(platform.detect(`https://${host}/`)).toBe(false);
  });

  it("does not detect a host that contains the domain as a prefix", () => {
    expect(platform.detect(`https://${host}.example.net${path}`)).toBe(false);
  });

  it("detects an uppercase host", () => {
    expect(platform.detect(`https://${host.toUpperCase()}${path}`)).toBe(true);
  });

  it("does not detect a scheme-less address", () => {
    expect(platform.detect(`${host}${path}`)).toBe(false);
  });

  it("does not detect a host that ends with the domain preceded by other text", () => {
    expect(platform.detect(`https://x${host}${path}`)).toBe(false);
  });

  it("does not detect a URL whose query merely mentions the domain and path", () => {
    expect(platform.detect(`https://example.net/?u=${host}${path}`)).toBe(
      false,
    );
  });

  it("does not detect a URL whose path holds the domain and path", () => {
    expect(platform.detect(`https://example.net/${host}${path}`)).toBe(false);
  });
});

describe("SPOTIFY.extractId and POCKET_CASTS.extractId", () => {
  it("reads the show id from a Spotify URL", () => {
    expect(SPOTIFY.extractId("https://open.spotify.com/show/abc123?si=1")).toBe(
      "abc123",
    );
  });

  it("reads the feed id from a Google Podcasts URL", () => {
    expect(
      GOOGLE_PODCASTS.extractId("https://podcasts.google.com/feed/abc_1-2"),
    ).toBe("abc_1-2");
  });

  it("reads the podcast uuid from a Pocket Casts URL", () => {
    expect(
      POCKET_CASTS.extractId(`https://pocketcasts.com/podcast/show/${UUID}`),
    ).toBe(UUID);
  });
});
