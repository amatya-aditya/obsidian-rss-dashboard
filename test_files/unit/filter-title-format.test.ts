import { describe, it, expect } from "vitest";
import {
  formatDashboardMultiFiltersTitle,
  formatDashboardMultiFiltersSummaryCompact,
} from "../../src/utils/filter-title-format";

describe("formatDashboardMultiFiltersTitle()", () => {
  it("formats OR logic with status filters", () => {
    const result = formatDashboardMultiFiltersTitle({
      baseTitle: "All articles",
      statusFilters: new Set(["unread", "starred"]),
      tagFilters: new Set(),
      logic: "OR",
    });

    expect(result).toEqual({
      title: "All Unread or Starred articles",
      tooltip: "Active filters (OR): Unread, Starred",
    });
  });

  it("formats AND logic including tagged", () => {
    const result = formatDashboardMultiFiltersTitle({
      baseTitle: "All articles",
      statusFilters: new Set(["read", "tagged"]),
      tagFilters: new Set(),
      logic: "AND",
    });

    expect(result).toEqual({
      title: "All Read and Tagged articles",
      tooltip: "Active filters (AND): Read, Tagged",
    });
  });

  it("includes tag names and omits redundant tagged/untagged statuses", () => {
    const result = formatDashboardMultiFiltersTitle({
      baseTitle: "All articles",
      statusFilters: new Set(["unread", "tagged"]),
      tagFilters: new Set(["Work", "Home"]),
      logic: "OR",
    });

    expect(result).toEqual({
      title: "All Unread or Tags: Home, Work articles",
      tooltip: "Active filters (OR): Unread, Tags: Home, Work",
    });
  });

  it("uses 'items' noun when podcasts/videos are selected", () => {
    const result = formatDashboardMultiFiltersTitle({
      baseTitle: "All articles",
      statusFilters: new Set(["podcasts"]),
      tagFilters: new Set(),
      logic: "OR",
    });

    expect(result).toEqual({
      title: "All Podcasts items",
      tooltip: "Active filters (OR): Podcasts",
    });
  });
});

describe("formatDashboardMultiFiltersSummaryCompact()", () => {
  it("returns All when there are no filters", () => {
    const result = formatDashboardMultiFiltersSummaryCompact({
      statusFilters: new Set(),
      tagFilters: new Set(),
      logic: "OR",
      maxItems: 2,
    });

    expect(result).toEqual({ text: "All", tooltip: null });
  });

  it("shows max 2 items with +n for the remainder", () => {
    const result = formatDashboardMultiFiltersSummaryCompact({
      statusFilters: new Set(["unread", "starred", "podcasts"]),
      tagFilters: new Set(),
      logic: "OR",
      maxItems: 2,
    });

    expect(result.text).toBe("Unread or Starred +1");
    expect(result.tooltip).toBe("Active filters (OR): Unread, Starred, Podcasts");
  });

  it("always includes Tags in the summary when tag names are active", () => {
    const result = formatDashboardMultiFiltersSummaryCompact({
      statusFilters: new Set(["unread", "podcasts", "videos"]),
      tagFilters: new Set(["Home", "Work"]),
      logic: "OR",
      maxItems: 2,
    });

    expect(result.text).toBe("Unread or Tags (2) +2");
    expect(result.tooltip).toBe(
      "Active filters (OR): Unread, Podcasts, Videos, Tags: Home, Work",
    );
  });
});
