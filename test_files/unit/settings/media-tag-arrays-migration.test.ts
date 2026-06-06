import { describe, expect, it } from "vitest";
import { migrateMediaDefaultTagArrays } from "../../../src/utils/settings-migration";

describe("migrateMediaDefaultTagArrays", () => {
  it("populates array from non-empty legacy string", () => {
    const settings: Record<string, unknown> = {
      media: { defaultVideoTag: "Video", defaultYouTubeTag: "YT" },
    };

    const changed = migrateMediaDefaultTagArrays(settings);
    const media = settings.media as Record<string, unknown>;

    expect(changed).toBe(true);
    expect(media).toEqual({
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
    const media = settings.media as Record<string, unknown>;

    expect(changed).toBe(true);
    expect(media.defaultVideoTags).toEqual([]);
    expect(media.defaultRssTags).toEqual([]);
  });

  it("sets empty arrays for all seven fields when media is empty", () => {
    const settings: Record<string, unknown> = {
      media: {},
    };

    const changed = migrateMediaDefaultTagArrays(settings);
    const media = settings.media as Record<string, unknown>;

    expect(changed).toBe(true);
    expect(Array.isArray(media.defaultVideoTags)).toBe(true);
    expect(Array.isArray(media.defaultYouTubeTags)).toBe(true);
    expect(Array.isArray(media.defaultPodcastTags)).toBe(true);
    expect(Array.isArray(media.defaultRssTags)).toBe(true);
    expect(Array.isArray(media.defaultSmallwebTags)).toBe(true);
    expect(Array.isArray(media.defaultTwitterTags)).toBe(true);
    expect(Array.isArray(media.defaultMastodonTags)).toBe(true);
    expect(media.defaultVideoTags).toEqual([]);
    expect(media.defaultYouTubeTags).toEqual([]);
    expect(media.defaultPodcastTags).toEqual([]);
    expect(media.defaultRssTags).toEqual([]);
    expect(media.defaultSmallwebTags).toEqual([]);
    expect(media.defaultTwitterTags).toEqual([]);
    expect(media.defaultMastodonTags).toEqual([]);
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
    const media = settings.media as Record<string, unknown>;

    expect(changed).toBe(false);
    expect(media.defaultVideoTags).toEqual(["Video"]);
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
    const media = settings.media as Record<string, unknown>;

    expect(changed).toBe(true);
    expect(media.defaultVideoTags).toEqual(["Vid"]);
    expect(media.defaultYouTubeTags).toEqual(["Yt"]);
    expect(media.defaultPodcastTags).toEqual(["Pod"]);
    expect(media.defaultRssTags).toEqual(["RSS"]);
    expect(media.defaultSmallwebTags).toEqual(["SW"]);
    expect(media.defaultTwitterTags).toEqual(["Tw"]);
    expect(media.defaultMastodonTags).toEqual(["Ma"]);
  });
});
