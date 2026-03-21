import { describe, it, expect } from "vitest";
import {
  SIDEBAR_ICONS,
  SIDEBAR_ICON_IDS,
  getIconById,
} from "../../src/utils/sidebar-icon-registry";

const ALL_EXPECTED_IDS = [
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

describe("SIDEBAR_ICONS registry", () => {
  it("contains all 9 expected IDs", () => {
    const actualIds = SIDEBAR_ICONS.map((icon) => icon.id);
    for (const id of ALL_EXPECTED_IDS) {
      expect(actualIds).toContain(id);
    }
  });

  it("has exactly 9 entries", () => {
    expect(SIDEBAR_ICONS).toHaveLength(9);
  });

  it("has no duplicate IDs", () => {
    const ids = SIDEBAR_ICONS.map((icon) => icon.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has id, label, lucideIcon, and settingKey as non-empty strings", () => {
    for (const icon of SIDEBAR_ICONS) {
      expect(typeof icon.id).toBe("string");
      expect(icon.id.length).toBeGreaterThan(0);
      expect(typeof icon.label).toBe("string");
      expect(icon.label.length).toBeGreaterThan(0);
      expect(typeof icon.lucideIcon).toBe("string");
      expect((icon.lucideIcon as string).length).toBeGreaterThan(0);
      expect(typeof icon.settingKey).toBe("string");
      expect((icon.settingKey as string).length).toBeGreaterThan(0);
    }
  });

  it("dashboard and discover have neverCollapses: true", () => {
    const dashboard = SIDEBAR_ICONS.find((i) => i.id === "dashboard");
    const discover = SIDEBAR_ICONS.find((i) => i.id === "discover");
    expect(dashboard?.neverCollapses).toBe(true);
    expect(discover?.neverCollapses).toBe(true);
  });

  it("each icon's settingKey matches hideIcon{PascalId}", () => {
    for (const icon of SIDEBAR_ICONS) {
      const expectedKey = `hideIcon${icon.id.charAt(0).toUpperCase() + icon.id.slice(1)}`;
      expect(icon.settingKey, `settingKey for ${icon.id}`).toBe(expectedKey);
    }
  });
});

describe("SIDEBAR_ICON_IDS", () => {
  it("contains exactly 9 IDs", () => {
    expect(SIDEBAR_ICON_IDS).toHaveLength(9);
  });

  it("has no duplicates", () => {
    expect(new Set(SIDEBAR_ICON_IDS).size).toBe(SIDEBAR_ICON_IDS.length);
  });

  it("contains all IDs from SIDEBAR_ICONS", () => {
    const registryIds = SIDEBAR_ICONS.map((i) => i.id);
    for (const id of SIDEBAR_ICON_IDS) {
      expect(registryIds).toContain(id);
    }
  });

  it("contains all 9 expected IDs", () => {
    for (const id of ALL_EXPECTED_IDS) {
      expect(SIDEBAR_ICON_IDS).toContain(id);
    }
  });
});

describe("getIconById()", () => {
  it("returns correct config for each valid ID", () => {
    for (const icon of SIDEBAR_ICONS) {
      const result = getIconById(icon.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(icon.id);
    }
  });

  it("returns undefined for unknown ID", () => {
    expect(getIconById("nonexistent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getIconById("")).toBeUndefined();
  });

  it("returned object matches the SIDEBAR_ICONS entry", () => {
    const icon = SIDEBAR_ICONS[0];
    const result = getIconById(icon.id);
    expect(result).toStrictEqual(icon);
  });
});
