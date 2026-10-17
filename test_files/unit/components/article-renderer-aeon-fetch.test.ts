// Regression coverage for the inline reader (ArticleRenderer) on the Aeon feed.
//
// The dedicated reader has the same regression test in
// test_files/unit/views/reader-view-aeon-fetch.test.ts. Both readers carried
// the same hidden preferred-host list, so both need the same guard (#1287).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  DEFAULT_SETTINGS,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => ({
  ...(await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch")),
  fetchFullArticleContentWithOutcome: fetchMock,
}));

installObsidianDomPolyfills();

// The real shape of an Aeon feed item's <description> (feed.rss, 2026-10-16):
// a lead image, a one-sentence blurb, and a "Read on Aeon" link.
const AEON_FEED_TEASER =
  '<p><img src="https://images.aeonmedia.co/images/x/hero.jpg?width=1200" /></p>' +
  "<p>Cicero’s ideal of manly virtue stressed the performance of self-control and bravery</p>" +
  "<p><em>- by Catharine Edwards</em></p>" +
  '<p><a href="https://aeon.co/essays/the-politics-of-masculinity">Read on Aeon</a></p>';

function makeAeonItem(): FeedItem {
  return {
    title: "How to be a (Roman) man",
    link: "https://aeon.co/essays/the-politics-of-masculinity-at-the-end-of-the-roman-republic",
    description: AEON_FEED_TEASER,
    content: "",
    pubDate: "2026-10-16T10:00:00Z",
    guid: "urn:id:9148",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Aeon | a world of ideas",
    feedUrl: "https://aeon.co/feed.rss",
    coverImage: "",
    mediaType: "article",
    saved: false,
  };
}

describe("ArticleRenderer Aeon feed full-article fetch", () => {
  let container: HTMLElement;

  beforeEach(() => {
    fetchMock.mockReset();
    document.body.empty();
    container = document.body.createDiv();
  });

  afterEach(() => {
    document.body.empty();
  });

  it("attempts the full-article fetch for an Aeon essay, direct (no proxy)", async () => {
    fetchMock.mockResolvedValue({
      content: `<p>${"Full essay body text. ".repeat(40)}</p>`,
      failureType: "none",
    });
    const item = makeAeonItem();
    const renderer = new ArticleRenderer({
      app: {
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        vault: { getAbstractFileByPath: vi.fn() },
      } as never,
      component: new Component(),
      settings: {
        ...DEFAULT_SETTINGS,
        corsProxyEnabled: false,
      } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });

    await renderer.render(container, item);

    expect(fetchMock).toHaveBeenCalledWith(
      item.link,
      undefined,
      expect.any(Number),
    );
  });
});
