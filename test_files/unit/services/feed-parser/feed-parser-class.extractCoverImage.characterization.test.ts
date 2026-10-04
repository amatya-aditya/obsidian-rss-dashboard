import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import type { RequestUrlResponse } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type MediaSettings,
} from "../../../../src/types/types.js";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class.js";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";
import type {
  ParsedFeed,
  ParsedItem,
} from "../../../../src/services/feed-parser/types.js";

/**
 * Characterization of `FeedParser.extractCoverImage` (#636, refactor tracked in
 * #436), pinned through the public `parseFeed`.
 *
 * `extractCoverImage` is private. It reads the HTML of an item (`content`, else
 * `description`) and returns the first usable image URL: an `og:image` meta
 * tag, else the first non-formula `<img>`, else a scan of every `<img>` that
 * skips junk, formula images and tracking pixels and wants an image extension
 * or the word "image". The item pipeline calls it twice per article (for the
 * cover and for the card image) and once more for a podcast episode, and runs
 * the result through `sanitizeImageUrl`, which drops anything that is not an
 * absolute http(s) URL.
 *
 * The XML parser's output is supplied directly (`parseString` spied), because
 * the real parser fills `item.image` from the first `<img>` of the content and
 * would hide what `extractCoverImage` returns. Two tests at the end use the
 * real parser to pin the one bug that shows through it. `parseFeed` always
 * passes a non-empty feed URL as the base URL, so the "no base URL" branches of
 * the method cannot be reached from here and are not pinned.
 */

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const RECENT = "Sun, 14 Jun 2026 00:00:00 GMT";
// A feed in a sub-folder, so a relative URL shows which directory it resolves against.
const FEED_URL = "https://example.com/rss/feed.xml";
const ITEM_LINK = "https://example.com/a";
const DEBUG_PREFIX = "[RSS Dashboard] extractCoverImage:";

const MEDIA_SETTINGS: MediaSettings = {
  autoTagVideos: true,
  rememberPlaybackProgress: true,
  defaultMastodonFolder: "Mastodon",
  defaultYouTubeFolder: "Videos",
  defaultVideoTag: "Video",
  defaultVideoTags: ["Video"],
  defaultYouTubeTag: "Video",
  defaultYouTubeTags: ["Video"],
  defaultPodcastFolder: "Podcasts",
  defaultPodcastTags: ["Podcast"],
  defaultRssFolder: "RSS",
  defaultRssTag: "",
  defaultRssTags: [],
  defaultSmallwebFolder: "Smallweb",
  defaultSmallwebTag: "",
  defaultSmallwebTags: [],
  defaultMastodonTag: "",
  defaultMastodonTags: [],
  openInSplitView: true,
  podcastTheme: "obsidian",
  enableApplePodcastsOpen: false,
  defaultPlaySpeed: 1,
};

function response(text: string): RequestUrlResponse {
  return {
    status: 200,
    text,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: null,
  };
}

async function parseBody(body: string, existing: Feed | null = null): Promise<Feed> {
  vi.spyOn(obsidian, "requestUrl").mockResolvedValue(response(body));
  const parser = new FeedParser(
    DEFAULT_SETTINGS.display,
    [],
    MEDIA_SETTINGS,
    () => [],
    () => true,
  );
  return parser.parseFeed(FEED_URL, existing, {});
}

/** Runs `parseFeed` with the XML parser's output supplied directly. */
async function parseParsed(
  items: ParsedItem[],
  feedProps: Partial<ParsedFeed> = {},
  existing: Feed | null = null,
): Promise<Feed> {
  vi.spyOn(CustomXMLParser.prototype, "parseString").mockReturnValue({
    title: "Parsed feed",
    items,
    type: "rss",
    feedItunesImage: "",
    feedImageUrl: "",
    ...feedProps,
  });
  return parseBody("<rss></rss>", existing);
}

function pitem(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    title: "A",
    link: ITEM_LINK,
    description: "",
    pubDate: RECENT,
    guid: ITEM_LINK,
    ...overrides,
  };
}

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) {
    throw new Error(`Expected an element at index ${index}`);
  }
  return value;
}

