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
import {
  getArticlePreviewSummaryText,
  resolveArticlePreviewImage,
} from "../../../../src/utils/article-preview-utils.js";

// The captured Stack Overflow Blog feed: empty descriptions and no images.
const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/rss/stackoverflow-empty-descriptions.xml",
);

const mediaSettings: MediaSettings = {
  autoTagVideos: true,
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
  openInSplitView: true,
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

describe("Stack Overflow Blog feed fixture", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("models a feed with empty descriptions and no images", async () => {
    const xml = readFileSync(FIXTURE_PATH, "utf8");
    vi.spyOn(obsidian, "requestUrl").mockResolvedValue(mockResponse(xml));

    const parser = new FeedParser(DEFAULT_SETTINGS.display, [], mediaSettings);
    const parsed = await parser.parseFeed(
      "https://stackoverflow.blog/feed/",
      null,
    );

    expect(parsed.items).toHaveLength(40);

    const emptyDescriptionItems = parsed.items.filter(
      (item) => !(item.description ?? "").trim(),
    );
    expect(emptyDescriptionItems).toHaveLength(8);

    // The feed ships no image markup, so no item resolves a preview image...
    for (const item of parsed.items) {
      expect(
        resolveArticlePreviewImage(item, ["coverImage", "image"]),
      ).toBeUndefined();
    }

    // ...and an item with an empty description resolves no preview text either.
    for (const item of emptyDescriptionItems) {
      expect(getArticlePreviewSummaryText(item)).toBe("");
    }
  });
});
