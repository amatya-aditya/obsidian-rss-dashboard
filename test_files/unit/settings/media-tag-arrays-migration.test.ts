import { describe, expect, it } from "vitest";
import { migrateMediaDefaultTagArrays } from "../../../src/utils/settings-migration";

describe("migrateMediaDefaultTagArrays", () => {
  it("populates array from non-empty legacy string", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video", defaultYouTubeTag: "YT" },
    };

    const changed = migrateMediaDefaultTagArrays(settings);

    expect(changed).toBe(true);
    expect(settings.media).toEqual({
      defaultVideoTag: "Video",
      defaultYouTubeTag: "YT",
      defaultVideoTags: ["Video"],
      defaultYouTubeTags: ["YT"],
      // Fields absent from legacy config → initialized to empty arrays
      defaultTwitterTags: [],
      defaultMastodonTags: [],
      defaultPodcastTags: [],
      defaultRssTags: [],
      defaultSmallwebTags: [],
    });
  });

  it("sets empty array for empty legacy string", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "", defaultRssTag: "   " },
    };

    const changed = migrateMediaDefaultTagArrays(settings);

    expect(changed).toBe(true);
    expect(settings.media.defaultVideoTags).toEqual([]);
    expect(settings.media.defaultRssTags).toEqual([]);
  });

  it("sets empty arrays for all seven fields when media is empty", () => {
    const settings: Record<string, unknown> = {
      media: {},
    };

    const changed = migrateMediaDefaultTagArrays(settings);

    expect(changed).toBe(true);
    expect(Array.isArray(settings.media.defaultVideoTags)).toBe(true);
    expect(Array.isArray(settings.media.defaultYouTubeTags)).toBe(true);
    expect(Array.isArray(settings.media.defaultPodcastTags)).toBe(true);
    expect(Array.isArray(settings.media.defaultRssTags)).toBe(true);
    expect(Array.isArray(settings.media.defaultSmallwebTags)).toBe(true);
    expect(Array.isArray(settings.media.defaultTwitterTags)).toBe(true);
    expect(Array.isArray(settings.media.defaultMastodonTags)).toBe(true);
    expect(settings.media.defaultVideoTags).toEqual([]);
    expect(settings.media.defaultYouTubeTags).toEqual([]);
    expect(settings.media.defaultPodcastTags).toEqual([]);
    expect(settings.media.defaultRssTags).toEqual([]);
    expect(settings.media.defaultSmallwebTags).toEqual([]);
    expect(settings.media.defaultTwitterTags).toEqual([]);
    expect(settings.media.defaultMastodonTags).toEqual([]);
  });

  it("does not overwrite existing arrays (idempotent)", () => {
    const settings: Record<string, unknown> = {
      media: {
        defaultVideoTag: "Video",
        defaultVideoTags: ["Video"],
        defaultYouTubeTags: [],
        defaultPodcastTags: [],
        defaultRssTags: [],
        defaultSmallwebTags: [],
        defaultTwitterTags: [],
        defaultMastodonTags: [],
      },
    };

    const changed = migrateMediaDefaultTagArrays(settings);

    expect(changed).toBe(false);
    expect(settings.media.defaultVideoTags).toEqual(["Video"]);
  });

  it("idempotent call returns false on second call", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video" },
    };

    migrateMediaDefaultTagArrays(settings);
    const secondChanged = migrateMediaDefaultTagArrays(settings);
    expect(secondChanged).toBe(false);
  });

  it("migrates all seven tag fields independently in one call", () => {
    const settings: Record<string, unknown> = {
      media: {
        defaultVideoTag: "Vid",
        defaultYouTubeTag: "Yt",
        defaultPodcastTag: "Pod",
        defaultRssTag: "RSS",
        defaultSmallwebTag: "SW",
        defaultTwitterTag: "Tw",
        defaultMastodonTag: "Ma",
      },
    };

    const changed = migrateMediaDefaultTagArrays(settings);

    expect(changed).toBe(true);
    expect(settings.media.defaultVideoTags).toEqual(["Vid"]);
    expect(settings.media.defaultYouTubeTags).toEqual(["Yt"]);
    expect(settings.media.defaultPodcastTags).toEqual(["Pod"]);
    expect(settings.media.defaultRssTags).toEqual(["RSS"]);
    expect(settings.media.defaultSmallwebTags).toEqual(["SW"]);
    expect(settings.media.defaultTwitterTags).toEqual(["Tw"]);
    expect(settings.media.defaultMastodonTags).toEqual(["Ma"]);
  });
});
