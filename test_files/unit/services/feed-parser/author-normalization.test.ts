// Author normalization (#247 slice 5, ADR 0007, #290/#291): every author
// element is kept, and each one is cut at its first comma or pipe.
import { describe, expect, it } from "vitest";
import {
  joinAuthors,
  splitAuthorElements,
} from "../../../../src/services/feed-parser/author-normalization";

describe("splitAuthorElements", () => {
  it("keeps each element as its own entry", () => {
    expect(splitAuthorElements(["Ada Lovelace", "Grace Hopper"])).toEqual([
      "Ada Lovelace",
      "Grace Hopper",
    ]);
  });

  it("cuts an element at its first comma (Name, Title, Institution)", () => {
    expect(
      splitAuthorElements(["Jane Doe, Professor of Law, Example University"]),
    ).toEqual(["Jane Doe"]);
  });

  it("cuts an element at its first pipe (Name | Dept)", () => {
    expect(splitAuthorElements(["Jane Doe | Politics Desk"])).toEqual([
      "Jane Doe",
    ]);
  });

  it("cuts each element independently", () => {
    expect(
      splitAuthorElements(["Jane Doe, Editor", "Sam Roe | Business"]),
    ).toEqual(["Jane Doe", "Sam Roe"]);
  });

  it("cuts at whichever of comma or pipe comes first", () => {
    expect(splitAuthorElements(["A | B, C"])).toEqual(["A"]);
    expect(splitAuthorElements(["A, B | C"])).toEqual(["A"]);
  });

  it("trims whitespace and drops empty and repeated entries", () => {
    expect(
      splitAuthorElements(["  Jane Doe  ", "", "   ", "jane doe", ", x"]),
    ).toEqual(["Jane Doe"]);
  });

  it("leaves a name with no separator, including natural-language pollution", () => {
    expect(splitAuthorElements(["Jane Doe in Paris"])).toEqual([
      "Jane Doe in Paris",
    ]);
  });

  it("returns an empty array for no usable input", () => {
    expect(splitAuthorElements([])).toEqual([]);
    expect(splitAuthorElements(["", " | "])).toEqual([]);
  });
});

describe("joinAuthors", () => {
  it("joins names with a comma and a space", () => {
    expect(joinAuthors(["Ada", "Grace"])).toBe("Ada, Grace");
  });

  it("is empty for no names", () => {
    expect(joinAuthors([])).toBe("");
  });
});
