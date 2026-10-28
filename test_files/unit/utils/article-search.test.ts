import { describe, expect, it } from "vitest";
import { articleTitleMatchesSearch } from "../../../src/utils/article-search";

// The article search's one matching rule: the list hides rows with it and
// select-first picks the first visible article with it (#1465).
describe("articleTitleMatchesSearch", () => {
  it("matches a title without regard to case or surrounding whitespace", () => {
    expect(articleTitleMatchesSearch("Samsung unveils a chip", "samsung")).toBe(
      true,
    );
    expect(
      articleTitleMatchesSearch("Samsung unveils a chip", "  SAMSUNG  "),
    ).toBe(true);
  });

  it("does not match a title that lacks the query", () => {
    expect(articleTitleMatchesSearch("Something else", "samsung")).toBe(false);
  });

  it("matches every title for an empty query", () => {
    expect(articleTitleMatchesSearch("Anything at all", "")).toBe(true);
    expect(articleTitleMatchesSearch("Anything at all", "   ")).toBe(true);
  });

  it("treats a missing title as an empty one", () => {
    expect(articleTitleMatchesSearch(undefined as unknown as string, "")).toBe(
      true,
    );
    expect(
      articleTitleMatchesSearch(undefined as unknown as string, "samsung"),
    ).toBe(false);
  });
});
