import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
  type SavedTemplate,
} from "../../../src/types/types";
import type { DeepPartial } from "../../../src/types/deep-partial";
import {
  isSaveVersion,
  migrateSaveVersionSetting,
  resolveSaveVersion,
  SAVE_VERSION_OPTIONS,
} from "../../../src/utils/save-version";
import {
  loadAndNormalizeSettings,
  migrateSettings,
} from "../../../src/utils/settings-normalization";

/** Raw persisted data as an older version wrote it. */
function rawWithArticleSaving(
  articleSaving: Record<string, unknown>,
): DeepPartial<RssDashboardSettings> {
  return { articleSaving } as unknown as DeepPartial<RssDashboardSettings>;
}

describe("Default save version setting", () => {
  it("offers RSS content and Fetched content, in that order", () => {
    expect(SAVE_VERSION_OPTIONS).toEqual([
      { value: "rss", label: "RSS content" },
      { value: "fetched", label: "Fetched content" },
    ]);
    expect(isSaveVersion("rss")).toBe(true);
    expect(isSaveVersion("fetched")).toBe(true);
    expect(isSaveVersion("both")).toBe(false);
  });

  it("defaults a new install to Fetched content", () => {
    expect(DEFAULT_SETTINGS.articleSaving.saveVersion).toBe("fetched");
  });

  describe("resolveSaveVersion", () => {
    it("returns the Default save version", () => {
      expect(resolveSaveVersion({ saveVersion: "rss" })).toBe("rss");
      expect(resolveSaveVersion({ saveVersion: "fetched" })).toBe("fetched");
    });

    it("falls back to Fetched content when the setting is missing or unknown", () => {
      expect(resolveSaveVersion({})).toBe("fetched");
      expect(
        resolveSaveVersion({
          saveVersion: "both" as unknown as "rss",
        }),
      ).toBe("fetched");
    });

    it("gives the same answer with or without a saved template today", () => {
      const template: SavedTemplate = {
        id: "t1",
        name: "Template",
        template: "{{content}}",
      };
      expect(resolveSaveVersion({ saveVersion: "rss" }, template)).toBe("rss");
    });
  });

  describe("migrating the old Save full content toggle", () => {
    it("loads a vault with the old toggle on as Fetched content", () => {
      const settings = loadAndNormalizeSettings(
        rawWithArticleSaving({ saveFullContent: true }),
      );
      expect(settings.articleSaving.saveVersion).toBe("fetched");
      expect(settings.articleSaving).not.toHaveProperty("saveFullContent");
    });

    it("loads a vault with the old toggle off as RSS content", () => {
      const settings = loadAndNormalizeSettings(
        rawWithArticleSaving({ saveFullContent: false }),
      );
      expect(settings.articleSaving.saveVersion).toBe("rss");
      expect(settings.articleSaving).not.toHaveProperty("saveFullContent");
    });

    it("keeps the other article-saving settings when it migrates the toggle", () => {
      const settings = loadAndNormalizeSettings(
        rawWithArticleSaving({
          saveFullContent: false,
          defaultFolder: "Inbox",
        }),
      );
      expect(settings.articleSaving.defaultFolder).toBe("Inbox");
      expect(settings.articleSaving.fetchTimeout).toBe(
        DEFAULT_SETTINGS.articleSaving.fetchTimeout,
      );
    });

    it("gives a new install Fetched content", () => {
      expect(loadAndNormalizeSettings({}).articleSaving.saveVersion).toBe(
        "fetched",
      );
      expect(
        loadAndNormalizeSettings(rawWithArticleSaving({ defaultFolder: "A" }))
          .articleSaving.saveVersion,
      ).toBe("fetched");
    });

    it("prefers the new setting when both keys are present", () => {
      const settings = loadAndNormalizeSettings(
        rawWithArticleSaving({ saveFullContent: true, saveVersion: "rss" }),
      );
      expect(settings.articleSaving.saveVersion).toBe("rss");
      expect(settings.articleSaving).not.toHaveProperty("saveFullContent");
    });

    it("does not change the raw data it was given", () => {
      const raw = rawWithArticleSaving({ saveFullContent: false });
      loadAndNormalizeSettings(raw);
      expect(raw.articleSaving).toEqual({ saveFullContent: false });
    });

    it("reads the old toggle before defaults can hide an off value", () => {
      // Merging DEFAULT_SETTINGS first would add saveVersion "fetched" and
      // make the old `false` look already migrated.
      const group: Record<string, unknown> = { saveFullContent: false };
      expect(migrateSaveVersionSetting(group)).toBe(true);
      expect(group).toEqual({ saveVersion: "rss" });
    });

    it("reports no change for a group that is already migrated", () => {
      const group: Record<string, unknown> = { saveVersion: "rss" };
      expect(migrateSaveVersionSetting(group)).toBe(false);
    });

    it("keeps the old truthiness meaning for a hand-edited toggle", () => {
      const asString: Record<string, unknown> = { saveFullContent: "false" };
      const asZero: Record<string, unknown> = { saveFullContent: 0 };
      migrateSaveVersionSetting(asString);
      migrateSaveVersionSetting(asZero);
      // The old code tested `!saveFullContent`: a non-empty string was on, 0 was off.
      expect(asString.saveVersion).toBe("fetched");
      expect(asZero.saveVersion).toBe("rss");
    });

    it("repairs an unknown save version", () => {
      const group: Record<string, unknown> = { saveVersion: "both" };
      expect(migrateSaveVersionSetting(group)).toBe(true);
      expect(group.saveVersion).toBe("fetched");
    });
  });

  describe("settings import in the old shape", () => {
    // The import applier replaces the whole group, then runs migrateSettings.
    function importOldShape(
      articleSaving: Record<string, unknown>,
      extra: Record<string, unknown> = {},
    ): RssDashboardSettings {
      const current = loadAndNormalizeSettings({});
      const parsed = { articleSaving, ...extra };
      const merged = Object.assign({}, DEFAULT_SETTINGS, current, parsed);
      migrateSettings(merged as unknown as RssDashboardSettings);
      return merged as unknown as RssDashboardSettings;
    }

    it("imports an old toggle off as RSS content over a current Fetched content", () => {
      const result = importOldShape({ saveFullContent: false });
      expect(result.articleSaving.saveVersion).toBe("rss");
      expect(result.articleSaving).not.toHaveProperty("saveFullContent");
    });

    it("imports an old toggle on as Fetched content", () => {
      const result = importOldShape({ saveFullContent: true });
      expect(result.articleSaving.saveVersion).toBe("fetched");
    });

    it("imports the old toggle off next to other legacy top-level keys", () => {
      // The legacy savePath step merges defaults into the group; the toggle
      // must already be migrated by then.
      const result = importOldShape(
        { saveFullContent: false },
        { savePath: "Legacy" },
      );
      expect(result.articleSaving.saveVersion).toBe("rss");
      expect(result.articleSaving.defaultFolder).toBe("Legacy");
    });

    it("imports a new-shape export unchanged", () => {
      const result = importOldShape({ saveVersion: "rss" });
      expect(result.articleSaving.saveVersion).toBe("rss");
    });
  });
});
