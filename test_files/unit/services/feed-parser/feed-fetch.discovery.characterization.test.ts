import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import { fetchFeedXml } from "../../../../src/services/feed-parser/feed-fetch.js";

// `discoverFeedUrls` and `fetchFirstValidFeed` run inside `fetchFeedXml` after
// a WordPress or PHP page answered and every WordPress fallback address failed,
// and again after the proxy chain gave up, so these tests drive them from there.

const DIRECT = { enabled: false, url: "" };
const SITE = "https://example.com/blog";
const FEEDBURNER_SITE = "https://feeds.feedburner.com/show/";
const FEEDBURNER_PROBES = [
  "https://feeds.feedburner.com/show?format=xml",
  "https://feeds.feedburner.com/show?fmt=xml",
  "https://feeds.feedburner.com/show?type=xml",
  "https://feeds.feedburner.com/show/feed",
  "https://feeds.feedburner.com/show/rss",
  "https://feeds.feedburner.com/show/atom",
  "https://feeds.feedburner.com/show.xml",
  "https://feeds.feedburner.com/show/feed.xml",
  "https://feeds.feedburner.com/show/rss.xml",
  "https://feeds.feedburner.com/show/atom.xml",
];
const ALL_FAILED =
  "All alternative feed URLs failed, received PHP file instead of RSS feed";

