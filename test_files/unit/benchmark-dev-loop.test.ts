import { describe, expect, it } from "vitest";
import {
  formatComparison,
  median,
  summarizeStage,
  typecheckCommandFromBuild,
} from "../../scripts/benchmark-dev-loop.mjs";

const run = (secs: number, foreign = 0, exit = 0) => ({ secs, foreign, exit });

describe("median", () => {
  it("returns the middle value of an odd-length list", () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it("averages the two middle values of an even-length list", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });
});

describe("summarizeStage", () => {
  it("reports the median of warm runs that had the machine to themselves", () => {
    const summary = summarizeStage({
      cold: run(100),
      warm: [run(50), run(90, 3), run(52), run(48)],
    });

    expect(summary).toEqual({
      cold: 100,
      warm: 50,
      cleanWarmRuns: 3,
      contaminatedRuns: 1,
      failed: false,
    });
  });

  it("falls back to every warm run when all of them overlapped other work", () => {
    const summary = summarizeStage({
      cold: run(100, 2),
      warm: [run(70, 1), run(80, 4)],
    });

    expect(summary.warm).toBe(75);
    expect(summary.cleanWarmRuns).toBe(0);
    expect(summary.contaminatedRuns).toBe(3);
  });

  it("marks a stage as failed when any run exits non-zero", () => {
    expect(summarizeStage({ cold: run(10), warm: [run(9, 0, 1)] }).failed).toBe(
      true,
    );
  });
});

describe("typecheckCommandFromBuild", () => {
  it("extracts the type-check step exactly as npm run build runs it", () => {
    const build =
      "npm run check:compliance && npm run lint && tsc -noEmit -skipLibCheck -incremental && node esbuild.config.mjs production";

    expect(typecheckCommandFromBuild(build)).toBe(
      "tsc -noEmit -skipLibCheck -incremental",
    );
  });

  it("returns null when the build script has no type-check step", () => {
    expect(typecheckCommandFromBuild("node esbuild.config.mjs")).toBeNull();
  });
});

describe("formatComparison", () => {
  const result = (label: string, commit: string, secs: number) => ({
    label,
    commit,
    date: "2026-09-24T12:00:00.000Z",
    machine: {
      cpu: "Test CPU",
      threads: 16,
      memoryGb: 16,
      os: "win32 10.0",
      node: "v24.12.0",
    },
    stages: {
      lint: { cold: run(secs * 2), warm: [run(secs), run(secs), run(secs)] },
    },
  });

  it("renders each stage with before, after, and the relative change", () => {
    const table = formatComparison(
      result("before", "aaaaaaa", 60),
      result("after", "bbbbbbb", 15),
    );

    expect(table).toContain("| Stage | Before (warm) | After (warm) | Change |");
    expect(table).toContain("| `eslint .` | 60.0s | 15.0s | -75% |");
    expect(table).toContain("aaaaaaa");
    expect(table).toContain("bbbbbbb");
  });

  it("marks a stage that exists on only one side", () => {
    const before = result("before", "aaaaaaa", 60);
    const after = result("after", "bbbbbbb", 15);
    after.stages = {
      ...after.stages,
      "pre-commit: one source file": {
        cold: run(20),
        warm: [run(10), run(10), run(10)],
      },
    } as typeof after.stages;

    expect(formatComparison(before, after)).toContain(
      "| pre-commit: one source file | - | 10.0s | - |",
    );
  });
});
