import { describe, it, expect } from "vitest";
import { getPageSizeOptions } from "../../../src/utils/page-size-options";

describe("Page size options", () => {
  it("getPageSizeOptions(0) includes 0 (All)", () => {
    expect(getPageSizeOptions(0)).toContain(0);
  });
});

