import { describe, expect, it } from "vitest";
import { planStagedChecks } from "../../scripts/run-staged-checks.mjs";

describe("planStagedChecks", () => {
  it("skips linting and tests when only prose changed", () => {
    expect(planStagedChecks(["README.md", "docs/guide.md"])).toEqual({
      lint: [],
      tests: { mode: "none", files: [] },
    });
  });

  it("lints staged source and runs only the tests related to it", () => {
    const plan = planStagedChecks(["src/views/reader-view.ts", "main.ts"]);

    expect(plan.lint).toEqual(["src/views/reader-view.ts", "main.ts"]);
    expect(plan.tests).toEqual({
      mode: "related",
      files: ["src/views/reader-view.ts", "main.ts"],
    });
  });

  it("runs a staged test file even when no source changed with it", () => {
    const plan = planStagedChecks(["test_files/unit/views/reader.test.ts"]);

    expect(plan.lint).toEqual(["test_files/unit/views/reader.test.ts"]);
    expect(plan.tests).toEqual({
      mode: "related",
      files: ["test_files/unit/views/reader.test.ts"],
    });
  });

  it("follows bundled What's New notes and repository scripts to their tests", () => {
    const plan = planStagedChecks([
      "src/whats-new/2.7.0.md",
      "scripts/check-doc-links.mjs",
    ]);

    expect(plan.lint).toEqual(["scripts/check-doc-links.mjs"]);
    expect(plan.tests.mode).toBe("related");
    expect(plan.tests.files).toEqual([
      "src/whats-new/2.7.0.md",
      "scripts/check-doc-links.mjs",
    ]);
  });

  it.each([
    "vitest.config.mjs",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "test_files/tsconfig.json",
    "test_files/stubs/obsidian.ts",
    "test_files/unit/vitest.setup.ts",
    "test_files/unit/test-dom-polyfills.ts",
    "test_files/unit/fixtures/sample-feed.xml",
  ])("runs the whole suite when %s changes", (file) => {
    expect(planStagedChecks(["src/main.ts", file]).tests).toEqual({
      mode: "all",
      files: [],
    });
  });

  it("lints the staged package manifest for banned dependencies", () => {
    expect(planStagedChecks(["package.json"]).lint).toEqual(["package.json"]);
  });

  it("normalizes Windows path separators from git", () => {
    expect(planStagedChecks(["src\\utils\\tag-utils.ts"]).lint).toEqual([
      "src/utils/tag-utils.ts",
    ]);
  });
});
