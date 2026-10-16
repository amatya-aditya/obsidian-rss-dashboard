import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
  type SavedTemplate,
} from "../../../src/types/types";
import type { DeepPartial } from "../../../src/types/deep-partial";
import {
  FALLBACK_BEFORE_SAVE_NOTICE,
  isSaveVersion,
  migrateSaveVersionSetting,
  resolveSaveVersion,
  SAVED_ARTICLE_TOOLTIP,
  SAVE_FALLBACK_NOTICE,
  SAVE_VERSION_OPTIONS,
  savedArticleNotice,
  saveVersionLabel,
  saveVersionTooltip,
} from "../../../src/utils/save-version";
import {
  ONE_SAVE_OVERRIDE_TEMPLATE_ID,
  resolveSavedTemplateForArticle,
} from "../../../src/utils/saved-template-utils";
import { parseSettingsBundle } from "../../../src/services/storage-bundle-parsers";
import { SHARD_VERSION } from "../../../src/services/storage-json";
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

    it("lets a saved template set the version its saves write (#1185)", () => {
      const rssTemplate: SavedTemplate = {
        id: "t1",
        name: "RSS template",
        template: "{{content}}",
        saveVersion: "rss",
      };
      expect(resolveSaveVersion({ saveVersion: "fetched" }, rssTemplate)).toBe(
        "rss",
      );
      expect(
        resolveSaveVersion(
          { saveVersion: "rss" },
          { ...rssTemplate, saveVersion: "fetched" },
        ),
      ).toBe("fetched");
    });

    it("falls back to the Default save version when the template leaves it unset (#1185)", () => {
      const template: SavedTemplate = {
        id: "t1",
        name: "Template",
        template: "{{content}}",
      };
      expect(resolveSaveVersion({ saveVersion: "rss" }, template)).toBe("rss");
      expect(resolveSaveVersion({ saveVersion: "fetched" }, template)).toBe(
        "fetched",
      );
    });

    it("ignores an unknown version on the template (#1185)", () => {
      const template = {
        id: "t1",
        name: "Template",
        template: "{{content}}",
        saveVersion: "both",
      } as unknown as SavedTemplate;
      expect(resolveSaveVersion({ saveVersion: "rss" }, template)).toBe("rss");
    });
  });

  describe("the template applied to an article (#1185)", () => {
    function template(
      id: string,
      saveVersion?: SavedTemplate["saveVersion"],
    ): SavedTemplate {
      return {
        id,
        name: id,
        template: "{{content}}",
        ...(saveVersion ? { saveVersion } : {}),
      };
    }

    const feed = {
      url: "https://example.com/feed.xml",
      customTemplate: "feed",
    };

    it("uses the feed-assigned template's version over the Default save version", () => {
      const applied = resolveSavedTemplateForArticle(
        { feedUrl: feed.url } as FeedItem,
        [feed],
        [template("feed", "rss")],
        "global",
      );
      expect(resolveSaveVersion({ saveVersion: "fetched" }, applied)).toBe(
        "rss",
      );
    });

    it("uses the global default template's version when the feed has none", () => {
      const applied = resolveSavedTemplateForArticle(
        { feedUrl: "https://example.com/other.xml" } as FeedItem,
        [feed],
        [template("feed", "rss"), template("global", "fetched")],
        "global",
      );
      expect(resolveSaveVersion({ saveVersion: "rss" }, applied)).toBe(
        "fetched",
      );
    });

    it("does not cascade the global default template's version to a feed template that leaves it unset", () => {
      const applied = resolveSavedTemplateForArticle(
        { feedUrl: feed.url } as FeedItem,
        [feed],
        [template("feed"), template("global", "fetched")],
        "global",
      );
      // The feed's template is the one applied, and it sets no version.
      expect(applied?.id).toBe("feed");
      expect(resolveSaveVersion({ saveVersion: "rss" }, applied)).toBe("rss");
    });

    it("uses the default save version when no template applies", () => {
      const applied = resolveSavedTemplateForArticle(
        { feedUrl: "https://example.com/other.xml" } as FeedItem,
        [feed],
        [template("feed", "rss")],
        undefined,
      );
      expect(applied).toBeUndefined();
      expect(resolveSaveVersion({ saveVersion: "rss" }, applied)).toBe("rss");
    });

    it("keeps the chosen version when the dialog overrides only the filename", () => {
      const chosen = template("feed", "rss");
      const oneSaveOverride = { ...chosen, filenamePattern: "{{title}}-copy" };
      expect(
        resolveSaveVersion({ saveVersion: "fetched" }, oneSaveOverride),
      ).toBe("rss");
    });

    it("falls back to the Default save version for the dialog's synthetic template", () => {
      const synthetic: SavedTemplate = {
        id: ONE_SAVE_OVERRIDE_TEMPLATE_ID,
        name: "One-save filename override",
        template: "{{content}}",
        defaultFolder: "",
        filenamePattern: "{{title}}-copy",
      };
      expect(resolveSaveVersion({ saveVersion: "fetched" }, synthetic)).toBe(
        "fetched",
      );
      expect(resolveSaveVersion({ saveVersion: "rss" }, synthetic)).toBe("rss");
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

  describe("settings export and import carry a template's save version (#1185)", () => {
    // The settings bundle stores the whole `articleSaving` group as JSON, and
    // the import applier merges it over the current settings before migrating.
    function roundTrip(
      templates: SavedTemplate[],
    ): RssDashboardSettings["articleSaving"] {
      const exported = JSON.parse(
        JSON.stringify({ articleSaving: { savedTemplates: templates } }),
      ) as { articleSaving: { savedTemplates: SavedTemplate[] } };
      const merged = Object.assign(
        {},
        DEFAULT_SETTINGS,
        loadAndNormalizeSettings({}),
        exported,
      ) as unknown as RssDashboardSettings;
      migrateSettings(merged);
      return merged.articleSaving;
    }

    it("round-trips the save version a template sets", () => {
      const imported = roundTrip([
        {
          id: "t1",
          name: "GitHub releases",
          template: "{{content}}",
          saveVersion: "fetched",
        },
      ]);
      const template = imported.savedTemplates[0];
      expect(template.saveVersion).toBe("fetched");
      expect(resolveSaveVersion({ saveVersion: "rss" }, template)).toBe(
        "fetched",
      );
    });

    it("imports a template from an export made before the field existed", () => {
      const imported = roundTrip([
        { id: "t1", name: "Older template", template: "{{content}}" },
      ]);
      const template = imported.savedTemplates[0];
      expect(template).not.toHaveProperty("saveVersion");
      expect(resolveSaveVersion({ saveVersion: "rss" }, template)).toBe("rss");
    });

    it("keeps the field through the settings bundle parser", () => {
      const bundle = parseSettingsBundle({
        version: SHARD_VERSION,
        exportedAt: Date.now(),
        settings: {
          storageMode: "vault-shards-v2",
          articleSaving: {
            savedTemplates: [
              {
                id: "t1",
                name: "Releases",
                template: "{{content}}",
                saveVersion: "fetched",
              },
            ],
          },
        },
      });
      const template = (
        bundle.settings.articleSaving as {
          savedTemplates: SavedTemplate[];
        }
      ).savedTemplates[0];
      expect(template.saveVersion).toBe("fetched");
    });
  });
});

describe("Save surface labels (#1184)", () => {
  it("names the version a save will write, in the save tooltip", () => {
    expect(saveVersionTooltip("rss")).toBe("Save RSS content to notes");
    expect(saveVersionTooltip("fetched")).toBe("Save fetched content to notes");
  });

  it("keeps the labels the settings dropdown shows", () => {
    expect(saveVersionLabel("rss")).toBe("RSS content");
    expect(saveVersionLabel("fetched")).toBe("Fetched content");
    expect(SAVE_VERSION_OPTIONS.map((option) => option.label)).toEqual([
      saveVersionLabel("rss"),
      saveVersionLabel("fetched"),
    ]);
  });

  it("names the version a save wrote, in the post-save notice", () => {
    const tail = "Click/tap the icon again to open the article in your vault.";
    expect(savedArticleNotice("rss")).toBe(
      `Article saved with RSS content. ${tail}`,
    );
    expect(savedArticleNotice("fetched")).toBe(
      `Article saved with fetched content. ${tail}`,
    );
  });

  it("names the fallback when a Fetched content save wrote RSS content", () => {
    expect(SAVE_FALLBACK_NOTICE.fetch).toBe(
      "Fetch failed; saved RSS content instead.",
    );
    expect(SAVE_FALLBACK_NOTICE.save).toBe(
      "Save failed; saved RSS content instead.",
    );
  });

  it("names both versions while a Fetched content save falls back", () => {
    expect(FALLBACK_BEFORE_SAVE_NOTICE).toBe(
      "Fetched content is unavailable; saving RSS content.",
    );
  });

  it("keeps the saved-article tooltip for an article that is already saved", () => {
    expect(SAVED_ARTICLE_TOOLTIP).toBe("Click to open saved article");
  });
});
