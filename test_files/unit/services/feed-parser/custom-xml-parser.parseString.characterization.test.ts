import { describe, it, expect, beforeEach } from "vitest";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";

// Characterization tests for CustomXMLParser.parseString's routing only.
// They pin the observable output at the public parseString boundary so the
// upcoming extraction (into feed-document-router.ts) can be verified as
// behavior-preserving. Do not change these expectations to match a refactor;
// pinned behavior may only change in a separate, non-refactor PR.

const WELL_FORMED_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Char RSS</title>
    <link>https://example.com</link>
    <description>Char description</description>
    <item>
      <title>First</title>
      <link>https://example.com/1</link>
      <guid>g1</guid>
      <description>First desc</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const WELL_FORMED_ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Char Atom</title>
  <subtitle>Atom sub</subtitle>
  <link rel="alternate" type="text/html" href="https://example.com"/>
  <entry>
    <title>Atom Entry</title>
    <link rel="alternate" type="text/html" href="https://example.com/atom-1"/>
    <id>urn:atom-1</id>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
</feed>`;

const WELL_FORMED_RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="http://purl.org/rss/1.0/">
  <channel>
    <title>Char RDF</title>
    <link>https://example.com/rdf</link>
    <description>RDF desc</description>
  </channel>
  <item rdf:about="https://example.com/rdf-1">
    <title>RDF Item</title>
    <link>https://example.com/rdf-1</link>
    <description>RDF item desc</description>
  </item>
</rdf:RDF>`;

// Root element name is not `rdf:RDF`; only the rss/1.0 default namespace marks
// it. This reaches the main classification site's `xmlns` branch.
const WELL_FORMED_RDF_XMLNS_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<RDF xmlns="http://purl.org/rss/1.0/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <channel>
    <title>Char RDF xmlns</title>
    <link>https://example.com/rdf2</link>
    <description>desc</description>
  </channel>
  <item rdf:about="https://example.com/rdf2-1">
    <title>Item</title>
    <link>https://example.com/rdf2-1</link>
  </item>
</RDF>`;

const JSON_FEED = `{"version":"https://jsonfeed.org/version/1.1","title":"Char JSON","home_page_url":"https://example.com","items":[{"id":"j1","title":"JSON Item","url":"https://example.com/j1","content_text":"body"}]}`;

// The unclosed <wrapper> makes the whole document malformed, but the nested
// <rss>..</rss> block is well-formed, so the parsererror retry recovers it.
const RECOVERABLE_MALFORMED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<wrapper><rss version="2.0"><channel><title>Recovered</title><link>https://example.com</link><description>d</description><item><title>Rec Item</title><link>https://example.com/rec</link></item></channel></rss>`;

// The unclosed <oops> element makes the document malformed and the extracted
// <rss> block malformed too, so the parsererror retry falls through to the
// regex fallback.
const UNRECOVERABLE_MALFORMED_XML = `<rss version="2.0"><channel><item><title>Only an item</title><link>https://example.com/item</link><description>Item description</description><guid>item-1</guid></item><oops></channel></rss>`;

// Parses cleanly but declares no feed structure, so validateFeedStructure is
// false and the main classification site is never reached.
const NO_FEED_STRUCTURE = `<root><child>value</child></root>`;

const RSS_WITH_NAMESPACED_ITUNES = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Podcast</title>
    <link>https://example.com</link>
    <description>d</description>
    <item>
      <title>Episode</title>
      <link>https://example.com/ep</link>
      <itunes:duration>01:02:03</itunes:duration>
      <itunes:explicit>no</itunes:explicit>
      <itunes:summary>summary text</itunes:summary>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:season>2</itunes:season>
      <itunes:episode>5</itunes:episode>
      <itunes:image href="https://example.com/ep.png" />
    </item>
  </channel>
</rss>`;

describe("CustomXMLParser.parseString routing (characterization)", () => {
  let parser: CustomXMLParser;

  beforeEach(() => {
    parser = new CustomXMLParser();
  });

  it("routes a well-formed RSS 2.0 document to parseRSS", () => {
    const result = parser.parseString(WELL_FORMED_RSS);
    expect(result.type).toBe("rss");
    expect(result.title).toBe("Char RSS");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("First");
    expect(result.items[0].link).toBe("https://example.com/1");
  });

  it("routes a well-formed Atom document to parseAtom", () => {
    const result = parser.parseString(WELL_FORMED_ATOM);
    expect(result.type).toBe("atom");
    expect(result.title).toBe("Char Atom");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Atom Entry");
  });

  it("routes a well-formed RSS 1.0/RDF document to parseRSS1", () => {
    const result = parser.parseString(WELL_FORMED_RDF);
    expect(result.type).toBe("rss");
    expect(result.title).toBe("Char RDF");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("RDF Item");
  });

  it("routes a document whose only RSS 1.0 marker is the rss/1.0 default namespace", () => {
    // Exercises the main classification site's `xmlns` check, which the
    // extracted-document recovery site does not have.
    const result = parser.parseString(WELL_FORMED_RDF_XMLNS_ONLY);
    expect(result.type).toBe("rss");
    expect(result.title).toBe("Char RDF xmlns");
    expect(result.items).toHaveLength(1);
  });

  it("routes JSON text through the JSON fast path", () => {
    const result = parser.parseString(JSON_FEED);
    expect(result.type).toBe("json");
    expect(result.title).toBe("Char JSON");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("JSON Item");
  });

  it("recovers a well-formed <rss> block nested in malformed XML via the parsererror retry", () => {
    const result = parser.parseString(RECOVERABLE_MALFORMED_XML);
    expect(result.type).toBe("rss");
    expect(result.title).toBe("Recovered");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Rec Item");
  });

  it("falls through to the regex fallback when the parsererror retry cannot recover", () => {
    const result = parser.parseString(UNRECOVERABLE_MALFORMED_XML);
    expect(result.type).toBe("rss");
    expect(result.title).toBe("Unknown feed");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Only an item");
  });

  it("falls back when a well-formed document declares no feed structure", () => {
    const result = parser.parseString(NO_FEED_STRUCTURE);
    expect(result.type).toBe("rss");
    expect(result.title).toBe("Unknown feed");
    expect(result.items).toHaveLength(0);
  });

  it("does not throw for text that starts with '{' but is not valid JSON", () => {
    let result: ReturnType<CustomXMLParser["parseString"]> | undefined;
    expect(() => {
      result = parser.parseString("{ not json }");
    }).not.toThrow();
    expect(result?.type).toBe("rss");
    expect(result?.title).toBe("Unknown feed");
    expect(result?.items).toHaveLength(0);
  });

  it("reads item-level namespaced iTunes fields as empty through the jsdom DOM path", () => {
    // jsdom's XML querySelector cannot match escaped-colon selectors such as
    // `itunes\:duration` (the same limitation pinned in
    // feed-parser-class.parseFeed.characterization.test.ts). Pin the current
    // empty output rather than treating it as a product defect.
    const result = parser.parseString(RSS_WITH_NAMESPACED_ITUNES);
    expect(result.items).toHaveLength(1);
    const itunes = result.items[0].itunes;
    expect(itunes?.duration).toBe("");
    expect(itunes?.explicit).toBe("");
    expect(itunes?.summary).toBe("");
    expect(itunes?.episodeType).toBe("");
    expect(itunes?.season).toBe("");
    expect(itunes?.episode).toBe("");
    expect(itunes?.image?.href).toBe("");
  });
});
