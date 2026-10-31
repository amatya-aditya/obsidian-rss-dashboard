import { describe, it, expect } from "vitest";
import { migrateKeywordRulesSettings } from "../../../src/utils/settings-migration";

describe("migrateKeywordRulesSettings() characterization", () => {
  it("migrates legacy global filters and removes the old key", () => {
    const settings: Record<string, unknown> = {
      filters: { includeLogic: "OR", bypassAll: true, rules: ["legacy"] },
      feeds: [],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(true);
    expect(settings).toEqual({
      keywordRules: { includeLogic: "OR", bypassAll: true, rules: ["legacy"] },
      feeds: [],
    });
  });

  it("uses legacy filters when current global rules contain defaults", () => {
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "AND", bypassAll: false, rules: [] },
      filters: { includeLogic: "OR", bypassAll: true, rules: ["legacy"] },
      feeds: [],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(true);
    expect(settings.keywordRules).toEqual({
      includeLogic: "OR",
      bypassAll: true,
      rules: ["legacy"],
    });
    expect(settings.filters).toBeUndefined();
  });

  it("keeps populated current global rules when legacy filters also exist", () => {
    const currentRules = {
      includeLogic: "OR",
      bypassAll: false,
      rules: ["new"],
    };
    const settings: Record<string, unknown> = {
      keywordRules: currentRules,
      filters: { includeLogic: "AND", bypassAll: true, rules: ["old"] },
      feeds: [],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(true);
    expect(settings.keywordRules).toBe(currentRules);
    expect(settings.filters).toBeUndefined();
  });

  it("creates and normalizes global defaults for malformed settings", () => {
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "BAD", bypassAll: "no", rules: "no" },
      feeds: [],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(true);
    expect(settings.keywordRules).toEqual({
      includeLogic: "AND",
      bypassAll: false,
      rules: [],
    });
    expect(migrateKeywordRulesSettings({ feeds: [] })).toBe(true);
  });

  it("migrates legacy feed filters and the legacy override flag", () => {
    const feed: Record<string, unknown> = {
      filters: {
        overrideGlobalFilters: true,
        includeLogic: "OR",
        rules: ["legacy"],
      },
    };
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "AND", bypassAll: false, rules: [] },
      feeds: [feed],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(true);
    expect(feed.filters).toBeUndefined();
    expect(feed.keywordRules).toEqual({
      overrideGlobalRules: true,
      includeLogic: "OR",
      rules: ["legacy"],
    });
  });

  it("keeps current feed rules when legacy feed filters also exist", () => {
    const currentRules = {
      overrideGlobalRules: true,
      includeLogic: "OR",
      rules: ["new"],
    };
    const feed = {
      keywordRules: currentRules,
      filters: {
        overrideGlobalFilters: false,
        includeLogic: "AND",
        rules: ["old"],
      },
    };
    const settings: Record<string, unknown> = {
      keywordRules: {},
      feeds: [feed],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(true);
    expect(feed.keywordRules).toBe(currentRules);
    expect(feed.filters).toBeUndefined();
  });

  it("normalizes malformed feed rules and ignores non-record feed entries", () => {
    const feed = { keywordRules: "invalid" };
    const settings: Record<string, unknown> = {
      keywordRules: {},
      feeds: [null, "invalid", feed],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(true);
    expect(feed.keywordRules).toEqual({
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [],
    });
  });

  it("preserves an old feed override key when the new key is already present", () => {
    const feed = {
      keywordRules: {
        overrideGlobalRules: false,
        overrideGlobalFilters: true,
        includeLogic: "AND",
        rules: [],
      },
    };
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "AND", bypassAll: false, rules: [] },
      feeds: [feed],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(false);
    expect(feed.keywordRules).toEqual({
      overrideGlobalRules: false,
      overrideGlobalFilters: true,
      includeLogic: "AND",
      rules: [],
    });
  });

  it("returns false when all current values are already normalized", () => {
    const settings: Record<string, unknown> = {
      keywordRules: { includeLogic: "AND", bypassAll: false, rules: [] },
      feeds: [
        {
          keywordRules: {
            overrideGlobalRules: false,
            includeLogic: "AND",
            rules: [],
          },
        },
      ],
    };

    expect(migrateKeywordRulesSettings(settings)).toBe(false);
  });
});
