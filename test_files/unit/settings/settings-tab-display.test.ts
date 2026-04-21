/**
 * Tests for pure helper functions extracted from the Display settings tab.
 *
 * Functions under test:
 *   - moveIconOrder(order, fromId, toId, insertAfter)
 *   - normalizeHexColor(value)
 *
 * These are extracted as named exports from the display settings tab module
 * so they can be independently verified without Obsidian DOM dependencies.
 */
import { describe, it, expect } from "vitest";
import {
  moveIconOrder,
  normalizeHexColor,
} from "../../../src/settings/tabs/display-settings-tab";

// ── moveIconOrder ────────────────────────────────────────────────────────────

describe("moveIconOrder()", () => {
  const BASE_ORDER = ["a", "b", "c", "d", "e"];

  describe("basic reordering", () => {
    it("moves an item before the target (insertAfter=false)", () => {
      // Move 'd' before 'b'  →  a, d, b, c, e
      expect(moveIconOrder(BASE_ORDER, "d", "b", false)).toEqual([
        "a",
        "d",
        "b",
        "c",
        "e",
      ]);
    });

    it("moves an item after the target (insertAfter=true)", () => {
      // Move 'a' after 'c'  →  b, c, a, d, e
      expect(moveIconOrder(BASE_ORDER, "a", "c", true)).toEqual([
        "b",
        "c",
        "a",
        "d",
        "e",
      ]);
    });

    it("moves first item to last position (insertAfter=true on last)", () => {
      expect(moveIconOrder(BASE_ORDER, "a", "e", true)).toEqual([
        "b",
        "c",
        "d",
        "e",
        "a",
      ]);
    });

    it("moves last item to first position (insertAfter=false on first)", () => {
      expect(moveIconOrder(BASE_ORDER, "e", "a", false)).toEqual([
        "e",
        "a",
        "b",
        "c",
        "d",
      ]);
    });

    it("moves adjacent items forward (insertAfter=true)", () => {
      // Move 'b' after 'c'  →  a, c, b, d, e
      expect(moveIconOrder(BASE_ORDER, "b", "c", true)).toEqual([
        "a",
        "c",
        "b",
        "d",
        "e",
      ]);
    });

    it("moves adjacent items backward (insertAfter=false)", () => {
      // Move 'c' before 'b'  →  a, c, b, d, e
      expect(moveIconOrder(BASE_ORDER, "c", "b", false)).toEqual([
        "a",
        "c",
        "b",
        "d",
        "e",
      ]);
    });
  });

  describe("no-op / edge cases", () => {
    it("returns original array when fromId equals toId", () => {
      const result = moveIconOrder(BASE_ORDER, "b", "b", true);
      expect(result).toEqual(BASE_ORDER);
    });

    it("returns original array when fromId is not found", () => {
      const result = moveIconOrder(BASE_ORDER, "z", "b", true);
      expect(result).toEqual(BASE_ORDER);
    });

    it("returns original array when toId is not found", () => {
      const result = moveIconOrder(BASE_ORDER, "a", "z", false);
      expect(result).toEqual(BASE_ORDER);
    });

    it("does not mutate the original array", () => {
      const original = ["a", "b", "c"];
      moveIconOrder(original, "a", "c", true);
      expect(original).toEqual(["a", "b", "c"]);
    });

    it("handles a single-element array (no-op)", () => {
      expect(moveIconOrder(["a"], "a", "a", false)).toEqual(["a"]);
    });

    it("handles a two-element swap (insertAfter=true)", () => {
      expect(moveIconOrder(["a", "b"], "a", "b", true)).toEqual(["b", "a"]);
    });

    it("handles a two-element swap (insertAfter=false)", () => {
      expect(moveIconOrder(["a", "b"], "b", "a", false)).toEqual(["b", "a"]);
    });
  });

  describe("preserves all elements", () => {
    it("keeps the same number of elements after reorder", () => {
      const result = moveIconOrder(BASE_ORDER, "c", "a", true);
      expect(result.length).toBe(BASE_ORDER.length);
    });

    it("contains all original elements after reorder", () => {
      const result = moveIconOrder(BASE_ORDER, "e", "b", false);
      expect(new Set(result)).toEqual(new Set(BASE_ORDER));
    });
  });
});

// ── normalizeHexColor ────────────────────────────────────────────────────────

describe("normalizeHexColor()", () => {
  describe("valid 6-digit hex colors", () => {
    it("returns null for empty string", () => {
      expect(normalizeHexColor("")).toBeNull();
    });

    it("accepts '#rrggbb' and returns lowercase", () => {
      expect(normalizeHexColor("#FF0000")).toBe("#ff0000");
    });

    it("accepts 'rrggbb' without hash and prepends '#'", () => {
      expect(normalizeHexColor("ff0000")).toBe("#ff0000");
    });

    it("trims surrounding whitespace before processing", () => {
      expect(normalizeHexColor("  #aabbcc  ")).toBe("#aabbcc");
    });

    it("normalizes mixed-case hex digits", () => {
      expect(normalizeHexColor("#AaBbCc")).toBe("#aabbcc");
    });
  });

  describe("valid 3-digit hex colors", () => {
    it("accepts '#rgb' shorthand", () => {
      expect(normalizeHexColor("#f0f")).toBe("#f0f");
    });

    it("accepts 'rgb' shorthand without hash", () => {
      expect(normalizeHexColor("abc")).toBe("#abc");
    });
  });

  describe("invalid inputs", () => {
    it("returns null for only whitespace", () => {
      expect(normalizeHexColor("   ")).toBeNull();
    });

    it("returns null for 7-digit hex (too long)", () => {
      expect(normalizeHexColor("#1234567")).toBeNull();
    });

    it("returns null for 5-digit hex", () => {
      expect(normalizeHexColor("#12345")).toBeNull();
    });

    it("returns null for non-hex characters", () => {
      expect(normalizeHexColor("#zzzzzz")).toBeNull();
    });

    it("returns null for a plain word", () => {
      expect(normalizeHexColor("red")).toBeNull();
    });

    it("returns null for partial value '#'", () => {
      expect(normalizeHexColor("#")).toBeNull();
    });

    it("returns null for '#00' (2 digits)", () => {
      expect(normalizeHexColor("#00")).toBeNull();
    });
  });
});
