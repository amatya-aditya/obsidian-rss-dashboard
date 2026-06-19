import { describe, it, expect } from "vitest";
import { getFolderFeedCount } from "../../../../src/components/sidebar/folder-feed-count";
import { Feed } from "../../../../src/types/types";

describe("Sidebar - Folder Feed Count", () => {
  const mockFeeds: Partial<Feed>[] = [
    { title: "Feed 1", folder: "Podcasts" },
    { title: "Feed 2", folder: "Podcasts/Tech" },
    { title: "Feed 3", folder: "Podcasts/Tech/AI" },
    { title: "Feed 4", folder: "Videos" },
    { title: "Feed 5", folder: "PodcastsNews" }, // Should not match "Podcasts"
    { title: "Feed 6", folder: "" },
    { title: "Feed 7" } // no folder
  ];

  it("should correctly count feeds in a folder and its subfolders", () => {
    const count = getFolderFeedCount("Podcasts", mockFeeds as Feed[]);
    // Matches "Podcasts", "Podcasts/Tech", "Podcasts/Tech/AI"
    expect(count).toBe(3);
  });

  it("should not count feeds in folders that just share a prefix", () => {
    // "PodcastsNews" starts with "Podcasts" but is not a subfolder
    const count = getFolderFeedCount("PodcastsNews", mockFeeds as Feed[]);
    expect(count).toBe(1);
  });

  it("should correctly count feeds in a nested folder", () => {
    const count = getFolderFeedCount("Podcasts/Tech", mockFeeds as Feed[]);
    // Matches "Podcasts/Tech", "Podcasts/Tech/AI"
    expect(count).toBe(2);
  });

  it("should return 0 for an empty folder path", () => {
    const count = getFolderFeedCount("", mockFeeds as Feed[]);
    expect(count).toBe(0);
  });

  it("should return 0 if no feeds match", () => {
    const count = getFolderFeedCount("NonExistent", mockFeeds as Feed[]);
    expect(count).toBe(0);
  });
});
