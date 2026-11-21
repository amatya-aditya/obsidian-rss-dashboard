// Fast pre-commit gate: lint only the staged files and run only the unit tests
// that exercise them. CI runs the full lint, type-check, and test suite, so
// this hook trades breadth for a short loop.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

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
  /^test_files\/unit\/vitest\.shared-environment\.setup\.ts$/,
  /^test_files\/unit\/test-dom-polyfills\.ts$/,
  /^test_files\/(?!.*\.ts$)/,
];

// Past this many files a single `eslint .` against the cache beats passing a
// command line that Windows may truncate.
const MAX_EXPLICIT_LINT_FILES = 150;

export function planStagedChecks(stagedPaths) {
  const paths = stagedPaths.map((p) => p.replace(/\\/g, "/"));

  const lint = paths.filter((p) => LINTABLE.test(p) || p === "package.json");

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
    tests:
      files.length > 0
        ? { mode: "related", files }
        : { mode: "none", files: [] },
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

export function vitestFileSummary(output) {
  const line = stripVTControlCharacters(output)
    .split(/\r?\n/)
    .find((entry) => /^\s*Test Files\s+/.test(entry));
  if (line) return line.trim().replace(/\s+/g, " ");
  if (/No test files found/.test(output)) return "Test Files 0";
  return "";
}

// Passing steps print a summary. Failing steps retain their output in a log.
// Set PRECOMMIT_VERBOSE=1 to stream every step's output as it runs.
export function summarizeStep(label, result, elapsedMs) {
  if (result.status === 0) {
    return {
      ok: true,
      text: `[pre-commit] ${label} ok (${(elapsedMs / 1000).toFixed(1)}s)\n`,
    };
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return {
    ok: false,
    text: `[pre-commit] ${label} FAILED\n${output}`,
  };
}

function runNode(label, script, args, summarizeOutput = () => "") {
  if (process.env.PRECOMMIT_VERBOSE === "1") {
    process.stdout.write(`[pre-commit] ${label}\n`);
    const result = spawnSync(process.execPath, [script, ...args], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    return;
  }
  const started = Date.now();
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const summary = summarizeStep(label, result, Date.now() - started);
  const details = summarizeOutput(result.stdout ?? "");
  if (summary.ok) {
    process.stdout.write(
      summary.text.trimEnd() + (details ? " — " + details : "") + "\n",
    );
    return;
  }

  let logPath;
  try {
    logPath = join(
      mkdtempSync(join(tmpdir(), "rss-dashboard-hook-")),
      "failure.log",
    );
    writeFileSync(logPath, summary.text + (result.error?.stack ?? ""));
  } catch {
    process.stderr.write(summary.text + (result.error?.stack ?? ""));
    process.exit(result.status ?? 1);
  }
  process.stderr.write(
    `[pre-commit] ${label} FAILED${details ? " — " + details : ""}. Full output: ${logPath}\n`,
  );
  process.exit(result.status ?? 1);
}

function main() {
  const plan = planStagedChecks(stagedPaths());

  if (plan.lint.length > 0) {
    const targets =
      plan.lint.length > MAX_EXPLICIT_LINT_FILES ? ["."] : plan.lint;
    runNode(
      `Linting ${plan.lint.length} staged file(s)...`,
      "node_modules/eslint/bin/eslint.js",
      [
        "--max-warnings=0",
        "--no-warn-ignored",
        "--suppressions-location",
        "scripts/eslint-suppressions.json",
        "--cache",
        "--cache-strategy",
        "content",
        "--cache-location",
        "node_modules/.cache/eslint/",
        ...targets,
      ],
    );
  }

  const vitest = "node_modules/vitest/vitest.mjs";
  const vitestArgs = ["--config", "vitest.config.mjs", "--reporter=dot"];
  if (plan.tests.mode === "all") {
    runNode(
      "Running the full unit suite...",
      vitest,
      ["run", ...vitestArgs],
      vitestFileSummary,
    );
  } else if (plan.tests.mode === "related") {
    runNode(
      "Running unit tests related to staged files...",
      vitest,
      [
        "related",
        "--run",
        "--passWithNoTests",
        ...vitestArgs,
        ...plan.tests.files,
      ],
      vitestFileSummary,
    );
  } else {
    process.stdout.write("[pre-commit] No staged code; skipping unit tests.\n");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
