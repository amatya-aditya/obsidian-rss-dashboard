import { describe, expect, it } from "vitest";
import { resolveItemLinkBaseUrl } from "../../../src/utils/url-utils.js";

/**
 * The base a feed's relative item link resolves against (#1337): the home page
 * the feed declares when the feed is hosted away from it, else the feed url.
 */
describe("resolveItemLinkBaseUrl", () => {
  const feedUrl = "https://feeds.example.com/harvardbusiness/";

  it("uses the declared home page when the feed sits on another host", () => {
    expect(resolveItemLinkBaseUrl("https://example.com", feedUrl)).toBe(
      "https://example.com",
    );
  });

  it("upgrades a plain-http home page so the article opens over https", () => {
    expect(resolveItemLinkBaseUrl("http://example.com", feedUrl)).toBe(
      "https://example.com",
    );
  });

  it("keeps the feed url when the home page shares the feed's host", () => {
    expect(
      resolveItemLinkBaseUrl(
        "http://example.com",
        "http://example.com/feed.xml",
      ),
    ).toBe("http://example.com/feed.xml");
  });

  it("treats a subdomain as another host, so its links keep the declared host", () => {
    expect(
      resolveItemLinkBaseUrl(
        "https://www.example.com",
        "https://example.com/feed.xml",
      ),
    ).toBe("https://www.example.com");
  });

  it("treats a different port as another host", () => {
    expect(
      resolveItemLinkBaseUrl(
        "https://example.com:8443",
        "https://example.com/feed.xml",
      ),
    ).toBe("https://example.com:8443");
  });

  it("keeps the feed url when the feed declares no home page", () => {
    expect(resolveItemLinkBaseUrl(null, feedUrl)).toBe(feedUrl);
  });

  it("keeps the feed url when the home page is not http(s)", () => {
    expect(resolveItemLinkBaseUrl("mailto:tips@example.org", feedUrl)).toBe(
      feedUrl,
    );
  });

  it("compares hosts without regard to case or a default port", () => {
    expect(
      resolveItemLinkBaseUrl(
        "https://EXAMPLE.com:443",
        "https://example.com/feed.xml",
      ),
    ).toBe("https://example.com/feed.xml");
  });

  it("keeps the feed url when the home page cannot be compared", () => {
    expect(resolveItemLinkBaseUrl("not a url", feedUrl)).toBe(feedUrl);
  });
});
