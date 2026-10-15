import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFeedXml } from "../../../../src/services/feed-parser/feed-fetch.js";
import {
  ACCEPT_ALL,
  ENCODED_TARGET,
  TARGET,
  cancelOn,
  feedXml,
  last,
  plainPage,
  requestsFor,
  serve,
  useAndroid,
  windows1251Feed,
} from "./helpers/feed-fetch-serve.js";

// What `fetchFeedXml` does once the direct attempt has failed: the public
// proxy chain inside `tryFetch`, the codetabs and rss2json tail after it, and
// the separate path for a configured (object) proxy. Every request goes through
// `requestUrl`, so the order and shape of the requests are the behavior.

const GET = `https://api.allorigins.win/get?url=${ENCODED_TARGET}`;
const RAW = `https://api.allorigins.win/raw?url=${ENCODED_TARGET}`;
const CODETABS = `https://api.codetabs.com/v1/proxy/?quest=${ENCODED_TARGET}`;
const ISO = `https://cors.isomorphic-git.org/${TARGET}`;
const THING = `https://thingproxy.freeboard.io/fetch/${ENCODED_TARGET}`;
const RSS2JSON = `https://api.rss2json.com/v1/api.json?rss_url=${ENCODED_TARGET}`;
const COULD_NOT = `Could not fetch a valid RSS/Atom feed from ${TARGET}`;
const NOT_A_FEED = "Not a valid RSS/Atom feed";

const CUSTOM_PREFIX = "https://my-proxy.com/?url=";
const CUSTOM = `${CUSTOM_PREFIX}${ENCODED_TARGET}`;
const CONFIGURED = { enabled: true, url: CUSTOM_PREFIX };
const AUTO = { enabled: true, url: "auto" };

/** The requests an all-failing run makes, in order. */
const EVERYTHING_FAILS = [
  TARGET,
  GET,
  RAW,
  CODETABS,
  ISO,
  THING,
  TARGET,
  CODETABS,
  RSS2JSON,
];

/** What the "auto" list asks for after the direct attempt, in order. */
const AUTO_PROXIES = [
  `https://api.allorigins.win/raw?url=${ENCODED_TARGET}`,
  `https://api.allorigins.win/get?url=${ENCODED_TARGET}`,
  `https://api.codetabs.com/v1/proxy/?quest=${ENCODED_TARGET}`,
  `https://cors.isomorphic-git.org/${ENCODED_TARGET}`,
  `https://thingproxy.freeboard.io/fetch/${ENCODED_TARGET}`,
  `https://api.rss2json.com/v1/api.json?rss_url=${ENCODED_TARGET}`,
];

function envelope(contents: string): string {
  return JSON.stringify({ contents });
}

function rss2json(): string {
  return JSON.stringify({
    status: "ok",
    feed: { title: "Via RSS2JSON", link: "https://example.com" },
    items: [{ title: "One", link: "https://example.com/1" }],
  });
}

/** An AllOrigins envelope whose feed title holds windows-1251 bytes. */
function envelopeWithWindows1251(): Uint8Array {
  const head = new TextEncoder().encode('{"contents":"<rss><channel><title>');
  const title = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
  const tail = new TextEncoder().encode('</title></channel></rss>"}');
  const bytes = new Uint8Array(head.length + title.length + tail.length);
  bytes.set(head);
  bytes.set(title, head.length);
  bytes.set(tail, head.length + title.length);
  return bytes;
}

