// Feed-level language in the feed parsers (#247 slice 7, #246, ADR 0007):
// RSS `<language>`, Atom `xml:lang`, and JSON Feed `language` are carried on
// the parsed feed as the resolver's fallback. The raw value is kept as the
// feed sent it; the resolver normalizes it.
import { describe, expect, it } from "vitest";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";

const parser = new CustomXMLParser();

describe("feed-level language parsing", () => {
  describe("RSS 2.0", () => {
    const rss = (
      channelExtras: string,
      itemExtras = "",
    ) => `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>T</title><link>https://example.com</link><description>D</description>
${channelExtras}
<item><title>A</title><link>https://example.com/a</link><guid>a</guid>
<description>x</description>${itemExtras}</item></channel></rss>`;

    it("reads the channel <language>", () => {
      expect(
        parser.parseString(rss("<language>de-DE</language>")).language,
      ).toBe("de-DE");
    });

    it("trims surrounding whitespace", () => {
      expect(
        parser.parseString(rss("<language>\n  fr \n</language>")).language,
      ).toBe("fr");
    });

    it("has no language when the channel declares none", () => {
      expect(parser.parseString(rss("")).language).toBeFalsy();
    });

    it("ignores a <language> element inside an item", () => {
      const parsed = parser.parseString(rss("", "<language>es</language>"));
      expect(parsed.language).toBeFalsy();
    });

    it("falls back to the channel dc:language", () => {
      expect(
        parser.parseString(rss("<dc:language>pt-BR</dc:language>")).language,
      ).toBe("pt-BR");
    });
  });

  describe("RSS 1.0", () => {
    it("reads the channel <language>", () => {
      const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://example.com"><title>T</title><link>https://example.com</link><description>D</description><language>nl-NL</language></channel>
<item rdf:about="https://example.com/a"><title>A</title><link>https://example.com/a</link><description>x</description></item></rdf:RDF>`;
      expect(parser.parseString(xml).language).toBe("nl-NL");
    });

    it("reads the channel dc:language", () => {
      const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://example.com"><title>T</title><link>https://example.com</link><description>D</description><dc:language>it</dc:language></channel>
<item rdf:about="https://example.com/a"><title>A</title><link>https://example.com/a</link><description>x</description></item></rdf:RDF>`;
      expect(parser.parseString(xml).language).toBe("it");
    });

    it("has no language when the channel declares none", () => {
      const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
<channel rdf:about="https://example.com"><title>T</title><link>https://example.com</link><description>D</description></channel>
<item rdf:about="https://example.com/a"><title>A</title><link>https://example.com/a</link><description>x</description></item></rdf:RDF>`;
      expect(parser.parseString(xml).language).toBeFalsy();
    });
  });

  describe("Atom", () => {
    const atom = (feedAttrs: string, entryAttrs = "") => `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"${feedAttrs}><title>T</title><id>f</id>
<entry${entryAttrs}><title>A</title><id>a</id><link href="https://example.com/a"/>
<updated>2026-10-01T00:00:00Z</updated><summary>x</summary></entry></feed>`;

    it("reads xml:lang on the feed element", () => {
      expect(parser.parseString(atom(' xml:lang="en-GB"')).language).toBe(
        "en-GB",
      );
    });

    it("has no language when the feed element has no xml:lang", () => {
      expect(parser.parseString(atom("")).language).toBeFalsy();
    });

    it("ignores xml:lang on an entry", () => {
      expect(
        parser.parseString(atom("", ' xml:lang="ja"')).language,
      ).toBeFalsy();
    });
  });

  describe("JSON Feed", () => {
    const jsonFeed = (extra: Record<string, unknown>) =>
      JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "T",
        items: [{ id: "a", url: "https://example.com/a", content_text: "x" }],
        ...extra,
      });

    it("reads the top-level language", () => {
      expect(parser.parseString(jsonFeed({ language: "sv-SE" })).language).toBe(
        "sv-SE",
      );
    });

    it("has no language when the field is absent or not a string", () => {
      expect(parser.parseString(jsonFeed({})).language).toBeFalsy();
      expect(
        parser.parseString(jsonFeed({ language: 5 })).language,
      ).toBeFalsy();
    });
  });
});
