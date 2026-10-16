import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAndLoadPreview } from "../../../src/modals/feed-manager/feed-preview-loader";
import {
  feedXml,
  plainPage,
  serve,
} from "../services/feed-parser/helpers/feed-fetch-serve.js";

// Walks the real preview path (no mock of the preview service) so the
// page -> discovery -> resolved-address wiring is observed end to end, which is
// what the Add feed dialog does when you click Load. GitHub #1201.

const PAGE = "https://example.com/blog";
const DISCOVERED = "https://example.com/posts.xml";

function pageAdvertisingFeed(): string {
  return plainPage(
    `<link rel="alternate" type="application/rss+xml" href="/posts.xml">`,
  );
}

describe("resolveAndLoadPreview() feed discovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a page address to the feed it advertises and reports that address", async () => {
    const served = serve({
      [PAGE]: pageAdvertisingFeed(),
      [DISCOVERED]: feedXml("Discovered"),
    });

    const result = await resolveAndLoadPreview(PAGE, {
      corsProxyEnabled: false,
    });

    expect(result.inputUrl).toBe(PAGE);
    expect(result.finalUrl).toBe(DISCOVERED);
    expect(result.title).toBe("Discovered");
    expect(served.requested).toContain(DISCOVERED);
  });

  it("keeps a page address that advertises no feed, and fails rather than resolving", async () => {
    serve({ [PAGE]: plainPage("no feed here") });

    await expect(
      resolveAndLoadPreview(PAGE, { corsProxyEnabled: false }),
    ).rejects.toThrow(/page with no feed/);
  });
});
