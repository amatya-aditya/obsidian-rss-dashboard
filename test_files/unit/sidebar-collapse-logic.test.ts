import { describe, it, expect } from "vitest";
import { computeCollapsedIds } from "../../src/utils/sidebar-icon-registry";

const ALL_IDS = [
  "dashboard",
  "discover",
  "addFeed",
  "manageFeeds",
  "search",
  "addFolder",
  "sort",
  "collapseAll",
  "settings",
];
const NO_HIDDEN: Partial<Record<string, boolean>> = {};

describe("computeCollapsedIds()", () => {
  describe("normal collapse progression", () => {
    it("width=400 → no icons collapsed (above all thresholds)", () => {
      const result = computeCollapsedIds(400, ALL_IDS, NO_HIDDEN, false);
      expect(result.size).toBe(0);
    });

    it("width=359 → settings collapsed (threshold 360)", () => {
      const result = computeCollapsedIds(359, ALL_IDS, NO_HIDDEN, false);
      expect(result.has("settings")).toBe(true);
      expect(result.size).toBe(1);
    });

    it("width=319 → settings and collapseAll collapsed (thresholds 360, 320)", () => {
      const result = computeCollapsedIds(319, ALL_IDS, NO_HIDDEN, false);
      expect(result.has("settings")).toBe(true);
      expect(result.has("collapseAll")).toBe(true);
      expect(result.size).toBe(2);
    });

    it("width=270 → settings, collapseAll, sort, addFolder collapsed (thresholds 360, 320, 300, 280)", () => {
      const result = computeCollapsedIds(270, ALL_IDS, NO_HIDDEN, false);
      expect(result.has("settings")).toBe(true);
      expect(result.has("collapseAll")).toBe(true);
      expect(result.has("sort")).toBe(true);
      expect(result.has("addFolder")).toBe(true);
      expect(result.size).toBe(4);
    });

    it("width=259 → settings, collapseAll, sort, addFolder, search collapsed", () => {
      const result = computeCollapsedIds(259, ALL_IDS, NO_HIDDEN, false);
      expect(result.has("settings")).toBe(true);
      expect(result.has("collapseAll")).toBe(true);
      expect(result.has("sort")).toBe(true);
      expect(result.has("addFolder")).toBe(true);
      expect(result.has("search")).toBe(true);
      expect(result.size).toBe(5);
    });

    it("width=210 → all 7 collapsible icons in set (below all thresholds)", () => {
      const result = computeCollapsedIds(210, ALL_IDS, NO_HIDDEN, false);
      expect(result.has("settings")).toBe(true);
      expect(result.has("collapseAll")).toBe(true);
      expect(result.has("sort")).toBe(true);
      expect(result.has("addFolder")).toBe(true);
      expect(result.has("search")).toBe(true);
      expect(result.has("manageFeeds")).toBe(true);
      expect(result.has("addFeed")).toBe(true);
      expect(result.size).toBe(7);
    });

    it("width at exact threshold is NOT collapsed (threshold is the collapse point)", () => {
      // At exactly 360, settings should still be visible (collapses when width < 360)
      const result = computeCollapsedIds(360, ALL_IDS, NO_HIDDEN, false);
      expect(result.has("settings")).toBe(false);
    });
  });

  describe("never-collapse icons", () => {
    it("dashboard never appears in collapsed set, even at width=0", () => {
      const result = computeCollapsedIds(0, ALL_IDS, NO_HIDDEN, false);
      expect(result.has("dashboard")).toBe(false);
    });

    it("discover never appears in collapsed set, even at width=0", () => {
      const result = computeCollapsedIds(0, ALL_IDS, NO_HIDDEN, false);
      expect(result.has("discover")).toBe(false);
    });

    it("width=0 → exactly 7 icons collapsed (all collapsible, never-collapse excluded)", () => {
      const result = computeCollapsedIds(0, ALL_IDS, NO_HIDDEN, false);
      expect(result.size).toBe(7);
    });
  });

  describe("settings-hidden icons are absent from collapsed set", () => {
    it("sort hidden in settings + width=290 → sort absent from collapsed set", () => {
      const hidden = { hideIconSort: true };
      const result = computeCollapsedIds(290, ALL_IDS, hidden, false);
      expect(result.has("sort")).toBe(false);
    });

    it("sort hidden + width=100 → sort still absent from collapsed set", () => {
      const hidden = { hideIconSort: true };
      const result = computeCollapsedIds(100, ALL_IDS, hidden, false);
      expect(result.has("sort")).toBe(false);
    });

    it("hiding one icon does not affect collapse of others", () => {
      const hidden = { hideIconSort: true };
      const result = computeCollapsedIds(290, ALL_IDS, hidden, false);
      // addFolder (280) is not yet collapsed at w=290, sort skipped
      expect(result.has("settings")).toBe(true);
      expect(result.has("collapseAll")).toBe(true);
    });

    it("icons hidden in settings are absent whether or not they would have collapsed", () => {
      const hidden = { hideIconSearch: true };
      const result = computeCollapsedIds(250, ALL_IDS, hidden, false);
      // search threshold is 260, so would collapse at 250, but it's hidden
      expect(result.has("search")).toBe(false);
    });
  });

  describe("master toggle short-circuit", () => {
    it("hideToolbarEntirely=true → returns empty set regardless of width", () => {
      const result = computeCollapsedIds(200, ALL_IDS, NO_HIDDEN, true);
      expect(result.size).toBe(0);
    });

    it("hideToolbarEntirely=true at width=0 → still empty set", () => {
      const result = computeCollapsedIds(0, ALL_IDS, NO_HIDDEN, true);
      expect(result.size).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("iconOrder contains unknown ID → does not throw", () => {
      const withUnknown = [...ALL_IDS, "unknownIcon"];
      expect(() =>
        computeCollapsedIds(200, withUnknown, NO_HIDDEN, false)
      ).not.toThrow();
    });

    it("iconOrder contains unknown ID → unknown ID absent from result", () => {
      const withUnknown = [...ALL_IDS, "unknownIcon"];
      const result = computeCollapsedIds(0, withUnknown, NO_HIDDEN, false);
      expect(result.has("unknownIcon")).toBe(false);
    });

    it("iconOrder is empty → returns empty set", () => {
      const result = computeCollapsedIds(200, [], NO_HIDDEN, false);
      expect(result.size).toBe(0);
    });

    it("returns a Set (not an array or other type)", () => {
      const result = computeCollapsedIds(200, ALL_IDS, NO_HIDDEN, false);
      expect(result).toBeInstanceOf(Set);
    });
  });
});
