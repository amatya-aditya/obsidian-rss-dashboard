import { describe, expect, it } from "vitest";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";

// `fallbackParse` in `xml-preprocessing.ts` is only reached when `DOMParser`
// rejects the XML (or the parsed document is not a feed). These inputs end the
// channel with an unclosed `<oops>` element, so the document is never
// well-formed and `parseString` takes the regex fallback path. Driving it
// through `parseString` pins the behavior through the module's stable public
// surface, so the assertions survive the extraction of `fallbackParse`.
function fallbackFeed(channelBody: string): string {
  return `<rss version="2.0"><channel>${channelBody}<oops></channel></rss>`;
}

function parseFallback(channelBody: string) {
  return new CustomXMLParser().parseString(fallbackFeed(channelBody));
}

describe("fallbackParse characterization - feed metadata", () => {
  it("reads the channel title, description, and link", () => {
    const result = parseFallback(
      "<title>Fallback Feed</title>" +
        "<description>Fallback &amp; desc</description>" +
        "<link>https://example.com</link>",
    );

    expect(result.title).toBe("Fallback Feed");
    expect(result.description).toBe("Fallback & desc");
    expect(result.link).toBe("https://example.com");
  });

  it("reports Unknown feed when the channel declares no title", () => {
    const result = parseFallback(
      "<description>No title</description><link>https://example.com</link>",
    );

    expect(result.title).toBe("Unknown feed");
  });

  it("reports empty description and link when the channel declares neither", () => {
    const result = parseFallback("<title>Only Title</title>");

    expect(result.description).toBe("");
    expect(result.link).toBe("");
  });

  it("returns an empty items array for a channel with no items", () => {
    const result = parseFallback("<title>Empty</title>");

    expect(result.items).toHaveLength(0);
    expect(result.type).toBe("rss");
    expect(result.author).toBeUndefined();
    expect(result.image).toBeUndefined();
    expect(result.feedItunesImage).toBe("");
    expect(result.feedImageUrl).toBe("");
  });

  it("keeps channel metadata out of item descendants", () => {
    // The DOM path also keeps channel metadata out of item descendants (see
    // "does not take RSS 2.0 channel metadata from item descendants" in
    // custom-xml-parser.test.ts). The regex fallback now matches: with no
    // channel-level metadata, the feed falls back to the default values.
    const result = parseFallback(
      "<item>" +
        "<title>Only an item</title>" +
        "<link>https://example.com/item</link>" +
        "<description>Item description</description>" +
        "<guid>item-1</guid>" +
        "</item>",
    );

    expect(result.title).toBe("Unknown feed");
    expect(result.link).toBe("");
    expect(result.description).toBe("");
    expect(result.items).toHaveLength(1);
  });
});

describe("fallbackParse characterization - item fields", () => {
  it("reads title, link, description, pubDate, and guid", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item One</title>" +
        "<link>https://example.com/1</link>" +
        "<description>Body text</description>" +
        "<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>" +
        "<guid>guid-1</guid>" +
        "</item>",
    );

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.title).toBe("Item One");
    expect(item.link).toBe("https://example.com/1");
    expect(item.description).toBe("Body text");
    expect(item.pubDate).toBe("Mon, 01 Jan 2024 00:00:00 GMT");
    expect(item.guid).toBe("guid-1");
    expect(item.content).toBe("Body text");
  });

  it("decodes HTML entities in the item title", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item><title>Tom &amp; Jerry</title><link>https://e/1</link></item>",
    );

    expect(result.items[0].title).toBe("Tom & Jerry");
  });

  it("strips a CDATA wrapper but keeps the inner markup in the description", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        "<description><![CDATA[<p>Hello</p>]]></description>" +
        "</item>",
    );

    expect(result.items[0].description).toBe("<p>Hello</p>");
  });

  it("falls back the guid to the item link", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item><title>Item</title><link>https://e/1</link></item>",
    );

    expect(result.items[0].guid).toBe("https://e/1");
  });

  it("uses # as the link and guid when the item declares neither", () => {
    const result = parseFallback(
      "<title>Feed</title><item><title>Item</title></item>",
    );

    expect(result.items[0].link).toBe("#");
    expect(result.items[0].guid).toBe("#");
  });

  it("skips an item that has no title", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item><link>https://e/1</link></item>" +
        "<item><title>Kept</title><link>https://e/2</link></item>",
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Kept");
  });

  it("splits an item that has no closing tag at the next channel or item boundary", () => {
    // No `</item>` anywhere: the first regex split finds nothing, so the
    // fallback walks `<item>` start tags until `</channel>`.
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Solo</title>" +
        "<link>https://e/1</link>" +
        "<guid>solo-1</guid>",
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Solo");
    expect(result.items[0].guid).toBe("solo-1");
  });

  it("does not treat an <item> written inside CDATA as an item boundary", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Outer</title>" +
        "<link>https://e/outer</link>" +
        "<description><![CDATA[<item><title>Inner</title></item>]]></description>" +
        "</item>",
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Outer");
  });
});

