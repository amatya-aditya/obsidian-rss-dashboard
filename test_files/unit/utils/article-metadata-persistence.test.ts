// Persisted article metadata (#247 slice 4, ADR 0007): the resolved values are
// copied onto flat FeedItem fields once, first-write-wins.
import { describe, expect, it } from "vitest";
import {
  applyArticleMetadata,
  planMetadataWrite,
} from "../../../src/utils/article-metadata-persistence";
import type { RawArticleMetadata } from "../../../src/utils/article-metadata";
import type { FeedItem } from "../../../src/types/types";

const DESCRIPTION =
  "The publisher's own summary of the harbor budget story, written for search results";

function raw(overrides: Partial<RawArticleMetadata> = {}): RawArticleMetadata {
  return {
    metaDescription: "",
    ogDescription: "",
    twitterDescription: "",
    htmlLang: "",
    metaAuthor: "",
    jsonLdAuthors: [],
    microdataAuthors: [],
    relAuthors: [],
    canonicalUrl: "",
    readabilityExcerpt: "",
    ...overrides,
  };
}

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Harbor budget approved",
    link: "https://example.com/a",
    description: "<p>Feed blurb</p>",
    pubDate: "2026-10-01",
    guid: "g1",
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed",
    coverImage: "",
    ...overrides,
  };
}

const ARTICLE = "<p>Completely different opening of the article body.</p>";

describe("planMetadataWrite", () => {
  it("returns the page's resolved fields and a fetch timestamp", () => {
    const update = planMetadataWrite(
      item(),
      raw({
        metaDescription: DESCRIPTION,
        htmlLang: "en_us",
        canonicalUrl: "https://example.com/canonical",
      }),
      ARTICLE,
      1234,
    );
    expect(update).toEqual({
      publisherDescription: DESCRIPTION,
      language: "en-US",
      languageSource: "page",
      canonicalUrl: "https://example.com/canonical",
      metadataFetchedAt: 1234,
    });
  });

  it("omits fields that did not resolve but still stamps the fetch", () => {
    expect(planMetadataWrite(item(), raw(), ARTICLE, 99)).toEqual({
      metadataFetchedAt: 99,
    });
  });

  it("does not persist an excerpt as the description", () => {
    const update = planMetadataWrite(
      item({ description: "" }),
      raw({
        readabilityExcerpt: "An excerpt that is not a description at all",
      }),
      ARTICLE,
      1,
    );
    expect(update?.publisherDescription).toBeUndefined();
  });

  it("falls back to the guarded feed blurb, minus a footer", () => {
    const blurb =
      "The council approved the harbor budget after a long and tense session";
    const update = planMetadataWrite(
      item({
        description: `<p>${blurb}</p><p>The post <a href="https://x.test">Harbor budget approved</a> appeared first on <a href="https://x.test">Blog</a>.</p>`,
      }),
      raw(),
      ARTICLE,
      1,
    );
    expect(update?.publisherDescription).toBe(blurb);
  });

  it("does not persist a description that duplicates the article's opening", () => {
    const update = planMetadataWrite(
      item(),
      raw({ metaDescription: DESCRIPTION }),
      `<p>${DESCRIPTION}. And then the rest of the story.</p>`,
      1,
    );
    expect(update?.publisherDescription).toBeUndefined();
  });

  it("is first-write-wins: nothing once metadataFetchedAt is set", () => {
    expect(
      planMetadataWrite(
        item({ metadataFetchedAt: 5, publisherDescription: "kept" }),
        raw({ metaDescription: DESCRIPTION }),
        ARTICLE,
        10,
      ),
    ).toBeNull();
  });
});

describe("applyArticleMetadata", () => {
  it("writes onto the item, leaves description alone, and returns the update", () => {
    const target = item();
    const update = applyArticleMetadata(
      target,
      raw({ metaDescription: DESCRIPTION }),
      ARTICLE,
      7,
    );
    expect(update?.publisherDescription).toBe(DESCRIPTION);
    expect(target.publisherDescription).toBe(DESCRIPTION);
    expect(target.metadataFetchedAt).toBe(7);
    expect(target.description).toBe("<p>Feed blurb</p>");
  });

  it("does nothing without page metadata", () => {
    const target = item();
    expect(applyArticleMetadata(target, undefined, ARTICLE, 7)).toBeNull();
    expect(target.metadataFetchedAt).toBeUndefined();
  });
});