function feedXml(label: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${label}</title></channel></rss>`;
}

/** A page that sends `fetchFeedXml` down the WordPress fallback route. */
function wpPage(markup: string): string {
  return `<html><body>WordPress ${markup}</body></html>`;
}

/** A page that is neither a feed nor a WordPress page. */
function plainPage(markup: string): string {
  return `<html><body>${markup}</body></html>`;
}

type Body = string | Uint8Array;

function response(body: Body): RequestUrlResponse {
  const bytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  return {
    text: typeof body === "string" ? body : "",
    status: 200,
    headers: {},
    arrayBuffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
    json: {},
  };
}

interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
}

interface Served {
  requested: string[];
  requests: RecordedRequest[];
}

/**
 * Serves `pages` by exact URL and rejects every other URL. A list answers
 * successive requests for the same URL in order, repeating its last entry.
 * `onRequest` runs when a request arrives, before the answer is returned.
 */
function serve(
  pages: Record<string, Body | Body[]>,
  onRequest?: (url: string, count: number) => void,
): Served {
  const served: Served = { requested: [], requests: [] };
  const counts = new Map<string, number>();
  vi.spyOn(obsidian, "requestUrl").mockImplementation((request) => {
    const url = typeof request === "string" ? request : request.url;
    const headers = typeof request === "string" ? {} : (request.headers ?? {});
    served.requested.push(url);
    served.requests.push({ url, headers });
    const count = (counts.get(url) ?? 0) + 1;
    counts.set(url, count);
    onRequest?.(url, count);
    const page = pages[url];
    if (page === undefined) {
      return Promise.reject(new Error("not found")) as never;
    }
    const body = Array.isArray(page)
      ? page[Math.min(count, page.length) - 1]
      : page;
    return Promise.resolve(response(body)) as never;
  });
  return served;
}

/** Everything requested after the `n`th request for `url`. */
function after(requested: string[], url: string, n: number): string[] {
  let seen = 0;
  const index = requested.findIndex((u) => u === url && ++seen === n);
  return index === -1 ? [] : requested.slice(index + 1);
}

describe("feed discovery, reached after the WordPress fallback addresses fail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetching the page", () => {
    it("asks for the page again with no User-Agent and an HTML Accept header", async () => {
      const served = serve({
        [SITE]: wpPage('<a href="/subscribe-feed">Feed</a>'),
        "https://example.com/subscribe-feed": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      const pageRequests = served.requests.filter((r) => r.url === SITE);
      expect(pageRequests).toHaveLength(2);
      expect(pageRequests[1].headers).toEqual({
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      });
    });

    it("gives up without finding anything when the page comes back empty", async () => {
      const served = serve({
        [SITE]: [wpPage('<a href="/subscribe-feed">Feed</a>'), ""],
        "https://example.com/subscribe-feed": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(served.requested).not.toContain(
        "https://example.com/subscribe-feed",
      );
    });

    it("gives up when the page request fails", async () => {
      serve({ [SITE]: wpPage("") });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
    });

    it("reads the page once, then fetches the discovered address", async () => {
      const served = serve({
        [SITE]: wpPage('<a href="/subscribe-feed">Feed</a>'),
        "https://example.com/subscribe-feed": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/subscribe-feed",
      ]);
    });
  });

  describe("link tags that advertise a feed", () => {
    it("fetches the address a link tag advertises", async () => {
      const feedUrl = "https://feeds.example.net/blog.xml";
      const served = serve({
        [SITE]: wpPage(
          `<link rel="alternate" type="application/rss+xml" title="Blog" href="${feedUrl}">`,
        ),
        [feedUrl]: feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([feedUrl]);
    });

    it.each([
      "application/rss+xml",
      "application/atom+xml",
      "application/rdf+xml",
      "application/xml",
    ])("recognises a link tag of type %s", async (type) => {
      const feedUrl = "https://feeds.example.net/blog.xml";
      serve({
        [SITE]: wpPage(
          `<link rel="alternate" type="${type}" href="${feedUrl}">`,
        ),
        [feedUrl]: feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
    });

    it("recognises the tag whatever case its name is in", async () => {
      const feedUrl = "https://feeds.example.net/blog.xml";
      serve({
        [SITE]: wpPage(
          `<LINK REL="alternate" type="application/rss+xml" href="${feedUrl}">`,
        ),
        [feedUrl]: feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
    });

    it("resolves a root-relative address against the site's origin", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="/discovered.xml">',
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/discovered.xml",
      ]);
    });

    it("resolves a relative address against the page's directory", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="discovered.xml">',
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/discovered.xml",
      ]);
    });

    it("resolves a relative address on a page address ending in a slash without a double slash", async () => {
      const site = "https://example.com/blog/";
      const served = serve({
        [site]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="discovered.xml">',
        ),
        "https://example.com/blog/discovered.xml": feedXml("Discovered"),
      });
      await fetchFeedXml(site, DIRECT);
      expect(after(served.requested, site, 2)).toEqual([
        "https://example.com/blog/discovered.xml",
      ]);
    });

    it("resolves a protocol-relative address against the page's scheme", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="//cdn.example.net/blog.xml">',
        ),
        "https://cdn.example.net/blog.xml": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://cdn.example.net/blog.xml",
      ]);
    });

    it("resolves a relative address beginning with http as relative", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="http-feed.xml">',
        ),
        "https://example.com/http-feed.xml": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/http-feed.xml",
      ]);
    });

    it("requests an address with its HTML entities decoded", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="https://feeds.example.net/blog?a=1&amp;b=2">',
        ),
        "https://feeds.example.net/blog?a=1&b=2": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://feeds.example.net/blog?a=1&b=2",
      ]);
    });

    it("drops a link tag whose address does not resolve to http(s)", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="ftp://cdn.example.net/blog.xml">',
        ),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("uses a later link tag when the first cannot resolve to http(s)", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="ftp://cdn.example.net/first.xml">' +
            '<link rel="alternate" type="application/rss+xml" href="/discovered.xml">',
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/discovered.xml",
      ]);
    });

    it("finds nothing when the page address cannot resolve a root-relative candidate", async () => {
      // An address without a scheme cannot resolve a candidate, so it is
      // dropped rather than requested.
      const site = "example.com/blog";
      const served = serve({
        [site]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="/discovered.xml">',
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(site, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, site, 2)).toEqual([]);
    });

    it("moves to the next link tag when the first is not a feed", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="https://example.net/comments.xml">' +
            '<link rel="alternate" type="application/rss+xml" href="https://example.net/posts.xml">',
        ),
        "https://example.net/posts.xml": feedXml("Posts"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Posts</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.net/comments.xml",
        "https://example.net/posts.xml",
      ]);
    });

    it("does not fetch the page's own address again when a link tag names it", async () => {
      const served = serve({
        [SITE]: wpPage(
          `<link rel="alternate" type="application/rss+xml" href="${SITE}">`,
        ),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(served.requested.filter((u) => u === SITE)).toHaveLength(2);
    });

    it("prefers a link tag over an anchor", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<a href="/subscribe-feed">Feed</a>' +
            '<link rel="alternate" type="application/rss+xml" href="/discovered.xml">',
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/discovered.xml",
      ]);
    });

    it("misses a link tag whose address comes before its type", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" href="/discovered.xml" type="application/rss+xml">',
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("misses a link tag written with single quotes", async () => {
      const served = serve({
        [SITE]: wpPage(
          "<link rel='alternate' type='application/rss+xml' href='/discovered.xml'>",
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("ignores a link tag of another type", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="stylesheet" type="text/css" href="/discovered.xml">',
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("skips a link tag with an empty address and uses the next one", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="">' +
            '<link rel="alternate" type="application/atom+xml" href="/discovered.xml">',
        ),
        "https://example.com/discovered.xml": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/discovered.xml",
      ]);
    });
  });

  describe("anchors that look like feeds", () => {
    it.each([
      ["feed", "/subscribe-feed"],
      ["rss", "/subscribe.rss"],
      ["atom", "/subscribe.atom"],
      ["rdf", "/subscribe.rdf"],
      ["xml", "/subscribe.xml"],
    ])("follows an anchor whose address contains %s", async (_word, href) => {
      const served = serve({
        [SITE]: wpPage(`<a class="x" href="${href}">Subscribe</a>`),
        [`https://example.com${href}`]: feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        `https://example.com${href}`,
      ]);
    });

    it("tries the feed pattern before the rss pattern, whatever the page order", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<a href="/subscribe.rss">RSS</a><a href="/subscribe-feed">Feed</a>',
        ),
        "https://example.com/subscribe-feed": feedXml("Feed"),
        "https://example.com/subscribe.rss": feedXml("Rss"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Feed</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/subscribe-feed",
      ]);
    });

    it("takes the first anchor a pattern matches", async () => {
      serve({
        [SITE]: wpPage(
          '<a href="/one-feed">One</a><a href="/two-feed">Two</a>',
        ),
        "https://example.com/one-feed": feedXml("One"),
        "https://example.com/two-feed": feedXml("Two"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>One</title>",
      );
    });

    it("skips an anchor that points back at the page itself", async () => {
      const site = "https://example.com/news-feed";
      const served = serve({
        [site]: wpPage(
          `<a href="${site}">Here</a><a href="/other-feed">Other</a>`,
        ),
        "https://example.com/other-feed": feedXml("Other"),
      });
      await expect(fetchFeedXml(site, DIRECT)).resolves.toContain(
        "<title>Other</title>",
      );
      expect(after(served.requested, site, 2)).toEqual([
        "https://example.com/other-feed",
      ]);
    });

    it("resolves a relative anchor address against the page's directory", async () => {
      const served = serve({
        [SITE]: wpPage('<a href="subscribe-feed">Feed</a>'),
        "https://example.com/subscribe-feed": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/subscribe-feed",
      ]);
    });

    it("resolves a relative anchor address on a page address ending in a slash without a double slash", async () => {
      const site = "https://example.com/blog/";
      const served = serve({
        [site]: wpPage('<a href="subscribe-feed">Feed</a>'),
        "https://example.com/blog/subscribe-feed": feedXml("Discovered"),
      });
      await fetchFeedXml(site, DIRECT);
      expect(after(served.requested, site, 2)).toEqual([
        "https://example.com/blog/subscribe-feed",
      ]);
    });

    it("resolves a relative anchor address beginning with http as relative", async () => {
      const served = serve({
        [SITE]: wpPage('<a href="http-feed.xml">Feed</a>'),
        "https://example.com/http-feed.xml": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/http-feed.xml",
      ]);
    });

    it("decodes HTML entities in an anchor address before fetching it", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<a href="https://feeds.example.net/blog?a=1&amp;b=2">Feed</a>',
        ),
        "https://feeds.example.net/blog?a=1&b=2": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://feeds.example.net/blog?a=1&b=2",
      ]);
    });

    it("keeps an absolute anchor address as written", async () => {
      const served = serve({
        [SITE]: wpPage('<a href="https://feeds.example.net/blog.rss">RSS</a>'),
        "https://feeds.example.net/blog.rss": feedXml("Discovered"),
      });
      await fetchFeedXml(SITE, DIRECT);
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://feeds.example.net/blog.rss",
      ]);
    });

    it("resolves a protocol-relative anchor address against the page's scheme", async () => {
      const served = serve({
        [SITE]: wpPage('<a href="//cdn.example.net/blog.rss">RSS</a>'),
        "https://cdn.example.net/blog.rss": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://cdn.example.net/blog.rss",
      ]);
    });

    it("moves past an anchor that only mentions feed in its name", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<a href="/feedback">Send feedback</a><a href="/news.rss">RSS</a>',
        ),
        "https://example.com/news.rss": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/feedback",
        "https://example.com/news.rss",
      ]);
    });

    it("drops a mailto anchor whose address does not resolve to http(s)", async () => {
      // `mailto:feedback@example.com` matches the `feed` pattern; its scheme is
      // not http(s), so discovery drops the candidate (#1098) rather than
      // requesting it. #1099 owns the remaining anchor-selection behavior.
      const served = serve({
        [SITE]: wpPage('<a href="mailto:feedback@example.com">Mail</a>'),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("uses a later anchor when the first cannot resolve to http(s)", async () => {
      const served = serve({
        [SITE]: wpPage(
          '<a href="mailto:feedback@example.com">Mail</a><a href="/news.rss">RSS</a>',
        ),
        "https://example.com/news.rss": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).resolves.toContain(
        "<title>Discovered</title>",
      );
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.com/news.rss",
      ]);
    });

    it("does not follow a tag whose name merely starts with a", async () => {
      // `<area href=...>` is not an anchor.
      const served = serve({
        [SITE]: wpPage('<area href="/subscribe-feed"><img src="/x-feed.png">'),
        "https://example.com/subscribe-feed": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("drops a fragment-only anchor", async () => {
      const served = serve({
        [SITE]: wpPage('<a href="#feed">Feed</a>'),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("fetches at most five candidates", async () => {
      const links = [1, 2, 3, 4, 5, 6, 7]
        .map((n) => `<a href="/f${n}-feed">F</a>`)
        .join("");
      const served = serve({
        [SITE]: wpPage(links),
        "https://example.com/f6-feed": feedXml("Late"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual(
        [1, 2, 3, 4, 5].map((n) => `https://example.com/f${n}-feed`),
      );
    });

    it("does not look inside tags that do not start with a", async () => {
      const served = serve({
        [SITE]: wpPage('<img src="/x-feed.png"><form href="/subscribe-feed">'),
        "https://example.com/subscribe-feed": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("misses an anchor written with single quotes", async () => {
      const served = serve({
        [SITE]: wpPage("<a href='/subscribe-feed'>Feed</a>"),
        "https://example.com/subscribe-feed": feedXml("Discovered"),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });

    it("finds nothing on a page with no candidates", async () => {
      const served = serve({
        [SITE]: wpPage('<a href="/about">About</a>'),
      });
      await expect(fetchFeedXml(SITE, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(after(served.requested, SITE, 2)).toEqual([]);
    });
  });

  describe("FeedBurner candidates", () => {
    const probes = FEEDBURNER_PROBES;

    it("tries ten candidate addresses in a fixed order", async () => {
      const served = serve({ [FEEDBURNER_SITE]: wpPage("") });
      await expect(fetchFeedXml(FEEDBURNER_SITE, DIRECT)).rejects.toThrow(
        ALL_FAILED,
      );
      expect(after(served.requested, FEEDBURNER_SITE, 2)).toEqual(probes);
    });

    it("chooses the first candidate that answers with a feed", async () => {
      const served = serve({
        [FEEDBURNER_SITE]: wpPage(""),
        "https://feeds.feedburner.com/show/rss": feedXml("Probed"),
        "https://feeds.feedburner.com/show/atom": feedXml("Later"),
      });
      await expect(fetchFeedXml(FEEDBURNER_SITE, DIRECT)).resolves.toContain(
        "<title>Probed</title>",
      );
      expect(after(served.requested, FEEDBURNER_SITE, 2)).toEqual([
        ...probes.slice(0, 5),
        "https://feeds.feedburner.com/show/rss",
      ]);
    });

    it.each(["<rss version='2.0'>", "<feed xmlns='x'>", "<channel>"])(
      "accepts a candidate whose answer contains %s",
      async (marker) => {
        const served = serve({
          [FEEDBURNER_SITE]: wpPage(""),
          "https://feeds.feedburner.com/show/feed": `text ${marker} text`,
        });
        await fetchFeedXml(FEEDBURNER_SITE, DIRECT).catch(() => undefined);
        expect(after(served.requested, FEEDBURNER_SITE, 2)).toEqual([
          ...probes.slice(0, 4),
          "https://feeds.feedburner.com/show/feed",
        ]);
      },
    );

    it("skips a candidate that answers with something else", async () => {
      serve({
        [FEEDBURNER_SITE]: wpPage(""),
        "https://feeds.feedburner.com/show/feed": "<html>no</html>",
        "https://feeds.feedburner.com/show/rss": feedXml("Probed"),
      });
      await expect(fetchFeedXml(FEEDBURNER_SITE, DIRECT)).resolves.toContain(
        "<title>Probed</title>",
      );
    });

    it("skips a candidate whose request fails", async () => {
      // `show/feed` is not served, so its request rejects.
      const served = serve({
        [FEEDBURNER_SITE]: wpPage(""),
        "https://feeds.feedburner.com/show/rss": feedXml("Probed"),
      });
      await expect(fetchFeedXml(FEEDBURNER_SITE, DIRECT)).resolves.toContain(
        "<title>Probed</title>",
      );
      expect(served.requested).toContain(
        "https://feeds.feedburner.com/show/feed",
      );
    });

    it("sends the candidate request with a feed Accept header and no User-Agent", async () => {
      const served = serve({
        [FEEDBURNER_SITE]: wpPage(""),
        "https://feeds.feedburner.com/show/feed": feedXml("Probed"),
      });
      await fetchFeedXml(FEEDBURNER_SITE, DIRECT);
      const probe = served.requests.filter(
        (r) => r.url === "https://feeds.feedburner.com/show/feed",
      )[0];
      expect(probe.headers).toEqual({
        Accept:
          "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      });
    });

    it("chooses a candidate before it looks at the page's link tags", async () => {
      const served = serve({
        [FEEDBURNER_SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="https://example.net/other.xml">',
        ),
        "https://feeds.feedburner.com/show/rss": feedXml("Probed"),
        "https://example.net/other.xml": feedXml("Linked"),
      });
      await expect(fetchFeedXml(FEEDBURNER_SITE, DIRECT)).resolves.toContain(
        "<title>Probed</title>",
      );
      expect(served.requested).not.toContain("https://example.net/other.xml");
    });

    it("moves on to the link tags when no candidate answers with a feed", async () => {
      const served = serve({
        [FEEDBURNER_SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="https://example.net/other.xml">',
        ),
        "https://example.net/other.xml": feedXml("Linked"),
      });
      await expect(fetchFeedXml(FEEDBURNER_SITE, DIRECT)).resolves.toContain(
        "<title>Linked</title>",
      );
      expect(after(served.requested, FEEDBURNER_SITE, 2)).toEqual([
        ...probes,
        "https://example.net/other.xml",
      ]);
    });

    it("fetches a candidate that is not a valid feed once more as the discovered address", async () => {
      // `<channel>` passes the candidate check but not `isValidFeed`.
      const served = serve({
        [FEEDBURNER_SITE]: wpPage(""),
        "https://feeds.feedburner.com/show/feed": "<channel>x</channel>",
      });
      await expect(fetchFeedXml(FEEDBURNER_SITE, DIRECT)).rejects.toThrow(
        ALL_FAILED,
      );
      expect(
        served.requested.filter(
          (u) => u === "https://feeds.feedburner.com/show/feed",
        ),
      ).toHaveLength(2);
    });

    it("decodes a candidate with the caller's encoding override", async () => {
      // The body declares UTF-16, which would garble these ASCII bytes. Only
      // the caller's override, which wins over the declaration, reads the
      // candidate as a feed; `show/feed` appears only in the discovery list.
      serve({
        [FEEDBURNER_SITE]: wpPage(""),
        "https://feeds.feedburner.com/show/feed":
          '<?xml version="1.0" encoding="utf-16le"?><rss version="2.0"><channel><title>Probed</title></channel></rss>',
      });
      await expect(
        fetchFeedXml(FEEDBURNER_SITE, DIRECT, undefined, "windows-1251"),
      ).resolves.toContain("<title>Probed</title>");
    });

    it("skips the candidates when the address has no feed name", async () => {
      const site = "https://feeds.feedburner.com";
      const served = serve({
        [site]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="https://example.net/other.xml">',
        ),
        "https://example.net/other.xml": feedXml("Linked"),
      });
      await fetchFeedXml(site, DIRECT);
      expect(after(served.requested, site, 2)).toEqual([
        "https://example.net/other.xml",
      ]);
    });

    it("skips the candidates for an address that only mentions FeedBurner", async () => {
      const site = "https://example.net/feeds.feedburner.com/show/";
      const served = serve({ [site]: wpPage("") });
      await expect(fetchFeedXml(site, DIRECT)).rejects.toThrow(ALL_FAILED);
      expect(
        served.requested.some((u) => u.startsWith("https://feeds.feedburner")),
      ).toBe(false);
    });
  });

  describe("cancelling", () => {
    it("does not read the page when the request is cancelled just before", async () => {
      // The last WordPress fallback address is the final request before
      // discovery starts; cancelling while it is in flight cancels discovery.
      const controller = new AbortController();
      const served = serve(
        {
          [SITE]: wpPage('<a href="/subscribe-feed">Feed</a>'),
          "https://example.com/subscribe-feed": feedXml("Discovered"),
        },
        (url) => {
          if (url === `${SITE}/index.php?feed=atom`) controller.abort();
        },
      );
      // #1116: the cancel lands on the final fallback address, so the
      // WordPress step re-checks before reporting that discovery mattered.
      await expect(
        fetchFeedXml(SITE, DIRECT, controller.signal),
      ).rejects.toThrow("Timed out");
      expect(served.requested.filter((u) => u === SITE)).toHaveLength(1);
      expect(served.requested).not.toContain(
        "https://example.com/subscribe-feed",
      );
    });

    it("finds nothing when the request is cancelled while the page is read", async () => {
      const controller = new AbortController();
      const served = serve(
        {
          [SITE]: wpPage('<a href="/subscribe-feed">Feed</a>'),
          "https://example.com/subscribe-feed": feedXml("Discovered"),
        },
        (url, count) => {
          if (url === SITE && count === 2) controller.abort();
        },
      );
      // #1116: the cancel lands while discovery reads the page, so discovery
      // finds nothing and the WordPress step re-checks before giving up.
      await expect(
        fetchFeedXml(SITE, DIRECT, controller.signal),
      ).rejects.toThrow("Timed out");
      expect(served.requested).not.toContain(
        "https://example.com/subscribe-feed",
      );
    });

    it("stops trying candidates and skips the link tags when cancelled between candidates", async () => {
      const controller = new AbortController();
      const served = serve(
        {
          [FEEDBURNER_SITE]: wpPage(
            '<link rel="alternate" type="application/rss+xml" href="https://example.net/other.xml">',
          ),
          "https://example.net/other.xml": feedXml("Linked"),
        },
        (url, count) => {
          if (url === "https://feeds.feedburner.com/show/feed" && count === 1) {
            controller.abort();
          }
        },
      );
      // #1116: the cancel lands between discovery's candidates, so discovery
      // finds nothing and the WordPress step re-checks before giving up.
      await expect(
        fetchFeedXml(FEEDBURNER_SITE, DIRECT, controller.signal),
      ).rejects.toThrow("Timed out");
      expect(after(served.requested, FEEDBURNER_SITE, 2)).toEqual(
        FEEDBURNER_PROBES.slice(0, 4),
      );
      expect(served.requested).not.toContain("https://example.net/other.xml");
    });

    it("stops fetching discovered addresses when cancelled after the first one", async () => {
      const controller = new AbortController();
      const served = serve(
        {
          [SITE]: wpPage(
            '<link rel="alternate" type="application/rss+xml" href="https://example.net/comments.xml">' +
              '<link rel="alternate" type="application/rss+xml" href="https://example.net/posts.xml">',
          ),
          "https://example.net/posts.xml": feedXml("Posts"),
        },
        (url) => {
          if (url === "https://example.net/comments.xml") controller.abort();
        },
      );
      await expect(
        fetchFeedXml(SITE, DIRECT, controller.signal),
      ).rejects.toThrow("Timed out");
      expect(after(served.requested, SITE, 2)).toEqual([
        "https://example.net/comments.xml",
      ]);
    });

    it("keeps going to the link tags when no candidate answered and nothing was cancelled", async () => {
      const served = serve({
        [FEEDBURNER_SITE]: wpPage(
          '<link rel="alternate" type="application/rss+xml" href="https://example.net/other.xml">',
        ),
        "https://example.net/other.xml": feedXml("Linked"),
      });
      await fetchFeedXml(FEEDBURNER_SITE, DIRECT);
      expect(served.requested).toContain("https://example.net/other.xml");
    });
  });
});

describe("feed discovery, reached after the proxy chain fails", () => {
  const PAGE = "https://example.com/news";

  beforeEach(() => {
    vi.restoreAllMocks();
    // Every proxy attempt logs its failure; keep the output quiet.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the feed a page's link tag advertises", async () => {
    const served = serve({
      [PAGE]: plainPage(
        '<link rel="alternate" type="application/rss+xml" href="/discovered.xml">',
      ),
      "https://example.com/discovered.xml": feedXml("Discovered"),
    });
    await expect(fetchFeedXml(PAGE, true)).resolves.toContain(
      "<title>Discovered</title>",
    );
    expect(served.requested[served.requested.length - 1]).toBe(
      "https://example.com/discovered.xml",
    );
  });

  it("asks for the discovered address with no User-Agent", async () => {
    const served = serve({
      [PAGE]: plainPage(
        '<link rel="alternate" type="application/rss+xml" href="/discovered.xml">',
      ),
      "https://example.com/discovered.xml": feedXml("Discovered"),
    });
    await fetchFeedXml(PAGE, true);
    const request = served.requests.filter(
      (r) => r.url === "https://example.com/discovered.xml",
    )[0];
    expect(request.headers["User-Agent"]).toBeUndefined();
    expect(request.headers.Accept).toContain("application/rss+xml");
  });

  it("follows an anchor when the page has no link tag", async () => {
    serve({
      [PAGE]: plainPage('<a href="/subscribe-feed">Feed</a>'),
      "https://example.com/subscribe-feed": feedXml("Discovered"),
    });
    await expect(fetchFeedXml(PAGE, true)).resolves.toContain(
      "<title>Discovered</title>",
    );
  });

  it("does not fetch the page again when discovery names the page itself", async () => {
    const served = serve({
      [PAGE]: plainPage(
        `<link rel="alternate" type="application/rss+xml" href="${PAGE}">`,
      ),
    });
    await expect(fetchFeedXml(PAGE, true)).rejects.toThrow();
    // The direct read and discovery's own read; the caller drops a discovered
    // address equal to the page, so there is no third request.
    const count = served.requested.filter((u) => u === PAGE).length;
    expect(count).toBe(2);
  });

  it("finds nothing when the page offers no candidate", async () => {
    const served = serve({ [PAGE]: plainPage('<a href="/about">About</a>') });
    await expect(fetchFeedXml(PAGE, true)).rejects.toThrow();
    expect(served.requested.filter((u) => u === PAGE)).toHaveLength(2);
  });

  it("does not follow a candidate when cancelled while the page is read", async () => {
    const controller = new AbortController();
    const served = serve(
      {
        [PAGE]: plainPage('<a href="/subscribe-feed">Feed</a>'),
        "https://example.com/subscribe-feed": feedXml("Discovered"),
      },
      (url, count) => {
        if (url === PAGE && count === 2) controller.abort();
      },
    );
    await expect(fetchFeedXml(PAGE, true, controller.signal)).rejects.toThrow();
    expect(served.requested).not.toContain(
      "https://example.com/subscribe-feed",
    );
  });
});
