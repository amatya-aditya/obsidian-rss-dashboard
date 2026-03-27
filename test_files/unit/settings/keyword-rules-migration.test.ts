import { describe, it, expect } from "vitest";
import { migrateKeywordRulesSettings } from "../../../src/utils/settings-migration";

describe("migrateKeywordRulesSettings()", () => {
  it("migrates legacy global `filters` -> `keywordRules` and removes `filters`", () => {
    const settings: Record<string, unknown> = {
      filters: { includeLogic: "OR", bypassAll: true, rules: [] },
      feeds: [],
    };

    const changed = migrateKeywordRulesSettings(settings);

    expect(changed).toBe(true);
    expect(settings.filters).toBeUndefined();
    expect(settings.keywordRules).toEqual({
      includeLogic: "OR",
      bypassAll: true,
      rules: [],
    });
  });

  it("prefers legacy `filters` over default `keywordRules` populated from defaults", () => {
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "AND", bypassAll: false, rules: [] },
      filters: { includeLogic: "OR", bypassAll: true, rules: ["legacy"] },
      feeds: [],
    };

    const changed = migrateKeywordRulesSettings(settings);

    expect(changed).toBe(true);
    expect(settings.filters).toBeUndefined();
    expect(settings.keywordRules).toEqual({
      includeLogic: "OR",
      bypassAll: true,
      rules: ["legacy"],
    });
  });

  it("migrates legacy `feed.filters` -> `feed.keywordRules` and renames override flag", () => {
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "AND", bypassAll: false, rules: [] },
      feeds: [
        {
          title: "A",
          url: "a",
          folder: "Work",
          items: [],
          lastUpdated: 0,
          filters: { overrideGlobalFilters: true, includeLogic: "OR", rules: [] },
        },
      ],
    };

    const changed = migrateKeywordRulesSettings(settings);

    expect(changed).toBe(true);
    const feed = (settings.feeds as Array<Record<string, unknown>>)[0];
    expect(feed.filters).toBeUndefined();
    expect(feed.keywordRules).toEqual({
      overrideGlobalRules: true,
      includeLogic: "OR",
      rules: [],
    });
  });

  it("normalizes invalid fields on existing keyword-rules objects", () => {
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "BAD", bypassAll: "nope", rules: "nope" },
      feeds: [
        {
          keywordRules: {
            overrideGlobalRules: "nope",
            includeLogic: "BAD",
            rules: "nope",
          },
        },
      ],
    };

    const changed = migrateKeywordRulesSettings(settings);

    expect(changed).toBe(true);
    expect(settings.keywordRules).toEqual({
      includeLogic: "AND",
      bypassAll: false,
      rules: [],
    });
    const feed = (settings.feeds as Array<Record<string, unknown>>)[0];
    expect(feed.keywordRules).toEqual({
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [],
    });
  });

  it("cleans up legacy keys when both legacy and new keys exist", () => {
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "OR", bypassAll: false, rules: [] },
      filters: { includeLogic: "AND", bypassAll: true, rules: ["legacy"] },
      feeds: [
        {
          keywordRules: { overrideGlobalRules: false, includeLogic: "OR", rules: [] },
          filters: { overrideGlobalFilters: true, includeLogic: "AND", rules: ["legacy"] },
        },
      ],
    };

    const changed = migrateKeywordRulesSettings(settings);

    expect(changed).toBe(true);
    expect(settings.filters).toBeUndefined();
    const feed = (settings.feeds as Array<Record<string, unknown>>)[0];
    expect(feed.filters).toBeUndefined();
    expect(feed.keywordRules).toEqual({
      overrideGlobalRules: false,
      includeLogic: "OR",
      rules: [],
    });
  });
});
