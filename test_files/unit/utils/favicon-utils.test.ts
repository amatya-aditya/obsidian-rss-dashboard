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
    const container = createDiv();
    createSafeIconImage(
      container,
      "https://example.com/icon.png",
      "alt text",
      () => {},
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://example.com/icon.png");
    expect(img.getAttribute("alt")).toBe("alt text");
  });

  it("does not add a URL to the failure cache after one failed load", () => {
    const container = createDiv();
    const src = "https://broken.example/icon.png";
    createSafeIconImage(container, src, "", () => {});
    const img = container.querySelector("img") as HTMLImageElement;
    img.onerror!(new Event("error"));
    expect(failedFeedIconUrls.has(src)).toBe(false);
  });

  it("adds a URL to the failure cache after a second consecutive failed load", () => {
    const container = createDiv();
    const src = "https://broken.example/icon.png";

    createSafeIconImage(container, src, "", () => {});
    (container.querySelector("img") as HTMLImageElement).onerror!(
      new Event("error"),
    );
    expect(failedFeedIconUrls.has(src)).toBe(false);

    createSafeIconImage(container, src, "", () => {});
    container.querySelectorAll("img").item(1).onerror!(new Event("error"));
    expect(failedFeedIconUrls.has(src)).toBe(true);
  });

  it("counts two concurrent failures for the same URL toward the session cache", () => {
    const container = createDiv();
    const src = "https://broken.example/shared-icon.png";

    // Two rows rendering the same feed before either icon load settles.
    const first = createSafeIconImage(container, src, "", () => {});
    const second = createSafeIconImage(container, src, "", () => {});

    first.onerror!(new Event("error"));
    expect(failedFeedIconUrls.has(src)).toBe(false);

    // The counter is keyed by URL, not by element, so the second element's
    // failure is the URL's second failure and blacklists it for the session.
    // The Set is the observable cache; no third render is needed to see it.
    second.onerror!(new Event("error"));
    expect(failedFeedIconUrls.has(src)).toBe(true);
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("clears the consecutive failure count when the icon loads", () => {
    const container = createDiv();
    const src = "https://flaky.example/icon.png";

    createSafeIconImage(container, src, "", () => {});
    (container.querySelector("img") as HTMLImageElement).onerror!(
      new Event("error"),
    );

    createSafeIconImage(container, src, "", () => {});
    container.querySelectorAll("img").item(1).onload!(new Event("load"));

    createSafeIconImage(container, src, "", () => {});
    container.querySelectorAll("img").item(2).onerror!(new Event("error"));

    // The earlier success reset the count, so this is a first failure again.
    expect(failedFeedIconUrls.has(src)).toBe(false);
  });

  it("createSafeIconImage onerror sets src to TRANSPARENT_PIXEL", () => {
    const container = createDiv();
    createSafeIconImage(
      container,
      "https://broken.example/icon.png",
      "",
      () => {},
    );
    const img = container.querySelector("img") as HTMLImageElement;
    img.onerror!(new Event("error"));
    expect(img.getAttribute("src")).toBe(TRANSPARENT_PIXEL);
  });

  it("createSafeIconImage onerror nulls the handler after firing", () => {
    const container = createDiv();
    createSafeIconImage(
      container,
      "https://broken.example/icon.png",
      "",
      () => {},
    );
    const img = container.querySelector("img") as HTMLImageElement;
    img.onerror!(new Event("error"));
    expect(img.onerror).toBeNull();
  });

  it("createSafeIconImage onerror invokes the onErrorFallback callback", () => {
    const container = createDiv();
    const onError = (): void => {};
    const onErrorFallback = vi.fn(onError);
    createSafeIconImage(
      container,
      "https://broken.example/icon.png",
      "",
      onErrorFallback,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    img.onerror!(new Event("error"));
    expect(onErrorFallback).toHaveBeenCalledOnce();
  });

  it("resetFeedIconFailureCache clears the cache and the retry counters", () => {
    const container = createDiv();
    const src = "https://broken.example/icon.png";

    createSafeIconImage(container, src, "", () => {});
    (container.querySelector("img") as HTMLImageElement).onerror!(
      new Event("error"),
    );
    createSafeIconImage(container, src, "", () => {});
    container.querySelectorAll("img").item(1).onerror!(new Event("error"));
    expect(failedFeedIconUrls.has(src)).toBe(true);

    resetFeedIconFailureCache();
    expect(failedFeedIconUrls.size).toBe(0);

    // A surviving count would make this single new failure blacklist the URL.
    createSafeIconImage(container, src, "", () => {});
    container.querySelectorAll("img").item(2).onerror!(new Event("error"));
    expect(failedFeedIconUrls.has(src)).toBe(false);
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
    expect(extractDomain("https://mastodon.social/@username.rss")).toBe(
      "mastodon.social",
    );
  });

  it("extracts the instance domain from a /users/ Mastodon RSS URL", () => {
    expect(extractDomain("https://hachyderm.io/users/alice.rss")).toBe(
      "hachyderm.io",
    );
  });

  it("extracts the base domain from a short Mastodon instance RSS URL", () => {
    expect(extractDomain("https://fosstodon.org/@bob.rss")).toBe(
      "fosstodon.org",
    );
  });

  it("returns empty string when the input is not a parseable URL", () => {
    expect(extractDomain("not-a-url")).toBe("");
  });
});
