import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { resolvePodcastPlatformUrl } from "../../../../src/services/feed-parser/podcast-platform-resolver.js";

function response(text: string): obsidian.RequestUrlResponse {
  return {
    text,
    status: 200,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: {},
  };
}

// Runs the page-title fallback and returns the search term it sent.
async function searchedTerm(ogTitle: string): Promise<string | undefined> {
  const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
  requestUrlSpy.mockReset();
  const page = `<html><head><meta property="og:title" content="${ogTitle}"></head></html>`;
  requestUrlSpy.mockResolvedValueOnce(
    response(JSON.stringify({ contents: page })),
  );
  requestUrlSpy.mockResolvedValueOnce(
    response(JSON.stringify({ results: [] })),
  );
  // An empty search result makes the resolver reject; only the request matters.
  await resolvePodcastPlatformUrl(
    "https://pocketcasts.com/podcast/x/abc",
  ).catch(() => null);
  const call = requestUrlSpy.mock.calls
    .map((c) => (c[0] as { url: string }).url)
    .find((u) => u.startsWith("https://itunes.apple.com/search"));
  const term = call ? new URL(call).searchParams.get("term") : null;
  return term ?? undefined;
}

describe("podcast title lookup text", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["a plain title", "My Show", "My Show"],
    ["an ampersand", "Tom &amp; Jerry", "Tom & Jerry"],
    ["quotes", "The &quot;Best&quot; Show", 'The "Best" Show'],
    ["an apostrophe", "Marc&#39;s Show", "Marc's Show"],
    ["angle brackets", "A &lt;b&gt; Show", "A <b> Show"],
    ["a numeric reference", "It&#8217;s", "It’s"],
    ["a named letter", "Caf&eacute;", "Café"],
  ])("searches with %s", async (_name, input, expected) => {
    expect(await searchedTerm(input)).toBe(expected);
  });

  // An ampersand entity is decoded once and stops there.
  it("keeps an escaped entity after a single decode", async () => {
    expect(await searchedTerm("A &amp;lt; B")).toBe("A &lt; B");
  });
});
