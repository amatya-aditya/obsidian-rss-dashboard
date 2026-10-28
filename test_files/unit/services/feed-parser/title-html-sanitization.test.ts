import { describe, expect, it } from "vitest";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";

const NAMESPACES =
  'xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
  'xmlns:media="http://search.yahoo.com/mrss/" ' +
  'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/"';

function rssFeed(channelTitle: string, itemBody: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" ${NAMESPACES}>` +
    `<channel>` +
    `<title>${channelTitle}</title>` +
    `<link>https://example.com</link>` +
    `<description>Feed description</description>` +
    `<item>${itemBody}</item>` +
    `</channel></rss>`
  );
}

function atomFeed(channelTitle: string, entryTitle: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<feed xmlns="http://www.w3.org/2005/Atom">` +
    `<title>${channelTitle}</title>` +
    `<id>https://example.com/</id>` +
    `<entry>` +
    `<title type="html">${entryTitle}</title>` +
    `<id>https://example.com/1</id>` +
    `<link href="https://example.com/1" rel="alternate"/>` +
    `<updated>2026-10-23T09:59:49-04:00</updated>` +
    `</entry>` +
    `</feed>`
  );
}

function rdfFeed(channelTitle: string, itemTitle: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns="http://purl.org/rss/1.0/">` +
    `<channel>` +
    `<title>${channelTitle}</title>` +
    `<link>https://example.com/rdf</link>` +
    `<description>RDF description</description>` +
    `</channel>` +
    `<item rdf:about="https://example.com/rdf-1">` +
    `<title>${itemTitle}</title>` +
    `<link>https://example.com/rdf-1</link>` +
    `<description>RDF item description</description>` +
    `</item>` +
    `</rdf:RDF>`
  );
}

function jsonFeed(feedTitle: string, itemTitle: string): string {
  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: feedTitle,
    items: [
      {
        id: "1",
        title: itemTitle,
        url: "https://example.com/1",
      },
    ],
  });
}

function firstItemTitle(feed: string): string {
  const parsed = new CustomXMLParser().parseString(feed);
  return parsed.items[0]?.title ?? "";
}

describe("Title HTML sanitization", () => {
  it("strips escaped inline markup from an Atom entry title", () => {
    const parsed = new CustomXMLParser().parseString(
      atomFeed(
        "Feed title",
        "&lt;em&gt;Wicker&lt;/em&gt; Asks Whether Love and Marriage Are Incompatible",
      ),
    );

    expect(parsed.title).toBe("Feed title");
    expect(parsed.items[0]?.title).toBe(
      "Wicker Asks Whether Love and Marriage Are Incompatible",
    );
  });

  it("strips escaped inline markup from RSS channel and item titles", () => {
    const parsed = new CustomXMLParser().parseString(
      rssFeed(
        "Feed &lt;em&gt;Title&lt;/em&gt;",
        "<title>&lt;strong&gt;Bold&lt;/strong&gt; move</title>" +
          "<link>https://example.com/1</link>",
      ),
    );

    expect(parsed.title).toBe("Feed Title");
    expect(parsed.items[0]?.title).toBe("Bold move");
  });

  it("strips markup from a JSON Feed title", () => {
    const parsed = new CustomXMLParser().parseString(
      jsonFeed("Feed <em>title</em>", "<i>Slow</i> news"),
    );

    expect(parsed.title).toBe("Feed title");
    expect(parsed.items[0]?.title).toBe("Slow news");
  });

  it("strips formatting tags from RSS 1.0/RDF channel and item titles", () => {
    const parsed = new CustomXMLParser().parseString(
      rdfFeed(
        "Feed &lt;em&gt;Title&lt;/em&gt;",
        "&lt;em&gt;RDF item&lt;/em&gt;",
      ),
    );

    expect(parsed.title).toBe("Feed Title");
    expect(parsed.items[0]?.title).toBe("RDF item");
  });

  it("strips formatting tags that carry attributes", () => {
    const parsed = new CustomXMLParser().parseString(
      rssFeed(
        "Feed",
        '<title>&lt;span class="lead"&gt;Intro&lt;/span&gt; text</title>' +
          "<link>https://example.com/1</link>",
      ),
    );

    expect(parsed.items[0]?.title).toBe("Intro text");
  });

  it("strips markup from a title parsed by the regex fallback", () => {
    // The unclosed <oops> makes both the document and its extracted <rss>
    // block malformed, so parsing falls through to the regex fallback.
    const feed =
      `<rss version="2.0"><channel>` +
      `<item><title>&lt;em&gt;Only an item&lt;/em&gt;</title>` +
      `<link>https://example.com/item</link>` +
      `<description>Item description</description>` +
      `<guid>item-1</guid></item><oops></channel></rss>`;

    expect(firstItemTitle(feed)).toBe("Only an item");
  });

  it("keeps a literal less-than comparison in a title", () => {
    const parsed = new CustomXMLParser().parseString(
      rssFeed(
        "Feed",
        "<title>Why 3 &lt; 4 and 5 &gt; 2</title>" +
          "<link>https://example.com/1</link>",
      ),
    );

    expect(parsed.items[0]?.title).toBe("Why 3 < 4 and 5 > 2");
  });

  it("keeps an autolink in a title", () => {
    const parsed = new CustomXMLParser().parseString(
      rssFeed(
        "Feed",
        "<title>More at &lt;https://example.com&gt;</title>" +
          "<link>https://example.com/1</link>",
      ),
    );

    expect(parsed.items[0]?.title).toBe("More at <https://example.com>");
  });

  it("keeps generic type syntax and other unpaired tags in a title", () => {
    const parsed = new CustomXMLParser().parseString(
      rssFeed(
        "Feed",
        "<title>Downcast (INumber&lt;T&gt;) to " +
          "(IBinaryInteger&lt;Generic&gt;)</title>" +
          "<link>https://example.com/1</link>",
      ),
    );

    expect(parsed.items[0]?.title).toBe(
      "Downcast (INumber<T>) to (IBinaryInteger<Generic>)",
    );
  });

  it("keeps an unpaired formatting tag in a title", () => {
    const parsed = new CustomXMLParser().parseString(
      rssFeed(
        "Feed",
        "<title>Use the &lt;b&gt; tag</title>" +
          "<link>https://example.com/1</link>",
      ),
    );

    expect(parsed.items[0]?.title).toBe("Use the <b> tag");
  });

  it("leaves a plain title and a decoded entity-only title unchanged", () => {
    const plain = new CustomXMLParser().parseString(
      rssFeed(
        "Feed",
        "<title>Plain title</title><link>https://example.com/1</link>",
      ),
    );
    const entity = new CustomXMLParser().parseString(
      rssFeed(
        "Feed",
        "<title>Tom &amp; Jerry</title><link>https://example.com/1</link>",
      ),
    );

    expect(plain.items[0]?.title).toBe("Plain title");
    expect(entity.items[0]?.title).toBe("Tom & Jerry");
  });

  it("keeps HTML in an item description", () => {
    const parsed = new CustomXMLParser().parseString(
      rssFeed(
        "Feed",
        "<title>Article</title>" +
          "<link>https://example.com/1</link>" +
          "<description>&lt;p&gt;Body &lt;em&gt;kept&lt;/em&gt;&lt;/p&gt;</description>",
      ),
    );

    expect(parsed.items[0]?.description).toBe("<p>Body <em>kept</em></p>");
  });
});
