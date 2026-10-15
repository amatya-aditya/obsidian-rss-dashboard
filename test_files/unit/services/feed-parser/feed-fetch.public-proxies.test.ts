import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchThroughPublicProxies } from "../../../../src/services/feed-parser/feed-fetch-proxies.js";
import { TARGET, cancelOn, serve } from "./helpers/feed-fetch-serve.js";

// `fetchThroughPublicProxies` is the public proxy chain `tryFetch` runs after a
// failed direct attempt. When it is reached through `fetchFeedXml`, its last
// failure is later replaced by the fallback tail's own cancellation check, so
// these cases call it directly to pin the chain's own behaviour.

const ENCODED = encodeURIComponent(TARGET);
const GET = `https://api.allorigins.win/get?url=${ENCODED}`;
const RAW = `https://api.allorigins.win/raw?url=${ENCODED}`;
const CODETABS = `https://api.codetabs.com/v1/proxy/?quest=${ENCODED}`;
const ISO = `https://cors.isomorphic-git.org/${TARGET}`;
const THING = `https://thingproxy.freeboard.io/fetch/${ENCODED}`;

describe("fetchThroughPublicProxies", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws that it timed out when cancelled during the desktop discovery page", async () => {
    // The desktop chain asks AllOrigins get, AllOrigins raw, codetabs,
    // isomorphic-git and thingproxy, then reads the page again for discovery.
    const controller = new AbortController();
    const served = serve({}, cancelOn(controller, TARGET));
    await expect(
      fetchThroughPublicProxies(TARGET, controller.signal, undefined, false),
    ).rejects.toThrow("Timed out");
    expect(served.requested).toEqual([GET, RAW, CODETABS, ISO, THING, TARGET]);
  });
});
