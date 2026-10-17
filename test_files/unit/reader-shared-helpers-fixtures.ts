// Shared fixtures for the #1238 reader-helper parity tests. The same fetched
// page and the same broken-image markup are driven through both readers
// (ArticleRenderer and ReaderView), so the constants and the item factory live
// here once instead of in each test file.
import type { FeedItem } from "../../src/types/types";
import type { RawArticleMetadata } from "../../src/utils/article-metadata";

export const LONG_A =
  "The first substantial paragraph of the fetched article runs well past one hundred and twenty characters so it marks the body start.";
export const LONG_B =
  "A second substantial paragraph keeps the fetched article above the two hundred character threshold for meaningful content.";
/** Short feed body that carries no Substack rich-markup marker, so a fetch runs. */
export const SHORT_FEED = "<p>Short RSS body.</p>";

export const PAGE_METADATA: RawArticleMetadata = {
  metaDescription:
    "Unique publisher summary with enough detail to pass the description guard.",
  ogDescription: "",
  twitterDescription: "",
  htmlLang: "en",
  metaAuthor: "Ada Author",
  jsonLdAuthors: [],
  microdataAuthors: [],
  relAuthors: [],
  ogImage: "",
  twitterImage: "",
  readabilityExcerpt: "",
  canonicalUrl: "https://example.com/canonical",
};

export const IMAGE_ORIGINAL =
  "https://substack-post-media.s3.amazonaws.com/public/images/abc.png";
export const IMAGE_WRAPPED = `https://substackcdn.com/image/fetch/w_1456,c_limit/${encodeURIComponent(
  IMAGE_ORIGINAL,
)}`;

export function makeSharedHelpersItem(
  overrides: Partial<FeedItem> = {},
): FeedItem {
  return {
    title: "Feed title",
    link: "https://example.com/article",
    description: "",
    content: SHORT_FEED,
    pubDate: "2026-01-01T00:00:00Z",
    guid: "reader-shared-helpers",
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
