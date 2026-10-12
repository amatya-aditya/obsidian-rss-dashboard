import { describe, expect, it } from "vitest";
import { migrateDisplaySettings } from "../../../src/utils/settings-migration";
import { migrateMediaVideoTagSettings } from "../../../src/utils/settings-migration";
import {
  loadAndNormalizeSettings,
  migrateSettings,
} from "../../../src/utils/settings-loader";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";

describe("migrateMediaVideoTagSettings", () => {
  it("adds defaultVideoTag default and Video tag when missing", () => {
    const settings: Record<string, unknown> = {
      media: {},
      availableTags: [{ name: "Podcast", color: "#8e44ad" }],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect((settings.media as Record<string, unknown>).defaultVideoTag).toBe(
      "Video",
    );
    expect(
      (settings.media as Record<string, unknown>).rememberPlaybackProgress,
    ).toBe(true);
    expect((settings.media as Record<string, unknown>).youtubeFocusMode).toBe(
      false,
    );
    expect((settings.media as Record<string, unknown>).defaultYouTubeTag).toBe(
      "Video",
    );
    expect(Array.isArray(settings.availableTags)).toBe(true);
    expect(
      (settings.availableTags as Array<{ name: string }>).some(
        (tag) => tag.name === "Video",
      ),
    ).toBe(true);
  });

  it("does not duplicate existing video tag and initializes defaultVideoTag", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video" },
      availableTags: [
        { name: "VIDEO", color: "#123456" },
        { name: "Podcast", color: "#8e44ad" },
      ],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect((settings.media as Record<string, unknown>).defaultYouTubeTag).toBe(
      "Video",
    );
    const names = (settings.availableTags as Array<{ name: string }>).map(
      (tag) => tag.name.toLowerCase(),
    );
    expect(names.filter((name) => name === "video")).toHaveLength(1);
  });

  it("removes YouTube tag but preserves configurable video tag settings", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video", defaultYouTubeTag: "youtube" },
      availableTags: [
        { name: "YouTube", color: "#ff0000" },
        { name: "Video", color: "#d04747" },
        { name: "Podcast", color: "#8e44ad" },
      ],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect((settings.media as Record<string, unknown>).defaultYouTubeTag).toBe(
      "youtube",
    );
    expect((settings.media as Record<string, unknown>).defaultVideoTag).toBe(
      "Video",
    );
    const tags = settings.availableTags as Array<{ name: string }>;
    expect(tags.some((tag) => tag.name.toLowerCase() === "youtube")).toBe(
      false,
    );
    expect(tags.some((tag) => tag.name.toLowerCase() === "video")).toBe(true);
  });

  it("normalizes malformed availableTags and ensures Video tag exists", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video" },
      availableTags: null,
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(Array.isArray(settings.availableTags)).toBe(true);
    const names = (settings.availableTags as Array<{ name: string }>).map(
      (tag) => tag.name.toLowerCase(),
    );
    expect(names).toContain("video");
  });

  it("backfills defaultMastodonFolder when missing", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video" },
      availableTags: [],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(
      (settings.media as Record<string, unknown>).defaultMastodonFolder,
    ).toBe("Mastodon");
  });

  it("restores defaultMastodonFolder when blank", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video", defaultMastodonFolder: "   " },
      availableTags: [],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(
      (settings.media as Record<string, unknown>).defaultMastodonFolder,
    ).toBe("Mastodon");
  });

  it("backfills useDomainIconsMastodon to false", () => {
    const settings: Record<string, unknown> = {
      display: {},
      media: { defaultVideoTag: "Video" },
      availableTags: [],
    };

    migrateDisplaySettings(settings.display as Record<string, unknown>);
    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(
      (settings.display as Record<string, unknown>).useDomainIconsMastodon,
    ).toBe(false);
  });

  it("preserves a user-set empty defaultVideoTag when a Video tag already exists", () => {
    const settings: Record<string, unknown> = {
      media: {
        defaultVideoTag: "",
        rememberPlaybackProgress: true,
        youtubeFocusMode: false,
        defaultMastodonFolder: "Mastodon",
        useDomainIconsMastodon: false,
        defaultYouTubeTag: "Video",
      },
      availableTags: [{ name: "Video", color: "#d04747" }],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(false);
    expect((settings.media as Record<string, unknown>).defaultVideoTag).toBe(
      "",
    );
  });
  it("carries a dev-build hideYouTubeDescriptions value through loading into Focus mode", () => {
    const loaded = loadAndNormalizeSettings({
      media: { hideYouTubeDescriptions: true },
    } as unknown as Partial<RssDashboardSettings>);
    migrateSettings(loaded);

    const media = loaded.media as unknown as Record<string, unknown>;
    expect(media.youtubeFocusMode).toBe(true);
    expect("hideYouTubeDescriptions" in media).toBe(false);
  });

  it("keeps an existing Focus mode value over a stale old key", () => {
    const loaded = loadAndNormalizeSettings({
      media: { youtubeFocusMode: false, hideYouTubeDescriptions: true },
    } as unknown as Partial<RssDashboardSettings>);
    migrateSettings(loaded);

    const media = loaded.media as unknown as Record<string, unknown>;
    expect(media.youtubeFocusMode).toBe(false);
    expect("hideYouTubeDescriptions" in media).toBe(false);
  });
});

describe("removed settings load cleanly (#919)", () => {
  it("derives an empty defaultVideoTag from legacy autoTagVideos false", () => {
    const settings: Record<string, unknown> = {
      media: { autoTagVideos: false },
      availableTags: [{ name: "Video", color: "#d04747" }],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect((settings.media as Record<string, unknown>).defaultVideoTag).toBe(
      "",
    );
  });

  it("keeps the Video default when legacy autoTagVideos was on or absent", () => {
    const withTrue: Record<string, unknown> = {
      media: { autoTagVideos: true },
      availableTags: [],
    };
    migrateMediaVideoTagSettings(withTrue);
    expect((withTrue.media as Record<string, unknown>).defaultVideoTag).toBe(
      "Video",
    );

    const absent: Record<string, unknown> = { media: {}, availableTags: [] };
    migrateMediaVideoTagSettings(absent);
    expect((absent.media as Record<string, unknown>).defaultVideoTag).toBe(
      "Video",
    );
  });

  it("normalizes raw settings that still carry the removed fields", () => {
    const loaded = loadAndNormalizeSettings({
      customProxyUrls: ["https://proxy.example"],
      display: { useDomainIconsYouTube: true },
      media: { autoTagVideos: true, openInSplitView: true },
    } as unknown as Partial<RssDashboardSettings>);

    migrateSettings(loaded);

    expect(loaded.media.defaultVideoTag).toBe("Video");
    expect(loaded.media.rememberPlaybackProgress).toBe(true);
    expect(typeof loaded.media.youtubeFocusMode).toBe("boolean");
  });

  it("no longer ships the removed fields in the defaults", () => {
    expect(DEFAULT_SETTINGS).not.toHaveProperty("customProxyUrls");
    expect(DEFAULT_SETTINGS.media).not.toHaveProperty("autoTagVideos");
    expect(DEFAULT_SETTINGS.media).not.toHaveProperty("openInSplitView");
    expect(DEFAULT_SETTINGS.display).not.toHaveProperty(
      "useDomainIconsYouTube",
    );
  });
});
