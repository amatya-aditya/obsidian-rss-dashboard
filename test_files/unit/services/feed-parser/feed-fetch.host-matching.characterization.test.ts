import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import { fetchFeedXml } from "../../../../src/services/feed-parser/feed-fetch.js";
import { RSS2_BASIC } from "./fixtures/rss-fixtures.js";

const NOT_A_FEED = "<html><body><?php echo 1; ?> WordPress</body></html>";
const DIRECT = { enabled: false, url: "" };

function response(text: string): RequestUrlResponse {
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    status: 200,
    headers: {},
    arrayBuffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    json: {},
  };
}

/**
 * Serves `pages` by exact URL and answers every other URL with a failure.
 * Returns the list of URLs requested, in order.
 */
function serve(pages: Record<string, string>): string[] {
  const requested: string[] = [];
  vi.spyOn(obsidian, "requestUrl").mockImplementation((request) => {
    const url = typeof request === "string" ? request : request.url;
    requested.push(url);
    const page = pages[url];
    if (page === undefined) {
      return Promise.reject(new Error("not found")) as never;
    }
    return Promise.resolve(response(page)) as never;
  });
  return requested;
}

describe("fetchFeedXml host handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("FeedBurner feeds", () => {
    it.each([
      "https://feeds.feedburner.com/show",
      "http://feeds.feedburner.com/show",
      "https://feeds.feedburner.com/show?fmt=xml#frag",
    ])(
      "asks for the canonical FeedBurner address first for %s",
      async (url) => {
        const requested = serve({
          "https://feeds.feedburner.com/show?format=xml": RSS2_BASIC,
        });
        await fetchFeedXml(url, DIRECT);
        expect(requested[0]).toBe(
          "https://feeds.feedburner.com/show?format=xml",
        );
      },
    );

    it("requests an address with an explicit port as given", async () => {
      // The FeedBurner name regex needs a slash right after the host name.
      const url = "https://feeds.feedburner.com:8443/show";
      const requested = serve({ [url]: RSS2_BASIC });
      await fetchFeedXml(url, DIRECT);
      expect(requested[0]).toBe(url);
    });

    it("requests an unrelated host directly", async () => {
      const requested = serve({ "https://example.com/feed.xml": RSS2_BASIC });
      await fetchFeedXml("https://example.com/feed.xml", DIRECT);
      expect(requested).toEqual(["https://example.com/feed.xml"]);
    });

    it("requests an uppercase host directly", async () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      // The FeedBurner name regex is case-sensitive, so both paths end up
      // requesting the address as given.
      const url = "https://FEEDS.FEEDBURNER.COM/show";
      const requested = serve({ [url]: RSS2_BASIC });
      await fetchFeedXml(url, DIRECT);
      expect(requested[0]).toBe(url);
    });

    it("requests the address as given when only the query mentions FeedBurner", async () => {
      const url = "https://example.net/?u=feeds.feedburner.com/show";
      const requested = serve({ [url]: RSS2_BASIC });
      await fetchFeedXml(url, DIRECT);
      expect(requested[0]).toBe(url);
    });

    it("requests the address as given when the path holds the FeedBurner host name", async () => {
      const url = "https://example.net/feeds.feedburner.com/show";
      const requested = serve({ [url]: RSS2_BASIC });
      await fetchFeedXml(url, DIRECT);
      expect(requested[0]).toBe(url);
    });

    // The discovery step runs after a page that is not a feed and every
    // WordPress fallback address has failed; the `/atom.xml` address exists
    // only in the discovery list.
    it("uses the discovery list for a FeedBurner page that is not a feed", async () => {
      const url = "https://feeds.feedburner.com/show/";
      const requested = serve({
        [url]: NOT_A_FEED,
        "https://feeds.feedburner.com/show/atom.xml": RSS2_BASIC,
      });
      await fetchFeedXml(url, DIRECT);
      expect(requested).toContain("https://feeds.feedburner.com/show/atom.xml");
    });

    it("skips the FeedBurner discovery list for an unrelated host", async () => {
      const url = "https://example.com/show";
      const requested = serve({ [url]: NOT_A_FEED });
      await expect(fetchFeedXml(url, DIRECT)).rejects.toThrow();
      expect(requested.some((u) => u.includes("feedburner"))).toBe(false);
    });

    it("skips the discovery list when only the query mentions the host", async () => {
      const url = "https://example.net/page?u=feeds.feedburner.com/show";
      const requested = serve({
        [url]: NOT_A_FEED,
        "https://feeds.feedburner.com/show/atom.xml": RSS2_BASIC,
      });
      await expect(fetchFeedXml(url, DIRECT)).rejects.toThrow();
      expect(requested).not.toContain(
        "https://feeds.feedburner.com/show/atom.xml",
      );
    });
  });

  describe("arXiv feeds", () => {
    const stub = "https://export.arxiv.org/api/query?search_query=cat";

    it.each([
      "https://export.arxiv.org/api/query?search_query=cat",
      "http://export.arxiv.org/api/query?search_query=cat",
      "https://export.arxiv.org:8443/api/query?search_query=cat",
      "https://export.arxiv.org/api/query?search_query=cat#frag",
    ])("falls back to rss.arxiv.org for %s", async (url) => {
      const requested = serve({ [url]: NOT_A_FEED });
      await fetchFeedXml(url, DIRECT).catch(() => undefined);
      expect(requested).toContain(
        url.replace("export.arxiv.org", "rss.arxiv.org"),
      );
    });

    it("requests a bare arxiv.org address once more as the discovered address", async () => {
      const url = "https://arxiv.org/a/cat";
      const requested = serve({ [url]: NOT_A_FEED });
      await fetchFeedXml(url, DIRECT).catch(() => undefined);
      expect(requested.filter((u) => u === url)).toHaveLength(3);
    });

    it("does not request an unrelated host once more", async () => {
      const url = "https://example.com/a/cat";
      const requested = serve({ [url]: NOT_A_FEED });
      await fetchFeedXml(url, DIRECT).catch(() => undefined);
      expect(requested.filter((u) => u === url)).toHaveLength(2);
    });

    it("does not fall back to rss.arxiv.org for an unrelated host", async () => {
      const url = "https://example.com/api/query?search_query=cat";
      const requested = serve({ [url]: NOT_A_FEED });
      await fetchFeedXml(url, DIRECT).catch(() => undefined);
      expect(requested.some((u) => u.includes("rss.arxiv.org"))).toBe(false);
    });

    it("does not fall back for a host that contains the domain as a prefix", async () => {
      const url = "https://export.arxiv.org.example.net/api/query";
      const requested = serve({ [url]: NOT_A_FEED });
      await fetchFeedXml(url, DIRECT).catch(() => undefined);
      expect(requested).not.toContain(
        "https://rss.arxiv.org.example.net/api/query",
      );
    });

    it("keeps the export host for a stub that is not a feed", async () => {
      const requested = serve({ [stub]: NOT_A_FEED });
      await fetchFeedXml(stub, DIRECT).catch(() => undefined);
      expect(requested[0]).toBe(stub);
    });
  });

  describe("arXiv stub feeds that name the real feed", () => {
    const base = "https://example.com/feed.xml";
    const target = "https://rss.arxiv.org/atom/cs";

    function stubWithAtomLink(href: string): string {
      return `<?xml version="1.0"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Stub</title><atom:link href="${href}" rel="self"/></channel></rss>`;
    }

    function stubWithChannelLink(href: string): string {
      return `<?xml version="1.0"?><rss version="2.0"><channel><title>Stub</title><link>${href}</link></channel></rss>`;
    }

    it.each([
      "https://rss.arxiv.org/atom/cs",
      "http://rss.arxiv.org/atom/cs",
      "https://arxiv.org/atom/cs",
      "https://rss.arxiv.org/atom/cs?x=1#frag",
      "https://RSS.ARXIV.ORG/atom/cs",
    ])("follows the atom link %s", async (href) => {
      const requested = serve({
        [base]: stubWithAtomLink(href),
        [href]: RSS2_BASIC,
      });
      await fetchFeedXml(base, DIRECT);
      expect(requested).toContain(href);
    });

    it("follows a link with an explicit port", async () => {
      const href = "https://rss.arxiv.org:8443/atom/cs";
      const requested = serve({
        [base]: stubWithAtomLink(href),
        [href]: RSS2_BASIC,
      });
      await fetchFeedXml(base, DIRECT);
      expect(requested).toContain(href);
    });

    it("follows the channel link when there is no atom link", async () => {
      const requested = serve({
        [base]: stubWithChannelLink(target),
        [target]: RSS2_BASIC,
      });
      await fetchFeedXml(base, DIRECT);
      expect(requested).toContain(target);
    });

    it("does not follow a link to an unrelated host", async () => {
      const href = "https://example.net/atom/cs";
      const requested = serve({ [base]: stubWithAtomLink(href) });
      await fetchFeedXml(base, DIRECT);
      expect(requested).toEqual([base]);
    });

    it("does not follow a link to a host that contains the domain as a prefix", async () => {
      const href = "https://arxiv.org.example.net/atom/cs";
      const requested = serve({ [base]: stubWithAtomLink(href) });
      await fetchFeedXml(base, DIRECT);
      expect(requested).toEqual([base]);
    });

    it.each([
      "https://notarxiv.org/atom/cs",
      "https://example.net/?u=arxiv.org/atom/cs",
      "https://example.net/arxiv.org/atom/cs",
    ])("does not follow the look-alike link %s", async (href) => {
      const requested = serve({ [base]: stubWithAtomLink(href) });
      await fetchFeedXml(base, DIRECT);
      expect(requested).toEqual([base]);
    });

    it("resolves a scheme-less link against the feed address", async () => {
      const href = "arxiv.org/atom/cs";
      const requested = serve({ [base]: stubWithAtomLink(href) });
      await fetchFeedXml(base, DIRECT);
      expect(requested).toEqual([base]);
    });

    it("resolves a relative link against the feed address", async () => {
      const arxivBase = "https://export.arxiv.org/api/query?search_query=cat";
      const resolved = "https://export.arxiv.org/atom/cs";
      const requested = serve({
        [arxivBase]: stubWithAtomLink("/atom/cs"),
        [resolved]: RSS2_BASIC,
      });
      await fetchFeedXml(arxivBase, DIRECT);
      expect(requested).toContain(resolved);
    });
  });
});
