import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");
const PLANS_DIR = join(ROOT_DIR, "docs", "plans");
const RELEASE_NOTES_DIR = join(ROOT_DIR, "src", "release-notes", "notes");

const RELEASE_LINE_PATTERN = /^(\d+)\.(\d+)(?:\.|$)/;
const RELEASE_NOTE_FILENAME_PATTERN = /^(\d+)\.(\d+)(?:\.(\d+))?\.md$/;
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

// eslint-disable-next-line no-control-regex -- control characters in a path are exactly what this flags
const HOSTILE_NAME_PATTERN = /[ [\]`:*?"<>|–—\u0000-\u001f]/g;
const CATALOG_LINK_PATTERN = /\(([^)]+\.md)\)/g;
const CATALOG_EXEMPT_FILENAMES = /^(public-roadmap|release-v[\d.]+-roadmap)\.md$/;
const ARCHIVED_PLANS_PREFIX = "docs/archive/plans/";

const ISSUE_PLAN_FILENAME = /^\d+-[a-z0-9-]+\.md$/;
const DRAFT_PLAN_FILENAME = /^draft-\d{8}-[a-z0-9-]+\.md$/;

export function findStrayFiles(filePaths) {
  return filePaths.filter((filePath) =>
    STRAY_FILE_PATTERNS.some((pattern) => pattern.test(basename(filePath))),
  );
}

/**
 * Characters that make a path awkward to handle: spaces and brackets break
 * unquoted shell and glob use, backticks invite command substitution, and the
 * rest are illegal in Windows filenames. Em- and en-dashes are included
 * because they look identical to a hyphen in a terminal but do not match one.
 */
export function findHostileFilenames(filePaths) {
  return filePaths
    .map((filePath) => {
      const fileName = basename(filePath);
      const offenders = [...new Set(fileName.match(HOSTILE_NAME_PATTERN) ?? [])];

      if (offenders.length === 0) {
        return null;
      }

      return {
        filePath,
        reason: `filename contains ${offenders
          .map((character) => (character === " " ? "a space" : `"${character}"`))
          .join(", ")}; use kebab-case`,
      };
    })
    .filter((issue) => issue !== null);
}

/**
 * Every archived plan must appear in the archive catalog, and every catalog
 * entry must point at a file that exists. Coordination roadmaps are exempt:
 * docs/archive/document-inventory.md records them as living documents rather
 * than archived implementation records.
 */
export function findCatalogParityIssues(catalogSource, archivedPlanPaths) {
  const listed = new Set();

  for (const match of catalogSource.matchAll(CATALOG_LINK_PATTERN)) {
    const target = match[1].split("#")[0];

    if (!target.startsWith("http")) {
      listed.add(normalizeCatalogPath(target));
    }
  }

  return archivedPlanPaths
    .filter((filePath) => !CATALOG_EXEMPT_FILENAMES.test(basename(filePath)))
    .filter((filePath) => !listed.has(filePath.replace(/\\/g, "/")))
    .map((filePath) => ({
      filePath,
      reason: "archived but missing from the catalog in docs/archive/README.md",
    }));
}

function normalizeCatalogPath(target) {
  return join("docs", "archive", target).replace(/\\/g, "/");
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
 * Validates the release-note naming contract: one note per release line, plus
 * optional notes for non-zero patch releases.
 */
export function findReleaseNoteFilenameIssues(noteFiles) {
  const issues = [];

  for (const { fileName, filePath } of noteFiles) {
    const match = RELEASE_NOTE_FILENAME_PATTERN.exec(fileName);
    const patch = match?.[3];
    if (!match || (patch !== undefined && Number(patch) === 0)) {
      issues.push({
        filePath,
        reason:
          "filename must be <major>.<minor>.md or <major>.<minor>.<non-zero-patch>.md",
      });
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

function readFileOrEmpty(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function getTrackedFiles() {
  // -z keeps paths raw: without it git quotes and escapes any path holding a
  // space or non-ASCII character, which is exactly what the filename check
  // below is looking for.
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return output.split("\0").filter(Boolean);
}

/**
 * Tracked paths still matched by .gitignore. Git honours the index over
 * .gitignore, so these keep working while a *new* sibling file would silently
 * fail to stage — the contradiction is invisible until it bites.
 */
function getTrackedButIgnoredFiles() {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-z", "-i", "-c", "--exclude-standard"],
      { cwd: ROOT_DIR, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    return output.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

function listActivePlanFiles() {
  let entries;
  try {
    entries = readdirSync(PLANS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile())
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
  const hostileNameIssues = findHostileFilenames(trackedFiles);
  const trackedButIgnored = getTrackedButIgnoredFiles();
  const archivedPlanPaths = trackedFiles.filter(
    (filePath) =>
      filePath.startsWith(ARCHIVED_PLANS_PREFIX) &&
      filePath.endsWith(".md") &&
      !filePath.toLowerCase().endsWith("/readme.md"),
  );
  const catalogParityIssues = findCatalogParityIssues(
    readFileOrEmpty(join(ROOT_DIR, "docs", "archive", "README.md")),
    archivedPlanPaths,
  );
  const activePlanFiles = listActivePlanFiles();
  const planStatusIssues = findPlanStatusIssues(activePlanFiles);
  const releaseNoteFiles = listReleaseNoteFiles();
  const noteFilenameIssues = findReleaseNoteFilenameIssues(releaseNoteFiles);
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

  if (hostileNameIssues.length > 0) {
    failed = true;
    console.error(
      `Pre-release check failed: ${hostileNameIssues.length} tracked file(s) with a ` +
        "filename that is awkward to handle.",
    );
    for (const issue of hostileNameIssues) {
      console.error(`- ${issue.filePath}: ${issue.reason}`);
    }
  }

  if (trackedButIgnored.length > 0) {
    failed = true;
    console.error(
      `Pre-release check failed: ${trackedButIgnored.length} tracked file(s) are also ` +
        "matched by .gitignore.",
    );
    for (const filePath of trackedButIgnored) {
      console.error(
        `- ${filePath}: tracked but ignored; a new file beside it would not stage`,
      );
    }
  }

  if (catalogParityIssues.length > 0) {
    failed = true;
    console.error(
      `Pre-release check failed: ${catalogParityIssues.length} archived plan(s) missing ` +
        "from the archive catalog.",
    );
    for (const issue of catalogParityIssues) {
      console.error(`- ${issue.filePath}: ${issue.reason}`);
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

  if (noteFilenameIssues.length > 0) {
    failed = true;
    console.error(
      `Pre-release check failed: ${noteFilenameIssues.length} invalid What's New note filename(s).`,
    );
    for (const issue of noteFilenameIssues) {
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
