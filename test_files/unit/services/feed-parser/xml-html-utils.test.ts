import { describe, expect, it } from "vitest";
import { stripTitleFormattingTags } from "../../../../src/services/feed-parser/xml-parser/xml-html-utils";

describe("stripTitleFormattingTags", () => {
  it("strips paired and void formatting tags", () => {
    expect(stripTitleFormattingTags('<em class="x">Wicker</em><br/>Park')).toBe(
      "Wicker Park",
    );
  });

  it("keeps a quoted '>' inside an attribute from ending the tag", () => {
    expect(stripTitleFormattingTags('<a href="x>y">Link</a>')).toBe("Link");
  });

  // A regex that backtracks exponentially never returns on these inputs, so a
  // regression stalls the run instead of failing an assertion.
  it.each([
    "<i " + "!".repeat(60),
    "<br " + "!".repeat(60),
    '<i "' + "a".repeat(60),
    "<i a='".repeat(30),
  ])("returns unclosed tag input unchanged: %s", (input) => {
    expect(stripTitleFormattingTags(input)).toBe(input.trim());
  });
});
