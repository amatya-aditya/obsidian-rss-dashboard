import { describe, expect, it } from "vitest";
import { resolveItemExternalUrl } from "../../src/utils/item-url-utils";
import type { FeedItem, Tag } from "../../src/types/types";

function createItem(overrides: Partial<FeedItem>): FeedItem {
  const tags: Tag[] = [];
  return {
    title: "Test",
    link: "",
    description: "",
    pubDate: new Date(0).toISOString(),
    guid: "",
    read: false,
    starred: false,
    tags,
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

describe("resolveItemExternalUrl", () => {
  it("prefers item.link when it is an http(s) URL", () => {
    const item = createItem({
      link: "https://example.com/episode",
      guid: "gid://not-openable",
      audioUrl: "https://example.com/audio.mp3",
    });

    expect(resolveItemExternalUrl(item)).toBe("https://example.com/episode");
  });

  it("falls back to audioUrl when link is empty (common for podcasts)", () => {
    const item = createItem({
      link: "",
      guid: "gid://art19-episode-locator/V0/abc",
      audioUrl: "https://cdn.example.com/audio.mp3",
    });

    expect(resolveItemExternalUrl(item)).toBe("https://cdn.example.com/audio.mp3");
  });

  it("falls back to guid when it is an http(s) URL", () => {
    const item = createItem({
      link: "#",
      guid: "https://example.com/post",
    });

    expect(resolveItemExternalUrl(item)).toBe("https://example.com/post");
  });

  it("falls back to enclosure.url when needed", () => {
    const item = createItem({
      link: "",
      guid: "gid://not-openable",
      enclosure: {
        url: "https://cdn.example.com/audio.m4a",
        type: "audio/mp4",
        length: "123",
      },
    });

    expect(resolveItemExternalUrl(item)).toBe("https://cdn.example.com/audio.m4a");
  });

  it("returns null when no openable URL is present", () => {
    const item = createItem({
      link: "",
      guid: "gid://not-openable",
      audioUrl: "file:///not-supported-here.mp3",
    });

    expect(resolveItemExternalUrl(item)).toBeNull();
  });
});

