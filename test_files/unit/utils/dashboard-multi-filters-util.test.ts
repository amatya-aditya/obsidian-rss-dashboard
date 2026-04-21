import { describe, it, expect } from "vitest";
import { makeDashboardMultiFiltersFromDefaultFilter } from "../../../src/utils/dashboard-multi-filters";

describe("makeDashboardMultiFiltersFromDefaultFilter()", () => {
  it("maps 'all' to empty filters", () => {
    expect(makeDashboardMultiFiltersFromDefaultFilter("all")).toEqual({
      statusFilters: [],
      tagFilters: [],
      logic: "OR",
    });
  });

  it("maps a status filter to a single statusFilters entry", () => {
    expect(makeDashboardMultiFiltersFromDefaultFilter("unread")).toEqual({
      statusFilters: ["unread"],
      tagFilters: [],
      logic: "OR",
    });
  });
});

