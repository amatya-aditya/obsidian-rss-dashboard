import { describe, expect, it } from "vitest";
import { extractDomain, getFaviconUrl } from "../../../src/utils/favicon-utils";

describe("favicon-utils.extractDomain", () => {
  it("extracts domain from a normal URL", () => {
    expect(extractDomain("https://example.com/path?q=1")).toBe("example.com");
  });

  it("special-cases feeds.<domain>.<tld>", () => {
    expect(extractDomain("https://feeds.example.com/rss")).toBe("example.com");
  });

  it("returns last two parts for long hostnames", () => {
    expect(extractDomain("https://a.b.c.example.com/x")).toBe("example.com");
  });

  it("falls back to regex parsing when URL constructor throws", () => {
    expect(extractDomain("https://exa mple.com/path")).toBe("exa mple.com");
  });

  it("returns empty string when input is not parseable", () => {
    expect(extractDomain("not a url")).toBe("");
  });
});

describe("favicon-utils.getFaviconUrl", () => {
  it("returns empty string for empty input", () => {
    expect(getFaviconUrl("")).toBe("");
  });

  it("builds the Google S2 favicon URL", () => {
    expect(getFaviconUrl("example.com")).toBe(
      "https://www.google.com/s2/favicons?sz=32&domain_url=http://example.com",
    );
  });
});

// ---------------------------------------------------------------------------
// Mastodon-specific domain extraction
// ---------------------------------------------------------------------------

describe("favicon-utils — Mastodon domain extraction", () => {
  it("extracts mastodon.social from a Mastodon profile-style RSS URL", () => {
    expect(
      extractDomain("https://mastodon.social/@username.rss"),
    ).toBe("mastodon.social");
  });

  it("extracts the instance domain from a /users/ Mastodon RSS URL", () => {
    expect(
      extractDomain("https://hachyderm.io/users/alice.rss"),
    ).toBe("hachyderm.io");
  });

  it("extracts the base domain from a short Mastodon instance RSS URL", () => {
    expect(
      extractDomain("https://fosstodon.org/@bob.rss"),
    ).toBe("fosstodon.org");
  });

  it("returns empty string when the input is not a parseable URL", () => {
    expect(extractDomain("not-a-url")).toBe("");
  });
});

