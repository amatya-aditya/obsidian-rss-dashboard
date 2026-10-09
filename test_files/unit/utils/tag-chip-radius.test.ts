import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAG_CHIP_RADIUS,
  TAG_CHIP_RADIUS_CSS_VAR,
  TAG_CHIP_RADIUS_EVENT,
  TAG_CHIP_RADIUS_PRESETS,
  findTagChipRadiusPreset,
  isValidTagChipRadius,
  normalizeTagChipRadius,
  parseTagChipRadius,
} from "../../../src/utils/tag-chip-radius";

describe("tag chip radius contract", () => {
  it("exposes the shared names and the three presets with Pill as the default", () => {
    expect(TAG_CHIP_RADIUS_CSS_VAR).toBe("--rss-dashboard-tag-chip-radius");
    expect(TAG_CHIP_RADIUS_EVENT).toBe("rss-dashboard:tag-chip-radius-changed");
    expect(DEFAULT_TAG_CHIP_RADIUS).toBe("999px");
    expect(TAG_CHIP_RADIUS_PRESETS).toEqual([
      { id: "rectangle", label: "Rectangle", value: "0px" },
      { id: "squircle", label: "Squircle", value: "6px" },
      { id: "pill", label: "Pill", value: "999px" },
    ]);
  });
});

describe("tag chip radius validation", () => {
  it.each([
    "0",
    "0px",
    "10px",
    "999px",
    "50%",
    "0.5em",
    ".5rem",
    "12PX",
    "4px 8px",
    "1px 2px 3px 4px",
    "12px 4px / 2px",
    "10px/20px",
    "  8px  ",
  ])("accepts %j", (value) => {
    expect(isValidTagChipRadius(value)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "red",
    "-4px",
    "4",
    "1px 2px 3px 4px 5px",
    "999px; color:red",
    "10px / ",
    "/ 10px",
    "1px / 2px / 3px",
    "calc(4px + 2px)",
    "var(--x)",
    "inherit",
    "initial",
    "10px !important",
    "1e3px",
    "10 px",
    "x".repeat(200),
  ])("rejects %j", (value) => {
    expect(isValidTagChipRadius(value)).toBe(false);
  });

  it.each([undefined, null, 10, true, {}, []])(
    "rejects the non-string %j",
    (value) => {
      expect(isValidTagChipRadius(value)).toBe(false);
    },
  );

  it("canonicalizes case and spacing around the slash", () => {
    expect(parseTagChipRadius(" 12PX   4px/2px ")).toBe("12px 4px / 2px");
  });
});

describe("normalizeTagChipRadius", () => {
  it.each([
    "",
    "red",
    "-4px",
    "1px 2px 3px 4px 5px",
    "999px; color:red",
    42,
    null,
    undefined,
  ])("falls back to Pill for %j", (value) => {
    expect(normalizeTagChipRadius(value)).toBe("999px");
  });

  it("keeps valid values", () => {
    expect(normalizeTagChipRadius("0px")).toBe("0px");
    expect(normalizeTagChipRadius("12px 4px / 2px")).toBe("12px 4px / 2px");
  });
});

describe("findTagChipRadiusPreset", () => {
  it("selects the preset a custom value is equivalent to", () => {
    expect(findTagChipRadiusPreset("6PX")?.id).toBe("squircle");
    expect(findTagChipRadiusPreset(" 0px ")?.id).toBe("rectangle");
    expect(findTagChipRadiusPreset("999px")?.id).toBe("pill");
  });

  it("returns undefined for other or invalid values", () => {
    expect(findTagChipRadiusPreset("12px")).toBeUndefined();
    expect(findTagChipRadiusPreset("nope")).toBeUndefined();
  });
});
