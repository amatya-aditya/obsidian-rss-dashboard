/**
 * Tests for pure helper functions extracted from the Highlights settings tab.
 *
 * Functions under test:
 *   - isHighlightWordDuplicate(words, text, excludeIndex?)
 *       Returns true if `text` already exists in the words array (case-sensitive),
 *       optionally skipping the entry at `excludeIndex` (used when editing).
 *
 *   - buildDefaultHighlights()
 *       Returns the standard "empty" highlights config object.
 */
import { describe, it, expect } from "vitest";
import {
  isHighlightWordDuplicate,
  buildDefaultHighlights,
} from "../../../src/settings/tabs/highlights-settings-tab";

// ── Fixture factory ──────────────────────────────────────────────────────────

function makeWord(text: string, extra: Partial<{ enabled: boolean; wholeWord: boolean; caseSensitive: boolean }> = {}) {
  return {
    id: `hw-${text}`,
    text,
    color: "#ffd700",
    enabled: true,
    wholeWord: false,
    caseSensitive: false,
    createdAt: Date.now(),
    ...extra,
  };
}

// ── isHighlightWordDuplicate ─────────────────────────────────────────────────

describe("isHighlightWordDuplicate()", () => {
  const words = [
    makeWord("TypeScript"),
    makeWord("Obsidian"),
    makeWord("Plugin"),
  ];

  describe("when adding a new word (no excludeIndex)", () => {
    it("returns true when word already exists (exact match)", () => {
      expect(isHighlightWordDuplicate(words, "TypeScript")).toBe(true);
    });

    it("returns false when word does not exist", () => {
      expect(isHighlightWordDuplicate(words, "Vitest")).toBe(false);
    });

    it("is case-sensitive — different case is NOT a duplicate", () => {
      expect(isHighlightWordDuplicate(words, "typescript")).toBe(false);
      expect(isHighlightWordDuplicate(words, "OBSIDIAN")).toBe(false);
    });

    it("returns false on an empty words array", () => {
      expect(isHighlightWordDuplicate([], "hello")).toBe(false);
    });

    it("returns true for the only word in a single-element array", () => {
      expect(isHighlightWordDuplicate([makeWord("only")], "only")).toBe(true);
    });
  });

  describe("when editing (excludeIndex provided)", () => {
    it("does not consider the word at excludeIndex a duplicate", () => {
      // Editing index 0 ('TypeScript') — checking same text should be false
      expect(isHighlightWordDuplicate(words, "TypeScript", 0)).toBe(false);
    });

    it("still detects duplicates among other entries", () => {
      // Editing index 0 but trying to rename to 'Obsidian' (index 1)
      expect(isHighlightWordDuplicate(words, "Obsidian", 0)).toBe(true);
    });

    it("excludeIndex out of range does not affect result", () => {
      expect(isHighlightWordDuplicate(words, "TypeScript", 99)).toBe(true);
    });

    it("works when excludeIndex is the last element", () => {
      expect(isHighlightWordDuplicate(words, "Plugin", 2)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty string text (not a duplicate if no empty-string word exists)", () => {
      expect(isHighlightWordDuplicate(words, "")).toBe(false);
    });

    it("handles empty string word in the list", () => {
      const withEmpty = [makeWord("")];
      expect(isHighlightWordDuplicate(withEmpty, "")).toBe(true);
    });

    it("handles whitespace-only search text", () => {
      expect(isHighlightWordDuplicate(words, "   ")).toBe(false);
    });
  });
});

// ── buildDefaultHighlights ───────────────────────────────────────────────────

describe("buildDefaultHighlights()", () => {
  it("returns an object with enabled=false", () => {
    const h = buildDefaultHighlights();
    expect(h.enabled).toBe(false);
  });

  it("returns an empty words array", () => {
    const h = buildDefaultHighlights();
    expect(h.words).toEqual([]);
  });

  it("contains the expected default color #ffd700", () => {
    const h = buildDefaultHighlights();
    expect(h.defaultColor).toBe("#ffd700");
  });

  it("has highlightInContent, highlightInTitles, and highlightInSummaries set to true", () => {
    const h = buildDefaultHighlights();
    expect(h.highlightInContent).toBe(true);
    expect(h.highlightInTitles).toBe(true);
    expect(h.highlightInSummaries).toBe(true);
  });

  it("returns a new object on each call (no shared reference)", () => {
    const a = buildDefaultHighlights();
    const b = buildDefaultHighlights();
    a.words.push(makeWord("test"));
    expect(b.words).toHaveLength(0);
  });
});
