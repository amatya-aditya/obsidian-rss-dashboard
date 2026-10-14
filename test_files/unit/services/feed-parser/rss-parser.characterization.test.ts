import { describe, expect, it } from "vitest";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";

// `parseRSS` in `rss-parser.ts` runs on the DOM path: a well-formed RSS 2.0
// document parses cleanly, so `parseString` routes it to `parseRSS`. Driving
// the assertions through `parseString` pins behavior at the module's stable
// public surface, so the tests survive extracting the per-<item> callback into
// `rss-item-parser.ts`.
const NAMESPACES =
  'xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
  'xmlns:media="http://search.yahoo.com/mrss/" ' +
  'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/"';

function rssFeed(channelBody: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" ${NAMESPACES}>` +
    `<channel>` +
    `<title>Feed Title</title>` +
    `<link>https://example.com</link>` +
    `<description>Feed description</description>` +
    channelBody +
    `</channel></rss>`
  );
}

function item(body: string): string {
  return `<item>${body}</item>`;
}

function parseFeed(channelBody: string) {
  return new CustomXMLParser().parseString(rssFeed(channelBody));
}

describe("rss-parser characterization - channel", () => {
  it("reads the channel title, description, and link and reports type rss", () => {
    const result = parseFeed("");

    expect(result.type).toBe("rss");
    expect(result.title).toBe("Feed Title");
    expect(result.description).toBe("Feed description");
    expect(result.link).toBe("https://example.com");
    expect(result.items).toHaveLength(0);
  });

  it("reports empty image fields and no language when the channel declares none", () => {
    const result = parseFeed("");

    expect(result.feedImageUrl).toBe("");
    expect(result.feedItunesImage).toBe("");
    expect(result.language).toBeUndefined();
  });

  it("reads the channel language", () => {
    const result = parseFeed("<language>en-US</language>");

    expect(result.language).toBe("en-US");
  });
});

describe("rss-parser characterization - item identity", () => {
  it("reads title, link, description, pubDate, and guid", () => {
    const result = parseFeed(
      item(
        "<title>Item One</title>" +
          "<link>https://example.com/1</link>" +
          "<description>Body text</description>" +
          "<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>" +
          "<guid>guid-1</guid>",
      ),
    );

    expect(result.items).toHaveLength(1);
    const parsed = result.items[0];
    expect(parsed.title).toBe("Item One");
    expect(parsed.link).toBe("https://example.com/1");
    expect(parsed.description).toBe("Body text");
    expect(parsed.pubDate).toBe("Mon, 01 Jan 2024 00:00:00 GMT");
    expect(parsed.guid).toBe("guid-1");
    expect(parsed.content).toBe("Body text");
  });

  it("falls the guid back to the item link", () => {
    const result = parseFeed(
      item("<title>Item</title><link>https://example.com/1</link>"),
    );

    expect(result.items[0].guid).toBe("https://example.com/1");
  });

  it("reports an empty author string and no authors when the item declares none", () => {
    const result = parseFeed(
      item("<title>Item</title><link>https://example.com/1</link>"),
    );

    expect(result.items[0].author).toBe("");
    expect(result.items[0].authors).toEqual([]);
  });

  it("prefers content:encoded over description for content", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<description>Short summary</description>" +
          "<content:encoded><![CDATA[<p>Long full article</p>]]></content:encoded>",
      ),
    );

    expect(result.items[0].description).toBe("Short summary");
    expect(result.items[0].content).toBe("<p>Long full article</p>");
  });

  it("clears a literal null description and the content that would fall back to it", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<description>null</description>",
      ),
    );

    expect(result.items[0].description).toBe("");
    expect(result.items[0].content).toBe("");
  });

  it("uses media:description when the item has no description", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<media:description>Media summary</media:description>",
      ),
    );

    expect(result.items[0].description).toBe("Media summary");
  });

  it("keeps an item that has no title, with an empty title", () => {
    const result = parseFeed(item("<link>https://example.com/1</link>"));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("");
    expect(result.items[0].link).toBe("https://example.com/1");
  });

  it("reads the item category", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<category>News</category>",
      ),
    );

    expect(result.items[0].category).toBe("News");
  });
});

describe("rss-parser characterization - item authors", () => {
  it("reads an author element, cut at the first comma", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<author>Alice, PhD</author>",
      ),
    );

    expect(result.items[0].author).toBe("Alice");
    expect(result.items[0].authors).toEqual(["Alice"]);
  });

  it("reads a dc:creator element", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<dc:creator>Carol</dc:creator>",
      ),
    );

    expect(result.items[0].author).toBe("Carol");
    expect(result.items[0].authors).toEqual(["Carol"]);
  });

  it("prefers an authors element over an author element and joins multiple authors", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<authors>Doe, J.</authors>" +
          "<author>Ignored Author</author>",
      ),
    );

    expect(result.items[0].authors).toEqual(["Doe"]);
    expect(result.items[0].author).toBe("Doe");
  });
});

