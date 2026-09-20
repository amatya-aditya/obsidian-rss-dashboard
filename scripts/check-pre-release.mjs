import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");
const PLANS_DIR = join(ROOT_DIR, "docs", "plans");
const RELEASE_NOTES_DIR = join(ROOT_DIR, "src", "release-notes", "notes");

const RELEASE_LINE_PATTERN = /^(\d+)\.(\d+)(?:\.|$)/;
const IMAGE_PATTERN = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;

const STRAY_FILE_PATTERNS = [
  /\.bak$/i,
  /\.orig$/i,
  /\.swp$/i,
  /\.swo$/i,
  /~$/,
  /^\.DS_Store$/,
  /^Thumbs\.db$/i,
];

// Statuses valid for a plan still sitting under docs/plans/. "implemented",
// "rejected", and "superseded" plans belong under docs/archive/plans/ per
// the Plan Lifecycle policy in docs/development/README.md.
const VALID_ACTIVE_PLAN_STATUSES = new Set([
  "idea",
  "proposed",
  "accepted",
  "blocked",
  "in-progress",
]);

const ISSUE_PLAN_FILENAME = /^\d+-[a-z0-9-]+\.md$/;
const DRAFT_PLAN_FILENAME = /^draft-\d{8}-[a-z0-9-]+\.md$/;

export function findStrayFiles(filePaths) {
  return filePaths.filter((filePath) =>
    STRAY_FILE_PATTERNS.some((pattern) => pattern.test(basename(filePath))),
  );
}

export function isLifecyclePlanFilename(fileName) {
  return ISSUE_PLAN_FILENAME.test(fileName) || DRAFT_PLAN_FILENAME.test(fileName);
}

