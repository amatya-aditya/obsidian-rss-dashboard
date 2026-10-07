import { afterEach, describe, expect, it } from "vitest";
import { setRequestUrlHandler, type RequestUrlParam } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type MediaSettings,
} from "../../../../src/types/types.js";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class.js";
import {
  fetchYouTubeFeedXmlFromApi,
  getYouTubeFeedPlaylistId,
} from "../../../../src/services/feed-parser/youtube-api-feed.js";

const CHANNEL_FEED =
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCYO_jab_esuFRV4b17AJtAw";

const PLAYLIST_ITEMS = {
  items: [
    {
      snippet: {
        title: "Older video",
        description: "first line & second",
        videoOwnerChannelTitle: "3Blue1Brown",
        videoOwnerChannelId: "UCYO_jab_esuFRV4b17AJtAw",
        thumbnails: {
          high: {
            url: "https://i.ytimg.com/vi/vid1/hqdefault.jpg",
            width: 480,
            height: 360,
          },
        },
      },
      contentDetails: {
        videoId: "vid1",
        videoPublishedAt: "2026-09-18T17:12:53Z",
      },
    },
    {
      snippet: {
        title: "Private video",
        description: "This video is private.",
        thumbnails: {},
      },
      contentDetails: { videoId: "vid2" },
    },
    {
      snippet: {
        title: "Newer <video>",
        description: "",
        videoOwnerChannelTitle: "3Blue1Brown",
        videoOwnerChannelId: "UCYO_jab_esuFRV4b17AJtAw",
        thumbnails: {
          high: {
            url: "https://i.ytimg.com/vi/vid3/hqdefault.jpg",
            width: 480,
            height: 360,
          },
        },
      },
      contentDetails: {
        videoId: "vid3",
        videoPublishedAt: "2026-09-25T13:35:02Z",
      },
    },
  ],
};

/** A fake server: YouTube feeds (and any proxy) fail, the Data API answers. */
function serveApi(requests: RequestUrlParam[], apiStatus = 200) {
  setRequestUrlHandler((request) => {
    requests.push(request);
    if (
      request.url.startsWith(
        "https://www.googleapis.com/youtube/v3/playlistItems",
      )
    ) {
      return { status: apiStatus, text: JSON.stringify(PLAYLIST_ITEMS) };
    }
    return { status: 404, text: "<html>Error 404 (Not Found)</html>" };
  });
}

afterEach(() => {
  setRequestUrlHandler(null);
});

describe("getYouTubeFeedPlaylistId", () => {
  it("maps a channel feed to the channel's uploads playlist", () => {
    expect(getYouTubeFeedPlaylistId(CHANNEL_FEED)).toBe(
      "UUYO_jab_esuFRV4b17AJtAw",
    );
  });

  it("returns the playlist id of a playlist feed", () => {
    expect(
      getYouTubeFeedPlaylistId(
        "https://www.youtube.com/feeds/videos.xml?playlist_id=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab",
      ),
    ).toBe("PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab");
  });

  it("returns null for user feeds, other hosts and invalid urls", () => {
    expect(
      getYouTubeFeedPlaylistId(
        "https://www.youtube.com/feeds/videos.xml?user=someone",
      ),
    ).toBeNull();
    expect(
      getYouTubeFeedPlaylistId(
        "https://example.com/feeds/videos.xml?channel_id=UC1",
      ),
    ).toBeNull();
    expect(getYouTubeFeedPlaylistId("not a url")).toBeNull();
  });
});

describe("fetchYouTubeFeedXmlFromApi", () => {
  it("sends the key as a header and builds a YouTube-style Atom feed", async () => {
    const requests: RequestUrlParam[] = [];
    serveApi(requests);

    const xml = await fetchYouTubeFeedXmlFromApi(CHANNEL_FEED, "test-key");

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("playlistId=UUYO_jab_esuFRV4b17AJtAw");
    expect(requests[0].url).not.toContain("test-key");
    expect(requests[0].headers?.["X-Goog-Api-Key"]).toBe("test-key");
    expect(xml).toContain("<title>3Blue1Brown</title>");
    expect(xml).toContain("<yt:videoId>vid1</yt:videoId>");
    expect(xml).not.toContain("vid2"); // private video without a publish date
    expect(xml).toContain("first line &amp; second");
    expect(xml).toContain("Newer &lt;video&gt;");
  });

  it("rejects non-YouTube feed urls", async () => {
    await expect(
      fetchYouTubeFeedXmlFromApi("https://example.com/feed.xml", "k"),
    ).rejects.toThrow("Not a YouTube channel or playlist feed");
  });
});

describe("FeedParser.parseFeed YouTube API fallback", () => {
  const withKey = (youtubeApiKey: string): MediaSettings => ({
    ...DEFAULT_SETTINGS.media,
    youtubeApiKey,
  });

  it("reads a failing YouTube feed through the API when a key is set", async () => {
    const requests: RequestUrlParam[] = [];
    serveApi(requests);
    const parser = new FeedParser(
      DEFAULT_SETTINGS.display,
      [],
      withKey("test-key"),
      () => [],
      () => false,
    );

    const feed = await parser.parseFeed(CHANNEL_FEED, null);

    expect(feed.items.map((item) => item.link)).toEqual(
      expect.arrayContaining([
        "https://www.youtube.com/watch?v=vid1",
        "https://www.youtube.com/watch?v=vid3",
      ]),
    );
    expect(feed.items).toHaveLength(2);
    expect(feed.items.map((item) => item.title)).toContain("Newer <video>");
  });

  it("keeps the original error when no key is set", async () => {
    const requests: RequestUrlParam[] = [];
    serveApi(requests);
    const parser = new FeedParser(
      DEFAULT_SETTINGS.display,
      [],
      withKey(""),
      () => [],
      () => false,
    );

    await expect(parser.parseFeed(CHANNEL_FEED, null)).rejects.toThrow();
    expect(requests.some((r) => r.url.includes("googleapis.com"))).toBe(false);
  });

  it("surfaces an API error when the key is rejected", async () => {
    serveApi([], 400);
    const parser = new FeedParser(
      DEFAULT_SETTINGS.display,
      [],
      withKey("bad-key"),
      () => [],
      () => false,
    );

    await expect(parser.parseFeed(CHANNEL_FEED, null)).rejects.toThrow();
  });
});
