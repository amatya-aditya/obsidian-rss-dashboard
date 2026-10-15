/**
 * The request headers outbound feed, page and JSON requests send.
 *
 * No request sets a User-Agent. A request that claims `Chrome/…` without the
 * matching `sec-ch-ua`, `sec-ch-ua-mobile` and `sec-ch-ua-platform` headers is
 * read as a bot signal by anti-bot filters, which answer 403 for an address a
 * browser loads normally (#1109). Leaving the header unset lets Obsidian send
 * its own User-Agent instead, on desktop and mobile alike.
 *
 * #1162 audited every call site that reads a feed, a page or a JSON API and
 * found none that needs a User-Agent of its own, so this policy holds for all
 * of them. The full-article fetch in `fetch-helpers.ts` carries the same
 * policy for the same reason; it keeps its own `Accept` and
 * `Accept-Language`.
 *
 * These helpers are the one place the policy lives: a call site spreads the
 * header set for what it is fetching and adds nothing else.
 * `test_files/unit/utils/request-headers.test.ts` fails if a production module
 * hard-codes a User-Agent again.
 */

/** What a feed request accepts: RSS, Atom, RDF and JSON Feed. */
export const FEED_ACCEPT =
  "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8";

/** What a request for an HTML page accepts. */
export const PAGE_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/** What a request for a JSON API accepts. */
export const JSON_ACCEPT = "application/json";

/** Headers for a request that reads a feed. */
export function feedRequestHeaders(): Record<string, string> {
  return { Accept: FEED_ACCEPT };
}

/** Headers for a request that reads an HTML page. */
export function pageRequestHeaders(): Record<string, string> {
  return { Accept: PAGE_ACCEPT };
}

/** Headers for a request that reads a JSON API. */
export function jsonRequestHeaders(): Record<string, string> {
  return { Accept: JSON_ACCEPT };
}
