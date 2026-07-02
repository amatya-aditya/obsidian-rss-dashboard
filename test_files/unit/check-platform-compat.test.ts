import { describe, expect, it } from "vitest";
import { findPlatformCompatViolations } from "../../scripts/check-platform-compat.mjs";

describe("findPlatformCompatViolations", () => {
  it("flags activeWindow timer usage in production code", () => {
    const source = `
      export function wait(): void {
        activeWindow.setTimeout(() => {}, 100);
      }
    `;

    expect(findPlatformCompatViolations(source, "src/utils/example.ts")).toEqual([
      expect.objectContaining({
        rule: "activeWindow-timer",
        line: 3,
      }),
    ]);
  });

  it("allows timer usage in test_files allowlist", () => {
    const source = "activeWindow.setTimeout(() => {}, 0);";

    expect(
      findPlatformCompatViolations(source, "test_files/unit/example.test.ts"),
    ).toEqual([]);
  });
});