interface Images {
  cover: string;
  image: string | undefined;
}

async function imagesOfItem(item: ParsedItem): Promise<Images> {
  const feed = await parseParsed([item]);
  const parsedItem = at(feed.items, 0);
  return { cover: parsedItem.coverImage, image: parsedItem.image };
}

/**
 * The cover an article gets from the HTML in its content. An article's card
 * image takes the same value when nothing else offers one, so the two are
 * checked together.
 */
async function coverFromContent(html: string): Promise<string> {
  const { cover, image } = await imagesOfItem(pitem({ content: html }));
  expect(image).toBe(cover);
  return cover;
}

/** The cover of a podcast episode (an audio enclosure) whose only artwork is in its HTML. */
async function podcastCoverFromContent(
  html: string,
  field: "content" | "description" = "content",
): Promise<string> {
  const feed = await parseParsed([
    pitem({
      [field]: html,
      enclosure: { url: "https://example.com/ep.mp3", type: "audio/mpeg", length: "1" },
    }),
  ]);
  return at(feed.items, 0).coverImage;
}

/** What `extractCoverImage` logged during the last parse, in call order. */
function extractDebugMessages(debugSpy: { mock: { calls: unknown[][] } }): string[] {
  return debugSpy.mock.calls
    .map((args) => String(args[0]))
    .filter((message) => message.startsWith(DEBUG_PREFIX));
}

const REAL = "https://img.example.com/real.jpg";
const PIXEL = "https://t.example.com/pixel.gif";

