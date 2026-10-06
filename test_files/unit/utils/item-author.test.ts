import { describe, expect, it } from "vitest";
import { itemAuthorText } from "../../../src/utils/item-author";

describe("itemAuthorText", () => {
  it("joins the cleaned authors list with a comma and a space", () => {
    expect(
      itemAuthorText({ author: "Jane Doe in Paris", authors: ["Jane", "Sam"] }),
    ).toBe("Jane, Sam");
  });

  it("falls back to the author string without a usable list", () => {
    expect(itemAuthorText({ author: "Old" })).toBe("Old");
    expect(itemAuthorText({ author: "Old", authors: [] })).toBe("Old");
    expect(itemAuthorText({ author: "Old", authors: ["", "  "] })).toBe("Old");
  });

  it("is empty when there is neither", () => {
    expect(itemAuthorText({})).toBe("");
  });
});