describe("rss-parser characterization - IEEE fields", () => {
  it("collects the IEEE citation fields", () => {
    const result = parseFeed(
      item(
        "<title>Paper</title>" +
          "<link>https://example.com/1</link>" +
          "<pubYear>2024</pubYear>" +
          "<volume>12</volume>" +
          "<issue>3</issue>" +
          "<startPage>1</startPage>" +
          "<endPage>10</endPage>" +
          "<fileSize>2048</fileSize>" +
          "<authors>Doe, J.</authors>",
      ),
    );

    expect(result.items[0].ieee).toEqual({
      pubYear: "2024",
      volume: "12",
      issue: "3",
      startPage: "1",
      endPage: "10",
      fileSize: "2048",
      authors: "Doe, J.",
    });
  });

  it("omits the IEEE object when no IEEE field is present", () => {
    const result = parseFeed(
      item("<title>Item</title><link>https://example.com/1</link>"),
    );

    expect(result.items[0].ieee).toBeUndefined();
  });
});

describe("rss-parser characterization - enclosure", () => {
  it("reads the enclosure url, type, and length", () => {
    const result = parseFeed(
      item(
        "<title>Episode</title>" +
          "<link>https://example.com/1</link>" +
          '<enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="12345" />',
      ),
    );

    expect(result.items[0].enclosure).toEqual({
      url: "https://example.com/ep1.mp3",
      type: "audio/mpeg",
      length: "12345",
    });
  });

  it("leaves the enclosure undefined when there is no enclosure element", () => {
    const result = parseFeed(
      item("<title>Item</title><link>https://example.com/1</link>"),
    );

    expect(result.items[0].enclosure).toBeUndefined();
  });
});

const EMPTY_ITUNES = {
  duration: "",
  explicit: "",
  image: { href: "" },
  category: "",
  summary: "",
  episodeType: "",
  season: "",
  episode: "",
};

describe("rss-parser characterization - iTunes fields", () => {
  it("reports an itunes object with every key when the item declares none", () => {
    const result = parseFeed(
      item("<title>Item</title><link>https://example.com/1</link>"),
    );

    expect(result.items[0].itunes).toEqual(EMPTY_ITUNES);
  });

  it("keeps the empty itunes object when namespaced iTunes tags are present", () => {
    // jsdom's XML `querySelector` cannot match escaped-colon selectors such as
    // `itunes\:duration`, so the namespaced item fields read empty through the
    // DOM path here. This is the same limitation noted in
    // `feed-parser-class.parseFeed.characterization.test.ts`; the extraction
    // must keep producing the same object.
    const result = parseFeed(
      item(
        "<title>Episode</title>" +
          "<link>https://example.com/1</link>" +
          "<itunes:duration>01:02:03</itunes:duration>" +
          "<itunes:explicit>yes</itunes:explicit>" +
          '<itunes:image href="https://example.com/art.png" />' +
          "<itunes:category>Technology</itunes:category>" +
          "<itunes:summary>An episode</itunes:summary>" +
          "<itunes:episodeType>full</itunes:episodeType>" +
          "<itunes:season>2</itunes:season>" +
          "<itunes:episode>5</itunes:episode>",
      ),
    );

    expect(result.items[0].itunes).toEqual(EMPTY_ITUNES);
  });
});

describe("rss-parser characterization - item image resolution", () => {
  it("uses the item image element url", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<image><url>https://example.com/item.png</url></image>",
      ),
    );

    expect(result.items[0].image).toEqual({
      url: "https://example.com/item.png",
    });
  });

  it("uses a media:content url when there is no item image element", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          '<media:content url="https://example.com/media.jpg" type="image/jpeg" />',
      ),
    );

    expect(result.items[0].image).toEqual({
      url: "https://example.com/media.jpg",
    });
    expect(result.items[0].mediaContentType).toBe("image/jpeg");
  });

  it("prefers the item image element over a media:content image", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          "<image><url>https://example.com/item.png</url></image>" +
          '<media:content url="https://example.com/media.jpg" />',
      ),
    );

    expect(result.items[0].image).toEqual({
      url: "https://example.com/item.png",
    });
  });

  it("falls back to the first content image when there is no item or media image", () => {
    const result = parseFeed(
      item(
        "<title>Item</title>" +
          "<link>https://example.com/1</link>" +
          '<content:encoded><![CDATA[<p>Before</p><img src="https://example.com/in-content.jpg" /><p>After</p>]]></content:encoded>',
      ),
    );

    expect(result.items[0].image).toEqual({
      url: "https://example.com/in-content.jpg",
    });
  });

  it("leaves the image undefined when no image source is present", () => {
    const result = parseFeed(
      item("<title>Item</title><link>https://example.com/1</link>"),
    );

    expect(result.items[0].image).toBeUndefined();
  });
});

describe("rss-parser characterization - link transformation", () => {
  it("transforms a Sage /doi/abs/ item link, and the guid that falls back to it", () => {
    const result = parseFeed(
      item(
        "<title>Paper</title>" +
          "<link>https://journals.sagepub.com/doi/abs/10.1177/00000000</link>",
      ),
    );

    expect(result.items[0].link).toBe(
      "https://journals.sagepub.com/doi/full/10.1177/00000000",
    );
    expect(result.items[0].guid).toBe(
      "https://journals.sagepub.com/doi/full/10.1177/00000000",
    );
  });

  it("leaves a non-Sage item link unchanged", () => {
    const result = parseFeed(
      item("<title>Item</title><link>https://example.com/1</link>"),
    );

    expect(result.items[0].link).toBe("https://example.com/1");
  });
});
