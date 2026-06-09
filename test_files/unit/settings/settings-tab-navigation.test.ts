/**
 * Tests for tab-orchestration helpers extracted from RssDashboardSettingTab.
 *
 * Functions under test:
 *   - SETTINGS_TAB_NAMES — the canonical list of tab names
 *   - isValidSettingsTab(name) — returns true only for known tab names
 *   - getInitialTab() — returns the first (default) tab name
 *
 * These are pure, zero-dependency exports from the settings-tab module.
 */
import { describe, it, expect } from "vitest";
import {
  SETTINGS_TAB_NAMES,
  isValidSettingsTab,
  getInitialTab,
} from "../../../src/settings/tab-names";

// ── SETTINGS_TAB_NAMES ───────────────────────────────────────────────────────

describe("SETTINGS_TAB_NAMES", () => {
  it("contains exactly 11 tabs", () => {
    expect(SETTINGS_TAB_NAMES).toHaveLength(11);
  });

  it("includes all expected tab names", () => {
    const expected = [
      "General",
      "Storage",
      "Display",
      "Sidebar",
      "Media",
      "Article saving",
      "Rules",
      "Highlights",
      "Import/Export",
      "Tags",
      "About",
    ];
    for (const name of expected) {
      expect(SETTINGS_TAB_NAMES, `missing tab "${name}"`).toContain(name);
    }
  });

  it("has 'General' as the first tab (default on open)", () => {
    expect(SETTINGS_TAB_NAMES[0]).toBe("General");
  });
});

// ── isValidSettingsTab ───────────────────────────────────────────────────────

describe("isValidSettingsTab()", () => {
  it("returns true for every known tab name", () => {
    for (const name of SETTINGS_TAB_NAMES) {
      expect(isValidSettingsTab(name), `"${name}" should be valid`).toBe(true);
    }
  });

  it("returns false for an unknown tab name", () => {
    expect(isValidSettingsTab("Unknown")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidSettingsTab("")).toBe(false);
  });

  it("is case-sensitive — wrong case returns false", () => {
    expect(isValidSettingsTab("general")).toBe(false);
    expect(isValidSettingsTab("DISPLAY")).toBe(false);
  });

  it("returns false for a name with trailing space", () => {
    expect(isValidSettingsTab("General ")).toBe(false);
  });
});

// ── getInitialTab ────────────────────────────────────────────────────────────

describe("getInitialTab()", () => {
  it("returns 'General'", () => {
    expect(getInitialTab()).toBe("General");
  });

  it("is always the first entry in SETTINGS_TAB_NAMES", () => {
    expect(getInitialTab()).toBe(SETTINGS_TAB_NAMES[0]);
  });
});
