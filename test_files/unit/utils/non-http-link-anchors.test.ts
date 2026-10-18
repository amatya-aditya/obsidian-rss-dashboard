import { afterEach, describe, expect, it } from "vitest";
import type { FeedItem } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  renderRestrictedBanner,
  renderVideoSourceBanner,
} from "../../../src/utils/reader-article-fetch";
import { renderFetchFailureBanner } from "../../../src/utils/full-article-fetch-failure";
import { getOpenableHttpHref } from "../../../src/utils/url-utils";

installObsidianDomPolyfills();

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Feed-supplied link",
    link: "https://example.com/article",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1297",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

// A feed controls item.link, so no non-http scheme may become an href (#1297).
const HOSTILE_LINKS = [
  "javascript:alert(1)",
  "data:text/html,<b>x</b>",
  "mailto:a@example.com",
  "not a url",
];

afterEach(() => {
  document.body.empty();
});

describe("getOpenableHttpHref", () => {
  it("returns a trimmed http(s) link and null for anything else", () => {
    expect(getOpenableHttpHref("  https://example.com/a  ")).toBe(
      "https://example.com/a",
    );
    expect(getOpenableHttpHref("http://example.com")).toBe(
      "http://example.com",
    );
    expect(getOpenableHttpHref("")).toBeNull();
    expect(getOpenableHttpHref(undefined)).toBeNull();
    for (const link of HOSTILE_LINKS) {
      expect(getOpenableHttpHref(link)).toBeNull();
    }
  });
});

describe.each(HOSTILE_LINKS)("banner link for a feed link of %s", (link) => {
  it("omits the restricted-article banner link", () => {
    const container = document.body.createDiv();
    renderRestrictedBanner(container, makeItem({ link }));
    expect(
      container.querySelector(".rss-reader-paywall-banner"),
    ).not.toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("omits the video-source banner link", () => {
    const container = document.body.createDiv();
    renderVideoSourceBanner(container, makeItem({ link }));
    expect(container.querySelector(".rss-reader-video-banner")).not.toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("omits the fetch-failure Open in browser link but keeps Try again", () => {
    const container = document.body.createDiv();
    renderFetchFailureBanner(
      container,
      makeItem({
        link,
        fullContentFetchFailure: { reason: "network", at: Date.now() },
      }),
      () => {},
    );
    expect(
      container.querySelector(".rss-reader-fetch-failure-banner"),
    ).not.toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("Try again");
  });
});

describe("banner links for a valid http(s) feed link", () => {
  it("still renders each anchor with the link as href", () => {
    const restricted = document.body.createDiv();
    renderRestrictedBanner(restricted, makeItem());
    expect(restricted.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/article",
    );

    const video = document.body.createDiv();
    renderVideoSourceBanner(video, makeItem());
    expect(video.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/article",
    );

    const failure = document.body.createDiv();
    renderFetchFailureBanner(
      failure,
      makeItem({
        fullContentFetchFailure: { reason: "network", at: Date.now() },
      }),
      () => {},
    );
    expect(failure.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/article",
    );
  });
});
