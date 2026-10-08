import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  buildFactoryResetSettings,
  loadAndNormalizeSettings,
  migrateSettings,
} from "../../../src/utils/settings-loader";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function withRadius(value: unknown): Partial<RssDashboardSettings> {
  return {
    display: { tagChipRadius: value },
  } as unknown as Partial<RssDashboardSettings>;
}

describe("tag chip radius default and load", () => {
  it("defaults to Pill for new installs", () => {
    expect(DEFAULT_SETTINGS.display.tagChipRadius).toBe("999px");
    expect(loadAndNormalizeSettings(null).display.tagChipRadius).toBe("999px");
  });

  it("backfills Pill for legacy settings whose display group lacks the field", () => {
    const legacy = { display: { showSummary: false } };
    const loaded = loadAndNormalizeSettings(
      legacy as unknown as Partial<RssDashboardSettings>,
    );

    expect(loaded.display.tagChipRadius).toBe("999px");
    expect(loaded.display.showSummary).toBe(false);
  });

  it.each(["0px", "10px", "999px", "12px 4px / 2px"])(
    "keeps the saved value %j across a reload",
    (value) => {
      expect(
        loadAndNormalizeSettings(withRadius(value)).display.tagChipRadius,
      ).toBe(value);
    },
  );

  it.each([
    "",
    "red",
    "-4px",
    "1px 2px 3px 4px 5px",
    "999px; color:red",
    42,
    null,
  ])("normalizes the unusable stored value %j to Pill", (value) => {
    expect(
      loadAndNormalizeSettings(withRadius(value)).display.tagChipRadius,
    ).toBe("999px");
  });
});

describe("tag chip radius migration", () => {
  it("repairs a missing or invalid radius and reports the change", () => {
    const settings = cloneSettings();
    (settings.display as unknown as Record<string, unknown>).tagChipRadius =
      "bogus";

    expect(migrateSettings(settings)).toBe(true);
    expect(settings.display.tagChipRadius).toBe("999px");

    delete (settings.display as unknown as Record<string, unknown>)
      .tagChipRadius;
    // A missing field is backfilled from the defaults with the rest of `display`.
    migrateSettings(settings);
    expect(settings.display.tagChipRadius).toBe("999px");
  });

  it("leaves a valid radius untouched", () => {
    const settings = cloneSettings();
    settings.display.tagChipRadius = "10px";
    migrateSettings(settings);
    expect(settings.display.tagChipRadius).toBe("10px");
  });
});

describe("tag chip radius factory reset", () => {
  it("restores Pill after a custom value was saved", () => {
    const customized = cloneSettings();
    customized.display.tagChipRadius = "0px";
    expect(customized.display.tagChipRadius).toBe("0px");

    expect(buildFactoryResetSettings().display.tagChipRadius).toBe("999px");
  });
});

describe("tag chip radius bundle round-trip", () => {
  let repository: FeedStorageRepository;
  let saveData: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<void>>>;

  beforeEach(() => {
    repository = new FeedStorageRepository(App.createMock());
    saveData = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockResolvedValue(undefined);
  });

  it.each(["0px", "10px", "999px", "12px 4px / 2px"])(
    "restores %j from an exported settings bundle",
    async (value) => {
      const source = cloneSettings();
      source.storageMode = "legacy-json";
      source.display.tagChipRadius = value;
      const exported = JSON.parse(
        JSON.stringify(repository.buildSettingsBundle(source)),
      ) as unknown;

      const target = cloneSettings();
      target.storageMode = "legacy-json";
      await repository.importSettingsBundle(exported, target, saveData);
      migrateSettings(target);

      expect(target.display.tagChipRadius).toBe(value);
    },
  );

  it("backfills Pill when an older bundle has no radius", async () => {
    const source = cloneSettings();
    source.storageMode = "legacy-json";
    const exported = JSON.parse(
      JSON.stringify(repository.buildSettingsBundle(source)),
    ) as { settings: { display: Record<string, unknown> } };
    delete exported.settings.display.tagChipRadius;

    const target = cloneSettings();
    target.storageMode = "legacy-json";
    target.display.tagChipRadius = "0px";
    await repository.importSettingsBundle(exported, target, saveData);
    migrateSettings(target);

    expect(target.display.tagChipRadius).toBe("999px");
  });

  it("carries the radius through a portable bundle", async () => {
    const source = cloneSettings();
    source.storageMode = "legacy-json";
    source.display.tagChipRadius = "10px";
    const exported = JSON.parse(
      JSON.stringify(repository.buildPortableDataBundle(source)),
    ) as unknown;

    const target = cloneSettings();
    target.storageMode = "legacy-json";
    await repository.importPortableDataBundle(exported, target, saveData);
    migrateSettings(target);

    expect(target.display.tagChipRadius).toBe("10px");
  });
});
