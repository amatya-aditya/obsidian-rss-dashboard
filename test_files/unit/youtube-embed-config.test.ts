import { describe, expect, it } from "vitest";
import { MediaService } from "../../src/services/media-service";
import { Feed } from "../../src/types/types";

describe("youtube embed config", () => {
  it("builds privacy-enhanced embed config with strict referrer policy", () => {
    const embed = MediaService.buildYouTubeEmbed("dQw4w9WgXcQ");

    expect(embed.videoId).toBe("dQw4w9WgXcQ");
    expect(embed.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    );
    expect(embed.watchUrl).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(embed.referrerPolicy).toBe("strict-origin-when-cross-origin");
    expect(embed.embedUrl).not.toContain("autoplay=");
    expect(embed.embedUrl).not.toContain("vq=");
    expect(embed.allow).toContain("picture-in-picture");
    expect(embed.allow).not.toContain("autoplay");
  });

  it("uses the shared embed config in the legacy html helper", () => {
    const playerHtml = MediaService.getYouTubePlayerHtml("dQw4w9WgXcQ");

    expect(playerHtml).toContain("https://www.youtube-nocookie.com/embed/");
    expect(playerHtml).toContain(
      'referrerpolicy="strict-origin-when-cross-origin"',
    );
    expect(playerHtml).not.toContain("autoplay");
    expect(playerHtml).not.toContain("vq=");
  });

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
