import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedItem } from "../../../../src/types/types";
import {
  buildArticleTemplateValues,
  itemTagNames,
  resolveSavedArticleDate,
  type ArticleTemplateInputs,
} from "../../../../src/services/article-template/template-values";

const PUB = new Date("2024-04-21T12:00:00Z");

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Title",
    link: "https://example.com/a",
    description: "<p>Blurb</p>",
    pubDate: PUB.toISOString(),
    guid: "g-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    ...overrides,
  };
}

function inputs(
  overrides: Partial<ArticleTemplateInputs> = {},
): ArticleTemplateInputs {
  return {
    articleDate: PUB,
    now: new Date(2026, 7, 29, 14, 45, 0),
    tagNames: [],
    image: "",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildArticleTemplateValues", () => {
  it("takes the item's text fields as they are, with an empty author and summary when missing", () => {
    const values = buildArticleTemplateValues(
      createItem({ author: undefined, summary: undefined }),
      inputs(),
    );

    expect(values).toMatchObject({
      title: "Title",
      link: "https://example.com/a",
      author: "",
      source: "Feed",
      feedTitle: "Feed",
      summary: "",
      guid: "g-1",
    });
  });

  it("joins the tag names with a comma and a space, and takes the image it is given", () => {
    const values = buildArticleTemplateValues(
      createItem(),
      inputs({
        tagNames: ["News", "Tech"],
        image: "https://img.example/a.png",
      }),
    );

    expect(values.tags).toBe("News, Tech");
    expect(values.image).toBe("https://img.example/a.png");
  });

  it("writes the article date in the long format", () => {
    const values = buildArticleTemplateValues(createItem(), inputs());

    // toLocaleDateString depends on environment, but we expect the long format
    expect(values.date).toContain("April 21, 2024");
  });

  it("writes {{dateShort}} as YYYY-MM-DD and both ISO variables as the ISO string", () => {
    const values = buildArticleTemplateValues(createItem(), inputs());

    expect(values.dateShort).toBe("2024-04-21");
    expect(values.isoDate).toBe("2024-04-21T12:00:00.000Z");
    expect(values.isoDateTime).toBe("2024-04-21T12:00:00.000Z");
    expect(values.articleDate).toBe(PUB);
  });

  it("writes the save date and times from the local time of the save", () => {
    const values = buildArticleTemplateValues(createItem(), inputs());

    expect(values.saveDate).toBe("2026-08-29");
    expect(values.saveTime12).toBe("02:45 PM");
    expect(values.saveTime24).toBe("14:45");
    expect(values.saveDateLong).toBe("August 29, 2026");
  });

  it("writes {{firstSeen}} from firstSeenMs when the item has it", () => {
    const values = buildArticleTemplateValues(
      createItem({ firstSeenMs: Date.parse("2024-05-01T12:00:00Z") }),
      inputs(),
    );

    expect(values.firstSeen).toBe("May 1, 2024");
  });

  it("falls back to the article date for {{firstSeen}} when the item has no firstSeenMs", () => {
    const values = buildArticleTemplateValues(createItem(), inputs());

    expect(values.firstSeen).toBe("April 21, 2024");
  });

  it("treats firstSeenMs of 0 (epoch) as provided rather than falling back", () => {
    const values = buildArticleTemplateValues(
      createItem({ firstSeenMs: 0 }),
      inputs(),
    );

    // Not "April 21, 2024" (the article date) — epoch 0 must not fall through
    // to the fallback. Exact day/month can shift by timezone, so assert the
    // epoch year rather than a hardcoded locale-formatted string.
    expect(values.firstSeen).toMatch(/December 31, 1969|January 1, 1970/);
  });
});

describe("buildArticleTemplateValues description, excerpt and author (#247 slice 6)", () => {
  const LONG =
    "The council approved the harbor budget after a long and tense session";

  it("fills {{description}} from the stored publisherDescription and leaves the excerpt empty", () => {
    const values = buildArticleTemplateValues(
      createItem({ publisherDescription: LONG, description: "<p>x</p>" }),
      inputs(),
    );
    expect(values.description).toBe(LONG);
    expect(values.excerpt).toBe("");
  });

  it("falls back to the guarded feed blurb for {{description}}", () => {
    const values = buildArticleTemplateValues(
      createItem({ description: `<p>${LONG}</p>` }),
      inputs(),
    );
    expect(values.description).toBe(LONG);
    expect(values.excerpt).toBe("");
  });

  it("uses the excerpt tier when the blurb is too short to be a description", () => {
    const values = buildArticleTemplateValues(
      createItem({ description: "<p>Short blurb</p>" }),
      inputs(),
    );
    expect(values.description).toBe("");
    expect(values.excerpt).toBe("Short blurb");
  });

  it("strips a feed footer from the blurb", () => {
    const values = buildArticleTemplateValues(
      createItem({
        title: "Harbor budget approved",
        description: `<p>${LONG}</p><p>The post <a href="https://x.test">Harbor budget approved</a> appeared first on <a href="https://x.test">Blog</a>.</p>`,
      }),
      inputs(),
    );
    expect(values.description).toBe(LONG);
  });

  it("leaves {{summary}} exactly as the item stores it", () => {
    const values = buildArticleTemplateValues(
      createItem({ summary: "Stored summary", publisherDescription: LONG }),
      inputs(),
    );
    expect(values.summary).toBe("Stored summary");
  });

  it("writes {{author}} from the cleaned authors list when the item has one", () => {
    const values = buildArticleTemplateValues(
      createItem({
        author: "Jane Doe in Paris",
        authors: ["Jane Doe", "Sam Roe"],
      }),
      inputs(),
    );
    expect(values.author).toBe("Jane Doe, Sam Roe");
  });

  it("keeps the author string for an item with no authors list", () => {
    expect(
      buildArticleTemplateValues(createItem({ author: "Old Author" }), inputs())
        .author,
    ).toBe("Old Author");
  });
});

describe("resolveSavedArticleDate", () => {
  it("uses the item's pubDate when it parses", () => {
    expect(resolveSavedArticleDate(createItem(), false)).toEqual(PUB);
  });

  it("uses firstSeenMs for an unparseable pubDate only when the fallback is enabled", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-31T12:00:00Z");
    vi.setSystemTime(now);
    const item = createItem({
      pubDate: "not-a-date",
      firstSeenMs: Date.parse("2024-05-01T12:00:00Z"),
    });

    expect(resolveSavedArticleDate(item, true).toISOString()).toBe(
      "2024-05-01T12:00:00.000Z",
    );
    expect(resolveSavedArticleDate(item, false)).toEqual(now);
  });
});

describe("itemTagNames", () => {
  it("lists the item's tag names in order, skipping blank ones", () => {
    const item = createItem({
      tags: [
        { name: " news ", color: "#e74c3c" },
        { name: "  ", color: "#000000" },
        { name: "Tech", color: "#3498db" },
      ],
    });

    expect(itemTagNames(item)).toEqual([" news ", "Tech"]);
  });

  it("returns no names for an item without tags", () => {
    expect(itemTagNames(createItem({ tags: undefined }))).toEqual([]);
  });
});
