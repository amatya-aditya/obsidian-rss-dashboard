import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findMissingNoteIssue,
  isMajorMinorRelease,
  releaseLineOf,
} from "./check-pre-release.mjs";

const ROOT_DIR = join(import.meta.dirname, "..");
const RELEASE_NOTES_DIR = join(ROOT_DIR, "src", "release-notes", "notes");
const PUBLIC_RELEASE_NOTES_DIR = join(ROOT_DIR, "docs", "releases");
const TARGET_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Whether the string is a version this check can act on. Accepts a plain
 * release (2.7.0) or a prerelease (2.7.0-beta.1).
 */
export function isValidTargetVersion(version) {
  return TARGET_VERSION_PATTERN.test(String(version).trim());
}

/** Whether the version carries a prerelease suffix, e.g. 2.7.0-beta.1. */
export function isPrerelease(version) {
  return String(version).includes("-");
}

/**
 * `CHANGELOG.md` must already carry the target version's heading — renaming
 * `## Unreleased` is release-prep work, deliberately not part of the version
 * bump commit (see CONTRIBUTING.md Step 6).
 */
export function findChangelogHeadingIssue(changelogSource, version) {
  const headingPattern = new RegExp(
    `^##\\s+\\[?${escapeForPattern(version)}\\]?\\s+-\\s+\\S`,
    "m",
  );

  if (headingPattern.test(changelogSource)) {
    return null;
  }

  return {
    filePath: "CHANGELOG.md",
    reason: `no "## ${version} - <date>" heading; rename the Unreleased heading first`,
  };
}

/**
 * An `Unreleased` section still holding entries at ship time means the
 * changelog was not finalized — those entries would ship unlabelled.
 */
export function findUnreleasedLeftoverIssue(changelogSource) {
  const heading = /^##\s+Unreleased\s*$/m.exec(changelogSource);

  if (!heading) {
    return null;
  }

  const afterHeading = changelogSource.slice(
    heading.index + heading[0].length,
  );
  const nextHeading = /^##\s/m.exec(afterHeading);
  const section = nextHeading
    ? afterHeading.slice(0, nextHeading.index)
    : afterHeading;

  // Empty type sub-headings (### Features, ### Bug Fixes) are structure, not
  // entries — only real content counts as an unfinalized changelog.
  const body = section.replace(/^###\s+.*$/gm, "").trim();

  if (body.length === 0) {
    return null;
  }

  return {
    filePath: "CHANGELOG.md",
    reason:
      "the Unreleased section still has entries; move them under the release heading",
  };
}

/**
 * Every shipped version gets a consolidated, public-facing summary under
 * docs/releases/ (see release-notes-workflow.md step 6).
 */
export function findPublicReleaseNotesIssue(version, publicNoteFileNames) {
  // Betas are announced to testers via BRAT, not to the wider audience, so
  // docs/releases/ only ever carries stable versions.
  if (isPrerelease(version)) {
    return null;
  }

  if (publicNoteFileNames.includes(`${version}.md`)) {
    return null;
  }

  return {
    filePath: `docs/releases/${version}.md`,
    reason: "no public-facing release summary for this version",
  };
}

/**
 * `npm version` only adds a versions.json entry when the target is absent, so
 * a version already listed means the bump silently skips part of its work —
 * the signature of a premature bump landing on dev.
 */
export function findPrematureBumpIssue(version, versionsMap) {
  if (!Object.prototype.hasOwnProperty.call(versionsMap, version)) {
    return null;
  }

  return {
    filePath: "versions.json",
    reason: `${version} is already listed; the version bump was applied early and would be a partial no-op`,
  };
}

/**
 * Release-bound plans move from docs/archive/plans/unreleased/ into the
 * version's own archive folder at ship time (release-notes-workflow.md step 10).
 */
export function findUnarchivedPlanIssues(unreleasedPlanPaths, version) {
  return unreleasedPlanPaths.map((filePath) => ({
    filePath,
    reason: `still unreleased; move it to docs/archive/plans/v${version}/ and update released_in`,
  }));
}

/** The working tree must be clean before the release commit is built. */
export function findWorkingTreeIssue(porcelainOutput) {
  const dirtyPaths = porcelainOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (dirtyPaths.length === 0) {
    return null;
  }

  return {
    filePath: ".",
    reason: `${dirtyPaths.length} uncommitted or untracked path(s); commit or clean them first`,
  };
}

function escapeForPattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readFileOrEmpty(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listMarkdownFileNames(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
}

/**
 * Every tracked plan still under docs/archive/plans/unreleased/, including
 * ones nested in a plan's own ticket folder. Enumerated through git so the
 * listing recurses and ignores anything untracked.
 */
function listUnreleasedPlanPaths() {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-z", "docs/archive/plans/unreleased"],
      { cwd: ROOT_DIR, encoding: "utf8" },
    );

    return output
      .split("\0")
      .filter(
        (filePath) =>
          filePath.endsWith(".md") &&
          !filePath.toLowerCase().endsWith("/readme.md"),
      );
  } catch {
    return [];
  }
}

function readVersionsMap() {
  try {
    return JSON.parse(readFileSync(join(ROOT_DIR, "versions.json"), "utf8"));
  } catch {
    return {};
  }
}

function readWorkingTreeStatus() {
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}

function reportIssue(issue) {
  console.error(`- ${issue.filePath}: ${issue.reason}`);
}

function main() {
  const targetVersion = (process.argv[2] ?? "").trim();

  if (!isValidTargetVersion(targetVersion)) {
    console.error(
      "Release-ready check failed: pass the version you are about to ship.",
    );
    console.error("\n  npm run check:release-ready -- 2.7.0\n");
    process.exit(1);
  }

  const changelogSource = readFileOrEmpty(join(ROOT_DIR, "CHANGELOG.md"));
  const issues = [
    findChangelogHeadingIssue(changelogSource, targetVersion),
    findUnreleasedLeftoverIssue(changelogSource),
    findPublicReleaseNotesIssue(
      targetVersion,
      listMarkdownFileNames(PUBLIC_RELEASE_NOTES_DIR),
    ),
    findMissingNoteIssue(
      targetVersion,
      listMarkdownFileNames(RELEASE_NOTES_DIR),
    ),
    findPrematureBumpIssue(targetVersion, readVersionsMap()),
    findWorkingTreeIssue(readWorkingTreeStatus()),
    ...findUnarchivedPlanIssues(listUnreleasedPlanPaths(), targetVersion),
  ].filter((issue) => issue !== null);

  if (issues.length > 0) {
    console.error(
      `Release-ready check failed: ${issues.length} item(s) outstanding for ${targetVersion}.`,
    );
    for (const issue of issues) {
      reportIssue(issue);
    }
    console.error(
      "\nSee CONTRIBUTING.md Step 6 and docs/development/pre-release-checklist.md.",
    );
    process.exit(1);
  }

  const releaseLine = releaseLineOf(targetVersion);
  const noteScope = isMajorMinorRelease(targetVersion)
    ? `curated What's New note for ${releaseLine}`
    : "patch release (curated note optional)";

  console.log(
    `Release-ready check passed for ${targetVersion} ` +
      `(changelog heading, public summary, ${noteScope}, ` +
      `versions.json, clean tree, archived plans).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
