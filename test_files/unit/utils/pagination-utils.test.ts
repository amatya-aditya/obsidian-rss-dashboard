import { describe, it, expect } from "vitest";
import { computePagination, computeResultsRange } from "../../../src/utils/pagination-utils";

describe("Pagination utils", () => {
  it("computePagination() treats pageSize=0 as All (single page)", () => {
    const result = computePagination({ totalItems: 49, pageSize: 0, requestedPage: 3 });
    expect(result.totalPages).toBe(1);
    expect(result.currentPage).toBe(1);
    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(49);
  });

  it("computeResultsRange() treats pageSize=0 as All (1..N)", () => {
    const range = computeResultsRange({ totalItems: 49, pageSize: 0, currentPage: 3 });
    expect(range.start).toBe(1);
    expect(range.end).toBe(49);
  });

  it("computePagination() clamps page within range for finite page sizes", () => {
    const result = computePagination({ totalItems: 49, pageSize: 25, requestedPage: 3 });
    expect(result.totalPages).toBe(2);
    expect(result.currentPage).toBe(2);
    expect(result.startIdx).toBe(25);
    expect(result.endIdx).toBe(49);
  });
});

