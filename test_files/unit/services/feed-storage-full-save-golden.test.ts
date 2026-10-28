/**
 * #1521 AC-019: a full save of a fixture vault writes the same data.json and
 * shard text as the base commit (cd7d183d), apart from the sync nonce, the
 * padding and the shard timestamp. The golden is generated from a checkout of
 * the base by saving `actual` below from that checkout; the branch then asserts it
 * writes the same text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

const GOLDEN_PATH = "test_files/fixtures/feed-storage-full-save.golden.json";
const CREATED = 1_700_000_000_000;

function makeItem(guid: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: `Title ${guid}`,
    link: `https://example.com/${guid}`,
    description: "Body",
    pubDate: "2026-01-01T00:00:00Z",
    guid,
    read: guid === "b",
    starred: guid === "c",
    tags: guid === "a" ? [{ name: "Video", color: "#d04747" }] : [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function makeSettings(mode: RssDashboardSettings["storageMode"]) {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.folders.forEach((folder) => {
    folder.createdAt = CREATED;
    folder.modifiedAt = CREATED;
  });
  settings.storageMode = mode;
  settings.storageFolder = "rss-dashboard-data/feeds/";
  settings.feeds = ["one", "two", "three"].map((id, index): Feed => ({
    title: `Feed ${id}`,
    url: `https://example.com/${id}.xml`,
    folder: "RSS",
    feedId: `feed-${id}`,
    lastUpdated: index,
    items: [makeItem("a"), makeItem("b"), makeItem("c", { title: id })],
  }));
  return settings;
}

/** Drops what a save stamps freshly each time, keeping key order. */
function normalize(text: string): string {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  delete parsed._syncNonce;
  delete parsed._syncPad;
  delete parsed.updatedAt;
  return JSON.stringify(parsed, null, 2);
}

async function fullSave(
  mode: RssDashboardSettings["storageMode"],
): Promise<Record<string, string>> {
  const app = new App();
  const repository = new FeedStorageRepository(app);
  let saved = "";
  await repository.persistSettings(
    makeSettings(mode),
    (data) => {
      saved = JSON.stringify(data);
      return Promise.resolve();
    },
    { forceAllShards: true, forceMetadata: true },
  );
  const files = (app.vault as unknown as { adapterFiles: Map<string, string> })
    .adapterFiles;
  const out: Record<string, string> = { "data.json": normalize(saved) };
  for (const [path, text] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (path.endsWith(".json") && !path.endsWith("user-state.json")) {
      out[path] = normalize(text);
    }
  }
  return out;
}

describe("full save golden (AC-019)", () => {
  it("writes the same data.json and shard text as the base commit", async () => {
    const actual = {
      "vault-shards-v2": await fullSave("vault-shards-v2"),
      "vault-shards": await fullSave("vault-shards"),
    };
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as unknown;
    expect(actual).toEqual(golden);
  });
});
