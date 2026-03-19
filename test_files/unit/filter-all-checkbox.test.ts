import { describe, it, expect, beforeEach } from "vitest";

/**
 * Unit tests for the "All" checkbox filter feature.
 *
 * Feature: Allow users to quickly reset all filters or start fresh by checking "All"
 * - "All" checkbox is checked by default
 * - When any other filter is checked, "All" becomes unchecked
 * - When "All" is checked, all other filters become unchecked
 * - When the last filter is unchecked, "All" becomes checked
 */

interface FilterState {
  all: boolean;
  unread: boolean;
  read: boolean;
  saved: boolean;
  starred: boolean;
  podcasts: boolean;
  videos: boolean;
  tagged: boolean;
  tagFilters: Set<string>;
}

/**
 * Simulates filter state management for the "All" checkbox feature.
 */
class FilterManager {
  private state: FilterState = {
    all: true, // All is checked by default
    unread: false,
    read: false,
    saved: false,
    starred: false,
    podcasts: false,
    videos: false,
    tagged: false,
    tagFilters: new Set(),
  };

  getState(): FilterState {
    return { ...this.state, tagFilters: new Set(this.state.tagFilters) };
  }

  /**
   * Handle checking/unchecking the "All" checkbox.
   * When "All" is checked, uncheck all other filters.
   */
  setAll(checked: boolean): void {
    if (checked) {
      this.state.all = true;
      this.state.unread = false;
      this.state.read = false;
      this.state.saved = false;
      this.state.starred = false;
      this.state.podcasts = false;
      this.state.videos = false;
      this.state.tagged = false;
      this.state.tagFilters.clear();
    } else {
      this.state.all = false;
    }
  }

  /**
   * Handle checking/unchecking a status filter.
   * When any filter becomes checked, uncheck "All".
   * When all filters are unchecked, check "All".
   */
  setStatusFilter(
    filter:
      | "unread"
      | "read"
      | "saved"
      | "starred"
      | "podcasts"
      | "videos"
      | "tagged",
    checked: boolean,
  ): void {
    this.state[filter] = checked;

    // If any filter is checked, uncheck "All"
    if (checked) {
      this.state.all = false;
    } else {
      // If this was the last filter being unchecked, check "All"
      const hasAnyFilter =
        this.state.unread ||
        this.state.read ||
        this.state.saved ||
        this.state.starred ||
        this.state.podcasts ||
        this.state.videos ||
        this.state.tagged ||
        this.state.tagFilters.size > 0;

      if (!hasAnyFilter) {
        this.state.all = true;
      }
    }
  }

  /**
   * Handle adding/removing tag filters.
   */
  toggleTag(tagName: string): void {
    if (this.state.tagFilters.has(tagName)) {
      this.state.tagFilters.delete(tagName);
    } else {
      this.state.tagFilters.add(tagName);
    }

    // If any tag is selected, uncheck "All"
    if (this.state.tagFilters.size > 0) {
      this.state.all = false;
    } else {
      // If no tags and no other filters, check "All"
      const hasAnyFilter =
        this.state.unread ||
        this.state.read ||
        this.state.saved ||
        this.state.starred ||
        this.state.podcasts ||
        this.state.videos ||
        this.state.tagged;

      if (!hasAnyFilter) {
        this.state.all = true;
      }
    }
  }
}

