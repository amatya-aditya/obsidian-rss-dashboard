import { describe, it, expect } from "vitest";
import { migrateDefaultFilterToDashboardMultiFilters } from "../../src/utils/settings-migration";

describe("migrateDefaultFilterToDashboardMultiFilters()", () => {
  it("migrates legacy display.defaultFilter when multi-filters are empty", () => {
    const display: Record<string, unknown> = { defaultFilter: "unread" };
    const dashboardMultiFilters: Record<string, unknown> = {
      statusFilters: [],
      tagFilters: [],
      logic: "OR",
    };

    migrateDefaultFilterToDashboardMultiFilters(display, dashboardMultiFilters);

    expect(dashboardMultiFilters).toEqual({
      statusFilters: ["unread"],
      tagFilters: [],
      logic: "OR",
    });
  });

  it("does not overwrite existing dashboard multi-filters", () => {
    const display: Record<string, unknown> = { defaultFilter: "unread" };
    const dashboardMultiFilters: Record<string, unknown> = {
      statusFilters: ["saved"],
      tagFilters: [],
      logic: "OR",
    };

    migrateDefaultFilterToDashboardMultiFilters(display, dashboardMultiFilters);

    expect(dashboardMultiFilters).toEqual({
      statusFilters: ["saved"],
      tagFilters: [],
      logic: "OR",
    });
  });

  it("ignores display.defaultFilter when it is 'all' or unknown", () => {
    const displayAll: Record<string, unknown> = { defaultFilter: "all" };
    const mf1: Record<string, unknown> = {
      statusFilters: [],
      tagFilters: [],
      logic: "OR",
    };
    migrateDefaultFilterToDashboardMultiFilters(displayAll, mf1);
    expect(mf1).toEqual({ statusFilters: [], tagFilters: [], logic: "OR" });

    const displayUnknown: Record<string, unknown> = { defaultFilter: "nope" };
    const mf2: Record<string, unknown> = {
      statusFilters: [],
      tagFilters: [],
      logic: "OR",
    };
    migrateDefaultFilterToDashboardMultiFilters(displayUnknown, mf2);
    expect(mf2).toEqual({ statusFilters: [], tagFilters: [], logic: "OR" });
  });
});

