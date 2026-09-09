import { afterEach, describe, expect, it, vi } from "vitest";
import {
  escapeFreshRssCategorySegment,
  generateFreshRssSubscriptionOpml,
} from "../../../src/services/freshrss-opml-export";
import type { Feed } from "../../../src/types/types";

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed",
    url: "https://example.com/rss.xml",
    folder: "",
    items: [],
    lastUpdated: 0,
    ...overrides,
  };
}

function parseOpml(opml: string): Document {
  const doc = new DOMParser().parseFromString(opml, "text/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

/** Feed outlines are any outline element carrying an `xmlUrl`. */
function feedOutlines(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagName("outline")).filter((el) =>
    el.hasAttribute("xmlUrl"),
  );
}

/** Category outlines are outline elements with no `xmlUrl` (folder wrappers). */
function categoryOutlines(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagName("outline")).filter(
    (el) => !el.hasAttribute("xmlUrl"),
  );
}

describe("generateFreshRssSubscriptionOpml", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces valid, parseable UTF-8 OPML 2.0", () => {
    const { opml } = generateFreshRssSubscriptionOpml([createFeed()]);

    expect(opml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(opml).toContain('<opml version="2.0">');
    parseOpml(opml);
  });

  it("handles an empty feed list", () => {
    const { opml, warnings } = generateFreshRssSubscriptionOpml([]);

    const doc = parseOpml(opml);
    expect(doc.getElementsByTagName("outline")).toHaveLength(0);
    expect(warnings).toEqual([]);
  });

  it("gives every feed outline text, title, type=rss, and the exact xmlUrl", () => {
    const feed = createFeed({
      title: "Example feed",
      url: "https://example.test/feed.xml?a=1&b=2",
    });
    const { opml } = generateFreshRssSubscriptionOpml([feed]);

    const doc = parseOpml(opml);
    const [outline] = feedOutlines(doc);
    expect(outline.getAttribute("text")).toBe("Example feed");
    expect(outline.getAttribute("title")).toBe("Example feed");
    expect(outline.getAttribute("type")).toBe("rss");
    expect(outline.getAttribute("xmlUrl")).toBe(
      "https://example.test/feed.xml?a=1&b=2",
    );
  });

  it("includes htmlUrl only when the feed has a reliable siteUrl", () => {
    const withSite = createFeed({
      title: "Has site",
      url: "https://a.example.com/rss.xml",
      siteUrl: "https://a.example.com",
    });
    const withoutSite = createFeed({
      title: "No site",
      url: "https://b.example.com/rss.xml",
    });

    const { opml } = generateFreshRssSubscriptionOpml([withSite, withoutSite]);
    const doc = parseOpml(opml);
    const outlines = feedOutlines(doc);

    const hasSiteOutline = outlines.find((o) => o.getAttribute("text") === "Has site");
    const noSiteOutline = outlines.find((o) => o.getAttribute("text") === "No site");

    expect(hasSiteOutline?.getAttribute("htmlUrl")).toBe("https://a.example.com");
    expect(noSiteOutline?.hasAttribute("htmlUrl")).toBe(false);
  });

  it("never fabricates a description attribute", () => {
    const { opml } = generateFreshRssSubscriptionOpml([createFeed()]);
    expect(opml).not.toContain("description=");
  });

  it("places uncategorized feeds directly under the OPML body", () => {
    const feed = createFeed({ title: "Direct feed", folder: "" });
    const { opml } = generateFreshRssSubscriptionOpml([feed]);

    const doc = parseOpml(opml);
    const [outline] = feedOutlines(doc);
    expect(outline.parentElement?.tagName.toLowerCase()).toBe("body");
  });

  it("treats the literal 'Uncategorized' folder value the same as no folder", () => {
    const feed = createFeed({ title: "Direct feed", folder: "Uncategorized" });
    const { opml } = generateFreshRssSubscriptionOpml([feed]);

    const doc = parseOpml(opml);
    const [outline] = feedOutlines(doc);
    expect(outline.parentElement?.tagName.toLowerCase()).toBe("body");
    expect(categoryOutlines(doc)).toHaveLength(0);
  });

  it("projects a nested folder path into one flat category outline", () => {
    const feed = createFeed({ title: "Nested feed", folder: "Tech/AI/Blogs" });
    const { opml } = generateFreshRssSubscriptionOpml([feed]);

    const doc = parseOpml(opml);
    const categories = categoryOutlines(doc);
    expect(categories).toHaveLength(1);
    expect(categories[0].getAttribute("text")).toBe("Tech/AI/Blogs");
    expect(categories[0].getAttribute("title")).toBe("Tech/AI/Blogs");

    // Exactly one level of nesting: the feed outline is a direct child of
    // the single category outline, not further nested.
    const feedOutline = feedOutlines(doc)[0];
    expect(feedOutline.parentElement).toBe(categories[0]);
    expect(categories[0].parentElement?.tagName.toLowerCase()).toBe("body");
  });

  it("escapes '%' before '/' within each folder segment so the introduced '%' is not re-escaped", () => {
    const feed = createFeed({
      title: "Escaped feed",
      folder: "100% Done/A/B Team",
    });
    const { opml } = generateFreshRssSubscriptionOpml([feed]);

    const doc = parseOpml(opml);
    const categories = categoryOutlines(doc);
    expect(categories).toHaveLength(1);
    // "100% Done" -> "100%25 Done", "A" -> "A", "B/Team"-free segment "B Team" unchanged,
    // joined with a literal "/" between the projected segments.
    expect(categories[0].getAttribute("text")).toBe("100%25 Done/A/B Team");
  });

  it("escapes multiple folder segments with '%' and joins them with a literal '/'", () => {
    const feed = createFeed({ title: "Percent feed", folder: "50%/100%" });
    const { opml } = generateFreshRssSubscriptionOpml([feed]);
    const doc = parseOpml(opml);
    const [category] = categoryOutlines(doc);

    expect(category.getAttribute("text")).toBe("50%25/100%25");
  });

  describe("escapeFreshRssCategorySegment", () => {
    it("escapes '%' to '%25'", () => {
      expect(escapeFreshRssCategorySegment("100% done")).toBe("100%25 done");
    });

    it("escapes '/' to '%2F'", () => {
      expect(escapeFreshRssCategorySegment("A/B")).toBe("A%2FB");
    });

    it("escapes '%' before '/' so the '%' introduced by escaping '/' is not re-escaped", () => {
      // If "/" were escaped first, the "%" introduced by "%2F" would then
      // be escaped a second time into "%252F". Escaping "%" first avoids
      // that: only the original "%" becomes "%25", and the "/" becomes a
      // clean, single "%2F".
      expect(escapeFreshRssCategorySegment("50%/off")).toBe("50%25%2Foff");
      expect(escapeFreshRssCategorySegment("50%/off")).not.toContain("%252F");
    });
  });

  it("collapses identical feed URLs deterministically, keeping the first in stable dashboard order and warning about every collapse", () => {
    const first = createFeed({
      title: "First entry",
      url: "https://dup.example.com/rss.xml",
      folder: "A",
    });
    const second = createFeed({
      title: "Second entry",
      url: "https://dup.example.com/rss.xml",
      folder: "B",
    });
    const third = createFeed({
      title: "Third entry",
      url: "https://dup.example.com/rss.xml",
      folder: "C",
    });

    const { opml, warnings } = generateFreshRssSubscriptionOpml([
      first,
      second,
      third,
    ]);

    const doc = parseOpml(opml);
    const outlines = feedOutlines(doc);
    expect(outlines).toHaveLength(1);
    expect(outlines[0].getAttribute("text")).toBe("First entry");

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("Second entry");
    expect(warnings[0]).toContain("First entry");
    expect(warnings[0]).toContain("https://dup.example.com/rss.xml");
    expect(warnings[1]).toContain("Third entry");
    expect(warnings[1]).toContain("First entry");
  });

  it("escapes XML metacharacters in titles, URLs, and categories without altering the underlying value after parsing", () => {
    const feed = createFeed({
      title: `Tom & Jerry's "Show" <Live>`,
      url: "https://example.com/rss.xml?a=1&b=2",
      folder: `Cats & Dogs/"Fun" <Stuff>`,
      siteUrl: "https://example.com/?ref=a&b",
    });

    const { opml } = generateFreshRssSubscriptionOpml([feed]);

    // The raw XML text must contain escaped entities, not raw metacharacters
    // inside attribute values.
    expect(opml).toContain("&amp;");
    expect(opml).toContain("&lt;");
    expect(opml).toContain("&gt;");
    expect(opml).toContain("&quot;");
    expect(opml).toContain("&apos;");

    const doc = parseOpml(opml);
    const [outline] = feedOutlines(doc);
    // After parsing (which XML-unescapes), the values round-trip exactly.
    expect(outline.getAttribute("text")).toBe(`Tom & Jerry's "Show" <Live>`);
    expect(outline.getAttribute("title")).toBe(`Tom & Jerry's "Show" <Live>`);
    expect(outline.getAttribute("xmlUrl")).toBe(
      "https://example.com/rss.xml?a=1&b=2",
    );
    expect(outline.getAttribute("htmlUrl")).toBe("https://example.com/?ref=a&b");

    const [category] = categoryOutlines(doc);
    expect(category.getAttribute("text")).toBe(`Cats & Dogs/"Fun" <Stuff>`);
  });

  it("never includes credentials, session, token, settings, sidecar, article, tag, label, or frss:* data even when present on the source feed", () => {
    const feed = createFeed({
      title: "Feed with extra state",
      url: "https://example.com/rss.xml",
      folder: "News",
      customTags: ["personal-tag", "do-not-export"],
      customTemplate: "secret-template",
      customFolder: "secret-folder",
      author: "Reliable author field",
      items: [
        {
          title: "Article title",
          link: "https://example.com/article",
          description: "Secret article body",
          pubDate: "2026-01-01",
          guid: "guid-1",
          read: true,
          starred: true,
          feedTitle: "Feed with extra state",
          feedUrl: "https://example.com/rss.xml",
          coverImage: "",
          content: "Full secret article content",
        },
      ],
    });

    const { opml } = generateFreshRssSubscriptionOpml([feed]);

    const forbiddenSubstrings = [
      "personal-tag",
      "do-not-export",
      "secret-template",
      "secret-folder",
      "Secret article body",
      "Full secret article content",
      "Article title",
      "guid-1",
      "frss:",
      "read=",
      "starred=",
      "credential",
      "token",
      "session",
    ];

    for (const forbidden of forbiddenSubstrings) {
      expect(opml).not.toContain(forbidden);
    }
  });

  it("does not change OpmlManager.generateOpml, the generic RSS Dashboard exporter", async () => {
    const { OpmlManager } = await import("../../../src/services/opml-manager");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T00:00:00.000Z"));

    const feeds: Feed[] = [
      createFeed({
        title: "Generic feed",
        url: "https://generic.example.com/rss.xml",
        folder: "Uncategorized",
      }),
    ];

    const opml = OpmlManager.generateOpml(feeds, []);
    expect(opml).toContain("<title>RSS dashboard feeds</title>");
    expect(opml).toContain(
      '<outline text="Generic feed" title="Generic feed" type="rss" xmlUrl="https://generic.example.com/rss.xml" category="Uncategorized"/>',
    );
  });
});
