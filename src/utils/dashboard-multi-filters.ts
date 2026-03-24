import type { RssDashboardSettings } from "../types/types";

export function makeDashboardMultiFiltersFromDefaultFilter(
  value: string,
): RssDashboardSettings["dashboardMultiFilters"] {
  if (value === "all") {
    return { statusFilters: [], tagFilters: [], logic: "OR" };
  }

  return { statusFilters: [value], tagFilters: [], logic: "OR" };
}

