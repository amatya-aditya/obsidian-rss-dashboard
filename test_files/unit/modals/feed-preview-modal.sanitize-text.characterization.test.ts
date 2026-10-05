import { describe, expect, it } from "vitest";
import * as obsidian from "obsidian";
import { FeedPreviewModal } from "../../../src/modals/feed-preview-modal";
import type { FeedMetadata } from "../../../src/types/discover-types";

function sanitize(text: string): string {
  const modal = new FeedPreviewModal(
    obsidian.App.createMock() as unknown as obsidian.App,
    {} as unknown as FeedMetadata,
  );
  return (modal as unknown as { sanitizeText(t: string): string }).sanitizeText(
    text,
  );
}

describe("FeedPreviewModal description text", () => {
  it.each([
    ["an empty string", "", ""],
    ["markup", "<p>Hello <b>world</b></p>", "Hello world"],
    ["collapsed whitespace", "  a \n\t b  ", "a b"],
    [
      "basic entities",
      "Tom &amp; Jerry &lt;3 &gt; &quot;x&quot;",
      'Tom & Jerry <3 > "x"',
    ],
    ["a non-breaking space", "a&nbsp;b", "a b"],
    ["apostrophes", "it&#39;s &#x27;ok&#x27;", "it's 'ok'"],
    ["a hex slash", "a&#x2F;b", "a/b"],
    ["generic decimal references", "&#65;&#8217;", "A’"],
    ["generic hex references", "&#x41;&#x1F600;", "A\u{1F600}"],
    ["an out-of-range reference", "&#1114112;", "&#1114112;"],
    [
      "escaped markup after tag removal",
      "&lt;b&gt;bold&lt;/b&gt;",
      "<b>bold</b>",
    ],
    ["named letters", "caf&eacute; &rsquo;", "café ’"],
    ["an ellipsis reference", "wait&#8230;", "wait..."],
  ])("cleans %s", (_name, input, expected) => {
    expect(sanitize(input)).toBe(expected);
  });

  // Text that is escaped twice loses one level of escaping, not two.
  it("decodes only once for an escaped lt entity", () => {
    expect(sanitize("&amp;lt;")).toBe("&lt;");
  });
});
