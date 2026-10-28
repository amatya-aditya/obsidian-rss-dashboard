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

describe("resolvePodcastOpenDestinations characterization", () => {
  it("preserves destination order, labels, selected URLs, and Apple option", () => {
    const item = createItem({
      link: " https://example.com/episode ",
      guid: "https://example.com/episode-guid",
      content: '<a href="https://notes.example.com/post">Show notes</a>',
      audioUrl: "https://cdn.example.com/direct.mp3",
      enclosure: {
        url: "https://cdn.example.com/enclosure.mp3",
        type: "audio/mpeg",
        length: "1",
      },
    });
    const feed: Pick<Feed, "url" | "siteUrl"> = {
      url: "https://example.com/feed.xml",
      siteUrl: "https://example.com/show",
    };

    expect(
      resolvePodcastOpenDestinations(item, feed, {
        includeApplePodcasts: true,
      }),
    ).toEqual([
      {
        id: "episode",
        title: "Episode page",
        url: "https://example.com/episode",
      },
      {
        id: "episode_guid",
        title: "Episode page (GUID)",
        url: "https://example.com/episode-guid",
      },
      {
        id: "show",
        title: "Show website",
        url: "https://example.com/show",
      },
      {
        id: "notes",
        title: "From show notes: notes.example.com",
        url: "https://notes.example.com/post",
      },
      {
        id: "audio",
        title: "Audio file",
        url: "https://cdn.example.com/direct.mp3",
      },
      {
        id: "rss",
        title: "RSS feed",
        url: "https://example.com/feed.xml",
      },
      { id: "apple_podcasts", title: "Apple Podcasts" },
    ]);
  });

  it("rejects non-HTTP destinations and suppresses a GUID equal to the episode URL", () => {
    const item = createItem({
      link: "javascript:alert(1)",
      guid: "https://example.com/guid",
      content: '<a href="javascript:alert(1)">Unsafe</a>',
      audioUrl: "mailto:audio@example.com",
    });
    const feed: Pick<Feed, "url" | "siteUrl"> = {
      url: "data:text/plain,feed",
      siteUrl: "#",
    };

    expect(resolvePodcastOpenDestinations(item, feed)).toEqual([
      {
        id: "episode_guid",
        title: "Episode page (GUID)",
        url: "https://example.com/guid",
      },
    ]);

    const sameGuidItem = createItem({
      link: "https://example.com/episode",
      guid: "https://example.com/episode",
    });
    expect(
      resolvePodcastOpenDestinations(sameGuidItem, { url: "", siteUrl: "" }),
    ).toEqual([
      {
        id: "episode",
        title: "Episode page",
        url: "https://example.com/episode",
      },
    ]);
  });

  it("resolves, deduplicates, orders, and limits show-notes URLs to five", () => {
    const item = createItem({
      content: [
        '<a href="/one">One</a>',
        '<a href="https://SHOW.example/ONE">Duplicate</a>',
        '<a href="/two">Two</a>',
        '<a href="/three">Three</a>',
        '<a href="/four">Four</a>',
        '<a href="/five">Five</a>',
        '<a href="/six">Six</a>',
      ].join(" "),
    });
    const feed: Pick<Feed, "url" | "siteUrl"> = {
      url: "https://show.example/feed.xml",
      siteUrl: "https://show.example/show",
    };

    expect(resolvePodcastOpenDestinations(item, feed)).toEqual([
      {
        id: "show",
        title: "Show website",
        url: "https://show.example/show",
      },
      {
        id: "notes",
        title: "From show notes: show.example",
        url: "https://show.example/one",
      },
      {
        id: "notes",
        title: "From show notes: show.example",
        url: "https://show.example/two",
      },
      {
        id: "notes",
        title: "From show notes: show.example",
        url: "https://show.example/three",
      },
      {
        id: "notes",
        title: "From show notes: show.example",
        url: "https://show.example/four",
      },
      {
        id: "notes",
        title: "From show notes: show.example",
        url: "https://show.example/five",
      },
      {
        id: "rss",
        title: "RSS feed",
        url: "https://show.example/feed.xml",
      },
    ]);
  });

  it("extracts plain-text URLs and uses the enclosure when audioUrl is empty", () => {
    const item = createItem({
      description: "Listen: https://notes.example.com/story).",
      audioUrl: "",
      enclosure: {
        url: "https://cdn.example.com/fallback.mp3",
        type: "audio/mpeg",
        length: "1",
      },
    });

    expect(
      resolvePodcastOpenDestinations(item, {
        url: "https://example.com/feed.xml",
        siteUrl: undefined,
      }),
    ).toEqual([
      {
        id: "notes",
        title: "From show notes: notes.example.com",
        url: "https://notes.example.com/story",
      },
      {
        id: "audio",
        title: "Audio file",
        url: "https://cdn.example.com/fallback.mp3",
      },
      {
        id: "rss",
        title: "RSS feed",
        url: "https://example.com/feed.xml",
      },
    ]);
  });

  it("falls back to the enclosure when audioUrl contains only whitespace", () => {
    const item = createItem({
      audioUrl: " ",
      enclosure: {
        url: "https://cdn.example.com/fallback.mp3",
        type: "audio/mpeg",
        length: "1",
      },
    });

    expect(
      resolvePodcastOpenDestinations(item, {
        url: "",
        siteUrl: undefined,
      }),
    ).toEqual([
      {
        id: "audio",
        title: "Audio file",
        url: "https://cdn.example.com/fallback.mp3",
      },
    ]);
  });
});
