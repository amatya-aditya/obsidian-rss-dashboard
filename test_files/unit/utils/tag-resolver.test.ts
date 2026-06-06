import { describe, expect, it } from "vitest";
import { type Tag } from "../../../src/types/types";
import { resolveTagObjects } from "../../../src/utils/tag-resolver";

describe("resolveTagObjects", () => {
  const availableTags: Tag[] = [
    { name: "News", color: "#111122" },
    { name: "Tech", color: "#228811" },
    { name: "Video", color: "#881122" },
  ];

  it("returns an empty array when input is empty", () => {
    expect(resolveTagObjects([], availableTags)).toEqual([]);
  });

  it("resolves valid tag names to their full Tag objects", () => {
    expect(resolveTagObjects(["News", "Video"], availableTags)).toEqual([
      { name: "News", color: "#111122" },
      { name: "Video", color: "#881122" },
    ]);
  });

  it("drops unknown tag names and returns only known ones", () => {
    expect(resolveTagObjects(["News", "Unknown", "Video"], availableTags)).toEqual([
      { name: "News", color: "#111122" },
      { name: "Video", color: "#881122" },
    ]);
  });

  it("handles duplicate tag names in the input by resolving them (or deduping if resolver does that)", () => {
    // Normalization can dedupe, but let's test basic lookup
    const resolved = resolveTagObjects(["News", "News"], availableTags);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toEqual({ name: "News", color: "#111122" });
  });
});
