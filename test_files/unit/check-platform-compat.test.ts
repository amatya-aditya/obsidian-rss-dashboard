import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPlatformCompatViolations } from "../../scripts/check-platform-compat.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProductionFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("findPlatformCompatViolations", () => {
  it("flags activeWindow timer usage in production code", () => {
    const source = `
      export function wait(): void {
        activeWindow.setTimeout(() => {}, 100);
      }
    `;

    expect(
      findPlatformCompatViolations(source, "src/utils/example.ts"),
    ).toEqual([
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

  it("flags regex lookbehind in production code", () => {
    const source = String.raw`const inline = /(?<!\s)\$$/;`;

    expect(
      findPlatformCompatViolations(source, "src/utils/example.ts"),
    ).toEqual([
      expect.objectContaining({
        rule: "regex-lookbehind",
        line: 1,
      }),
    ]);
  });

  it("accepts regex lookahead and named capture groups", () => {
    const source = String.raw`const inline = /(?!\s)$(?<name>x)/;`;

    expect(
      findPlatformCompatViolations(source, "src/utils/example.ts"),
    ).toEqual([]);
  });

  it("keeps the highlight and math regexes free of lookbehind", () => {
    const files = [
      "src/services/highlight-service.ts",
      "src/utils/math-rendering.ts",
    ];

    for (const file of files) {
      expect(
        findPlatformCompatViolations(readProductionFile(file), file),
      ).toEqual([]);
    }
  });
});
