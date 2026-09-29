import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "../../../../src/services/feed-parser/xml-parser/xml-html-utils";

describe("decodeHtmlEntities", () => {
  it.each([
    ["an empty string", "", ""],
    ["text without entities", "plain text", "plain text"],
    ["a non-breaking space", "a&nbsp;b", "a b"],
    ["an ampersand", "Tom &amp; Jerry", "Tom & Jerry"],
    ["angle brackets", "&lt;b&gt;", "<b>"],
    ["quotes", "&quot;hi&quot; &apos;there&apos;", "\"hi\" 'there'"],
    ["decimal apostrophes", "it&#39;s", "it's"],
    ["hex apostrophes", "it&#x27;s", "it's"],
    ["hex slashes in either case", "a&#x2F;b&#x2f;c", "a/b/c"],
    ["curly quotes by number", "&#8216;a&#8217; &#8220;b&#8221;", "‘a’ “b”"],
    ["curly quotes by name", "&lsquo;a&rsquo; &ldquo;b&rdquo;", "‘a’ “b”"],
    ["dashes", "a&#8211;b&#8212;c &ndash; &mdash;", "a–b—c – —"],
    ["an ellipsis by number", "wait&#8230;", "wait..."],
    ["an ellipsis by name", "wait&hellip;", "wait..."],
    ["padded decimal ampersand", "a&#038;b", "a&b"],
    ["hex ampersand", "a&#x26;b", "a&b"],
    ["lowercase hex brackets", "&#x3c;&#x3e;", "<>"],
    ["uppercase hex brackets", "&#x3C;&#x3E;", "<>"],
    ["accented letters by name", "caf&eacute; &Uuml;ber", "café Über"],
    ["symbols by name", "&copy; &reg; &trade; &euro;", "© ® ™ €"],
    ["generic decimal references", "&#65;&#66;", "AB"],
    ["generic hex references", "&#x41;&#x1F600;", "A\u{1F600}"],
    ["an out-of-range decimal reference", "&#1114112;", "&#1114112;"],
    ["an out-of-range hex reference", "&#x110000;", "&#x110000;"],
    ["an unknown named entity", "&bogus;", "&bogus;"],
    ["a differently cased name", "&AMP; &Amp;", "&AMP; &Amp;"],
    ["a bare ampersand", "R&D and AT&T", "R&D and AT&T"],
    ["an unterminated entity", "&amp and &#65", "&amp and &#65"],
  ])("decodes %s", (_name, input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  // Text that is escaped twice loses one level of escaping, not two.
  it.each([
    ["an escaped lt entity", "&amp;lt;b&amp;gt;", "&lt;b&gt;"],
    ["an escaped quote entity", "&amp;quot;", "&quot;"],
    ["an escaped decimal reference", "&amp;#65;", "&#65;"],
    ["an escaped named letter", "&amp;eacute;", "&eacute;"],
  ])("decodes only once for %s", (_name, input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  it("keeps an escaped ampersand entity as an ampersand entity", () => {
    expect(decodeHtmlEntities("&amp;amp;")).toBe("&amp;");
  });
});
