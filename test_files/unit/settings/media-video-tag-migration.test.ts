import { describe, expect, it } from "vitest";
import { migrateMediaVideoTagSettings } from "../../../src/utils/settings-migration";

describe("migrateMediaVideoTagSettings", () => {
  it("adds autoTagVideos default and Video tag when missing", () => {
    const settings: Record<string, unknown> = {
      media: {},
      availableTags: [{ name: "Podcast", color: "#8e44ad" }],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect((settings.media as Record<string, unknown>).autoTagVideos).toBe(
      true,
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

  it("does not duplicate existing video tag and initializes default tag", () => {
    const settings: Record<string, unknown> = {
      media: { autoTagVideos: true },
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

  it("removes YouTube tag but preserves configurable video tag setting", () => {
    const settings: Record<string, unknown> = {
      media: { autoTagVideos: true, defaultYouTubeTag: "youtube" },
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
    const tags = settings.availableTags as Array<{ name: string }>;
    expect(tags.some((tag) => tag.name.toLowerCase() === "youtube")).toBe(
      false,
    );
    expect(tags.some((tag) => tag.name.toLowerCase() === "video")).toBe(true);
  });

  it("normalizes malformed availableTags and ensures Video tag exists", () => {
    const settings: Record<string, unknown> = {
      media: { autoTagVideos: true },
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
      media: { autoTagVideos: true },
      availableTags: [],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(
      (settings.media as Record<string, unknown>).defaultTwitterFolder,
    ).toBe("Twitter");
  });

  it("restores defaultTwitterFolder when blank", () => {
    const settings: Record<string, unknown> = {
      media: { autoTagVideos: true, defaultTwitterFolder: "   " },
      availableTags: [],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(true);
    expect(
      (settings.media as Record<string, unknown>).defaultTwitterFolder,
    ).toBe("Twitter");
  });
});
