import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import {
  MERGED_SETTINGS_GROUPS,
  mergeImportedSettingsGroups,
} from "../../../src/utils/settings-group-merge";

function makeCurrent(): RssDashboardSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.articleSaving = {
    ...settings.articleSaving,
    defaultFolder: "current-folder/",
    fetchTimeout: 42,
    saveVersion: "fetched",
  };
  settings.media = {
    ...settings.media,
    defaultVideoTag: "CurrentVideo",
    defaultVideoTags: ["CurrentVideo"],
  };
  return settings;
}

function partial(value: unknown): Partial<RssDashboardSettings> {
  return value as Partial<RssDashboardSettings>;
}

describe("mergeImportedSettingsGroups", () => {
  it("keeps the current keys a partial group omits", () => {
    const current = makeCurrent();
    const merged = mergeImportedSettingsGroups(
      current,
      partial({ articleSaving: { defaultFolder: "saved-articles/" } }),
    );

    expect(merged.articleSaving).toEqual({
      ...current.articleSaving,
      defaultFolder: "saved-articles/",
    });
    expect(merged.articleSaving?.fetchTimeout).toBe(42);
    expect(merged.articleSaving?.savedTemplates).toEqual(
      current.articleSaving.savedTemplates,
    );
  });

  it("keeps a group the import omits whole", () => {
    const current = makeCurrent();
    const merged = mergeImportedSettingsGroups(
      current,
      partial({ maxItems: 7 }),
    );

    for (const group of MERGED_SETTINGS_GROUPS) {
      expect(group in merged).toBe(false);
    }
    expect(merged.maxItems).toBe(7);
  });

  it("replaces an array the import carries and keeps one it omits", () => {
    const current = makeCurrent();
    const merged = mergeImportedSettingsGroups(
      current,
      partial({ media: { defaultVideoTags: ["A", "B"] } }),
    );

    expect(merged.media?.defaultVideoTags).toEqual(["A", "B"]);
    const keptOnly = mergeImportedSettingsGroups(
      current,
      partial({ media: { youtubeFocusMode: true } }),
    );
    expect(keptOnly.media?.defaultVideoTags).toEqual(["CurrentVideo"]);
  });

  it("migrates an imported saveFullContent: false over a current Fetched content", () => {
    const merged = mergeImportedSettingsGroups(
      makeCurrent(),
      partial({ articleSaving: { saveFullContent: false } }),
    );

    expect(merged.articleSaving?.saveVersion).toBe("rss");
    expect(merged.articleSaving).not.toHaveProperty("saveFullContent");
  });

  it("keeps the current saveVersion when the imported group carries neither version key", () => {
    const merged = mergeImportedSettingsGroups(
      makeCurrent(),
      partial({ articleSaving: { defaultFolder: "x/" } }),
    );

    expect(merged.articleSaving?.saveVersion).toBe("fetched");
  });

  it("migrates an imported media.autoTagVideos: false to an empty defaultVideoTag", () => {
    const merged = mergeImportedSettingsGroups(
      makeCurrent(),
      partial({ media: { autoTagVideos: false } }),
    );

    expect(merged.media?.defaultVideoTag).toBe("");
    expect(merged.media).not.toHaveProperty("autoTagVideos");
  });

  it("lets an imported defaultVideoTag win over a legacy autoTagVideos", () => {
    const merged = mergeImportedSettingsGroups(
      makeCurrent(),
      partial({ media: { autoTagVideos: false, defaultVideoTag: "Clips" } }),
    );

    expect(merged.media?.defaultVideoTag).toBe("Clips");
  });

  it("merges readerFormat, highlights and articleFilter one level deep", () => {
    const current = makeCurrent();
    const merged = mergeImportedSettingsGroups(
      current,
      partial({
        readerFormat: { fontSize: 99 },
        highlights: { enabled: false },
        articleFilter: { type: "tag" },
      }),
    );

    expect(merged.readerFormat).toEqual({
      ...current.readerFormat,
      fontSize: 99,
    });
    expect(merged.highlights).toEqual({
      ...current.highlights,
      enabled: false,
    });
    expect(merged.articleFilter).toEqual({
      ...current.articleFilter,
      type: "tag",
    });
  });

  it("imports a complete group as the file carries it", () => {
    const current = makeCurrent();
    const complete = { ...DEFAULT_SETTINGS.articleSaving, fetchTimeout: 5 };
    const merged = mergeImportedSettingsGroups(
      current,
      partial({ articleSaving: complete }),
    );

    expect(merged.articleSaving).toEqual(complete);
  });

  it("leaves a non-object group value to the current group", () => {
    const current = makeCurrent();
    const merged = mergeImportedSettingsGroups(
      current,
      partial({ media: null, highlights: [] }),
    );

    expect(merged).not.toHaveProperty("media");
    expect(merged).not.toHaveProperty("highlights");
  });

  it("changes neither the current settings nor the imported settings", () => {
    const current = makeCurrent();
    const imported = partial({ articleSaving: { saveFullContent: false } });
    const currentBefore = structuredClone(current);
    const importedBefore = structuredClone(imported);

    mergeImportedSettingsGroups(current, imported);

    expect(current).toEqual(currentBefore);
    expect(imported).toEqual(importedBefore);
  });

  it("does not touch display, keywordRules, autoBackup or dashboardMultiFilters", () => {
    const merged = mergeImportedSettingsGroups(
      makeCurrent(),
      partial({
        display: { showCoverImage: false },
        keywordRules: { rules: [] },
      }),
    );

    expect(merged.display).toEqual({ showCoverImage: false });
    expect(merged.keywordRules).toEqual({ rules: [] });
  });
});
