// Fast pre-commit gate: lint only the staged files and run only the unit tests
// that exercise them. The full lint, type-check, and test suite run in the
// pre-push hook and in CI, so this hook trades breadth for a short loop.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LINTABLE = /\.(?:ts|mjs|cjs|js)$/;
const TEST_INPUT = /\.(?:ts|mjs|md)$/;

// Files whose change can alter any test's outcome without appearing in a
// test's import graph: runner configuration, shared setup, the Obsidian stub,
// dependencies, and fixtures read from disk.
const WHOLE_SUITE_TRIGGERS = [
  /^vitest\.config\.mjs$/,
  /^package(?:-lock)?\.json$/,
  /(?:^|\/)tsconfig\.json$/,
  /^test_files\/stubs\//,
  /^test_files\/unit\/vitest\.setup\.ts$/,
  /^test_files\/unit\/test-dom-polyfills\.ts$/,
  /^test_files\/(?!.*\.ts$)/,
];

// Past this many files a single `eslint .` against the cache beats passing a
// command line that Windows may truncate.
const MAX_EXPLICIT_LINT_FILES = 150;

export function planStagedChecks(stagedPaths) {
  const paths = stagedPaths.map((p) => p.replace(/\\/g, "/"));

  const lint = paths.filter(
    (p) => LINTABLE.test(p) || p === "package.json",
  );

  if (paths.some((p) => WHOLE_SUITE_TRIGGERS.some((re) => re.test(p)))) {
    return { lint, tests: { mode: "all", files: [] } };
  }

  const files = paths.filter(
    (p) =>
      TEST_INPUT.test(p) &&
      (p.startsWith("src/") ||
        p.startsWith("test_files/") ||
        p.startsWith("scripts/") ||
        p === "main.ts"),
  );

  return {
    lint,
    tests: files.length > 0 ? { mode: "related", files } : { mode: "none", files: [] },
  };
}

function stagedPaths() {
  const result = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "Could not list staged files.\n");
    process.exit(result.status ?? 1);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function runNode(label, script, args) {
  process.stdout.write(`[pre-commit] ${label}\n`);
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const plan = planStagedChecks(stagedPaths());

  if (plan.lint.length > 0) {
    const targets =
      plan.lint.length > MAX_EXPLICIT_LINT_FILES ? ["."] : plan.lint;
    runNode(`Linting ${plan.lint.length} staged file(s)...`, "node_modules/eslint/bin/eslint.js", [
      "--max-warnings=0",
      "--no-warn-ignored",
      "--cache",
      "--cache-strategy",
      "content",
      "--cache-location",
      "node_modules/.cache/eslint/",
      ...targets,
    ]);
  }

  const vitest = "node_modules/vitest/vitest.mjs";
  const vitestArgs = ["--config", "vitest.config.mjs", "--reporter=dot"];
  if (plan.tests.mode === "all") {
    runNode("Running the full unit suite...", vitest, ["run", ...vitestArgs]);
  } else if (plan.tests.mode === "related") {
    runNode("Running unit tests related to staged files...", vitest, [
      "related",
      "--run",
      "--passWithNoTests",
      ...vitestArgs,
      ...plan.tests.files,
    ]);
  } else {
    process.stdout.write("[pre-commit] No staged code; skipping unit tests.\n");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
