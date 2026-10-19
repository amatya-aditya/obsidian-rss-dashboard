import { describe, it, expect } from "vitest";
import { isValidFeed } from "../../../../src/services/feed-parser/feed-validation.js";
import {
  RSS2_BASIC,
  ATOM_BASIC,
  ATOM_PREFIXED,
  RSS2_PREFIXED,
  RSS1_PREFIXED,
  JSON_FEED_BASIC,
} from "./fixtures/rss-fixtures.js";

describe("isValidFeed", () => {
  it("identifies RSS feeds", () => {
    expect(isValidFeed(RSS2_BASIC)).toBe(true);
  });

  it("identifies Atom feeds", () => {
    expect(isValidFeed(ATOM_BASIC)).toBe(true);
  });

  it("identifies a namespace-prefixed Atom feed", () => {
    expect(isValidFeed(ATOM_PREFIXED)).toBe(true);
  });

  it("identifies a namespace-prefixed RSS 2.0 feed", () => {
    expect(isValidFeed(RSS2_PREFIXED)).toBe(true);
  });

  it("identifies a namespace-prefixed RSS 1.0 feed", () => {
    expect(isValidFeed(RSS1_PREFIXED)).toBe(true);
  });

  it("identifies an RDF root that carries a non-rdf namespace prefix", () => {
    expect(
      isValidFeed(
        '<ns0:RDF xmlns:ns0="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/>',
      ),
    ).toBe(true);
  });

  it("rejects HTML content", () => {
    expect(isValidFeed("<html><body>Not a feed</body></html>")).toBe(false);
  });

  it("rejects a namespace-prefixed non-feed XML document", () => {
    expect(
      isValidFeed(
        '<ns0:html xmlns:ns0="http://www.w3.org/1999/xhtml"><ns0:body>Not a feed</ns0:body></ns0:html>',
      ),
    ).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidFeed("")).toBe(false);
  });

  it("accepts JSON Feed version documents", () => {
    expect(isValidFeed(JSON_FEED_BASIC)).toBe(true);
  });

  it("rejects arbitrary JSON content", () => {
    expect(isValidFeed('{"title":"Not a feed"}')).toBe(false);
  });
});
