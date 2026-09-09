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
 *
 * Ticket 12 (state mutation + OPML contract) extends this fixture set with
 * two more feeds, both still deterministic logical fixtures under the same
 * rule above:
 *
 * - `feed-d` is seeded at container boot (via `seed-subscriptions.opml`,
 *   same as feed-a/b/c) and exists specifically to exercise read/unread,
 *   starred/unstarred, and mapped-label-membership mutations against
 *   distinct control articles, plus a deeper (3-page) item-ID pagination
 *   than feed-a alone exercised under ticket 11.
 * - `feed-e` (exported as `OPML_ROUND_TRIP_FEED`, not part of
 *   `FIXTURE_FEEDS`) is deliberately *not* seeded at boot. It exists only so
 *   the OPML round-trip scenario has a feed that FreshRSS does not already
 *   know about: the scenario exports it from a synthetic RSS-Dashboard
 *   subscription list through the real `generateFreshRssSubscriptionOpml`
 *   production function, imports that OPML into the running FreshRSS
 *   instance mid-run, and confirms FreshRSS's own re-exported OPML reflects
 *   it. `ALL_SERVED_FEEDS` (the union) is what the fixture HTTP server
 *   actually serves, so feed-e is reachable the moment the OPML scenario
 *   needs it, without being part of the initial seed.
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
  {
    logicalId: "feed-d",
    fileName: "feed-d.xml",
    format: "rss",
    title: "Contract Feed D",
    category: null,
    // Five articles: enough for a 3-page item-ID enumeration at n=2 (2, 2, 1)
    // -- a deeper pagination than feed-a's single-continuation case -- and
    // enough distinct articles to give each state-mutation scenario (read,
    // starred, mapped label) its own control article that is never touched
    // by any of the others, so "X is set" and "Y was never set" can both be
    // observed from the same feed.
    articles: [
      {
        logicalId: "article-d1",
        guid: "https://fixture.test/feed-d/article-1",
        title: "Feed D Article 1",
      },
      {
        logicalId: "article-d2",
        guid: "https://fixture.test/feed-d/article-2",
        title: "Feed D Article 2",
      },
      {
        logicalId: "article-d3",
        guid: "https://fixture.test/feed-d/article-3",
        title: "Feed D Article 3",
      },
      {
        logicalId: "article-d4",
        guid: "https://fixture.test/feed-d/article-4",
        title: "Feed D Article 4",
      },
      {
        logicalId: "article-d5",
        guid: "https://fixture.test/feed-d/article-5",
        title: "Feed D Article 5",
      },
    ],
  },
];

/**
 * Ticket 12's OPML round-trip fixture. Deliberately excluded from
 * `FIXTURE_FEEDS` (and therefore from `seed-subscriptions.opml`, and from
 * every "is this feed seeded at boot" check in `run-contract.mjs`) so the
 * OPML scenario has a feed FreshRSS has never seen before it imports the
 * dashboard-generated OPML mid-run. See the module doc comment above.
 */
export const OPML_ROUND_TRIP_FEED = {
  logicalId: "feed-e",
  fileName: "feed-e.xml",
  format: "rss",
  title: "Contract Feed E",
  category: "Category E",
  articles: [
    {
      logicalId: "article-e1",
      guid: "https://fixture.test/feed-e/article-1",
      title: "Feed E Article 1",
    },
  ],
};

/**
 * Every feed the fixture HTTP server serves, whether or not it is seeded at
 * FreshRSS container boot. `fixture-server.mjs` builds its routes from this
 * union so `feed-e.xml` is reachable the moment the OPML scenario needs it.
 */
export const ALL_SERVED_FEEDS = [...FIXTURE_FEEDS, OPML_ROUND_TRIP_FEED];

export function totalFixtureArticleCount() {
  return FIXTURE_FEEDS.reduce((sum, feed) => sum + feed.articles.length, 0);
}

export function findFixtureFeed(logicalId) {
  const feed = ALL_SERVED_FEEDS.find((entry) => entry.logicalId === logicalId);
  if (!feed) {
    throw new Error(`Unknown fixture feed logical id: ${logicalId}`);
  }
  return feed;
}
