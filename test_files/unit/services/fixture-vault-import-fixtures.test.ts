import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpmlManager } from "../../../src/services/opml-manager";
import {
  parseFeedBundle,
  parsePortableDataBundle,
  parseSettingsBundle,
} from "../../../src/services/feed-storage-repository";
import {
  ImportExportService,
  type ImportConfirmation,
  type ImportKind,
} from "../../../src/services/import-export-service";
import {
  mapStarredExportToCandidates,
  type StarredJsonExport,
} from "../../../src/services/starred-import-mapper";
import { loadAndNormalizeSettings } from "../../../src/utils/settings-loader";
import type { Feed, RssDashboardSettings } from "../../../src/types/types";
import { TEMPLATE_DIR } from "../../../scripts/generate-fixture-vault.mjs";

// Parses every file in the fixture vault's import-fixtures folder with the
// plugin's real parsers and validators, so the files a maintainer picks in
// the import dialogs keep matching the formats the plugin accepts.

const IMPORT_DIR = join(TEMPLATE_DIR, "import-fixtures");

function readFixture(name: string): string {
  return readFileSync(join(IMPORT_DIR, name), "utf8");
}

function readJsonFixture(name: string): unknown {
  return JSON.parse(readFixture(name));
}

/** The fixture vault's own settings and feeds, as the import dialogs see them. */
function fixtureVaultSettings(): RssDashboardSettings {
  const metadata = JSON.parse(
    readFileSync(join(TEMPLATE_DIR, "rss-dashboard-data", "data.json"), "utf8"),
  ) as Partial<RssDashboardSettings>;
  const settings = loadAndNormalizeSettings(metadata);
  for (const feed of settings.feeds) {
    const shard = JSON.parse(
      readFileSync(
        join(TEMPLATE_DIR, "rss-dashboard-data", "feeds", `${feed.feedId}.json`),
        "utf8",
      ),
    ) as { items: Feed["items"] };
    feed.items = shard.items;
  }
  return settings;
}

function importService(settings: RssDashboardSettings) {
  const confirmations: ImportConfirmation[] = [];
  const applied: Array<{ preferences: Record<string, unknown>; kind: ImportKind }> = [];
  const service = new ImportExportService({
    settings,
    isMobile: false,
    importUserPreferences: async (preferences, kind) => {
      applied.push({ preferences, kind });
    },
    confirmImport: async (confirmation) => {
      confirmations.push(confirmation);
      return "confirm";
    },
  });
  return { service, confirmations, applied };
}

function fixtureFile(name: string): File {
  return new File([readFixture(name)], name, { type: "application/json" });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.empty();
});

describe("Fixture vault import fixtures", () => {
  it("has an OPML file with nested folders, a root feed, and a feed the vault already follows", () => {
    const { feeds, folders } = OpmlManager.parseOpml(readFixture("feeds.opml"));

    expect(feeds.map((feed) => feed.folder)).toEqual([
      "Comics",
      "News/Tech",
      "News/Tech",
      "Uncategorized",
    ]);
    expect(folders.map((folder) => folder.name)).toEqual(["Comics", "News"]);
    expect(folders[1].subfolders.map((folder) => folder.name)).toEqual(["Tech"]);

    const existingUrls = new Set(fixtureVaultSettings().feeds.map((feed) => feed.url));
    expect(feeds.filter((feed) => existingUrls.has(feed.url))).toHaveLength(1);
  });

  it("has a starred.json with a known feed, a new feed, labels, and one entry the importer rejects", () => {
    const parsed = readJsonFixture("starred.json") as StarredJsonExport;
    const settings = fixtureVaultSettings();

    expect(Array.isArray(parsed.items)).toBe(true);
    const { candidates, unimportable } = mapStarredExportToCandidates(
      parsed,
      settings.feeds,
      settings.availableTags,
    );

    expect(candidates.map((candidate) => candidate.isNewFeed)).toEqual([false, true]);
    expect(unimportable).toEqual([
      expect.objectContaining({ reason: "no_article_url" }),
    ]);
    const labelTags = candidates.flatMap((candidate) => candidate.item.tags ?? []);
    expect(labelTags).toContainEqual({ name: "Read later", color: "#3498db" });
    expect(labelTags.map((tag) => tag.name)).toContain("Starred import");
  });

  it("has a Feed bundle whose shards match its feeds", () => {
    const bundle = parseFeedBundle(readJsonFixture("rss-dashboard-feed-bundle.json"));

    expect(bundle.feeds).toHaveLength(2);
    expect(bundle.shards.map((shard) => shard.feedId)).toEqual(
      bundle.feeds.map((feed) => feed.feedId),
    );
    expect(bundle.shards.some((shard) => shard.items.some((item) => item.starred))).toBe(
      true,
    );
  });

  it("has a Settings bundle that changes preferences without moving storage", () => {
    const bundle = parseSettingsBundle(readJsonFixture("rss-dashboard-settings-bundle.json"));

    expect(bundle.settings).not.toHaveProperty("feeds");
    expect(bundle.settings.storageMode).toBe("vault-shards-v2");
    expect(bundle.settings.storageFolder).toBe(fixtureVaultSettings().storageFolder);
    expect(bundle.metadataStorageFolder).toBe(fixtureVaultSettings().metadataStorageFolder);
  });

  it("has a Portable data bundle with feeds, articles, and settings", () => {
    const bundle = parsePortableDataBundle(
      readJsonFixture("rss-dashboard-portable-bundle.json"),
    );

    expect(bundle.storageMode).toBe("vault-shards-v2");
    expect(bundle.metadata.feeds).toHaveLength(1);
    expect(bundle.shards[0].feedId).toBe(bundle.metadata.feeds[0].feedId);
    expect(bundle.shards[0].items.length).toBeGreaterThan(0);
  });

  it("has a user preferences file that only overwrites preferences", async () => {
    const { service, confirmations, applied } = importService(fixtureVaultSettings());

    const result = await service.importUserPreferencesFromFile(
      fixtureFile("rss-dashboard-user-preferences.json"),
    );

    expect(result).toBe("committed");
    expect(applied.map((entry) => entry.kind)).toEqual(["overwriting"]);
    expect(confirmations[0].preferences?.changedCount).toBeGreaterThan(0);
    expect(confirmations[0].storageLocationChange).toBeNull();
  });

  it("has a preferences file with folders and tags but no feeds, which keeps the vault's feeds", async () => {
    const settings = fixtureVaultSettings();
    const { service, confirmations, applied } = importService(settings);

    await service.importUserPreferencesFromFile(
      fixtureFile("preferences-folders-and-tags-only.json"),
    );

    expect(applied[0].preferences).not.toHaveProperty("feeds");
    expect(applied[0].kind).toBe("replacing");
    const feedData = confirmations[0].feedData;
    expect(feedData?.incoming.feeds).toBe(settings.feeds.length);
    expect(feedData?.incoming.articles).toBe(feedData?.current.articles);
    expect(feedData?.incoming.folders).toBeGreaterThan(feedData?.current.folders ?? 0);
    expect(feedData?.incoming.tags).toBeGreaterThan(feedData?.current.tags ?? 0);
  });
});