describe("FeedParser.extractCoverImage characterization", () => {
  beforeEach(() => {
    // Fake only Date; real timers keep the mocked fetch promises flowing.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("input", () => {
    it("finds no cover when the item has neither content nor description", async () => {
      expect(await imagesOfItem(pitem())).toEqual({ cover: "", image: "" });
    });

    it("finds no cover in html without an image or an og:image tag", async () => {
      expect(await coverFromContent("<p>Words</p><a href='https://example.com'>link</a>")).toBe("");
    });

    it("reads the description only when the content is empty, even if the content has no image", async () => {
      const withImage = `<img src="${REAL}">`;

      expect(
        (await imagesOfItem(pitem({ content: "<p>Words</p>", description: withImage }))).cover,
      ).toBe("");
      expect(
        (await imagesOfItem(pitem({ content: "", description: withImage }))).cover,
      ).toBe(REAL);
    });

    it("returns no cover from the content when the html cannot be parsed, and the item is still built", async () => {
      vi.spyOn(DOMParser.prototype, "parseFromString").mockImplementation(() => {
        throw new Error("parse failure");
      });

      const feed = await parseParsed([
        pitem({
          content: `<img src="${REAL}">`,
          itunes: { image: { href: "https://img.example.com/itunes.jpg" } },
        }),
      ]);

      const item = at(feed.items, 0);
      expect(item.title).toBe("A");
      // The content image is lost; the next candidate, the itunes image, takes its place.
      expect(item.coverImage).toBe("https://img.example.com/itunes.jpg");
    });
  });

  describe("og:image", () => {
    function og(content: string): string {
      return `<meta property="og:image" content="${content}">`;
    }

    it.each([
      ["an https url", "https://img.example.com/og.jpg", "https://img.example.com/og.jpg"],
      ["an http url", "http://img.example.com/og.jpg", "http://img.example.com/og.jpg"],
      ["a protocol-relative url", "//cdn.example.com/og.png", "https://cdn.example.com/og.png"],
      ["an app:// url", "app://cdn.example.com/og.png", "https://cdn.example.com/og.png"],
      ["a root-relative path", "/og/social.png", "https://example.com/og/social.png"],
      ["a relative path", "og/social.png", "https://example.com/rss/og/social.png"],
      ["a path with no extension", "og/social", "https://example.com/rss/og/social"],
    ])("resolves %s against the feed url", async (_label, content, expected) => {
      expect(await coverFromContent(og(content))).toBe(expected);
    });

    it("wins over an image that comes earlier in the document", async () => {
      const html = `<img src="${REAL}">${og("https://img.example.com/og.jpg")}`;

      expect(await coverFromContent(html)).toBe("https://img.example.com/og.jpg");
    });

    it("shrinks a supported CDN image", async () => {
      expect(
        await coverFromContent(og("https://res.cloudinary.com/demo/image/upload/sample.jpg")),
      ).toBe("https://res.cloudinary.com/demo/image/upload/w_600,c_scale/sample.jpg");
    });

    it("is skipped when its content is empty, for the next image", async () => {
      expect(await coverFromContent(`${og("")}<img src="${REAL}">`)).toBe(REAL);
    });

    it("is read only from a property attribute, not a name attribute", async () => {
      const html = `<meta name="og:image" content="https://img.example.com/og.jpg"><img src="${REAL}">`;

      expect(await coverFromContent(html)).toBe(REAL);
    });

    it("reads only the first og:image tag, so an empty first tag hides a valid second one", async () => {
      expect(
        await coverFromContent(`${og("")}${og("https://img.example.com/second.jpg")}`),
      ).toBe("");
    });

    it("falls through a formula og:image to the first image that is not a formula", async () => {
      const html = `${og("https://s0.wp.com/latex.php?latex=x")}<img class="latex" src="${REAL}"><img src="https://img.example.com/second.png">`;

      expect(await coverFromContent(html)).toBe("https://img.example.com/second.png");
    });

    it("resolves a relative file name that starts with http", async () => {
      expect(await coverFromContent(`${og("http-banner.jpg")}<img src="${REAL}">`)).toBe(
        "https://example.com/rss/http-banner.jpg",
      );
    });

    it("skips a data: URI and uses the later image", async () => {
      expect(
        await coverFromContent(`${og("data:image/png;base64,AAAA")}<img src="${REAL}">`),
      ).toBe(REAL);
    });

    it("keeps a double-encoded absolute url as it is and logs it once per call", async () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const url = "https://img.example.com/a%2520b.jpg";

      expect(await coverFromContent(og(url))).toBe(url);

      const message = `${DEBUG_PREFIX} og:image contains double-encoded: ${url}`;
      // The cover and the card image each call the method once.
      expect(extractDebugMessages(debugSpy)).toEqual([message, message]);
    });

    it("does not log an og:image that has no encoded percent sign", async () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      await coverFromContent(og("https://img.example.com/a%20b.jpg"));

      expect(extractDebugMessages(debugSpy)).toEqual([]);
    });
  });

  describe("first image", () => {
    it.each([
      ["an https url with no image extension", "https://img.example.com/photo", "https://img.example.com/photo"],
      ["an http url", "http://img.example.com/a.png", "http://img.example.com/a.png"],
      ["a protocol-relative url", "//cdn.example.com/a.png", "https://cdn.example.com/a.png"],
      ["an app:// url", "app://cdn.example.com/a.png", "https://cdn.example.com/a.png"],
      ["a root-relative path", "/uploads/a.png", "https://example.com/uploads/a.png"],
      ["a relative path", "pics/a.png", "https://example.com/rss/pics/a.png"],
      ["a relative path with no extension", "photo", "https://example.com/rss/photo"],
      ["a parent-relative path", "../a.png", "https://example.com/a.png"],
      ["a url with padding spaces", "  https://img.example.com/a.jpg ", "https://img.example.com/a.jpg"],
      ["a relative path with padding spaces", "  pics/a.jpg ", "https://example.com/rss/pics/a.jpg"],
    ])("takes %s", async (_label, src, expected) => {
      expect(await coverFromContent(`<img src="${src}">`)).toBe(expected);
    });

    it("shrinks a supported CDN image", async () => {
      expect(
        await coverFromContent('<img src="https://res.cloudinary.com/demo/image/upload/sample.jpg">'),
      ).toBe("https://res.cloudinary.com/demo/image/upload/w_600,c_scale/sample.jpg");
    });

    it("shrinks a supported CDN image that had to be resolved first", async () => {
      expect(
        await coverFromContent('<img src="//res.cloudinary.com/demo/image/upload/sample.jpg">'),
      ).toBe("https://res.cloudinary.com/demo/image/upload/w_600,c_scale/sample.jpg");
    });

    it("decodes html entities in the src", async () => {
      expect(await coverFromContent('<img src="https://img.example.com/a.png?x=1&amp;y=2">')).toBe(
        "https://img.example.com/a.png?x=1&y=2",
      );
    });

    it("takes the img of a picture element and ignores its sources", async () => {
      const html =
        '<picture><source srcset="https://img.example.com/s.webp"><img src="https://img.example.com/p.jpg"></picture>';

      expect(await coverFromContent(html)).toBe("https://img.example.com/p.jpg");
    });

    it("takes the first of several usable images", async () => {
      const html = `<img src="${REAL}"><img src="https://img.example.com/second.jpg">`;

      expect(await coverFromContent(html)).toBe(REAL);
    });

    it("normalizes a double-encoded relative src once and logs it", async () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      expect(await coverFromContent('<img src="/uploads/a%2520b.png">')).toBe(
        "https://example.com/uploads/a%20b.png",
      );

      const message = `${DEBUG_PREFIX} first img src contains double-encoded: /uploads/a%2520b.png`;
      expect(extractDebugMessages(debugSpy)).toEqual([message, message]);
    });

    it.each([
      "https://img.example.com/a%2520b.png",
      "http://img.example.com/a%2520b.png",
    ])("keeps the double-encoded absolute src %s as it is", async (url) => {
      vi.spyOn(console, "debug").mockImplementation(() => {});

      expect(await coverFromContent(`<img src="${url}">`)).toBe(url);
    });

    describe("formula images", () => {
      it.each([
        ["the latex class", '<img class="latex" src="https://img.example.com/f.png">'],
        ["the latex class among others, in any case", '<img class="x LaTeX" src="https://img.example.com/f.png">'],
        ["a latex.php url", '<img src="https://s0.wp.com/latex.php?latex=x%5E2&amp;bg=ffffff">'],
      ])("skips an image with %s for the next one", async (_label, formula) => {
        expect(await coverFromContent(`${formula}<img src="${REAL}">`)).toBe(REAL);
      });

      it("finds no cover when every image is a formula", async () => {
        const html =
          '<img class="latex" src="https://img.example.com/f.png"><img src="https://s0.wp.com/latex.php?latex=y">';

        expect(await coverFromContent(html)).toBe("");
      });

      it("does not treat a longer class name as the latex class", async () => {
        expect(await coverFromContent('<img class="latexy" src="https://img.example.com/f.png">')).toBe(
          "https://img.example.com/f.png",
        );
      });
    });

    describe("junk src values", () => {
      it.each([
        ["an empty src", ""],
        ["a blank src", "   "],
        ["undefined", "undefined"],
        ["undefined with padding", " undefined "],
        ["null", "null"],
        ["a hash", "#"],
        ["about:blank", "about:blank"],
      ])("skips %s for the next image", async (_label, src) => {
        expect(await coverFromContent(`<img src="${src}"><img src="${REAL}">`)).toBe(REAL);
      });

      it("skips an image with no src attribute", async () => {
        expect(await coverFromContent(`<img alt="no source"><img src="${REAL}">`)).toBe(REAL);
      });

      it("finds no cover when every image is junk", async () => {
        expect(await coverFromContent('<img src="#"><img src="null"><img>')).toBe("");
      });
    });

    describe("unusable image URLs", () => {
      it("skips a data: URI placeholder and uses the real image after it", async () => {
        const html = `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><img src="${REAL}">`;

        expect(await coverFromContent(html)).toBe(REAL);
      });

      it("finds no cover when a data: URI is the only image", async () => {
        expect(await coverFromContent('<img src="data:image/gif;base64,AAAA">')).toBe("");
      });

      it("resolves a relative file name that starts with http", async () => {
        expect(await coverFromContent(`<img src="http-banner.jpg"><img src="${REAL}">`)).toBe(
          "https://example.com/rss/http-banner.jpg",
        );
      });
    });
  });

  describe("tracking pixels", () => {
    // `isTrackingPixel` matches these substrings anywhere in the raw src.
    it.each([
      ["tracking/", "/tracking/a.png"],
      ["pixel.gif", "/pixel.gif"],
      ["beacon.", "/beacon.png"],
      ["1x1", "/1x1.png"],
      ["/track/", "/track/a.png"],
      ["rss-pixel", "/rss-pixel.png"],
    ])("skips a relative src that contains %s for the next image", async (_pattern, src) => {
      expect(await coverFromContent(`<img src="${src}"><img src="${REAL}">`)).toBe(REAL);
    });

    it.each([
      ["a path segment named tracking", "https://img.example.com/tracking/a.png"],
      ["a host that starts with beacon", "https://beacon.example.com/a.jpg"],
      ["a file name that holds 1x1", "https://img.example.com/photo-1x1-crop.jpg"],
    ])("skips %s wherever the pattern sits in the url", async (_label, src) => {
      expect(await coverFromContent(`<img src="${src}"><img src="${REAL}">`)).toBe(REAL);
    });

    it.each([
      ["pixel.png", "https://t.example.com/pixel.png"],
      ["tracker/", "https://t.example.com/tracker/a.png"],
      ["1x2", "https://t.example.com/1x2.png"],
      ["track without slashes", "https://t.example.com/trackpad.png"],
      ["beacon without the dot", "https://t.example.com/beaconlight.png"],
      ["rss pixel with a space", "https://t.example.com/rss_pixel.png"],
    ])("does not treat %s as a tracking pixel", async (_label, src) => {
      expect(await coverFromContent(`<img src="${src}"><img src="${REAL}">`)).toBe(src);
    });

    it("finds no cover when the only image is a tracking pixel", async () => {
      expect(await coverFromContent(`<img src="${PIXEL}">`)).toBe("");
    });

    it("logs a double-encoded tracking src once for the first image and once for the scan", async () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const src = "https://t.example.com/tracking/%2520a.gif";

      expect(await coverFromContent(`<img src="${src}"><img src="${REAL}">`)).toBe(REAL);

      const first = `${DEBUG_PREFIX} first img src contains double-encoded: ${src}`;
      const scan = `${DEBUG_PREFIX} img src contains double-encoded: ${src}`;
      // Two calls (cover and card image), each logging the first image and then the scan.
      expect(extractDebugMessages(debugSpy)).toEqual([first, scan, first, scan]);
    });
  });

  describe("scanning the images after a skipped first image", () => {
    function afterPixel(...images: string[]): string {
      return `<img src="${PIXEL}">${images.map((src) => `<img src="${src}">`).join("")}`;
    }

    it.each([
      [".jpg", "https://img.example.com/a.jpg"],
      [".jpeg", "https://img.example.com/a.jpeg"],
      [".png", "https://img.example.com/a.png"],
      [".gif", "https://img.example.com/a.gif"],
      [".webp", "https://img.example.com/a.webp"],
      ["a path with the word image", "https://img.example.com/image/12345"],
      ["a path with the word images", "https://img.example.com/images/a"],
      ["a host with the word image", "https://images.example.com/a"],
      ["the word image alone", "https://img.example.com/image"],
    ])("accepts an absolute src with %s", async (_label, src) => {
      expect(await coverFromContent(afterPixel(src))).toBe(src);
    });

    it.each([
      [".jpg", "https://img.example.com/a%2520b.jpg"],
      [".jpeg", "https://img.example.com/a%2520b.jpeg"],
      [".png", "https://img.example.com/a%2520b.png"],
      [".gif", "https://img.example.com/a%2520b.gif"],
      [".webp", "https://img.example.com/a%2520b.webp"],
      ["the word image", "https://img.example.com/image/a%2520b"],
      ["an http url", "http://img.example.com/a%2520b.png"],
    ])("keeps an absolute src with %s and a double-encoded name exactly as written", async (_label, src) => {
      // An absolute url is returned as it is; only a src that has to be resolved is normalized.
      vi.spyOn(console, "debug").mockImplementation(() => {});

      expect(await coverFromContent(afterPixel(src))).toBe(src);
    });

    it.each([
      ["an uppercase extension", "https://img.example.com/A.JPG"],
      ["a query string after the extension", "https://img.example.com/a.jpg?w=1"],
      ["an svg", "https://img.example.com/a.svg"],
      ["an avif", "https://img.example.com/a.avif"],
      ["no extension and no image in the name", "https://img.example.com/photo"],
    ])("rejects an absolute src with %s", async (_label, src) => {
      // Pinned as it is: the first image is taken whatever its extension, but
      // the scan after a skipped first image is stricter. The real XML parser
      // fills in `item.image` and hides this from users, so it is not filed.
      expect(await coverFromContent(afterPixel(src))).toBe("");
    });

    it.each([
      ["a root-relative path with an extension", "/uploads/a.png", "https://example.com/uploads/a.png"],
      ["a relative path with an extension", "pics/a.webp", "https://example.com/rss/pics/a.webp"],
      ["a parent-relative path", "../a.png", "https://example.com/a.png"],
      ["a protocol-relative url", "//cdn.example.com/a.png", "https://cdn.example.com/a.png"],
      ["an app:// url", "app://cdn.example.com/a.png", "https://cdn.example.com/a.png"],
      ["a root-relative path with the word image", "/images/a", "https://example.com/images/a"],
      ["a relative .jpg", "pics/a.jpg", "https://example.com/rss/pics/a.jpg"],
      ["a relative .jpeg", "pics/a.jpeg", "https://example.com/rss/pics/a.jpeg"],
      ["a relative .gif", "pics/a.gif", "https://example.com/rss/pics/a.gif"],
    ])("resolves %s against the feed url", async (_label, src, expected) => {
      expect(await coverFromContent(afterPixel(src))).toBe(expected);
    });

    it("shrinks a supported CDN image that had to be resolved first", async () => {
      expect(
        await coverFromContent(
          afterPixel("//res.cloudinary.com/demo/image/upload/sample.jpg"),
        ),
      ).toBe("https://res.cloudinary.com/demo/image/upload/w_600,c_scale/sample.jpg");
    });

    it("rejects a relative src with no extension and no image in the name", async () => {
      expect(await coverFromContent(afterPixel("/a"))).toBe("");
    });

    it("skips a data:image URI and uses the later image", async () => {
      expect(await coverFromContent(afterPixel("data:image/png;base64,AA", REAL))).toBe(REAL);
    });

    it("continues past an image that does not qualify to one that does", async () => {
      const html = afterPixel("https://img.example.com/photo", "https://img.example.com/b.png");

      expect(await coverFromContent(html)).toBe("https://img.example.com/b.png");
    });

    it("returns the first qualifying image and ignores the rest", async () => {
      const html = afterPixel("https://img.example.com/a.png", "https://img.example.com/b.png");

      expect(await coverFromContent(html)).toBe("https://img.example.com/a.png");
    });

    it("skips later tracking pixels, junk srcs and formula images", async () => {
      const html = [
        `<img src="${PIXEL}">`,
        '<img src="https://t.example.com/tracking/b.png">',
        '<img src="#">',
        '<img alt="no src">',
        '<img class="latex" src="https://img.example.com/formula.png">',
        '<img src="https://s0.wp.com/latex.php?latex=z.png">',
        `<img src="${REAL}">`,
      ].join("");

      expect(await coverFromContent(html)).toBe(REAL);
    });

    it("shrinks a supported CDN image", async () => {
      expect(
        await coverFromContent(
          afterPixel("https://res.cloudinary.com/demo/image/upload/sample.jpg"),
        ),
      ).toBe("https://res.cloudinary.com/demo/image/upload/w_600,c_scale/sample.jpg");
    });

    it("reaches the scan when the first image is junk and the second is a tracking pixel", async () => {
      expect(await coverFromContent(`<img src="#"><img src="${PIXEL}"><img src="${REAL}">`)).toBe(REAL);
    });

    it("normalizes a double-encoded relative src once and logs it", async () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      expect(await coverFromContent(afterPixel("/uploads/a%2520b.png"))).toBe(
        "https://example.com/uploads/a%20b.png",
      );

      const message = `${DEBUG_PREFIX} img src contains double-encoded: /uploads/a%2520b.png`;
      expect(extractDebugMessages(debugSpy)).toEqual([message, message]);
    });
  });

  describe("a podcast episode", () => {
    it("takes its cover from the og:image in the content when it has no artwork", async () => {
      const html = `<meta property="og:image" content="/og/episode.png"><img src="${REAL}">`;

      expect(await podcastCoverFromContent(html)).toBe("https://example.com/og/episode.png");
    });

    it("takes its cover from the first image in the content", async () => {
      expect(await podcastCoverFromContent(`<img src="pics/ep.png">`)).toBe(
        "https://example.com/rss/pics/ep.png",
      );
    });

    it("skips a tracking pixel and takes the next image with an extension", async () => {
      expect(await podcastCoverFromContent(`<img src="${PIXEL}"><img src="${REAL}">`)).toBe(REAL);
    });

    it("reads the description when there is no content", async () => {
      expect(await podcastCoverFromContent(`<img src="${REAL}">`, "description")).toBe(REAL);
    });

    it("falls back to the feed image when the content has no usable image", async () => {
      const feed = await parseParsed(
        [
          pitem({
            content: `<img src="${PIXEL}">`,
            enclosure: { url: "https://example.com/ep.mp3", type: "audio/mpeg", length: "1" },
          }),
        ],
        { feedImageUrl: "https://img.example.com/show.jpg" },
      );

      expect(at(feed.items, 0).coverImage).toBe("https://img.example.com/show.jpg");
    });

    it("prefers the episode artwork to an image in the content", async () => {
      const feed = await parseParsed([
        pitem({
          content: `<img src="${REAL}">`,
          itunes: { image: { href: "https://img.example.com/art.jpg" } },
          enclosure: { url: "https://example.com/ep.mp3", type: "audio/mpeg", length: "1" },
        }),
      ]);

      expect(at(feed.items, 0).coverImage).toBe("https://img.example.com/art.jpg");
    });
  });

  describe("an item that is already stored", () => {
    function stored(overrides: Partial<FeedItem> = {}): Feed {
      return {
        title: "Stored feed",
        url: FEED_URL,
        folder: "Uncategorized",
        lastUpdated: 1,
        items: [
          {
            title: "Stored title",
            link: ITEM_LINK,
            description: "",
            pubDate: RECENT,
            guid: ITEM_LINK,
            read: false,
            starred: false,
            tags: [],
            feedTitle: "Stored feed",
            feedUrl: FEED_URL,
            coverImage: "https://img.example.com/stored-cover.jpg",
            saved: false,
            mediaType: "article",
            ...overrides,
          },
        ],
      };
    }

    it("replaces its cover with the og:image of the refreshed content", async () => {
      const feed = await parseParsed(
        [pitem({ content: '<meta property="og:image" content="/og/new.png">' })],
        {},
        stored(),
      );

      expect(at(feed.items, 0).coverImage).toBe("https://example.com/og/new.png");
    });

    it("keeps its cover when the refreshed content has only skipped images", async () => {
      const feed = await parseParsed(
        [pitem({ content: `<img src="${PIXEL}"><img src="#"><img class="latex" src="${REAL}">` })],
        {},
        stored(),
      );

      expect(at(feed.items, 0).coverImage).toBe("https://img.example.com/stored-cover.jpg");
    });
  });

  describe("through the real XML parser", () => {
    function rssWithContent(html: string): string {
      return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>Feed</title>
<link>https://example.com/</link>
<item>
<title>A</title>
<link>${ITEM_LINK}</link>
<guid>${ITEM_LINK}</guid>
<pubDate>${RECENT}</pubDate>
<content:encoded><![CDATA[${html}]]></content:encoded>
</item>
</channel>
</rss>`;
    }

    it("takes the first usable image of an article's content as its cover", async () => {
      const feed = await parseBody(rssWithContent(`<p>Words</p><img src="${REAL}">`));

      expect(at(feed.items, 0).coverImage).toBe(REAL);
    });

    it("gives an article whose first image is a data: placeholder the real image that follows", async () => {
      const html = `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><img src="${REAL}">`;

      const feed = await parseBody(rssWithContent(html));

      const item = at(feed.items, 0);
      expect(item.coverImage).toBe(REAL);
      expect(item.image).toBe(REAL);
    });
  });
});