function extractFrontmatterStatus(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return undefined;
  }

  const statusLine = match[1]
    .split(/\r?\n/)
    .find((line) => /^status:/.test(line.trim()));
  if (!statusLine) {
    return undefined;
  }

  return statusLine
    .slice(statusLine.indexOf(":") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

export function findPlanStatusIssues(planFiles) {
  const issues = [];

  for (const { fileName, filePath, source } of planFiles) {
    if (!isLifecyclePlanFilename(fileName)) {
      continue;
    }

    const status = extractFrontmatterStatus(source);
    if (!status) {
      issues.push({
        filePath,
        reason: "missing `status` frontmatter field",
      });
      continue;
    }

    if (!VALID_ACTIVE_PLAN_STATUSES.has(status)) {
      issues.push({
        filePath,
        reason:
          `status "${status}" is not valid for an active plan under docs/plans/ ` +
          `(expected one of: ${[...VALID_ACTIVE_PLAN_STATUSES].join(", ")}; ` +
          "an \"implemented\"/\"rejected\"/\"superseded\" plan belongs under docs/archive/plans/)",
      });
    }
  }

  return issues;
}

/**
 * The `major.minor` release line a version belongs to, or null when the string
 * is not a version this check can read.
 */
export function releaseLineOf(version) {
  const match = RELEASE_LINE_PATTERN.exec(String(version).trim());
  return match ? `${match[1]}.${match[2]}` : null;
}

/** Whether a version is a major/minor release, i.e. its patch part is zero. */
export function isMajorMinorRelease(version) {
  const core = String(version).split("-")[0] ?? "";
  const parts = core.split(".");
  return parts.length >= 3 && Number(parts[2]) === 0;
}

/**
 * Validates every curated What's New note: a top-level heading, and images
 * that are HTTPS and carry alt text.
 */
export function findNoteIssues(noteFiles) {
  const issues = [];

  for (const { filePath, source } of noteFiles) {
    if (!/^#\s+\S/m.test(source)) {
      issues.push({
        filePath,
        reason: "missing a top-level markdown heading",
      });
    }

    for (const match of source.matchAll(IMAGE_PATTERN)) {
      const alt = match[1] ?? "";
      const url = match[2] ?? "";
      if (!url.startsWith("https://")) {
        issues.push({
          filePath,
          reason: `image "${url}" is not an HTTPS URL`,
        });
      }
      if (alt.trim().length === 0) {
        issues.push({
          filePath,
          reason: `image "${url}" is missing alt text`,
        });
      }
    }
  }

  return issues;
}

/**
 * A major/minor release must ship a note for its release line. Patch releases
 * need none, so the check stays out of the way of bug-fix releases.
 */
export function findMissingNoteIssue(manifestVersion, noteFileNames) {
  if (!isMajorMinorRelease(manifestVersion)) {
    return null;
  }

  const releaseLine = releaseLineOf(manifestVersion);
  if (releaseLine && noteFileNames.includes(`${releaseLine}.md`)) {
    return null;
  }

  return {
    filePath: "src/release-notes/notes",
    reason: `no What's New note for release line ${releaseLine ?? manifestVersion}`,
  };
}

function getTrackedFiles() {
  const output = execFileSync("git", ["ls-files"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listActivePlanFiles() {
  let entries;
  try {
    entries = readdirSync(PLANS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const absolutePath = join(PLANS_DIR, entry.name);
      return {
        fileName: entry.name,
        filePath: relative(ROOT_DIR, absolutePath).replace(/\\/g, "/"),
        source: readFileSync(absolutePath, "utf8"),
      };
    });
}

function listReleaseNoteFiles() {
  let entries;
  try {
    entries = readdirSync(RELEASE_NOTES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const absolutePath = join(RELEASE_NOTES_DIR, entry.name);
      return {
        fileName: entry.name,
        filePath: relative(ROOT_DIR, absolutePath).replace(/\\/g, "/"),
        source: readFileSync(absolutePath, "utf8"),
      };
    });
}

function readManifestVersion() {
  try {
    return JSON.parse(readFileSync(join(ROOT_DIR, "manifest.json"), "utf8"))
      .version;
  } catch {
    return null;
  }
}

function main() {
  const trackedFiles = getTrackedFiles();
  const strayFiles = findStrayFiles(trackedFiles);
  const activePlanFiles = listActivePlanFiles();
  const planStatusIssues = findPlanStatusIssues(activePlanFiles);
  const releaseNoteFiles = listReleaseNoteFiles();
  const noteIssues = findNoteIssues(releaseNoteFiles);
  const manifestVersion = readManifestVersion();
  const missingNoteIssue = manifestVersion
    ? findMissingNoteIssue(
        manifestVersion,
        releaseNoteFiles.map((note) => note.fileName),
      )
    : null;

  let failed = false;

  if (strayFiles.length > 0) {
    failed = true;
    console.error(
      `Pre-release check failed: ${strayFiles.length} stray file(s) tracked in the repo.`,
    );
    for (const filePath of strayFiles) {
      console.error(`- ${filePath}`);
    }
  }

  if (planStatusIssues.length > 0) {
    failed = true;
    console.error(
      `Pre-release check failed: ${planStatusIssues.length} plan(s) under docs/plans/ ` +
        "have a missing or invalid status.",
    );
    for (const issue of planStatusIssues) {
      console.error(`- ${issue.filePath}: ${issue.reason}`);
    }
  }

  if (noteIssues.length > 0) {
    failed = true;
    console.error(
      `Pre-release check failed: ${noteIssues.length} issue(s) in curated What's New notes.`,
    );
    for (const issue of noteIssues) {
      console.error(`- ${issue.filePath}: ${issue.reason}`);
    }
  }

  if (missingNoteIssue) {
    failed = true;
    console.error(
      "Pre-release check failed: the running version is a major/minor release " +
        "with no curated What's New note.",
    );
    console.error(`- ${missingNoteIssue.filePath}: ${missingNoteIssue.reason}`);
  }

  if (failed) {
    console.error(
      "\nSee docs/development/pre-release-checklist.md for the full pre-release checklist, " +
        "including the manual steps this script does not automate.",
    );
    process.exit(1);
  }

  console.log(
    `Pre-release check passed (${trackedFiles.length} tracked file(s) scanned, ` +
      `${activePlanFiles.length} active plan(s) validated, ` +
      `${releaseNoteFiles.length} What's New note(s) validated).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
