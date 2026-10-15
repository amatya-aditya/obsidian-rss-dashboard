import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFeedXml } from "../../../../src/services/feed-parser/feed-fetch.js";
import {
  ACCEPT_ALL,
  DIRECT,
  cancelOn,
  feedXml,
  last,
  plainPage,
  requestsFor,
  serve,
  windows1251Feed,
  wpPage,
} from "./helpers/feed-fetch-serve.js";

// The WordPress/PHP fallback in `tryFetch`: a page that is not a feed but says
// it is PHP or WordPress sends the fetch through a fixed list of alternative
// addresses, then through discovery, then gives up. Cases run with the proxy
// chain off unless they say otherwise.

const BASE = "https://example.com/blog";
const SITE = `${BASE}/feed/`;
const SITE_HTTP = "http://example.com/blog/feed/";
const ALL_FAILED =
  "All alternative feed URLs failed, received PHP file instead of RSS feed";
const NOT_A_FEED = "Not a valid RSS/Atom feed";

const ALTERNATIVES = [
  `${BASE}/feed/rss/`,
  `${BASE}/feed/rss2/`,
  `${BASE}/feed/atom/`,
  `${BASE}/rss/`,
  `${BASE}/rss.xml`,
  `${BASE}/feed.xml`,
  `${BASE}/index.php/feed/`,
  `${BASE}/?feed=rss2`,
  `${BASE}/?feed=rss`,
  `${BASE}/?feed=atom`,
  `${BASE}/wp-feed.php`,
  `${BASE}/feed/feed/`,
  `${BASE}/feed/rdf/`,
  `${BASE}/?feed=rss2&paged=1`,
  `${BASE}/?feed=rss&paged=1`,
  `${BASE}/feed`,
  `${BASE}/rss`,
  `${BASE}/index.rss`,
  `${BASE}/index.xml`,
  `${BASE}/index.php?feed=rss2`,
  `${BASE}/index.php?feed=rss`,
  `${BASE}/index.php?feed=atom`,
];

