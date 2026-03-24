import { describe, it, expect } from "vitest";
import { formatDashboardMultiFiltersTitle } from "../../src/utils/filter-title-format";

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

