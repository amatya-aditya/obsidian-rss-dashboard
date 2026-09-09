/**
 * Single source of truth for the deterministic FreshRSS Docker-contract
 * fixture data. Both the fixture HTTP server's own tests
 * (`fixture-server.test.mjs`) and the live contract runner
 * (`run-contract.mjs`) import this module so the "what we served" and "what
 * we expect FreshRSS to have ingested" descriptions can never drift apart.
 *
 * Every identity here is a stable *logical* fixture key ("feed-a",
 * "article-a1", ...). None of it is an opaque FreshRSS-assigned ID —
 * FreshRSS's own subscription/stream/tag/article IDs are discovered at
 * contract-run time from FreshRSS's responses and are never hardcoded here,
 * per the ticket's "stable logical fixture identities stay distinct from
 * every opaque remote ... ID" requirement.
 */

/** @typedef {{ logicalId: string, guid: string, title: string }} FixtureArticle */
/**
 * @typedef {{
 *   logicalId: string,
 *   fileName: string,
 *   format: "rss" | "atom",
 *   title: string,
 *   category: string | null,
 *   articles: FixtureArticle[],
 * }} FixtureFeed
 */

/** @type {FixtureFeed[]} */
export const FIXTURE_FEEDS = [
  {
    logicalId: "feed-a",
    fileName: "feed-a.xml",
    format: "rss",
    title: "Contract Feed A",
    category: "Category A",
    articles: [
      {
        logicalId: "article-a1",
        guid: "https://fixture.test/feed-a/article-1",
        title: "Feed A Article 1",
      },
      {
        logicalId: "article-a2",
        guid: "https://fixture.test/feed-a/article-2",
        title: "Feed A Article 2",
      },
      {
        logicalId: "article-a3",
        guid: "https://fixture.test/feed-a/article-3",
        title: "Feed A Article 3",
      },
    ],
  },
  {
    logicalId: "feed-b",
    fileName: "feed-b.xml",
    format: "atom",
    title: "Contract Feed B",
    category: "Category B",
    articles: [
      {
        logicalId: "article-b1",
        guid: "https://fixture.test/feed-b/article-1",
        title: "Feed B Article 1",
      },
      {
        logicalId: "article-b2",
        guid: "https://fixture.test/feed-b/article-2",
        title: "Feed B Article 2",
      },
    ],
  },
  {
    logicalId: "feed-c",
    fileName: "feed-c.xml",
    format: "rss",
    title: "Contract Feed C",
    category: null,
    articles: [
      {
        logicalId: "article-c1",
        guid: "https://fixture.test/feed-c/article-1",
        title: "Feed C Article 1",
      },
      {
        logicalId: "article-c2",
        guid: "https://fixture.test/feed-c/article-2",
        title: "Feed C Article 2",
      },
    ],
  },
];

export function totalFixtureArticleCount() {
  return FIXTURE_FEEDS.reduce((sum, feed) => sum + feed.articles.length, 0);
}

export function findFixtureFeed(logicalId) {
  const feed = FIXTURE_FEEDS.find((entry) => entry.logicalId === logicalId);
  if (!feed) {
    throw new Error(`Unknown fixture feed logical id: ${logicalId}`);
  }
  return feed;
}
