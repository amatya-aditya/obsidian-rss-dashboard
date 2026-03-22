/**
 * Tests for pure helper functions extracted from the General settings tab.
 *
 * Functions under test:
 *   - isPresetRefreshInterval(value) — checks if a number is a preset dropdown option
 *   - isPresetMaxItems(value)        — checks if a number is a preset dropdown option
 *   - isPresetAutoDeleteDuration(value) — checks if a number is a preset dropdown option
 *
 * These helpers power the dropdown "setValue" logic that decides whether to
 * display "Custom..." vs a named preset option.
 */
import { describe, it, expect } from "vitest";
import {
  isPresetRefreshInterval,
  isPresetMaxItems,
  isPresetAutoDeleteDuration,
  REFRESH_INTERVAL_PRESETS,
  MAX_ITEMS_PRESETS,
  AUTO_DELETE_PRESETS,
} from "../../src/settings/tabs/general-settings-tab";

// ── isPresetRefreshInterval ──────────────────────────────────────────────────

describe("isPresetRefreshInterval()", () => {
  it("returns true for every documented preset", () => {
    for (const v of REFRESH_INTERVAL_PRESETS) {
      expect(isPresetRefreshInterval(v), `${v} should be a preset`).toBe(true);
    }
  });

  it("covers the expected preset list [5,10,15,30,60,120,240,480,720,1440]", () => {
    const expected = [5, 10, 15, 30, 60, 120, 240, 480, 720, 1440];
    expect(REFRESH_INTERVAL_PRESETS).toEqual(expected);
  });

  it("returns false for a non-preset value", () => {
    expect(isPresetRefreshInterval(45)).toBe(false);
  });

  it("returns false for 0", () => {
    expect(isPresetRefreshInterval(0)).toBe(false);
  });

  it("returns false for a negative value", () => {
    expect(isPresetRefreshInterval(-5)).toBe(false);
  });

  it("returns false for a very large custom value", () => {
    expect(isPresetRefreshInterval(2000)).toBe(false);
  });
});

// ── isPresetMaxItems ─────────────────────────────────────────────────────────

describe("isPresetMaxItems()", () => {
  it("returns true for 0 (Unlimited)", () => {
    expect(isPresetMaxItems(0)).toBe(true);
  });

  it("returns true for every named preset", () => {
    for (const v of MAX_ITEMS_PRESETS) {
      expect(isPresetMaxItems(v), `${v} should be a preset`).toBe(true);
    }
  });

  it("covers the expected preset list [0,10,25,50,100,200,500,1000]", () => {
    expect(MAX_ITEMS_PRESETS).toEqual([0, 10, 25, 50, 100, 200, 500, 1000]);
  });

  it("returns false for a non-preset value", () => {
    expect(isPresetMaxItems(75)).toBe(false);
  });

  it("returns false for negative values", () => {
    expect(isPresetMaxItems(-1)).toBe(false);
  });

  it("returns false for a large custom value", () => {
    expect(isPresetMaxItems(9999)).toBe(false);
  });
});

// ── isPresetAutoDeleteDuration ───────────────────────────────────────────────

describe("isPresetAutoDeleteDuration()", () => {
  it("returns true for 0 (Disabled)", () => {
    expect(isPresetAutoDeleteDuration(0)).toBe(true);
  });

  it("returns true for every named preset", () => {
    for (const v of AUTO_DELETE_PRESETS) {
      expect(isPresetAutoDeleteDuration(v), `${v} should be a preset`).toBe(
        true,
      );
    }
  });

  it("covers the expected preset list [0,1,3,7,14,30,60,90,180,365]", () => {
    expect(AUTO_DELETE_PRESETS).toEqual([0, 1, 3, 7, 14, 30, 60, 90, 180, 365]);
  });

  it("returns false for 2 (between 1 and 3)", () => {
    expect(isPresetAutoDeleteDuration(2)).toBe(false);
  });

  it("returns false for a large custom number", () => {
    expect(isPresetAutoDeleteDuration(500)).toBe(false);
  });

  it("returns false for negative values", () => {
    expect(isPresetAutoDeleteDuration(-7)).toBe(false);
  });
});
