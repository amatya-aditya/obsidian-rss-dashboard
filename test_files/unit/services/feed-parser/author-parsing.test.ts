// Author collection in the feed parsers (#247 slice 5, ADR 0007, #290/#291):
// every author element is kept, each cut at its first comma or pipe, and
// `author` is the cleaned names joined with ", ".
import { describe, expect, it } from "vitest";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";

const parser = new CustomXMLParser();

function rss2(itemBody: string): string {
  return `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>T</title><link>https://example.com</link><description>D</description>
<item><title>A</title><link>https://example.com/a</link><guid>a</guid>
<description>x</description>${itemBody}</item></channel></rss>`;
}

describe("author parsing", () => {
  describe("RSS 2.0", () => {
    it("keeps every dc:creator element", () => {
      const item = parser.parseString(
        rss2(
          "<dc:creator>Ada Lovelace</dc:creator><dc:creator>Grace Hopper</dc:creator>",
        ),
      ).items[0];
      expect(item?.authors).toEqual(["Ada Lovelace", "Grace Hopper"]);
      expect(item?.author).toBe("Ada Lovelace, Grace Hopper");
    });

    it("cuts 'Name, Title, Institution' at the first comma", () => {
      const item = parser.parseString(
        rss2("<author>Jane Doe, Professor of Law, Example University</author>"),
      ).items[0];
      expect(item?.authors).toEqual(["Jane Doe"]);
      expect(item?.author).toBe("Jane Doe");
    });

    it("cuts 'Name | Dept' at the pipe, per element", () => {
      const item = parser.parseString(
        rss2(
          "<dc:creator>Jane Doe | Politics</dc:creator><dc:creator>Sam Roe | Business</dc:creator>",
        ),
      ).items[0];
      expect(item?.authors).toEqual(["Jane Doe", "Sam Roe"]);
    });

    it("has no authors for an item without an author element", () => {
      const item = parser.parseString(rss2("")).items[0];
      expect(item?.authors).toEqual([]);
      expect(item?.author).toBeFalsy();
    });

    it("leaves pollution with no separator for the post-fetch layer", () => {
      const item = parser.parseString(
        rss2("<dc:creator>Jane Doe in Paris</dc:creator>"),
      ).items[0];
      expect(item?.authors).toEqual(["Jane Doe in Paris"]);
    });
  });

  describe("Atom", () => {
    const atom = (entryBody: string) => `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title><id>f</id>
<entry><title>A</title><id>a</id><link href="https://example.com/a"/>
<updated>2026-10-01T00:00:00Z</updated><summary>x</summary>${entryBody}</entry></feed>`;

    it("keeps every author element", () => {
      const item = parser.parseString(
        atom(
          "<author><name>Ada Lovelace</name></author><author><name>Grace Hopper | Navy</name></author>",
        ),
      ).items[0];
      expect(item?.authors).toEqual(["Ada Lovelace", "Grace Hopper"]);
      expect(item?.author).toBe("Ada Lovelace, Grace Hopper");
    });
  });

  describe("JSON Feed", () => {
    it("keeps every author, cut at the first comma", () => {
      const feed = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "T",
        items: [
          {
            id: "a",
            url: "https://example.com/a",
            content_text: "x",
            authors: [{ name: "Ada Lovelace" }, { name: "Grace Hopper, Navy" }],
          },
        ],
      });
      const item = parser.parseString(feed).items[0];
      expect(item?.authors).toEqual(["Ada Lovelace", "Grace Hopper"]);
      expect(item?.author).toBe("Ada Lovelace, Grace Hopper");
    });
  });

  describe("RSS 1.0", () => {
    it("keeps every dc:creator and cuts each at its first comma", () => {
      const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://example.com"><title>T</title><link>https://example.com</link><description>D</description></channel>
<item rdf:about="https://example.com/a"><title>A</title><link>https://example.com/a</link>
<description>x</description><dc:creator>Ada Lovelace, Editor</dc:creator><dc:creator>Grace Hopper</dc:creator></item></rdf:RDF>`;
      const item = parser.parseString(xml).items[0];
      expect(item?.authors).toEqual(["Ada Lovelace", "Grace Hopper"]);
      expect(item?.author).toBe("Ada Lovelace, Grace Hopper");
    });
  });
});