describe("the WordPress fallback in fetchFeedXml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("when it starts", () => {
    it.each([
      ["a PHP opening tag", "<html><?php echo 1; ?></html>"],
      ["the word WordPress", "<html>Powered by WordPress</html>"],
      ["wp-blog-header.php", "<html>require wp-blog-header.php</html>"],
    ])("starts for a page that holds %s", async (_label, page) => {
      const served = serve({ [SITE]: page });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
      expect(served.requested).toContain(ALTERNATIVES[0]);
    });

    it("does not start for a page that is neither PHP nor WordPress", async () => {
      const served = serve({ [SITE]: plainPage("hello") });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: NOT_A_FEED,
      });
      expect(served.requested).toEqual([SITE, SITE_HTTP]);
    });

    it("matches the word WordPress by case", async () => {
      const served = serve({ [SITE]: plainPage("wordpress") });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: NOT_A_FEED,
      });
      expect(served.requested).toEqual([SITE, SITE_HTTP]);
    });
  });

  describe("the alternative addresses", () => {
    it("asks for 22 alternatives in a fixed order after the page and its other scheme", async () => {
      const served = serve({ [SITE]: wpPage() });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
      expect(served.requested.slice(0, 2)).toEqual([SITE, SITE_HTTP]);
      expect(served.requested.slice(2, 2 + ALTERNATIVES.length)).toEqual(
        ALTERNATIVES,
      );
    });

    it("then reads the site's own address once for discovery and stops", async () => {
      const served = serve({ [SITE]: wpPage() });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
      expect(served.requested.slice(2 + ALTERNATIVES.length)).toEqual([BASE]);
    });

    it("builds the alternatives from the address without a trailing /feed", async () => {
      const served = serve({ [`${BASE}/feed`]: wpPage() });
      await expect(fetchFeedXml(`${BASE}/feed`, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
      expect(served.requested[2]).toBe(`${BASE}/feed/rss/`);
    });

    it("keeps an address that does not end in /feed whole", async () => {
      const page = "https://example.com/blog/index.php";
      const served = serve({ [page]: wpPage() });
      await expect(fetchFeedXml(page, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
      expect(served.requested[2]).toBe(`${page}/feed/rss/`);
    });

    it("keeps a /feed that is not at the very end", async () => {
      const page = "https://example.com/feed/archive";
      const served = serve({ [page]: wpPage() });
      await expect(fetchFeedXml(page, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
      expect(served.requested[2]).toBe(`${page}/feed/rss/`);
    });

    it("asks for each alternative with the feed Accept header and no User-Agent", async () => {
      const served = serve({ [SITE]: wpPage() });
      await fetchFeedXml(SITE, DIRECT).catch(() => undefined);
      expect(served.requests[2]).toEqual({
        url: ALTERNATIVES[0],
        method: "GET",
        headers: { Accept: ACCEPT_ALL },
      });
    });

    it("returns the first alternative that is a feed and asks for no more", async () => {
      const served = serve({
        [SITE]: wpPage(),
        [ALTERNATIVES[3]]: feedXml("Fourth"),
        [ALTERNATIVES[5]]: feedXml("Sixth"),
      });
      expect(await fetchFeedXml(SITE, DIRECT)).toBe(feedXml("Fourth"));
      expect(served.requested).toEqual([
        SITE,
        SITE_HTTP,
        ...ALTERNATIVES.slice(0, 4),
      ]);
    });

    it("skips an alternative that answers with something else, empty, or an error", async () => {
      const served = serve({
        [SITE]: wpPage(),
        [ALTERNATIVES[0]]: plainPage("nope"),
        [ALTERNATIVES[1]]: "",
        [ALTERNATIVES[2]]: new Error("down"),
        [ALTERNATIVES[3]]: feedXml("Fourth"),
      });
      expect(await fetchFeedXml(SITE, DIRECT)).toBe(feedXml("Fourth"));
      expect(served.requested.slice(2)).toEqual(ALTERNATIVES.slice(0, 4));
    });

    it("reaches the last alternative when none before it is a feed", async () => {
      serve({ [SITE]: wpPage(), [ALTERNATIVES[21]]: feedXml("Last") });
      expect(await fetchFeedXml(SITE, DIRECT)).toBe(feedXml("Last"));
    });

    it("decodes each alternative with the caller's encoding override", async () => {
      serve({ [SITE]: wpPage(), [ALTERNATIVES[0]]: windows1251Feed() });
      expect(
        await fetchFeedXml(SITE, DIRECT, undefined, "windows-1251"),
      ).toContain("Привет");
    });

    it("stops and throws when cancelled while an alternative is requested", async () => {
      const controller = new AbortController();
      const served = serve(
        { [SITE]: wpPage() },
        cancelOn(controller, ALTERNATIVES[2]),
      );
      await expect(
        fetchFeedXml(SITE, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested.slice(2)).toEqual(ALTERNATIVES.slice(0, 3));
    });

    it("throws that it timed out when cancelled during the last alternative", async () => {
      // #1116: the abort lands during the final request, after the last
      // pre-request check, so the sequence re-checks before giving up.
      const controller = new AbortController();
      const served = serve(
        { [SITE]: wpPage() },
        cancelOn(controller, ALTERNATIVES[21]),
      );
      await expect(
        fetchFeedXml(SITE, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(last(served.requested)).toBe(ALTERNATIVES[21]);
    });
  });

  describe("the discovered address", () => {
    const FOUND = "https://example.com/blog/found.xml";

    function pageWithLink(): string {
      return wpPage(
        `<link rel="alternate" type="application/rss+xml" href="${FOUND}">`,
      );
    }

    it("asks for the address discovery names, after the alternatives, with a feed Accept header", async () => {
      const served = serve({
        [SITE]: wpPage(),
        [BASE]: pageWithLink(),
        [FOUND]: feedXml("Found"),
      });
      expect(await fetchFeedXml(SITE, DIRECT)).toBe(feedXml("Found"));
      const lastRequest = last(served.requests);
      expect(lastRequest).toEqual({
        url: FOUND,
        method: "GET",
        headers: {
          Accept: ACCEPT_ALL,
        },
      });
      expect(served.requested.slice(-2)).toEqual([BASE, FOUND]);
    });

    it("gives up when the discovered address is not a feed", async () => {
      serve({
        [SITE]: wpPage(),
        [BASE]: pageWithLink(),
        [FOUND]: plainPage("nope"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
    });

    it("gives up when the discovered address comes back empty", async () => {
      serve({ [SITE]: wpPage(), [BASE]: pageWithLink(), [FOUND]: "" });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
    });

    it("gives up when the request for the discovered address fails", async () => {
      serve({
        [SITE]: wpPage(),
        [BASE]: pageWithLink(),
        [FOUND]: new Error("down"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
    });

    it("decodes the discovered feed with the caller's encoding override", async () => {
      serve({
        [SITE]: wpPage(),
        [BASE]: pageWithLink(),
        [FOUND]: windows1251Feed(),
      });
      expect(
        await fetchFeedXml(SITE, DIRECT, undefined, "windows-1251"),
      ).toContain("Привет");
    });

    it("throws instead of fetching the discovered address when cancelled while discovery found it", async () => {
      // A FeedBurner page: discovery's candidate probe answers, and the abort
      // lands during that request, so the next check is the one before the
      // discovered address.
      const fb = "https://feeds.feedburner.com/show";
      const page = `${fb}/page`;
      const probe = `${fb}?format=xml`;
      const controller = new AbortController();
      const served = serve(
        { [page]: wpPage(), [probe]: [new Error("down"), feedXml("Probe")] },
        cancelOn(controller, probe, 2),
      );
      await expect(
        fetchFeedXml(page, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(requestsFor(served, probe)).toHaveLength(2);
    });

    it("throws that it timed out when cancelled during the discovery page", async () => {
      // #1116: the abort lands during the discovery page, so discovery finds
      // nothing. The WordPress step re-checks before reporting that every
      // alternative failed.
      const controller = new AbortController();
      const served = serve({ [SITE]: wpPage() }, cancelOn(controller, BASE));
      await expect(
        fetchFeedXml(SITE, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(last(served.requested)).toBe(BASE);
    });
  });

  describe("an arXiv address", () => {
    const EXPORT = "https://export.arxiv.org/api/query?search_query=cat";
    const RSS = "https://rss.arxiv.org/api/query?search_query=cat";

    it("asks for the rss.arxiv.org twin once discovery finds nothing, and returns it", async () => {
      const served = serve({ [EXPORT]: wpPage(), [RSS]: feedXml("arXiv") });
      expect(await fetchFeedXml(EXPORT, DIRECT)).toBe(feedXml("arXiv"));
      expect(last(served.requests)).toEqual({
        url: RSS,
        method: "GET",
        headers: {
          Accept: ACCEPT_ALL,
        },
      });
    });

    it("prefers what discovery finds over the twin", async () => {
      const found = "https://export.arxiv.org/found.xml";
      const served = serve({
        [EXPORT]: wpPage(
          `<link rel="alternate" type="application/rss+xml" href="${found}">`,
        ),
        [found]: feedXml("Found"),
        [RSS]: feedXml("Twin"),
      });
      expect(await fetchFeedXml(EXPORT, DIRECT)).toBe(feedXml("Found"));
      expect(served.requested).not.toContain(RSS);
    });

    it("gives up when the twin is not a feed", async () => {
      serve({ [EXPORT]: wpPage(), [RSS]: plainPage("nope") });
      await expect(fetchFeedXml(EXPORT, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
    });
  });

  describe("which error the caller sees", () => {
    it("is the all-alternatives-failed error when the chain is off", async () => {
      serve({ [SITE]: wpPage() });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toMatchObject({
        message: ALL_FAILED,
      });
    });

    it("is replaced by the proxy chain's own when the chain is on", async () => {
      serve({ [SITE]: wpPage() });
      await expect(fetchFeedXml(SITE, true)).rejects.toMatchObject({
        message: `Could not fetch a valid RSS/Atom feed from ${SITE}`,
      });
    });

    it("is replaced by a proxy's feed when the chain is on and one answers", async () => {
      serve({
        [SITE]: wpPage(),
        [`https://api.allorigins.win/raw?url=${encodeURIComponent(SITE)}`]:
          feedXml("Proxied"),
        [`https://api.allorigins.win/get?url=${encodeURIComponent(SITE)}`]:
          JSON.stringify({ contents: "" }),
      });
      expect(await fetchFeedXml(SITE, true)).toBe(feedXml("Proxied"));
    });
  });
});
