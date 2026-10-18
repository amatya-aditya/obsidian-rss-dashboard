import { describe, expect, it } from "vitest";
import { MediaService } from "../../../src/services/media-service";
import { Feed } from "../../../src/types/types";

describe("youtube feed processing", () => {
  it("extracts and persists youtube video ids during feed processing", () => {
    const feed: Feed = {
      title: "Video feed",
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=test",
      folder: "Videos",
      items: [
        {
          title: "Video item",
          link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          description: "",
          pubDate: "Fri, 06 Mar 2026 15:58:34 +0000",
          guid: "guid-1",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "Video feed",
          feedUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=test",
          coverImage: "",
          saved: false,
        },
      ],
      lastUpdated: 0,
    };

    const processedFeed = MediaService.processYouTubeFeed(feed);

    expect(processedFeed.mediaType).toBe("video");
    expect(processedFeed.items[0].videoId).toBe("dQw4w9WgXcQ");
    expect(processedFeed.items[0].mediaType).toBe("video");
    expect(processedFeed.items[0].coverImage).toContain(
      "/dQw4w9WgXcQ/maxresdefault.jpg",
    );
  });
});
