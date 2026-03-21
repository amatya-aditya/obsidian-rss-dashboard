import { describe, it, expect } from "vitest";
import { migrateDisplaySettings } from "../../src/utils/settings-migration";

const CANONICAL_ICON_ORDER = [
  "dashboard",
  "discover",
  "addFeed",
  "manageFeeds",
  "search",
  "tags",
  "addFolder",
  "sort",
  "collapseAll",
  "settings",
];

const ICON_HIDE_FIELDS = [
  "hideIconDashboard",
  "hideIconDiscover",
  "hideIconAddFeed",
  "hideIconManageFeeds",
  "hideIconSearch",
  "hideIconTags",
  "hideIconAddFolder",
  "hideIconSort",
  "hideIconCollapseAll",
  "hideIconSettings",
];

describe("migrateDisplaySettings()", () => {
  describe("new boolean hide-flag fields", () => {
    it("all 10 hide-flag fields missing → all initialized to false", () => {
      const display: Record<string, unknown> = {};
      migrateDisplaySettings(display);
      for (const field of ICON_HIDE_FIELDS) {
        expect(display[field], `${field} should be false`).toBe(false);
      }
    });

    it("hideToolbarEntirely missing → initialized to false", () => {
      const display: Record<string, unknown> = {};
      migrateDisplaySettings(display);
      expect(display.hideToolbarEntirely).toBe(false);
    });

    it("existing false values are preserved", () => {
      const display: Record<string, unknown> = {
        hideIconDashboard: false,
        hideIconSort: false,
      };
      migrateDisplaySettings(display);
      expect(display.hideIconDashboard).toBe(false);
      expect(display.hideIconSort).toBe(false);
    });

    it("existing true values are preserved", () => {
      const display: Record<string, unknown> = {
        hideIconSettings: true,
        hideIconSort: true,
      };
      migrateDisplaySettings(display);
      expect(display.hideIconSettings).toBe(true);
      expect(display.hideIconSort).toBe(true);
    });

    it("partial presence: missing fields get false, present fields preserved", () => {
      const display: Record<string, unknown> = {
        hideIconDashboard: true,
        hideIconDiscover: false,
        // rest are missing
      };
      migrateDisplaySettings(display);
      expect(display.hideIconDashboard).toBe(true);
      expect(display.hideIconDiscover).toBe(false);
      // All others should now be false
      for (const field of ICON_HIDE_FIELDS) {
        if (field !== "hideIconDashboard" && field !== "hideIconDiscover") {
          expect(display[field], `${field} should default to false`).toBe(false);
        }
      }
    });

    it("hideToolbarEntirely: true is preserved", () => {
      const display: Record<string, unknown> = { hideToolbarEntirely: true };
      migrateDisplaySettings(display);
      expect(display.hideToolbarEntirely).toBe(true);
    });
  });

  describe("iconOrder field", () => {
    it("iconOrder missing → initialized to canonical default array", () => {
      const display: Record<string, unknown> = {};
      migrateDisplaySettings(display);
      expect(display.iconOrder).toEqual(CANONICAL_ICON_ORDER);
    });

    it("iconOrder present with custom order → unchanged", () => {
      const customOrder = [
        "discover",
        "dashboard",
        "addFeed",
        "settings",
        "search",
        "manageFeeds",
        "addFolder",
        "sort",
        "collapseAll",
      ];
      const display: Record<string, unknown> = { iconOrder: [...customOrder] };
      migrateDisplaySettings(display);
      expect(display.iconOrder).toEqual(customOrder);
    });

    it("default iconOrder has exactly 10 entries", () => {
      const display: Record<string, unknown> = {};
      migrateDisplaySettings(display);
      expect((display.iconOrder as string[]).length).toBe(10);
    });

    it("default iconOrder contains all canonical IDs", () => {
      const display: Record<string, unknown> = {};
      migrateDisplaySettings(display);
      for (const id of CANONICAL_ICON_ORDER) {
        expect((display.iconOrder as string[])).toContain(id);
      }
    });
  });

  describe("edge cases", () => {
    it("completely empty object → all 10 new fields initialized", () => {
      const display: Record<string, unknown> = {};
      migrateDisplaySettings(display);
      // 9 hide booleans + hideToolbarEntirely + iconOrder = 11 new fields
      for (const field of ICON_HIDE_FIELDS) {
        expect(display[field]).toBeDefined();
      }
      expect(display.hideToolbarEntirely).toBeDefined();
      expect(display.iconOrder).toBeDefined();
    });

    it("unrelated existing fields are not removed", () => {
      const display: Record<string, unknown> = {
        showCoverImage: true,
        sidebarRowSpacing: 12,
      };
      migrateDisplaySettings(display);
      expect(display.showCoverImage).toBe(true);
      expect(display.sidebarRowSpacing).toBe(12);
    });

    it("iconOrder present but missing 'settings' ID → preserved as-is", () => {
      const orderWithoutSettings = [
        "dashboard",
        "discover",
        "addFeed",
        "manageFeeds",
        "search",
        "addFolder",
        "sort",
        "collapseAll",
      ];
      const display: Record<string, unknown> = {
        iconOrder: [...orderWithoutSettings],
      };
      migrateDisplaySettings(display);
      // Preserved as-is — registry handles unknown IDs gracefully at render time
      expect(display.iconOrder).toEqual(orderWithoutSettings);
    });
  });
});
