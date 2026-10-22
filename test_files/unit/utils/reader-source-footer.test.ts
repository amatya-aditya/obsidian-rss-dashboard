import { afterEach, describe, expect, it } from "vitest";
import type { FeedItem } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { renderSourceFooter } from "../../../src/utils/reader-source-footer";

installObsidianDomPolyfills();

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Source footer",
    link: "https://example.com/post/1?utm=a",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1507",
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

afterEach(() => {
  document.body.empty();
});

describe("renderSourceFooter", () => {
  it("shows a Source label and the full link as an external anchor", () => {
    const container = document.body.createDiv();
    renderSourceFooter(container, makeItem());

    const footer = container.querySelector(".rss-reader-source-footer");
    expect(footer).not.toBeNull();
    expect(
      footer?.querySelector(".rss-reader-source-footer-label")?.textContent,
    ).toBe("Source");

    const anchor = footer?.querySelector("a");
    expect(anchor?.textContent).toBe("https://example.com/post/1?utm=a");
    expect(anchor?.getAttribute("href")).toBe(
      "https://example.com/post/1?utm=a",
    );
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("names the full URL in the anchor's tooltip, not a title attribute", () => {
    const container = document.body.createDiv();
    renderSourceFooter(container, makeItem());

    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("aria-label")).toBe(
      "https://example.com/post/1?utm=a",
    );
    expect(anchor?.hasAttribute("title")).toBe(false);
  });

  it("trims the link before using it", () => {
    const container = document.body.createDiv();
    renderSourceFooter(
      container,
      makeItem({ link: "  https://example.com/a " }),
    );

    const anchor = container.querySelector("a");
    expect(anchor?.textContent).toBe("https://example.com/a");
    expect(anchor?.getAttribute("href")).toBe("https://example.com/a");
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["javascript:", "javascript:alert(1)"],
    ["file:", "file:///etc/passwd"],
    ["data:", "data:text/html,<b>x</b>"],
    ["mailto:", "mailto:a@example.com"],
    ["not a URL", "not a url"],
  ])("renders nothing for a %s link", (_name, link) => {
    const container = document.body.createDiv();
    renderSourceFooter(container, makeItem({ link }));

    expect(container.querySelector(".rss-reader-source-footer")).toBeNull();
    expect(container.children.length).toBe(0);
  });

  it("renders nothing when the item has no link", () => {
    const container = document.body.createDiv();
    renderSourceFooter(
      container,
      makeItem({ link: undefined as unknown as string }),
    );

    expect(container.children.length).toBe(0);
  });

  it("replaces the footer it drew earlier instead of adding a second", () => {
    const container = document.body.createDiv();
    renderSourceFooter(
      container,
      makeItem({ link: "https://example.com/one" }),
    );
    renderSourceFooter(
      container,
      makeItem({ link: "https://example.com/two" }),
    );

    const anchors = container.querySelectorAll(".rss-reader-source-footer a");
    expect(anchors.length).toBe(1);
    expect(anchors[0].getAttribute("href")).toBe("https://example.com/two");
  });

  it("removes the earlier footer when the new item has no openable link", () => {
    const container = document.body.createDiv();
    renderSourceFooter(container, makeItem());
    renderSourceFooter(container, makeItem({ link: "javascript:alert(1)" }));

    expect(container.querySelector(".rss-reader-source-footer")).toBeNull();
  });

  it("appends after the content already in the container", () => {
    const container = document.body.createDiv();
    container.createDiv({ cls: "rss-reader-article-content" });
    renderSourceFooter(container, makeItem());

    expect(container.lastElementChild?.className).toContain(
      "rss-reader-source-footer",
    );
  });
});
