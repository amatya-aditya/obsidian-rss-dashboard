import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  extractDomain,
  getFaviconUrl,
  TRANSPARENT_PIXEL,
  failedFeedIconUrls,
  resetFeedIconFailureCache,
  createSafeIconImage,
} from "../../../src/utils/favicon-utils";

describe("favicon-utils (failure cache infrastructure)", () => {
  beforeEach(() => {
    resetFeedIconFailureCache();
    document.body.innerHTML = "";
  });

  it("TRANSPARENT_PIXEL is a valid gif data URI", () => {
    expect(TRANSPARENT_PIXEL).toMatch(/^data:image\/gif;base64,/);
  });

  it("createSafeIconImage inserts an img with the given src", () => {
    const container = document.createElement("div");
    createSafeIconImage(container, "https://example.com/icon.png", "alt text", () => {});
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://example.com/icon.png");
    expect(img.getAttribute("alt")).toBe("alt text");
  });

  it("createSafeIconImage onerror adds src to failure cache", () => {
    const container = document.createElement("div");
    const src = "https://broken.example/icon.png";
    createSafeIconImage(container, src, "", () => {});
    const img = container.querySelector("img") as HTMLImageElement;
    img.onerror!(new Event("error"));
    expect(failedFeedIconUrls.has(src)).toBe(true);
  });

  it("createSafeIconImage onerror sets src to TRANSPARENT_PIXEL", () => {
    const container = document.createElement("div");
    createSafeIconImage(container, "https://broken.example/icon.png", "", () => {});
    const img = container.querySelector("img") as HTMLImageElement;
    img.onerror!(new Event("error"));
    expect(img.getAttribute("src")).toBe(TRANSPARENT_PIXEL);
  });

  it("createSafeIconImage onerror nulls the handler after firing", () => {
    const container = document.createElement("div");
    createSafeIconImage(container, "https://broken.example/icon.png", "", () => {});
    const img = container.querySelector("img") as HTMLImageElement;
    img.onerror!(new Event("error"));
    expect(img.onerror).toBeNull();
  });

  it("createSafeIconImage onerror invokes the onErrorFallback callback", () => {
    const container = document.createElement("div");
    const onError = (): void => {};
    const onErrorFallback = vi.fn(onError);
    createSafeIconImage(container, "https://broken.example/icon.png", "", onErrorFallback);
    const img = container.querySelector("img") as HTMLImageElement;
    img.onerror!(new Event("error"));
    expect(onErrorFallback).toHaveBeenCalledOnce();
  });

  it("resetFeedIconFailureCache empties the failure cache", () => {
    failedFeedIconUrls.add("https://example.com/icon.png");
    resetFeedIconFailureCache();
    expect(failedFeedIconUrls.size).toBe(0);
  });
});

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