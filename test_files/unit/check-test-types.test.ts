import { describe, expect, it } from "vitest";
import { evaluateTestTypecheck } from "../../scripts/check-test-types.mjs";

const error = (file: string, code = "TS2345") =>
  `${file}(12,3): error ${code}: Argument of type 'x' is not assignable.`;

describe("evaluateTestTypecheck", () => {
  it("passes when test-file errors stay at the baseline", () => {
    const output = [
      error("test_files/unit/a.test.ts"),
      "  Detail line that is not an error.",
      error("test_files/unit/b.test.ts"),
    ].join("\n");

    expect(evaluateTestTypecheck(output, 2)).toEqual({
      errorCount: 2,
      failures: [],
      notes: [],
    });
  });

  it("fails when test-file errors grow past the baseline", () => {
    const output = [
      error("test_files/unit/a.test.ts"),
      error("test_files/unit/b.test.ts"),
    ].join("\n");

    const result = evaluateTestTypecheck(output, 1);

    expect(result.failures).toEqual([
      expect.stringContaining("2 type error(s) in test files; the baseline is 1"),
    ]);
  });

  it("asks for the baseline to be lowered when errors drop below it", () => {
    const result = evaluateTestTypecheck(error("test_files/unit/a.test.ts"), 3);

    expect(result.failures).toEqual([]);
    expect(result.notes).toEqual([
      expect.stringContaining("lower TEST_TYPE_ERROR_BASELINE to 1"),
    ]);
  });

  it("fails on any error in production code or the stub, even under the baseline", () => {
    const output = [
      error("src/views/dashboard-view.ts"),
      error("main.ts"),
      error("test_files/stubs/obsidian.ts", "TS2344"),
    ].join("\n");

    const result = evaluateTestTypecheck(output, 100);

    expect(result.failures).toEqual([
      expect.stringContaining("src/views/dashboard-view.ts(12,3)"),
      expect.stringContaining("main.ts(12,3)"),
      expect.stringContaining("test_files/stubs/obsidian.ts(12,3)"),
    ]);
  });

  it("normalizes Windows path separators", () => {
    const result = evaluateTestTypecheck(error("src\\utils\\x.ts"), 5);

    expect(result.failures).toEqual([expect.stringContaining("src/utils/x.ts")]);
  });
});