describe("fallbackParse characterization - description fallback", () => {
  it("uses media:description when the description is the literal null", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        "<description>null</description>" +
        "<media:description>Media summary</media:description>" +
        "</item>",
    );

    expect(result.items[0].description).toBe("Media summary");
  });

  it("uses media:description when the description is empty", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        "<description></description>" +
        "<media:description>Media summary</media:description>" +
        "</item>",
    );

    expect(result.items[0].description).toBe("Media summary");
  });

  it("reports an empty description when neither description nor media:description is present", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item><title>Item</title><link>https://e/1</link></item>",
    );

    expect(result.items[0].description).toBe("");
  });
});

describe("fallbackParse characterization - authors", () => {
  it("reads an <author> element and cuts it at the first comma", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        "<author>Alice, PhD</author>" +
        "</item>",
    );

    expect(result.items[0].author).toBe("Alice");
    expect(result.items[0].authors).toEqual(["Alice"]);
  });

  it("cuts an author at the first pipe", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        "<author>Bob | Newsroom</author>" +
        "</item>",
    );

    expect(result.items[0].author).toBe("Bob");
  });

  it("reads a dc:creator element", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        "<dc:creator>Carol</dc:creator>" +
        "</item>",
    );

    expect(result.items[0].author).toBe("Carol");
  });

  it("reads a CDATA dc:creator element", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        "<dc:creator><![CDATA[Jane Roe]]></dc:creator>" +
        "</item>",
    );

    expect(result.items[0].author).toBe("Jane Roe");
  });

  it("leaves the author undefined when no author element is present", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item><title>Item</title><link>https://e/1</link></item>",
    );

    expect(result.items[0].author).toBeUndefined();
    expect(result.items[0].authors).toEqual([]);
  });
});

describe("fallbackParse characterization - media", () => {
  it("uses a media:content url as the item image and converts app:// URLs", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        '<media:content url="app://img/pic.jpg" type="image/jpeg" />' +
        "</item>",
    );

    expect(result.items[0].image?.url).toBe("https://img/pic.jpg");
  });

  it("uses a media:thumbnail url as the item image", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        '<media:thumbnail url="https://img/thumb.jpg" />' +
        "</item>",
    );

    expect(result.items[0].image?.url).toBe("https://img/thumb.jpg");
  });

  it("prefers a video media:content type and medium when an image appears first", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        '<media:content url="https://img/poster.jpg" type="image/jpeg" />' +
        '<media:content url="https://img/clip.mp4" type="video/mp4" />' +
        "</item>",
    );

    expect(result.items[0].image?.url).toBe("https://img/poster.jpg");
    expect(result.items[0].mediaContentType).toBe("video/mp4");
    expect(result.items[0].mediaContentMedium).toBe("video");
  });

  it("derives the media medium from the type when medium is absent", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        '<media:content url="https://img/pic.jpg" type="image/jpeg" />' +
        "</item>",
    );

    expect(result.items[0].mediaContentMedium).toBe("image");
  });

  it("leaves the type and medium undefined when media:content declares neither", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Item</title>" +
        "<link>https://e/1</link>" +
        '<media:content url="https://img/pic.jpg" />' +
        "</item>",
    );

    expect(result.items[0].mediaContentType).toBeUndefined();
    expect(result.items[0].mediaContentMedium).toBeUndefined();
  });

  it("leaves the item image undefined when there is no media element", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item><title>Item</title><link>https://e/1</link></item>",
    );

    expect(result.items[0].image).toBeUndefined();
  });
});

describe("fallbackParse characterization - IEEE metadata", () => {
  it("collects IEEE fields and uses <authors> when no author element is present", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Paper</title>" +
        "<link>https://e/1</link>" +
        "<pubYear>2024</pubYear>" +
        "<volume>12</volume>" +
        "<issue>3</issue>" +
        "<startPage>1</startPage>" +
        "<endPage>10</endPage>" +
        "<fileSize>2048</fileSize>" +
        "<authors>Doe, J.</authors>" +
        "</item>",
    );

    const item = result.items[0];
    expect(item.ieee).toEqual({
      pubYear: "2024",
      volume: "12",
      issue: "3",
      startPage: "1",
      endPage: "10",
      fileSize: "2048",
      authors: "Doe, J.",
    });
    expect(item.author).toBe("Doe");
  });

  it("omits the IEEE object when no IEEE field is present", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item><title>Item</title><link>https://e/1</link></item>",
    );

    expect(result.items[0].ieee).toBeUndefined();
  });

  it("keeps an explicit author over the IEEE <authors> element", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Paper</title>" +
        "<link>https://e/1</link>" +
        "<author>Explicit Author</author>" +
        "<authors>Fallback, A.</authors>" +
        "</item>",
    );

    expect(result.items[0].author).toBe("Explicit Author");
  });
});

describe("fallbackParse characterization - link transformation", () => {
  it("transforms a Sage /doi/abs/ item link to /doi/full/", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item>" +
        "<title>Paper</title>" +
        "<link>https://journals.sagepub.com/doi/abs/10.1177/00000000</link>" +
        "</item>",
    );

    expect(result.items[0].link).toBe(
      "https://journals.sagepub.com/doi/full/10.1177/00000000",
    );
  });

  it("leaves a non-Sage item link unchanged", () => {
    const result = parseFallback(
      "<title>Feed</title>" +
        "<item><title>Item</title><link>https://example.com/1</link></item>",
    );

    expect(result.items[0].link).toBe("https://example.com/1");
  });
});
