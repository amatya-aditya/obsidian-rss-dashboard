/**
 * Characterization tests for the bundle parsers (#472), pinned before
 * `parsePortableDataBundle`, `parseFeedBundle` and `parseSettingsBundle` move
 * out of `feed-storage-repository.ts` (#436, phase 8). They pin what each
 * parser accepts, the exact error for each rejection and the order of the
 * checks, and the shape of what it returns. They only use the repository's
 * public `validate*Bundle` methods, which stay as delegates after the
 * extraction.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";

const STORAGE_MODES = [
  "legacy-json",
  "vault-shards",
  "vault-shards-v2",
] as const;
const NON_OBJECTS: unknown[] = [
  null,
  undefined,
  0,
  false,
  "",
  "bundle",
  42,
  true,
];

let repository: FeedStorageRepository;

beforeEach(() => {
  repository = new FeedStorageRepository(App.createMock());
});

function shard(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { feedId: "feed-1", items: [], ...overrides };
}

describe("Portable bundle parsing", () => {
  function portable(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      version: 1,
      exportedAt: 1_700_000_000_000,
      storageMode: "vault-shards-v2",
      metadata: { feeds: [] },
      shards: [shard()],
      ...overrides,
    };
  }

  const parse = (input: unknown) =>
    repository.validatePortableDataBundle(input);

  it.each(NON_OBJECTS)("rejects %j as not a JSON object", (input) => {
    expect(() => parse(input)).toThrow("Portable bundle must be a JSON object");
  });

  it("treats an array as an object and rejects it on the version", () => {
    expect(() => parse([])).toThrow(
      "Unsupported portable bundle version: undefined (expected 1)",
    );
  });

  it.each([
    [undefined, "undefined"],
    [2, "2"],
    ["1", "1"],
    [null, "null"],
  ])("rejects version %j and names it in the error", (version, shown) => {
    expect(() => parse(portable({ version }))).toThrow(
      `Unsupported portable bundle version: ${shown} (expected 1)`,
    );
  });

  it.each([undefined, "1700000000000", null])(
    "rejects exportedAt %j",
    (exportedAt) => {
      expect(() => parse(portable({ exportedAt }))).toThrow(
        "Portable bundle is missing a valid exportedAt timestamp",
      );
    },
  );

  it.each([undefined, "markdown", "VAULT-SHARDS"])(
    "rejects storageMode %j",
    (storageMode) => {
      expect(() => parse(portable({ storageMode }))).toThrow(
        "Portable bundle has an invalid storageMode value",
      );
    },
  );

  it.each(STORAGE_MODES)("accepts storageMode %s", (storageMode) => {
    expect(parse(portable({ storageMode })).storageMode).toBe(storageMode);
  });

  it.each([undefined, null, "settings", 7])(
    "rejects metadata %j",
    (metadata) => {
      expect(() => parse(portable({ metadata }))).toThrow(
        "Portable bundle is missing metadata",
      );
    },
  );

  it("accepts any object as metadata, including an array", () => {
    expect(parse(portable({ metadata: [] })).metadata).toEqual([]);
  });

  it.each([undefined, null, {}, "shards"])("rejects shards %j", (shards) => {
    expect(() => parse(portable({ shards }))).toThrow(
      "Portable bundle is missing shards",
    );
  });

  it("accepts an empty shard list", () => {
    expect(parse(portable({ shards: [] })).shards).toEqual([]);
  });

  it.each([null, 0, "feed-1"])("rejects shard entry %j", (entry) => {
    expect(() => parse(portable({ shards: [shard(), entry] }))).toThrow(
      "Portable bundle has an invalid shard entry",
    );
  });

  it.each([undefined, "", "   ", 42])("rejects shard feedId %j", (feedId) => {
    expect(() => parse(portable({ shards: [shard({ feedId })] }))).toThrow(
      "Portable bundle shard is missing feedId",
    );
  });

  it.each([undefined, {}, "items"])(
    "rejects shard items %j and names the feed",
    (items) => {
      expect(() =>
        parse(portable({ shards: [shard({ feedId: "feed-9", items })] })),
      ).toThrow("Portable bundle shard feed-9 is missing items");
    },
  );

  it("does not check a shard's version, feedUrl or item contents", () => {
    const loose = shard({ version: 99, feedUrl: 5, items: [42, null] });
    expect(parse(portable({ shards: [loose] })).shards[0]).toBe(loose);
  });

  it("checks version, exportedAt, storageMode, metadata, then shards", () => {
    expect(() =>
      parse({ version: 2, exportedAt: "x", storageMode: "x", shards: "x" }),
    ).toThrow("Unsupported portable bundle version");
    expect(() =>
      parse({ version: 1, exportedAt: "x", storageMode: "x", shards: "x" }),
    ).toThrow("exportedAt");
    expect(() =>
      parse({ version: 1, exportedAt: 1, storageMode: "x", shards: "x" }),
    ).toThrow("storageMode");
    expect(() =>
      parse({
        version: 1,
        exportedAt: 1,
        storageMode: "vault-shards",
        shards: "x",
      }),
    ).toThrow("missing metadata");
  });

  it("returns the input object itself, extra fields included", () => {
    const input = portable({
      markdownMirrorFallbackPlanned: true,
      extra: "kept",
    });
    const result = parse(input);

    expect(result).toBe(input);
    expect(result).toHaveProperty("extra", "kept");
  });
});

describe("Feed bundle parsing", () => {
  function feedBundle(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      version: 1,
      exportedAt: 1_700_000_000_000,
      feeds: [{ title: "Feed", url: "https://example.com/feed.xml" }],
      folders: [{ name: "News", subfolders: [] }],
      availableTags: [{ name: "later", color: "#fff" }],
      shards: [shard()],
      ...overrides,
    };
  }

  const parse = (input: unknown) => repository.validateFeedBundle(input);

  it.each(NON_OBJECTS)("rejects %j as not a JSON object", (input) => {
    expect(() => parse(input)).toThrow("Feed bundle must be a JSON object");
  });

  it("treats an array as an object and rejects it on the version", () => {
    expect(() => parse([])).toThrow(
      "Unsupported feed bundle version: undefined (expected 1)",
    );
  });

  it.each([
    [undefined, "undefined"],
    [2, "2"],
    ["1", "1"],
  ])("rejects version %j and names it in the error", (version, shown) => {
    expect(() => parse(feedBundle({ version }))).toThrow(
      `Unsupported feed bundle version: ${shown} (expected 1)`,
    );
  });

  it.each([undefined, "1700000000000"])(
    "rejects exportedAt %j",
    (exportedAt) => {
      expect(() => parse(feedBundle({ exportedAt }))).toThrow(
        "Feed bundle is missing a valid exportedAt timestamp",
      );
    },
  );

  it.each([
    ["feeds", "Feed bundle is missing feeds"],
    ["folders", "Feed bundle is missing folders"],
    ["availableTags", "Feed bundle is missing availableTags"],
  ])("rejects a bundle whose %s is not an array", (field, message) => {
    expect(() => parse(feedBundle({ [field]: undefined }))).toThrow(message);
    expect(() => parse(feedBundle({ [field]: {} }))).toThrow(message);
  });

  it("checks feeds, folders, availableTags, then shards", () => {
    expect(() =>
      parse(
        feedBundle({
          feeds: null,
          folders: null,
          availableTags: null,
          shards: null,
        }),
      ),
    ).toThrow("missing feeds");
    expect(() =>
      parse(feedBundle({ folders: null, availableTags: null, shards: null })),
    ).toThrow("missing folders");
    expect(() =>
      parse(feedBundle({ availableTags: null, shards: null })),
    ).toThrow("missing availableTags");
  });

  it("does not check the contents of feeds, folders or tags", () => {
    const result = parse(
      feedBundle({ feeds: [42], folders: ["x"], availableTags: [null] }),
    );

    expect(result.feeds).toEqual([42]);
    expect(result.folders).toEqual(["x"]);
    expect(result.availableTags).toEqual([null]);
  });

  it.each([undefined, null, {}])("rejects shards %j", (shards) => {
    expect(() => parse(feedBundle({ shards }))).toThrow(
      "Bundle is missing shards",
    );
  });

  it.each([null, 0, "feed-1"])("rejects shard entry %j", (entry) => {
    expect(() => parse(feedBundle({ shards: [entry] }))).toThrow(
      "Bundle has an invalid shard entry",
    );
  });

  it.each([undefined, "", "   ", 42])("rejects shard feedId %j", (feedId) => {
    expect(() => parse(feedBundle({ shards: [shard({ feedId })] }))).toThrow(
      "Bundle shard is missing feedId",
    );
  });

  it("rejects a shard without an items array and names the feed", () => {
    expect(() =>
      parse(feedBundle({ shards: [shard({ feedId: "feed-9", items: {} })] })),
    ).toThrow("Bundle shard feed-9 is missing items");
  });

  it("returns a new object with only the six bundle fields, sharing the input's arrays", () => {
    const input = feedBundle({ extra: "dropped", storageMode: "vault-shards" });
    const result = parse(input);

    expect(result).not.toBe(input);
    expect(Object.keys(result)).toEqual([
      "version",
      "exportedAt",
      "feeds",
      "folders",
      "availableTags",
      "shards",
    ]);
    expect(result.feeds).toBe(input.feeds);
    expect(result.folders).toBe(input.folders);
    expect(result.availableTags).toBe(input.availableTags);
    expect(result.shards).toBe(input.shards);
  });
});

describe("Settings bundle parsing", () => {
  function settingsBundle(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      version: 1,
      exportedAt: 1_700_000_000_000,
      metadataStorageMode: "vault-shards-v2",
      metadataStorageFolder: ".rss-dashboard-data",
      settings: { storageMode: "vault-shards-v2", refreshInterval: 30 },
      ...overrides,
    };
  }

  const parse = (input: unknown) => repository.validateSettingsBundle(input);

  it.each(NON_OBJECTS)("rejects %j as not a JSON object", (input) => {
    expect(() => parse(input)).toThrow("Settings bundle must be a JSON object");
  });

  it("treats an array as an object and rejects it on the version", () => {
    expect(() => parse([])).toThrow(
      "Unsupported settings bundle version: undefined (expected 1)",
    );
  });

  it.each([
    [undefined, "undefined"],
    [2, "2"],
    ["1", "1"],
  ])("rejects version %j and names it in the error", (version, shown) => {
    expect(() => parse(settingsBundle({ version }))).toThrow(
      `Unsupported settings bundle version: ${shown} (expected 1)`,
    );
  });

  it.each([undefined, "1700000000000"])(
    "rejects exportedAt %j",
    (exportedAt) => {
      expect(() => parse(settingsBundle({ exportedAt }))).toThrow(
        "Settings bundle is missing a valid exportedAt timestamp",
      );
    },
  );

  it.each([undefined, null, "settings", 7])(
    "rejects settings %j",
    (settings) => {
      expect(() => parse(settingsBundle({ settings }))).toThrow(
        "Settings bundle is missing settings",
      );
    },
  );

  it.each([undefined, "markdown"])(
    "rejects settings.storageMode %j",
    (storageMode) => {
      expect(() =>
        parse(settingsBundle({ settings: { storageMode } })),
      ).toThrow("Settings bundle has an invalid storageMode value");
    },
  );

  it("rejects array settings on the storageMode check", () => {
    expect(() => parse(settingsBundle({ settings: [] }))).toThrow(
      "Settings bundle has an invalid storageMode value",
    );
  });

  it.each(STORAGE_MODES)("accepts settings.storageMode %s", (storageMode) => {
    expect(
      parse(settingsBundle({ settings: { storageMode } })).settings.storageMode,
    ).toBe(storageMode);
  });

  it("strips feeds, folders and availableTags from the settings and keeps every other key", () => {
    const input = settingsBundle({
      settings: {
        storageMode: "vault-shards",
        feeds: [{ title: "Feed" }],
        folders: [{ name: "News" }],
        availableTags: [{ name: "later" }],
        refreshInterval: 30,
        unknownKey: "kept",
      },
    });
    const result = parse(input);

    expect(result.settings).toEqual({
      storageMode: "vault-shards",
      refreshInterval: 30,
      unknownKey: "kept",
    });
    expect(result.settings).not.toBe(input.settings);
    expect(input.settings).toHaveProperty("feeds");
  });

  it("passes the metadata storage fields through without checking them", () => {
    const result = parse(
      settingsBundle({ metadataStorageMode: 42, metadataStorageFolder: false }),
    );

    expect(result.metadataStorageMode).toBe(42);
    expect(result.metadataStorageFolder).toBe(false);
  });

  it("returns a new object with only the five bundle fields, even when the metadata fields are absent", () => {
    const input = settingsBundle({
      metadataStorageMode: undefined,
      metadataStorageFolder: undefined,
      extra: "dropped",
    });
    delete input.metadataStorageMode;
    delete input.metadataStorageFolder;
    const result = parse(input);

    expect(result).not.toBe(input);
    expect(Object.keys(result)).toEqual([
      "version",
      "exportedAt",
      "metadataStorageMode",
      "metadataStorageFolder",
      "settings",
    ]);
    expect(result.metadataStorageMode).toBeUndefined();
    expect(result.metadataStorageFolder).toBeUndefined();
  });
});
