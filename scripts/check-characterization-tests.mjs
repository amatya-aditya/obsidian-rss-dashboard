import { execFileSync } from "node:child_process";

// Refactor PRs must keep characterization tests read-only (#436): they pin
// current behavior, so a refactor that has to change one is not
// behavior-preserving. New characterization tests may be added.
const CHARACTERIZATION_SUFFIX = ".characterization.test.ts";

const baseReference = process.argv[2];
if (!baseReference) {
  console.error(
    "Usage: node scripts/check-characterization-tests.mjs <base-ref>",
  );
  process.exit(2);
}

function isCharacterizationTest(filePath) {
  return filePath.endsWith(CHARACTERIZATION_SUFFIX);
}

// One `git diff --name-status -M` line: a status letter (with a similarity
// score for renames and copies) followed by one path, or two for R and C.
function parseNameStatusLine(line) {
  const [status, ...paths] = line.split("\t");
  return { status: status.charAt(0), paths };
}

// Returns a reason string when the change touches a protected test, or null.
// Adding a test, or copying one (the original stays untouched), is allowed.
// A rename away from a protected path counts even at 100% similarity, since
// moving the test changes what reviewers see as pinned.
function describeProtectedChange({ status, paths }) {
  const [sourcePath] = paths;
  if (!isCharacterizationTest(sourcePath)) return null;
  if (status === "M") return "modified " + sourcePath;
  if (status === "D") return "deleted " + sourcePath;
  if (status === "T") return "changed the file type of " + sourcePath;
  if (status === "R") return "renamed " + sourcePath + " to " + paths[1];
  return null;
}

const diffOutput = execFileSync(
  "git",
  ["diff", "--name-status", "-M", baseReference + "...HEAD"],
  { encoding: "utf8" },
);

const violations = diffOutput
  .split(/\r?\n/)
  .filter(Boolean)
  .map(parseNameStatusLine)
  .map(describeProtectedChange)
  .filter(Boolean);

if (violations.length === 0) {
  console.log(
    "Characterization tests: no protected test changed against " +
      baseReference +
      ".",
  );
} else {
  for (const violation of violations) console.error("ERROR " + violation);
  console.error(
    "Refactor PRs may not change characterization tests. If the pinned behavior must change, do it in a separate, non-refactor PR first.",
  );
  process.exitCode = 1;
}