describe("the public proxy chain in fetchFeedXml", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("the order and shape of the requests", () => {
    it("asks for the page, six proxies, the page again and the rss2json proxy, then gives up", async () => {
      const served = serve({});
      await expect(fetchFeedXml(TARGET)).rejects.toMatchObject({
        message: COULD_NOT,
      });
      expect(served.requested).toEqual(EVERYTHING_FAILS);
    });

    it("asks AllOrigins get and rss2json with no headers", async () => {
      const served = serve({});
      await fetchFeedXml(TARGET).catch(() => undefined);
      expect(served.requests[1]).toEqual({
        url: GET,
        method: "GET",
        headers: {},
      });
      expect(served.requests[8]).toEqual({
        url: RSS2JSON,
        method: "GET",
        headers: {},
      });
    });

    it("asks the other proxies with no headers in the chain, and a feed Accept header in the tail", async () => {
      const served = serve({});
      await fetchFeedXml(TARGET).catch(() => undefined);
      for (const index of [2, 3, 4, 5]) {
        expect(served.requests[index].headers).toEqual({});
        expect(served.requests[index].method).toBe("GET");
      }
      expect(served.requests[7]).toEqual({
        url: CODETABS,
        method: "GET",
        headers: { Accept: ACCEPT_ALL },
      });
    });

    it("sends the isomorphic-git proxy the address unencoded", async () => {
      const target = "https://example.com/a b?x=1&y=2";
      const served = serve({});
      await fetchFeedXml(target).catch(() => undefined);
      expect(served.requested).toContain(
        "https://cors.isomorphic-git.org/https://example.com/a b?x=1&y=2",
      );
      expect(served.requested).toContain(
        `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(target)}`,
      );
    });

    it("throws the error naming the address when the chain gives up", async () => {
      serve({});
      await expect(fetchFeedXml(TARGET)).rejects.toMatchObject({
        message: COULD_NOT,
      });
    });

    it("also uses the chain when the caller passes true", async () => {
      const served = serve({});
      await fetchFeedXml(TARGET, true).catch(() => undefined);
      expect(served.requested).toEqual(EVERYTHING_FAILS);
    });
  });

  describe("each proxy in turn", () => {
    it("returns the feed inside an AllOrigins get envelope and asks for no more", async () => {
      const served = serve({ [GET]: envelope(feedXml("Get")) });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Get"));
      expect(served.requested).toEqual([TARGET, GET]);
    });

    it.each([
      ["contents that are not a feed", envelope(plainPage("nope"))],
      ["no contents", JSON.stringify({})],
      ["empty contents", envelope("")],
      ["a body that is not JSON", "oops"],
    ])(
      "goes on to AllOrigins raw after an envelope with %s",
      async (_label, body) => {
        const served = serve({ [GET]: body, [RAW]: feedXml("Raw") });
        expect(await fetchFeedXml(TARGET)).toBe(feedXml("Raw"));
        expect(served.requested).toEqual([TARGET, GET, RAW]);
      },
    );

    it("logs a failed AllOrigins get with the address and the error", async () => {
      serve({ [RAW]: feedXml("Raw") });
      await fetchFeedXml(TARGET);
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        `[RSS dashboard] AllOrigins proxy fetch failed for ${TARGET}:`,
        expect.any(Error),
      );
    });

    it.each([
      ["no contents", JSON.stringify({}), "No contents from AllOrigins"],
      [
        "contents that are not a feed",
        envelope(plainPage("nope")),
        "Not a valid RSS/Atom feed",
      ],
    ])(
      "logs the reason an AllOrigins get envelope with %s was refused",
      async (_label, body, reason) => {
        serve({ [GET]: body, [RAW]: feedXml("Raw") });
        await fetchFeedXml(TARGET);
        expect(consoleError.mock.calls[0][1]).toMatchObject({
          message: reason,
        });
      },
    );

    it("does not log when AllOrigins get answers", async () => {
      serve({ [GET]: envelope(feedXml("Get")) });
      await fetchFeedXml(TARGET);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("returns AllOrigins raw's feed and asks for no more", async () => {
      const served = serve({ [RAW]: feedXml("Raw") });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Raw"));
      expect(served.requested).toEqual([TARGET, GET, RAW]);
    });

    it.each([
      ["something that is not a feed", plainPage("nope")],
      ["nothing", ""],
    ])("goes on to codetabs after raw answers with %s", async (_l, body) => {
      const served = serve({ [RAW]: body, [CODETABS]: feedXml("Codetabs") });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Codetabs"));
      expect(served.requested).toEqual([TARGET, GET, RAW, CODETABS]);
    });

    it("goes on to isomorphic-git after codetabs fails", async () => {
      const served = serve({ [ISO]: feedXml("Iso") });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Iso"));
      expect(served.requested).toEqual([TARGET, GET, RAW, CODETABS, ISO]);
    });

    it("ignores a codetabs answer that is not a feed", async () => {
      serve({ [CODETABS]: plainPage("nope"), [ISO]: feedXml("Iso") });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Iso"));
    });

    it("goes on to thingproxy after isomorphic-git fails", async () => {
      const served = serve({ [THING]: feedXml("Thing") });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Thing"));
      expect(served.requested).toEqual([
        TARGET,
        GET,
        RAW,
        CODETABS,
        ISO,
        THING,
      ]);
    });

    it("ignores an isomorphic-git answer that is not a feed", async () => {
      serve({ [ISO]: plainPage("nope"), [THING]: feedXml("Thing") });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Thing"));
    });

    it("goes on to discovery when thingproxy answers with something that is not a feed", async () => {
      const found = "https://example.com/found.xml";
      serve({
        [THING]: plainPage("nope"),
        [TARGET]: [
          new Error("down"),
          `<html><link rel="alternate" type="application/rss+xml" href="${found}"></html>`,
        ],
        [found]: feedXml("Found"),
      });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Found"));
    });

    it("asks for the discovered address with a feed Accept header and no User-Agent", async () => {
      const found = "https://example.com/found.xml";
      const served = serve({
        [TARGET]: [
          new Error("down"),
          `<html><link rel="alternate" type="application/rss+xml" href="${found}"></html>`,
        ],
        [found]: feedXml("Found"),
      });
      await fetchFeedXml(TARGET);
      expect(requestsFor(served, found)[0]).toEqual({
        url: found,
        method: "GET",
        headers: {
          Accept: ACCEPT_ALL,
        },
      });
    });

    it("goes on to discovery after thingproxy fails, and returns the discovered feed", async () => {
      const found = "https://example.com/found.xml";
      const served = serve({
        [TARGET]: [
          new Error("down"),
          `<html><link rel="alternate" type="application/rss+xml" href="${found}"></html>`,
        ],
        [found]: feedXml("Found"),
      });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Found"));
      expect(served.requested).toEqual([
        TARGET,
        GET,
        RAW,
        CODETABS,
        ISO,
        THING,
        TARGET,
        found,
      ]);
    });

    it("falls through to the tail when the discovered address is not a feed", async () => {
      const found = "https://example.com/found.xml";
      const served = serve({
        [TARGET]: [
          new Error("down"),
          `<html><link rel="alternate" type="application/rss+xml" href="${found}"></html>`,
        ],
        [found]: plainPage("nope"),
        [RSS2JSON]: rss2json(),
      });
      expect(await fetchFeedXml(TARGET)).toContain("Via RSS2JSON");
      expect(served.requested.slice(6)).toEqual([
        TARGET,
        found,
        CODETABS,
        RSS2JSON,
      ]);
    });

    it("does not read a discovery that names the address itself as a new feed", async () => {
      const served = serve({
        [TARGET]: [
          new Error("down"),
          `<html><link rel="alternate" type="application/rss+xml" href="${TARGET}"></html>`,
        ],
      });
      await expect(fetchFeedXml(TARGET)).rejects.toMatchObject({
        message: COULD_NOT,
      });
      expect(served.requested).toEqual(EVERYTHING_FAILS);
    });
  });

  describe("the encoding override", () => {
    const FOUND = "https://example.com/found.xml";
    const LINK_PAGE = `<html><link rel="alternate" type="application/rss+xml" href="${FOUND}"></html>`;

    it.each([
      ["AllOrigins raw", { [RAW]: windows1251Feed() }],
      ["codetabs", { [CODETABS]: windows1251Feed() }],
      ["isomorphic-git", { [ISO]: windows1251Feed() }],
      ["thingproxy", { [THING]: windows1251Feed() }],
      [
        "the discovered address",
        {
          [TARGET]: [new Error("down"), LINK_PAGE],
          [FOUND]: windows1251Feed(),
        },
      ],
      [
        "the codetabs tail",
        { [CODETABS]: [new Error("down"), windows1251Feed()] },
      ],
    ])("reaches %s", async (_label, pages) => {
      serve(pages);
      expect(
        await fetchFeedXml(TARGET, true, undefined, "windows-1251"),
      ).toContain("Привет");
    });
  });

  describe("the codetabs and rss2json tail", () => {
    it("asks codetabs a second time after the chain gives up, and returns its feed", async () => {
      const served = serve({
        [CODETABS]: [new Error("down"), feedXml("Tail")],
      });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Tail"));
      expect(served.requested).toEqual([
        TARGET,
        GET,
        RAW,
        CODETABS,
        ISO,
        THING,
        TARGET,
        CODETABS,
      ]);
    });

    it("goes on to rss2json when the second codetabs answer is not a feed", async () => {
      serve({
        [CODETABS]: [new Error("down"), plainPage("nope")],
        [RSS2JSON]: rss2json(),
      });
      const xml = await fetchFeedXml(TARGET);
      expect(xml).toContain("<rss");
      expect(xml).toContain("Via RSS2JSON");
    });

    it("goes on to rss2json when the second codetabs answer is empty", async () => {
      serve({
        [CODETABS]: [new Error("down"), ""],
        [RSS2JSON]: rss2json(),
      });
      expect(await fetchFeedXml(TARGET)).toContain("Via RSS2JSON");
    });

    it.each([
      [
        "a status other than ok",
        JSON.stringify({ status: "error", message: "x" }),
      ],
      [
        "a status other than ok next to a feed",
        JSON.stringify({
          status: "error",
          feed: { title: "Stale", link: "https://example.com" },
          items: [],
        }),
      ],
      ["no feed", JSON.stringify({ status: "ok" })],
      ["a body that is not JSON", "oops"],
    ])(
      "throws the chain's error when rss2json answers with %s",
      async (_l, body) => {
        serve({ [RSS2JSON]: body });
        await expect(fetchFeedXml(TARGET)).rejects.toMatchObject({
          message: COULD_NOT,
        });
      },
    );
  });

  describe("on Android", () => {
    beforeEach(() => {
      useAndroid();
    });

    it("asks only AllOrigins get and raw after the page, then throws the chain's error", async () => {
      const served = serve({});
      await expect(fetchFeedXml(TARGET)).rejects.toMatchObject({
        message: COULD_NOT,
      });
      expect(served.requested).toEqual([TARGET, GET, RAW]);
    });

    it("still returns what AllOrigins raw answers", async () => {
      serve({ [RAW]: feedXml("Raw") });
      expect(await fetchFeedXml(TARGET)).toBe(feedXml("Raw"));
    });

    it("skips the tail", async () => {
      const served = serve({
        [CODETABS]: feedXml("Tail"),
        [RSS2JSON]: rss2json(),
      });
      await expect(fetchFeedXml(TARGET)).rejects.toMatchObject({
        message: COULD_NOT,
      });
      expect(served.requested).not.toContain(CODETABS);
      expect(served.requested).not.toContain(RSS2JSON);
    });
  });

  describe("cancelling", () => {
    it("throws before any request when the signal is already cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      const served = serve({});
      await expect(
        fetchFeedXml(TARGET, true, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([]);
    });

    it.each([
      ["the page", TARGET, 1, 1],
      ["AllOrigins get", GET, 1, 2],
      ["AllOrigins raw", RAW, 1, 3],
      ["codetabs", CODETABS, 1, 4],
      ["isomorphic-git", ISO, 1, 5],
      ["thingproxy", THING, 1, 6],
      ["the discovery page", TARGET, 2, 7],
      ["the codetabs tail", CODETABS, 2, 8],
    ])(
      "throws that it timed out, asking for nothing more, when cancelled during %s",
      async (_label, url, nth, count) => {
        const controller = new AbortController();
        const served = serve({}, cancelOn(controller, url, nth));
        await expect(
          fetchFeedXml(TARGET, true, controller.signal),
        ).rejects.toMatchObject({ message: "Timed out" });
        expect(served.requested).toEqual(EVERYTHING_FAILS.slice(0, count));
      },
    );

    it("throws that it timed out when cancelled during the rss2json request", async () => {
      // #1116: the abort lands during the final request of the tail.
      const controller = new AbortController();
      const served = serve({}, cancelOn(controller, RSS2JSON));
      await expect(
        fetchFeedXml(TARGET, true, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual(EVERYTHING_FAILS);
    });

    it("returns the feed AllOrigins get answers even when cancelled while it was asked", async () => {
      const controller = new AbortController();
      serve({ [GET]: envelope(feedXml("Get")) }, cancelOn(controller, GET));
      expect(await fetchFeedXml(TARGET, true, controller.signal)).toBe(
        feedXml("Get"),
      );
    });

    it("on Android throws that it timed out when cancelled during the page", async () => {
      useAndroid();
      const controller = new AbortController();
      const served = serve({}, cancelOn(controller, TARGET));
      await expect(
        fetchFeedXml(TARGET, true, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([TARGET]);
    });

    it("on Android throws that it timed out when cancelled during AllOrigins get", async () => {
      useAndroid();
      const controller = new AbortController();
      const served = serve({}, cancelOn(controller, GET));
      await expect(
        fetchFeedXml(TARGET, true, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([TARGET, GET]);
    });

    it("on Android throws that it timed out when cancelled during AllOrigins raw", async () => {
      // #1116: on Android the tail is not reached, so the raw request is the
      // final one of the chain and needs its own re-check.
      useAndroid();
      const controller = new AbortController();
      const served = serve({}, cancelOn(controller, RAW));
      await expect(
        fetchFeedXml(TARGET, true, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([TARGET, GET, RAW]);
    });
  });
});

describe("a configured proxy in fetchFeedXml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("the order and shape of the requests", () => {
    it("tries the page, then the prefix with the address appended encoded, and returns its feed", async () => {
      const served = serve({ [CUSTOM]: feedXml("Custom") });
      expect(await fetchFeedXml(TARGET, CONFIGURED)).toBe(feedXml("Custom"));
      expect(served.requests).toEqual([
        { url: TARGET, method: "GET", headers: expect.any(Object) },
        { url: CUSTOM, method: "GET", headers: { Accept: ACCEPT_ALL } },
      ]);
    });

    it("never asks a public proxy", async () => {
      const served = serve({});
      await fetchFeedXml(TARGET, CONFIGURED).catch(() => undefined);
      expect(served.requested).toEqual([TARGET, CUSTOM]);
    });

    it("asks the built-in list in a fixed order for auto", async () => {
      const served = serve({});
      await expect(fetchFeedXml(TARGET, AUTO)).rejects.toMatchObject({
        message: "not found",
      });
      expect(served.requested).toEqual([TARGET, ...AUTO_PROXIES]);
    });

    it("stops at the first proxy that answers with a feed", async () => {
      const served = serve({ [AUTO_PROXIES[2]]: feedXml("Codetabs") });
      expect(await fetchFeedXml(TARGET, AUTO)).toBe(feedXml("Codetabs"));
      expect(served.requested).toEqual([TARGET, ...AUTO_PROXIES.slice(0, 3)]);
    });

    it("skips a proxy whose answer is empty or not a feed", async () => {
      const served = serve({
        [AUTO_PROXIES[0]]: "",
        [AUTO_PROXIES[1]]: plainPage("nope"),
        [AUTO_PROXIES[2]]: feedXml("Codetabs"),
      });
      expect(await fetchFeedXml(TARGET, AUTO)).toBe(feedXml("Codetabs"));
      expect(served.requested).toHaveLength(4);
    });

    it("unwraps an AllOrigins get envelope", async () => {
      serve({ [AUTO_PROXIES[1]]: envelope(feedXml("Get")) });
      expect(await fetchFeedXml(TARGET, AUTO)).toBe(feedXml("Get"));
    });

    it.each([
      ["no contents", JSON.stringify({})],
      ["contents that are not a feed", envelope(plainPage("nope"))],
    ])("skips an AllOrigins get envelope with %s", async (_l, body) => {
      serve({
        [AUTO_PROXIES[1]]: body,
        [AUTO_PROXIES[2]]: feedXml("Codetabs"),
      });
      expect(await fetchFeedXml(TARGET, AUTO)).toBe(feedXml("Codetabs"));
    });

    it("rebuilds a feed from an rss2json answer", async () => {
      serve({ [AUTO_PROXIES[5]]: rss2json() });
      expect(await fetchFeedXml(TARGET, AUTO)).toContain("Via RSS2JSON");
    });

    it("keeps the guid an rss2json item reports apart from its link", async () => {
      serve({
        [AUTO_PROXIES[5]]: JSON.stringify({
          status: "ok",
          feed: { title: "Guids", link: "https://example.com" },
          items: [
            { title: "One", link: "https://example.com/1", guid: "guid-one" },
          ],
        }),
      });
      const xml = await fetchFeedXml(TARGET, AUTO);
      expect(xml).toContain("<guid>guid-one</guid>");
    });

    it.each([
      ["a status other than ok", JSON.stringify({ status: "error" })],
      [
        "a status other than ok next to a feed",
        JSON.stringify({
          status: "error",
          feed: { title: "Stale", link: "https://example.com" },
          items: [],
        }),
      ],
      ["no feed", JSON.stringify({ status: "ok" })],
    ])("skips an rss2json answer with %s", async (_l, body) => {
      serve({ [AUTO_PROXIES[5]]: body });
      await expect(fetchFeedXml(TARGET, AUTO)).rejects.toMatchObject({
        message: "not found",
      });
    });

    it("throws the direct attempt's error when every proxy fails", async () => {
      serve({ [TARGET]: plainPage("no feed") });
      await expect(fetchFeedXml(TARGET, AUTO)).rejects.toMatchObject({
        message: NOT_A_FEED,
      });
    });

    it("runs the direct attempt without the public chain, so a WordPress page ends it", async () => {
      const served = serve({ [TARGET]: "<html>WordPress</html>" });
      await expect(fetchFeedXml(TARGET, CONFIGURED)).rejects.toMatchObject({
        message:
          "All alternative feed URLs failed, received PHP file instead of RSS feed",
      });
      expect(served.requested).not.toContain(GET);
      expect(last(served.requested)).toBe(CUSTOM);
    });
  });

  describe("the encoding override", () => {
    it("reaches a raw proxy", async () => {
      serve({ [CUSTOM]: windows1251Feed() });
      expect(
        await fetchFeedXml(TARGET, CONFIGURED, undefined, "windows-1251"),
      ).toContain("Привет");
    });

    it("does not reach an AllOrigins get envelope", async () => {
      serve({ [AUTO_PROXIES[1]]: envelopeWithWindows1251() });
      const xml = await fetchFeedXml(TARGET, AUTO, undefined, "windows-1251");
      expect(xml).toContain("�");
      expect(xml).not.toContain("Привет");
    });
  });

  describe("on Android", () => {
    it("throws the direct attempt's error without asking a proxy", async () => {
      useAndroid();
      const served = serve({});
      await expect(fetchFeedXml(TARGET, CONFIGURED)).rejects.toMatchObject({
        message: "not found",
      });
      expect(served.requested).toEqual([TARGET]);
    });
  });

  describe("cancelling", () => {
    it("throws that it timed out, asking no proxy, when cancelled during the page", async () => {
      const controller = new AbortController();
      const served = serve({}, cancelOn(controller, TARGET));
      await expect(
        fetchFeedXml(TARGET, AUTO, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([TARGET]);
    });

    it("throws that it timed out before the next proxy when cancelled during a proxy that answered", async () => {
      const controller = new AbortController();
      const served = serve(
        { [AUTO_PROXIES[0]]: feedXml("Raw") },
        cancelOn(controller, AUTO_PROXIES[0]),
      );
      await expect(
        fetchFeedXml(TARGET, AUTO, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
      expect(served.requested).toEqual([TARGET, AUTO_PROXIES[0]]);
    });

    it("throws that it timed out when cancelled during the only proxy", async () => {
      // #1116: the abort lands during the configured proxy's request, and with
      // no further proxy to run the first pre-request check of the next
      // iteration never arrives. The loop re-checks before reporting the
      // direct attempt's error.
      const controller = new AbortController();
      serve({ [CUSTOM]: feedXml("Custom") }, cancelOn(controller, CUSTOM));
      await expect(
        fetchFeedXml(TARGET, CONFIGURED, controller.signal),
      ).rejects.toMatchObject({ message: "Timed out" });
    });

    it("counts requests for the page through the direct attempt only", async () => {
      const served = serve({ [CUSTOM]: feedXml("Custom") });
      await fetchFeedXml(TARGET, CONFIGURED);
      expect(requestsFor(served, TARGET)).toHaveLength(1);
    });
  });
});