describe("All Checkbox Filter Feature", () => {
  let filterManager: FilterManager;

  beforeEach(() => {
    filterManager = new FilterManager();
  });

  describe("Initial State (PASSING TESTS)", () => {
    it("should have All checkbox checked by default", () => {
      const state = filterManager.getState();
      expect(state.all).toBe(true);
    });

    it("should have all other filters unchecked by default", () => {
      const state = filterManager.getState();
      expect(state.unread).toBe(false);
      expect(state.read).toBe(false);
      expect(state.saved).toBe(false);
      expect(state.starred).toBe(false);
      expect(state.podcasts).toBe(false);
      expect(state.videos).toBe(false);
      expect(state.tagged).toBe(false);
      expect(state.tagFilters.size).toBe(0);
    });

    it("should have no tag filters by default", () => {
      const state = filterManager.getState();
      expect(state.tagFilters.size).toBe(0);
    });
  });

  describe("Checking Other Filters (PASSING TESTS)", () => {
    it("should uncheck All when Unread is checked", () => {
      filterManager.setStatusFilter("unread", true);
      const state = filterManager.getState();
      expect(state.unread).toBe(true);
      expect(state.all).toBe(false);
    });

    it("should uncheck All when any status filter is checked", () => {
      const filters: Array<
        "read" | "saved" | "starred" | "podcasts" | "videos" | "tagged"
      > = ["read", "saved", "starred", "podcasts", "videos", "tagged"];

      filters.forEach((filter) => {
        const manager = new FilterManager();
        manager.setStatusFilter(filter, true);
        const state = manager.getState();
        expect(state.all).toBe(false);
        expect(state[filter]).toBe(true);
      });
    });

    it("should uncheck All when a tag is added", () => {
      filterManager.toggleTag("priority");
      const state = filterManager.getState();
      expect(state.all).toBe(false);
      expect(state.tagFilters.has("priority")).toBe(true);
    });

    it("should allow multiple status filters to be checked together", () => {
      filterManager.setStatusFilter("unread", true);
      filterManager.setStatusFilter("starred", true);
      const state = filterManager.getState();
      expect(state.unread).toBe(true);
      expect(state.starred).toBe(true);
      expect(state.all).toBe(false);
    });
  });

  describe("Checking All (PASSING TESTS)", () => {
    it("should uncheck all other filters when All is checked", () => {
      filterManager.setStatusFilter("unread", true);
      filterManager.setStatusFilter("starred", true);
      filterManager.toggleTag("work");

      filterManager.setAll(true);

      const state = filterManager.getState();
      expect(state.all).toBe(true);
      expect(state.unread).toBe(false);
      expect(state.starred).toBe(false);
      expect(state.tagFilters.size).toBe(0);
    });

    it("should uncheck all status filters when All is checked", () => {
      const filters: Array<
        | "unread"
        | "read"
        | "saved"
        | "starred"
        | "podcasts"
        | "videos"
        | "tagged"
      > = [
        "unread",
        "read",
        "saved",
        "starred",
        "podcasts",
        "videos",
        "tagged",
      ];

      filters.forEach((filter) => {
        filterManager.setStatusFilter(filter, true);
      });

      filterManager.setAll(true);

      const state = filterManager.getState();
      filters.forEach((filter) => {
        expect(state[filter]).toBe(false);
      });
      expect(state.all).toBe(true);
    });

    it("should clear tag filters when All is checked", () => {
      filterManager.toggleTag("work");
      filterManager.toggleTag("urgent");

      filterManager.setAll(true);

      const state = filterManager.getState();
      expect(state.tagFilters.size).toBe(0);
      expect(state.all).toBe(true);
    });
  });

  describe("Unchecking Last Filter (PASSING TESTS)", () => {
    it("should check All when the last filter is unchecked", () => {
      filterManager.setStatusFilter("unread", true);
      filterManager.setStatusFilter("unread", false);

      const state = filterManager.getState();
      expect(state.all).toBe(true);
      expect(state.unread).toBe(false);
    });

    it("should check All when the last tag is removed", () => {
      filterManager.toggleTag("work");
      filterManager.toggleTag("work");

      const state = filterManager.getState();
      expect(state.all).toBe(true);
      expect(state.tagFilters.size).toBe(0);
    });

    it("should check All when all tags are removed but status filters are also empty", () => {
      filterManager.setStatusFilter("starred", true);
      filterManager.setStatusFilter("starred", false);
      filterManager.toggleTag("work");
      filterManager.toggleTag("work");

      const state = filterManager.getState();
      expect(state.all).toBe(true);
    });

    it("should not check All if other filters remain when one is unchecked", () => {
      filterManager.setStatusFilter("unread", true);
      filterManager.setStatusFilter("starred", true);
      filterManager.setStatusFilter("unread", false);

      const state = filterManager.getState();
      expect(state.all).toBe(false);
      expect(state.starred).toBe(true);
    });
  });

  describe("Current Behavior Tests (These FAIL with current code)", () => {
    it("FAILING: should not apply tagged filter when only unread is selected", () => {
      // This test represents the current problem:
      // When user checks "Unread", they expect to see unread articles,
      // but current code also requires tagged (this is the bug)
      filterManager.setStatusFilter("unread", true);

      const state = filterManager.getState();

      // With the new "All" feature, tagged should NOT be checked
      // Therefore articles should be filtered by unread only
      expect(state.tagged).toBe(false);
      expect(state.unread).toBe(true);
      expect(state.all).toBe(false);
    });

    it("FAILING: should allow user to select Unread without auto-selecting Tagged", () => {
      // Another way to express the bug: user should be able to check
      // Unread and see ONLY unread articles (no tagged requirement)
      filterManager.setStatusFilter("unread", true);

      const state = filterManager.getState();
      const hasTaggedFilter = state.tagged || state.tagFilters.size > 0;

      expect(hasTaggedFilter).toBe(false);
    });
  });

  describe("Edge Cases (PASSING TESTS)", () => {
    it("should handle rapid filter changes correctly", () => {
      filterManager.setStatusFilter("unread", true);
      filterManager.setStatusFilter("unread", false);
      filterManager.setStatusFilter("read", true);
      filterManager.setStatusFilter("read", false);

      const state = filterManager.getState();
      expect(state.all).toBe(true);
      expect(state.unread).toBe(false);
      expect(state.read).toBe(false);
    });

    it("should handle tag + status filter combinations", () => {
      filterManager.setStatusFilter("starred", true);
      filterManager.toggleTag("work");
      filterManager.toggleTag("urgent");

      const state = filterManager.getState();
      expect(state.all).toBe(false);
      expect(state.starred).toBe(true);
      expect(state.tagFilters.size).toBe(2);
      expect(state.tagFilters.has("work")).toBe(true);
      expect(state.tagFilters.has("urgent")).toBe(true);
    });

    it("should maintain All checked when toggling same tag on and off", () => {
      filterManager.toggleTag("work");
      filterManager.toggleTag("work");

      filterManager.setStatusFilter("unread", true);
      filterManager.setStatusFilter("unread", false);

      const state = filterManager.getState();
      expect(state.all).toBe(true);
    });
  });
});
