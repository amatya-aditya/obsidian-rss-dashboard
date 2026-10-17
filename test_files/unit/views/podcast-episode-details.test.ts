import { beforeEach, describe, expect, it } from "vitest";
import type { FeedItem, Tag } from "../../../src/types/types";
import { renderEpisodeDetails } from "../../../src/views/podcast-episode-details";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Episode",
    link: "",
    description: "",
    pubDate: "2026-03-01T12:34:56.000Z",
    guid: "guid-ep1",
    read: false,
    starred: false,
    tags: [] as Tag[],
    feedTitle: "Show",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    mediaType: "podcast",
    ...overrides,
  };
}

function render(item: FeedItem): HTMLElement {
  const player: HTMLDivElement = createDiv();
  renderEpisodeDetails(player, item, "obsidian");
  return player;
}

function metaLabelTexts(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(".podcast-episode-meta-label"),
    (label) => label.textContent ?? "",
  );
}

describe("renderEpisodeDetails link row", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("omits the link row when the feed link uses a non-http(s) scheme", () => {
    const container = render(createItem({ link: "javascript:alert(1)" }));

    expect(metaLabelTexts(container)).not.toContain("Link");
    expect(container.querySelector(".podcast-episode-meta-value a")).toBeNull();
  });

  it("omits the link row for other non-openable links", () => {
    const links = [
      "mailto:someone@example.com",
      "data:text/html,<b>note</b>",
      "obsidian://open?vault=v",
      "not a url",
    ];

    for (const link of links) {
      const container = render(createItem({ link }));
      expect(metaLabelTexts(container)).not.toContain("Link");
      expect(
        container.querySelector(".podcast-episode-meta-value a"),
      ).toBeNull();
    }
  });

  it("omits the link row for schemes disguised by case or embedded characters", () => {
    // Case, embedded control characters, and an authority-less URL are the
    // shapes a naive `startsWith("javascript:")` check would let through. This
    // guard is the last check before the anchor is built, so it must reject
    // them.
    const links = [
      "JavaScript:alert(1)",
      "java\nscript:alert(1)",
      "\u0000javascript:alert(1)",
      "vbscript:msgbox(1)",
      "file:///C:/Windows",
      "blob:https://example.com/abc",
      "tel:+15551234",
      "//evil.example/x",
    ];

    for (const link of links) {
      const container = render(createItem({ link }));
      expect(metaLabelTexts(container)).not.toContain("Link");
      expect(
        container.querySelector(".podcast-episode-meta-value a"),
      ).toBeNull();
    }
  });

  it("renders the link row as an external anchor for http and https links", () => {
    for (const link of ["https://example.com/ep", " http://example.com/ep "]) {
      const container = render(createItem({ link }));
      const anchor = container.querySelector<HTMLAnchorElement>(
        ".podcast-episode-meta-value a",
      );

      expect(anchor?.getAttribute("href")).toBe(link.trim());
      expect(anchor?.textContent).toBe("Open episode");
      expect(anchor?.target).toBe("_blank");
      expect(anchor?.rel).toBe("noopener noreferrer");
    }
  });

  it("keeps the other meta rows when the link is unsafe", () => {
    const container = render(
      createItem({
        link: "javascript:alert(1)",
        pubDate: "",
        season: 2,
        episode: 7,
        category: "Tech",
      }),
    );

    expect(metaLabelTexts(container)).toEqual([
      "Season",
      "Episode",
      "Category",
    ]);
  });
});
