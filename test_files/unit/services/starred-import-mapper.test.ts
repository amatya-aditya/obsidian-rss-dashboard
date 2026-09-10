import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapStarredExportToCandidates,
  type StarredJsonExport,
} from "../../../src/services/starred-import-mapper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFixture(): StarredJsonExport {
  const fixturePath = path.resolve(
    __dirname,
    "..",
    "..",
    "fixtures",
    "starred",
    "starred.json",
  );
  return JSON.parse(readFileSync(fixturePath, "utf-8")) as StarredJsonExport;
}

const EXISTING_FEEDS = [
  { url: "https://example-feed.test/rss", title: "Example Feed" },
  { url: "https://example.com/blog/feed.xml", title: "Example Blog" },
];

describe("mapStarredExportToCandidates", () => {
  it("only produces candidates for items whose source feed already exists locally", () => {
    const parsed = loadFixture();

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.item.guid)).toEqual([
      "tag:google.com,2005:reader/item/0000000000000001",
      "tag:google.com,2005:reader/item/0000000000000002",
    ]);
  });

  it("excludes items whose origin.streamId does not match any local feed", () => {
    const parsed = loadFixture();

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(
      candidates.some(
        (c) => c.item.title === "Unsubscribed Source Article",
      ),
    ).toBe(false);
  });

  it("excludes items with no origin.streamId at all", () => {
    const parsed: StarredJsonExport = {
      items: [
        {
          id: "tag:google.com,2005:reader/item/no-origin",
          title: "No origin item",
          canonical: [{ href: "https://example-feed.test/articles/x" }],
        },
      ],
    };

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(0);
  });

  it("maps title, link (canonical preferred), content, author, published date, and guid", () => {
    const parsed = loadFixture();

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);
    const first = candidates[0].item;

    expect(first.title).toBe("Existing Feed Article One");
    expect(first.link).toBe("https://example-feed.test/articles/one");
    expect(first.description).toBe(
      "<p>Placeholder summary content for article one.</p>",
    );
    expect(first.content).toBe(
      "<p>Placeholder summary content for article one.</p>",
    );
    expect(first.guid).toBe(
      "tag:google.com,2005:reader/item/0000000000000001",
    );
    expect(first.author).toBeUndefined();
    expect(new Date(first.pubDate).toISOString()).toBe(
      new Date(1699999000 * 1000).toISOString(),
    );
  });

  it("falls back to the alternate href when no canonical href is present", () => {
    const parsed: StarredJsonExport = {
      items: [
        {
          id: "tag:google.com,2005:reader/item/alt-only",
          title: "Alternate only",
          alternate: [{ href: "https://example-feed.test/alt-link", type: "text/html" }],
          origin: { streamId: "feed/https://example-feed.test/rss" },
        },
      ],
    };

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].item.link).toBe("https://example-feed.test/alt-link");
  });

  it("sets starred true unconditionally", () => {
    const parsed = loadFixture();

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    for (const candidate of candidates) {
      expect(candidate.item.starred).toBe(true);
    }
  });

  it("passes through the exported read state", () => {
    const parsed = loadFixture();

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);
    const readItem = candidates.find((c) => c.item.guid.endsWith("0001"));
    const unreadItem = candidates.find((c) => c.item.guid.endsWith("0002"));

    expect(readItem?.item.read).toBe(true);
    expect(unreadItem?.item.read).toBe(false);
  });

  it("ignores label categories on the labeled item without any tag side effects", () => {
    const parsed = loadFixture();

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);
    const labeled = candidates.find((c) => c.item.guid.endsWith("0002"));

    expect(labeled).toBeDefined();
    expect(labeled?.item.author).toBe("Jane Example");
    expect(labeled?.item.tags).toBeUndefined();
  });

  it("groups candidates under the matching local feed's url and title", () => {
    const parsed = loadFixture();

    const candidates = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates[0].feedUrl).toBe("https://example-feed.test/rss");
    expect(candidates[0].feedTitle).toBe("Example Feed");
    expect(candidates[1].feedUrl).toBe("https://example.com/blog/feed.xml");
    expect(candidates[1].feedTitle).toBe("Example Blog");
  });
});
