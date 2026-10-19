// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { type RequestUrlResponse } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type MediaSettings,
} from "../../../../src/types/types.js";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class.js";
import { loadFeedForPreview } from "../../../../src/services/feed-parser/feed-preview.js";

// A trimmed copy of the live Harvard Business Review Atom response (GitHub
// #1338): HBR's CMS now serialises every element with an `ns6:` prefix bound to
// the Atom namespace. The prefix carries no meaning, so the feed must import
// exactly like its unprefixed form — through the fetch gate, the parser and the
// Add feed preview.
const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/rss/hbr-ns6-atom.xml",
);
const FEED_URL = "http://feeds.harvardbusiness.org/harvardbusiness/";

const mediaSettings: MediaSettings = {
  rememberPlaybackProgress: true,
  youtubeFocusMode: false,
  defaultMastodonFolder: "Mastodon",
  defaultYouTubeFolder: "Videos",
  defaultVideoTag: "Video",
  defaultVideoTags: ["Video"],
  defaultYouTubeTag: "Video",
  defaultYouTubeTags: ["Video"],
  defaultPodcastFolder: "Podcast",
  defaultPodcastTags: ["Podcast"],
  defaultRssFolder: "RSS",
  defaultRssTag: "",
  defaultRssTags: [],
  defaultSmallwebFolder: "Smallweb",
  defaultSmallwebTag: "",
  defaultSmallwebTags: [],
  defaultMastodonTag: "",
  defaultMastodonTags: [],
  podcastTheme: "obsidian",
  enableApplePodcastsOpen: false,
  defaultPlaySpeed: 1,
};

/** A minimal but fully-typed {@link RequestUrlResponse} stub for mocking. */
function mockResponse(text: string): RequestUrlResponse {
  return {
    status: 200,
    text,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: null,
  };
}

describe("namespace-prefixed HBR feed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports the entries with title, link, date, author and summary", async () => {
    const xml = readFileSync(FIXTURE_PATH, "utf8");
    vi.spyOn(obsidian, "requestUrl").mockResolvedValue(mockResponse(xml));

    const parser = new FeedParser(DEFAULT_SETTINGS.display, [], mediaSettings);
    const feed = await parser.parseFeed(FEED_URL, null);

    expect(feed.items).toHaveLength(3);

    const sponsored = feed.items.find((item) =>
      item.title.startsWith("From Factory Data to Trusted Action"),
    );
    expect(sponsored?.link).toContain(
      "/sponsored/2026/10/from-factory-data-to-trusted-action-putting-agentic-ai-to-work-in-manufacturing",
    );
    expect(sponsored?.pubDate).toBe("2026-10-16T05:05:04Z");
    expect(sponsored?.summary).toBeTruthy();

    // The real entry carries four bylines; all of them survive the import.
    const multiAuthor = feed.items.find(
      (item) =>
        item.title ===
        "Turn Vibe-Coded Prototypes Into Tools Your Company Can Actually Use",
    );
    expect(multiAuthor?.authors).toEqual([
      "José Parra Moyano",
      "Karl Schmedders",
      "Olivier Laplace",
      "Benjamin Torben-Nielsen",
    ]);
    expect(multiAuthor?.author).toBe(
      "José Parra Moyano, Karl Schmedders, Olivier Laplace, Benjamin Torben-Nielsen",
    );

    const singleAuthor = feed.items.find(
      (item) => item.title === "The Most Consequential Move a New CEO Can Make",
    );
    expect(singleAuthor?.author).toBe("Adi Ignatius");
    expect(singleAuthor?.authors).toEqual(["Adi Ignatius"]);
  });

  it("shows the feed title and a non-zero item count in the Add feed preview", async () => {
    const xml = readFileSync(FIXTURE_PATH, "utf8");
    vi.spyOn(obsidian, "requestUrl").mockResolvedValue(mockResponse(xml));

    const preview = await loadFeedForPreview(FEED_URL);

    expect(preview.title).toBe("HBR CMS");
    expect(preview.hasEntries).toBe(true);
    expect(preview.latestPubDate).not.toBe("");
  });
});
