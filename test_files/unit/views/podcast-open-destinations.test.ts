import { describe, expect, it } from "vitest";
import type { Feed, FeedItem, Tag } from "../../../src/types/types";
import { resolvePodcastOpenDestinations } from "../../../src/utils/podcast-open-destinations";

function createItem(overrides: Partial<FeedItem>): FeedItem {
  const tags: Tag[] = [];
  return {
    title: "Episode",
    link: "",
    description: "",
    pubDate: new Date(0).toISOString(),
    guid: "",
    read: false,
    starred: false,
    tags,
    feedTitle: "Show",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    mediaType: "podcast",
    ...overrides,
  };
}

describe("resolvePodcastOpenDestinations", () => {
  it("returns episode/show/audio/rss in a stable order", () => {
    const item = createItem({
      link: "https://example.com/ep1",
      content: `<p>Links: <a href="https://sub.example.com/p/post">Post</a></p>`,
      audioUrl: "https://cdn.example.com/ep1.mp3",
      enclosure: {
        url: "https://cdn.example.com/ep1.mp3",
        type: "audio/mpeg",
        length: "1",
      },
    });
    const feed: Pick<Feed, "url" | "siteUrl"> = {
      url: "https://example.com/feed.xml",
      siteUrl: "https://example.com",
    };

    const destinations = resolvePodcastOpenDestinations(item, feed);
    expect(destinations.map((d) => d.id)).toEqual([
      "episode",
      "show",
      "notes",
      "audio",
      "rss",
    ]);
    expect(destinations[0]?.url).toBe("https://example.com/ep1");
    expect(destinations[1]?.url).toBe("https://example.com");
    expect(destinations[2]?.url).toBe("https://sub.example.com/p/post");
    expect(destinations[3]?.url).toBe("https://cdn.example.com/ep1.mp3");
    expect(destinations[4]?.url).toBe("https://example.com/feed.xml");
  });

  it("includes guid as a separate option when it is a URL", () => {
    const item = createItem({
      link: "https://example.com/ep1",
      guid: "https://example.com/ep1?alt=guid",
    });
    const feed: Pick<Feed, "url" | "siteUrl"> = {
      url: "https://example.com/feed.xml",
      siteUrl: undefined,
    };

    const destinations = resolvePodcastOpenDestinations(item, feed);
    expect(destinations.map((d) => d.id)).toEqual(["episode", "episode_guid", "rss"]);
  });

  it("adds Apple Podcasts entry when enabled", () => {
    const item = createItem({ link: "https://example.com/ep1" });
    const feed: Pick<Feed, "url" | "siteUrl"> = {
      url: "https://example.com/feed.xml",
      siteUrl: "https://example.com",
    };

    const destinations = resolvePodcastOpenDestinations(item, feed, {
      includeApplePodcasts: true,
    });
    expect(destinations[destinations.length - 1]?.id).toBe("apple_podcasts");
  });
});
