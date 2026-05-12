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
    expect(Array.isArray(settings.availableTags)).toBe(true);
    expect(
      (settings.availableTags as Array<{ name: string }>).some(
        (tag) => tag.name === "Video",
      ),
    ).toBe(true);
  });

  it("does not duplicate existing video tag regardless of case", () => {
    const settings: Record<string, unknown> = {
      media: { autoTagVideos: true },
      availableTags: [
        { name: "VIDEO", color: "#123456" },
        { name: "Podcast", color: "#8e44ad" },
      ],
    };

    const changed = migrateMediaVideoTagSettings(settings);

    expect(changed).toBe(false);
    const names = (settings.availableTags as Array<{ name: string }>).map(
      (tag) => tag.name.toLowerCase(),
    );
    expect(names.filter((name) => name === "video")).toHaveLength(1);
  });
});