import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFeedXml } from "../../../../src/services/feed-parser/feed-fetch.js";
import {
  ACCEPT_ALL,
  DIRECT,
  FEEDBRO_UA,
  TARGET,
  after,
  cancelOn,
  feedXml,
  plainPage,
  requestsFor,
  serve,
  windows1251Feed,
  wpPage,
} from "./helpers/feed-fetch-serve.js";

// The direct attempt in `tryFetch`: the FeedBurner pre-probe, the plain fetch,
// the arXiv stub follow-up and the toggled-scheme retry. Every case runs with
// the proxy chain off (DIRECT) unless it says otherwise, so what surfaces is
// what the direct attempt throws.

const FB = "https://feeds.feedburner.com/show";
const FB_PROBE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FB_PROBE_ACCEPT =
  "application/feed+json, application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8";
const FB_PROBES = [`${FB}?format=xml`, `${FB}?fmt=xml`, `${FB}?type=xml`, FB];
const NOT_A_FEED = "Not a valid RSS/Atom feed";

function stubWithAtomLink(href: string): string {
  return `<?xml version="1.0"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Stub</title><atom:link href="${href}" rel="self"/></channel></rss>`;
}

describe("the direct attempt in fetchFeedXml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("the FeedBurner pre-probe", () => {
    it("tries four candidate addresses in a fixed order, then the address itself", async () => {
      const served = serve({});
      await expect(fetchFeedXml(FB, DIRECT)).rejects.toMatchObject({
        message: "not found",
      });
      expect(served.requested).toEqual([...FB_PROBES, FB]);
    });

    it("builds the candidates from the feed name alone, over https", async () => {
      const served = serve({});
      await fetchFeedXml(
        "http://feeds.feedburner.com/show/extra?x=1",
        DIRECT,
      ).catch(() => undefined);
      expect(served.requested.slice(0, 4)).toEqual(FB_PROBES);
    });

    it("returns the first candidate that answers with a feed and asks for no more", async () => {
      const served = serve({
        [FB_PROBES[1]]: feedXml("Second"),
        [FB_PROBES[2]]: feedXml("Third"),
      });
      expect(await fetchFeedXml(FB, DIRECT)).toBe(feedXml("Second"));
      expect(served.requested).toEqual([FB_PROBES[0], FB_PROBES[1]]);
    });

    it("sends a browser identity and a feed Accept header with each candidate", async () => {
      const served = serve({ [FB_PROBES[0]]: feedXml("First") });
      await fetchFeedXml(FB, DIRECT);
      expect(served.requests[0]).toEqual({
        url: FB_PROBES[0],
        method: "GET",
        headers: { "User-Agent": FB_PROBE_UA, Accept: FB_PROBE_ACCEPT },
      });
    });

    it("skips a candidate that answers with something that is not a feed", async () => {
      const served = serve({
        [FB_PROBES[0]]: plainPage("nope"),
        [FB_PROBES[1]]: "",
        [FB_PROBES[2]]: feedXml("Third"),
      });
      expect(await fetchFeedXml(FB, DIRECT)).toBe(feedXml("Third"));
      expect(served.requested).toEqual(FB_PROBES.slice(0, 3));
    });

    it("goes on to the address itself with the direct-fetch identity when no candidate is a feed", async () => {
      // The trailing slash keeps the address distinct from the fourth candidate.
      const served = serve({ [`${FB}/`]: feedXml("Plain") });
      expect(await fetchFeedXml(`${FB}/`, DIRECT)).toBe(feedXml("Plain"));
      const direct = served.requests[4];
      expect(direct.url).toBe(`${FB}/`);
      expect(direct.headers).toEqual({
        "User-Agent": FEEDBRO_UA,
        Accept: ACCEPT_ALL,
      });
    });

    it("probes over https even when the address asked for was http", async () => {
      serve({ [FB_PROBES[0]]: feedXml("First") });
      expect(
        await fetchFeedXml("http://feeds.feedburner.com/show", DIRECT),
      ).toBe(feedXml("First"));
    });

    it("does not probe an address with no feed name", async () => {
      const served = serve({});
      await fetchFeedXml("https://feeds.feedburner.com/", DIRECT).catch(
        () => undefined,
      );
      expect(served.requested).toEqual(["https://feeds.feedburner.com/"]);
    });

    it("does not read an unrelated host as FeedBurner", async () => {
      const served = serve({});
      await fetchFeedXml(TARGET, DIRECT).catch(() => undefined);
      expect(served.requested).toEqual([TARGET]);
    });

    it("decodes each candidate with the caller's encoding override", async () => {
      serve({ [FB_PROBES[0]]: windows1251Feed() });
      const text = await fetchFeedXml(FB, DIRECT, undefined, "windows-1251");
      expect(text).toContain("Привет");
    });

    it("stops probing and throws when cancelled while a candidate is requested", async () => {
      const controller = new AbortController();
      const served = serve({}, cancelOn(controller, FB_PROBES[1]));
      await expect(
        fetchFeedXml(FB, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([FB_PROBES[0], FB_PROBES[1]]);
    });

    it("throws without asking for the address itself when cancelled during the last candidate", async () => {
      const controller = new AbortController();
      const served = serve({}, cancelOn(controller, FB, 1));
      await expect(
        fetchFeedXml(FB, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual(FB_PROBES);
    });

    it("throws before any request when the signal is already cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      const served = serve({});
      await expect(
        fetchFeedXml(FB, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([]);
    });
  });

  describe("the plain fetch", () => {
    it("asks once, with a feed-reader identity and a feed Accept header, and returns a feed as is", async () => {
      const served = serve({ [TARGET]: feedXml("Plain") });
      expect(await fetchFeedXml(TARGET, DIRECT)).toBe(feedXml("Plain"));
      expect(served.requests).toEqual([
        {
          url: TARGET,
          method: "GET",
          headers: { "User-Agent": FEEDBRO_UA, Accept: ACCEPT_ALL },
        },
      ]);
    });

    it("returns a feed that has no items when it names no arXiv feed", async () => {
      const empty = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
      const served = serve({ [TARGET]: empty });
      expect(await fetchFeedXml(TARGET, DIRECT)).toBe(empty);
      expect(served.requested).toEqual([TARGET]);
    });

    it("throws when the page comes back empty and does not try the other scheme", async () => {
      const served = serve({ [TARGET]: "" });
      await expect(fetchFeedXml(TARGET, DIRECT)).rejects.toMatchObject({
        message: "Empty response from feed",
      });
      expect(served.requested).toEqual([TARGET]);
    });

    it("throws the request's own error when the request fails", async () => {
      const served = serve({ [TARGET]: new Error("boom") });
      await expect(fetchFeedXml(TARGET, DIRECT)).rejects.toMatchObject({
        message: "boom",
      });
      expect(served.requested).toEqual([TARGET]);
    });

    it("decodes the response with the caller's encoding override", async () => {
      serve({ [TARGET]: windows1251Feed() });
      expect(
        await fetchFeedXml(TARGET, DIRECT, undefined, "windows-1251"),
      ).toContain("Привет");
    });

    it("returns the feed even when cancelled while it was being fetched", async () => {
      const controller = new AbortController();
      serve({ [TARGET]: feedXml("Plain") }, cancelOn(controller, TARGET));
      expect(await fetchFeedXml(TARGET, DIRECT, controller.signal)).toBe(
        feedXml("Plain"),
      );
    });
  });

  describe("the toggled-scheme retry", () => {
    const HTTP = "http://example.com/feed.xml";

    it("returns the http page after a non-feed https page, asked for with the same headers", async () => {
      const served = serve({
        [TARGET]: plainPage("no feed"),
        [HTTP]: feedXml("Over http"),
      });
      expect(await fetchFeedXml(TARGET, DIRECT)).toBe(feedXml("Over http"));
      expect(served.requests[1]).toEqual({
        url: HTTP,
        method: "GET",
        headers: { "User-Agent": FEEDBRO_UA, Accept: ACCEPT_ALL },
      });
    });

    it("asks for the https address after a non-feed http page", async () => {
      const served = serve({
        [HTTP]: plainPage("no feed"),
        [TARGET]: feedXml("Over https"),
      });
      expect(await fetchFeedXml(HTTP, DIRECT)).toBe(feedXml("Over https"));
      expect(served.requested).toEqual([HTTP, TARGET]);
    });

    it("keeps the rest of the address when it swaps the scheme", async () => {
      const served = serve({
        "http://Example.com/Feed?A=1#top": plainPage("no feed"),
        "https://Example.com/Feed?A=1#top": feedXml("Kept"),
      });
      expect(
        await fetchFeedXml("http://Example.com/Feed?A=1#top", DIRECT),
      ).toBe(feedXml("Kept"));
      expect(served.requested).toEqual([
        "http://Example.com/Feed?A=1#top",
        "https://Example.com/Feed?A=1#top",
      ]);
    });

    it("does not swap an upper-case scheme", async () => {
      const served = serve({ "HTTP://example.com/feed.xml": plainPage("x") });
      await expect(
        fetchFeedXml("HTTP://example.com/feed.xml", DIRECT),
      ).rejects.toMatchObject({ message: NOT_A_FEED });
      expect(served.requested).toEqual(["HTTP://example.com/feed.xml"]);
    });

    it("throws that the page is not a feed when the toggled page is not one either", async () => {
      const served = serve({
        [TARGET]: plainPage("no feed"),
        [HTTP]: plainPage("still no feed"),
      });
      await expect(fetchFeedXml(TARGET, DIRECT)).rejects.toMatchObject({
        message: NOT_A_FEED,
      });
      expect(served.requested).toEqual([TARGET, HTTP]);
    });

    it("ignores a toggled request that fails", async () => {
      serve({ [TARGET]: plainPage("no feed"), [HTTP]: new Error("down") });
      await expect(fetchFeedXml(TARGET, DIRECT)).rejects.toMatchObject({
        message: NOT_A_FEED,
      });
    });

    it("ignores an empty toggled page", async () => {
      serve({ [TARGET]: plainPage("no feed"), [HTTP]: "" });
      await expect(fetchFeedXml(TARGET, DIRECT)).rejects.toMatchObject({
        message: NOT_A_FEED,
      });
    });

    it("asks for no other scheme when the address is neither http nor https", async () => {
      const served = serve({ "ftp://example.com/feed.xml": plainPage("x") });
      await expect(
        fetchFeedXml("ftp://example.com/feed.xml", DIRECT),
      ).rejects.toMatchObject({ message: NOT_A_FEED });
      expect(served.requested).toEqual(["ftp://example.com/feed.xml"]);
    });

    it("tries the other scheme before the WordPress alternatives", async () => {
      const served = serve({
        [TARGET]: wpPage(),
        [HTTP]: feedXml("Over http"),
      });
      expect(await fetchFeedXml(TARGET, DIRECT)).toBe(feedXml("Over http"));
      expect(served.requested).toEqual([TARGET, HTTP]);
    });

    it("decodes the toggled page with the caller's encoding override", async () => {
      serve({ [TARGET]: plainPage("no feed"), [HTTP]: windows1251Feed() });
      expect(
        await fetchFeedXml(TARGET, DIRECT, undefined, "windows-1251"),
      ).toContain("Привет");
    });

    it("throws without asking for the other scheme when cancelled while the page was fetched", async () => {
      const controller = new AbortController();
      const served = serve(
        { [TARGET]: plainPage("no feed"), [HTTP]: feedXml("Over http") },
        cancelOn(controller, TARGET),
      );
      await expect(
        fetchFeedXml(TARGET, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([TARGET]);
    });
  });

  describe("arXiv stub feeds", () => {
    const STUB_URL = "https://example.com/stub.xml";
    const ARXIV = "https://rss.arxiv.org/atom/cs";

    it("asks for the named arXiv feed with the feed-reader identity and returns it", async () => {
      const served = serve({
        [STUB_URL]: stubWithAtomLink(ARXIV),
        [ARXIV]: feedXml("arXiv"),
      });
      expect(await fetchFeedXml(STUB_URL, DIRECT)).toBe(feedXml("arXiv"));
      expect(served.requests[1]).toEqual({
        url: ARXIV,
        method: "GET",
        headers: { "User-Agent": FEEDBRO_UA, Accept: ACCEPT_ALL },
      });
    });

    it("prefers the atom link over the channel link", async () => {
      const stub = `<?xml version="1.0"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Stub</title><link>https://arxiv.org/chan</link><atom:link href="${ARXIV}" rel="self"/></channel></rss>`;
      const served = serve({ [STUB_URL]: stub, [ARXIV]: feedXml("arXiv") });
      await fetchFeedXml(STUB_URL, DIRECT);
      expect(served.requested).toEqual([STUB_URL, ARXIV]);
    });

    it("does not follow a stub that has items", async () => {
      const withItem = `<?xml version="1.0"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Stub</title><atom:link href="${ARXIV}" rel="self"/><item><title>One</title></item></channel></rss>`;
      const served = serve({ [STUB_URL]: withItem, [ARXIV]: feedXml("arXiv") });
      expect(await fetchFeedXml(STUB_URL, DIRECT)).toBe(withItem);
      expect(served.requested).toEqual([STUB_URL]);
    });

    it("returns the stub when the named feed is not a feed", async () => {
      const stub = stubWithAtomLink(ARXIV);
      serve({ [STUB_URL]: stub, [ARXIV]: plainPage("no feed") });
      expect(await fetchFeedXml(STUB_URL, DIRECT)).toBe(stub);
    });

    it("returns the stub when the named feed comes back empty", async () => {
      const stub = stubWithAtomLink(ARXIV);
      serve({ [STUB_URL]: stub, [ARXIV]: "" });
      expect(await fetchFeedXml(STUB_URL, DIRECT)).toBe(stub);
    });

    it("returns the stub when the request for the named feed fails", async () => {
      const stub = stubWithAtomLink(ARXIV);
      serve({ [STUB_URL]: stub, [ARXIV]: new Error("down") });
      expect(await fetchFeedXml(STUB_URL, DIRECT)).toBe(stub);
    });

    it("does not follow a link to a host other than arXiv", async () => {
      const stub = stubWithAtomLink("https://example.net/atom/cs");
      const served = serve({ [STUB_URL]: stub });
      expect(await fetchFeedXml(STUB_URL, DIRECT)).toBe(stub);
      expect(served.requested).toEqual([STUB_URL]);
    });

    it("returns the stub when it names no link at all", async () => {
      const bare = `<?xml version="1.0"?><rss version="2.0"><channel><title>Bare</title></channel></rss>`;
      const served = serve({ [STUB_URL]: bare });
      expect(await fetchFeedXml(STUB_URL, DIRECT)).toBe(bare);
      expect(served.requested).toEqual([STUB_URL]);
    });

    it("decodes the named feed with the caller's encoding override", async () => {
      serve({
        [STUB_URL]: stubWithAtomLink(ARXIV),
        [ARXIV]: windows1251Feed(),
      });
      expect(
        await fetchFeedXml(STUB_URL, DIRECT, undefined, "windows-1251"),
      ).toContain("Привет");
    });

    it("throws instead of returning the stub when cancelled while the stub was fetched", async () => {
      const controller = new AbortController();
      const served = serve(
        { [STUB_URL]: stubWithAtomLink(ARXIV), [ARXIV]: feedXml("arXiv") },
        cancelOn(controller, STUB_URL),
      );
      await expect(
        fetchFeedXml(STUB_URL, DIRECT, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([STUB_URL]);
    });
  });

  describe("when the direct attempt fails with the proxy chain on", () => {
    it("starts the chain at the first public proxy after the page fails", async () => {
      const served = serve({ [TARGET]: new Error("down") });
      await fetchFeedXml(TARGET, true).catch(() => undefined);
      expect(served.requested[0]).toBe(TARGET);
      expect(served.requested[1]).toBe(
        `https://api.allorigins.win/get?url=${encodeURIComponent(TARGET)}`,
      );
    });

    it("starts the chain after a page that is not a feed and its toggled twin fail", async () => {
      const served = serve({
        [TARGET]: plainPage("no feed"),
        "http://example.com/feed.xml": plainPage("no feed"),
      });
      await fetchFeedXml(TARGET, true).catch(() => undefined);
      expect(served.requested.slice(0, 3)).toEqual([
        TARGET,
        "http://example.com/feed.xml",
        `https://api.allorigins.win/get?url=${encodeURIComponent(TARGET)}`,
      ]);
    });

    it("rethrows the direct error and asks no proxy when the chain is off", async () => {
      const served = serve({ [TARGET]: new Error("down") });
      await expect(fetchFeedXml(TARGET, DIRECT)).rejects.toMatchObject({
        message: "down",
      });
      expect(after(served.requested, TARGET)).toEqual([]);
      expect(requestsFor(served, TARGET)).toHaveLength(1);
    });
  });
});
