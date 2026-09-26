import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");
const TSC_BIN = join(ROOT_DIR, "node_modules", "typescript", "bin", "tsc");

// Type errors the test type-check still reports in test files (#362). Lower it
// as they are fixed; the check fails if the count grows.
export const TEST_TYPE_ERROR_BASELINE = 92;

// Production code and the Obsidian stub must type-check cleanly under the
// test config too, so any error here fails regardless of the baseline.
const ZERO_ERROR_PATHS = [/^src\//, /^main\.ts$/, /^test_files\/stubs\//];

const ERROR_LINE = /^(.+?)\(\d+,\d+\): error TS\d+:/;

export function evaluateTestTypecheck(output, baseline) {
  const errors = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const match = ERROR_LINE.exec(rawLine);
    if (!match) {
      continue;
    }
    const file = match[1].replace(/\\/g, "/");
    errors.push({ file, line: rawLine.replace(match[1], file) });
  }

  const failures = errors
    .filter(({ file }) => ZERO_ERROR_PATHS.some((pattern) => pattern.test(file)))
    .map(({ line }) => `Must type-check cleanly: ${line}`);

  const testErrorCount = errors.length - failures.length;
  const notes = [];
  if (testErrorCount > baseline) {
    failures.push(
      `${testErrorCount} type error(s) in test files; the baseline is ${baseline}. Fix the new errors rather than raising the baseline.`,
    );
  } else if (testErrorCount < baseline) {
    notes.push(
      `Test type errors dropped to ${testErrorCount}: lower TEST_TYPE_ERROR_BASELINE to ${testErrorCount} in scripts/check-test-types.mjs.`,
    );
  }

  return { errorCount: testErrorCount, failures, notes };
}

function main() {
  const result = spawnSync(
    process.execPath,
    [
      TSC_BIN,
      "--noEmit",
      "--skipLibCheck",
      "--pretty",
      "false",
      "--incremental",
      "--tsBuildInfoFile",
      "node_modules/.cache/tsc/tests.tsbuildinfo",
      "-p",
      "test_files/tsconfig.json",
    ],
    { cwd: ROOT_DIR, encoding: "utf8" },
  );
  if (result.error) {
    throw result.error;
  }

  const { errorCount, failures, notes } = evaluateTestTypecheck(
    `${result.stdout}\n${result.stderr}`,
    TEST_TYPE_ERROR_BASELINE,
  );

  if (failures.length > 0) {
    console.error("Test type-check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  for (const note of notes) {
    console.warn(note);
  }
  console.log(
    `Test type-check passed (${errorCount} known test-file error(s), baseline ${TEST_TYPE_ERROR_BASELINE}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
