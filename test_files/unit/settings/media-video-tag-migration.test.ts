import { describe, expect, it } from "vitest";
import { migrateMediaVideoTagSettings } from "../../../src/utils/settings-migration";

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

  it("backfills defaultTwitterFolder when missing", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video" },
      availableTags: [],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(
      (settings.media as Record<string, unknown>).defaultTwitterFolder,
    ).toBe("Twitter");
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

  it("restores defaultTwitterFolder when blank", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video", defaultTwitterFolder: "   " },
      availableTags: [],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(
      (settings.media as Record<string, unknown>).defaultTwitterFolder,
    ).toBe("Twitter");
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
      media: { defaultVideoTag: "Video" },
      availableTags: [],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(
      (settings.media as Record<string, unknown>).useDomainIconsMastodon,
    ).toBe(false);
  });

  it("preserves a user-set empty defaultVideoTag when a Video tag already exists", () => {
    const settings: Record<string, unknown> = {
      media: {
        defaultVideoTag: "",
        rememberPlaybackProgress: true,
        defaultTwitterFolder: "Twitter",
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
});
