import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { extractLinks, resolveTarget } from "./check-doc-links.mjs";
import { isGitCheckout, skipWithoutGit } from "./git-repository.mjs";

const ROOT_DIR = join(import.meta.dirname, "..");

// Release notes and the changelog are audited by their own rules (the What's
// New note checks and check:release-ready), so this audit leaves them out.
const EXCLUDED_PATHS = new Set([
  "CHANGELOG.md",
  "docs/development/whats-new-note-template.md",
]);
const EXCLUDED_PREFIXES = ["docs/releases/", "src/release-notes/"];

const ADR_STATUSES = new Set([
  "proposed",
  "accepted",
  "superseded",
  "deprecated",
  "rejected",
]);
const ADR_NON_DECISION_FILES = new Set([
  "README.md",
  "POLICY.md",
  "ADR-TEMPLATE.md",
]);
const ADR_FILE_PATTERN = /^(\d{4})-[a-z0-9]+(?:[.-][a-z0-9]+)*\.md$/;
const ADR_REQUIRED_SECTIONS = [
  "Status",
  "Date",
  "Context and problem",
  "Decision",
  "Consequences",
];

// Markdown may live only where the repo expects it. Anything else is stray.
const ROOT_MARKDOWN = new Set([
  "README.md",
  "AGENTS.md",
  "CONTEXT.md",
  "CONTRIBUTING.md",
  "ACCESSIBILITY.md",
  "THIRD-PARTY.md",
  ".instructions.md",
]);
const MARKDOWN_HOMES = [
  /^docs\//,
  /^\.agents\//,
  /^\.github\//,
  /^test_files\//,
  /^src\/(?:[^/]+\/)*README\.md$/,
];

// Lowercase kebab-case, with dots allowed for version-prefixed names. Names
// outside this pattern must be a conventional name (GitHub, Obsidian, or
// repo-defined) listed here.
const KEBAB_FILE_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.md$/;
const CONVENTIONAL_NAMES = new Set([
  "README.md",
  "SKILL.md",
  "CREDITS.md",
  "POLICY.md",
  "ADR-TEMPLATE.md",
  "SECURITY.md",
  "AGENTS.md",
  "CONTEXT.md",
  "CONTRIBUTING.md",
  "ACCESSIBILITY.md",
  "THIRD-PARTY.md",
  "CHANGELOG.md",
  "PULL_REQUEST_TEMPLATE.md",
  "bug_report.md",
  "feature_request.md",
  "refactor.md",
  ".instructions.md",
]);

const ARCHIVED_PLANS_PREFIX = "docs/archive/plans/";
const ADR_INDEX = "docs/adr/README.md";

/** Whether a repo-relative path is out of scope for this audit. */
export function isExcludedPath(filePath) {
  return (
    EXCLUDED_PATHS.has(filePath) ||
    EXCLUDED_PREFIXES.some((prefix) => filePath.startsWith(prefix))
  );
}

/**
 * Parses `git diff --name-status -M` output. Renames and copies carry the old
 * path, and their similarity score, in addition to the new path.
 */
export function parseNameStatus(output) {
  return output
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [code, ...paths] = line.split("\t");
      const kind = code.charAt(0);

      if (kind === "R" || kind === "C") {
        return {
          status: kind,
          filePath: paths[1],
          oldPath: paths[0],
          similarity: Number(code.slice(1)),
        };
      }

      return { status: kind, filePath: paths[0] };
    })
    .filter((entry) => !isExcludedPath(entry.filePath));
}

/** The text under a `## Heading`, up to the next level-2 heading. */
function sectionBody(source, heading) {
  const start = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m").exec(
    source,
  );

  if (!start) {
    return null;
  }

  const rest = source.slice(start.index + start[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The first word of the Status section, lowercased: `accepted`, `proposed`. */
function adrStatusOf(source) {
  const body = sectionBody(source, "Status") ?? "";
  const first = /[a-z]+/i.exec(body.trim());
  return first ? first[0].toLowerCase() : null;
}

/**
 * Validates ADR metadata against docs/adr/POLICY.md and checks that the index
 * (docs/adr/README.md) lists every decision with a matching status. Each
 * finding names the ADR file it concerns, so a fix points somewhere editable.
 */
export function findAdrIssues(adrFiles, indexSource) {
  const issues = [];
  const numbers = new Map();

  for (const { filePath, source } of adrFiles) {
    const fileName = basename(filePath);

    if (ADR_NON_DECISION_FILES.has(fileName)) {
      continue;
    }

    const match = ADR_FILE_PATTERN.exec(fileName);
    if (!match) {
      issues.push({
        rule: "adr-filename",
        filePath,
        reason: "filename must be NNNN-short-kebab-title.md",
      });
      continue;
    }

    const number = match[1];
    numbers.set(number, [...(numbers.get(number) ?? []), filePath]);

    for (const heading of ADR_REQUIRED_SECTIONS) {
      if (sectionBody(source, heading) === null) {
        issues.push({
          rule: "adr-sections",
          filePath,
          reason: `missing "## ${heading}" section`,
        });
      }
    }

    const status = adrStatusOf(source);
    if (!status || !ADR_STATUSES.has(status)) {
      issues.push({
        rule: "adr-status",
        filePath,
        reason: `Status must be one of ${[...ADR_STATUSES].join(", ")}`,
      });
    } else if (status === "superseded") {
      const statusBody = sectionBody(source, "Status") ?? "";
      if (!/\]\([^)]*\d{4}-[^)]*\.md/.test(statusBody)) {
        issues.push({
          rule: "adr-superseded-link",
          filePath,
          reason: "superseded ADR must link the ADR that replaced it",
        });
      }
    }

    const dateBody = sectionBody(source, "Date") ?? "";
    if (!/\d{4}-\d{2}-\d{2}/.test(dateBody)) {
      issues.push({
        rule: "adr-date",
        filePath,
        reason: "Date section must contain a YYYY-MM-DD date",
      });
    }
  }

  for (const [number, paths] of numbers) {
    if (paths.length > 1) {
      issues.push({
        rule: "adr-duplicate-id",
        filePath: paths[1],
        reason: `ADR number ${number} is used by ${paths.length} files`,
      });
    }
  }

  issues.push(...findAdrIndexIssues(adrFiles, indexSource));
  return issues;
}

function findAdrIndexIssues(adrFiles, indexSource) {
  const issues = [];
  const indexRows = new Map();
  const rowPattern =
    /^\|\s*\[(\d{4})\]\([^)]*\)\s*\|[^|]*\|\s*([A-Za-z]+)\s*\|/gm;

  for (const match of indexSource.matchAll(rowPattern)) {
    indexRows.set(match[1], match[2].toLowerCase());
  }

  for (const { filePath, source } of adrFiles) {
    const fileName = basename(filePath);
    const match = ADR_FILE_PATTERN.exec(fileName);

    if (ADR_NON_DECISION_FILES.has(fileName) || !match) {
      continue;
    }

    if (!indexRows.has(match[1])) {
      issues.push({
        rule: "adr-index",
        filePath,
        reason: `not listed in the ADR index (${ADR_INDEX})`,
      });
      continue;
    }

    const indexed = indexRows.get(match[1]);
    const status = adrStatusOf(source);
    if (indexed !== status) {
      issues.push({
        rule: "adr-index",
        filePath,
        reason: `index lists status "${indexed}" but the file says "${status}"`,
      });
    }
  }

  return issues;
}

/** Markdown outside the directories the repo uses for documentation. */
export function findStrayMarkdown(filePaths) {
  return filePaths
    .filter((filePath) => {
      if (!filePath.includes("/")) {
        return !ROOT_MARKDOWN.has(filePath);
      }
      return !MARKDOWN_HOMES.some((home) => home.test(filePath));
    })
    .map((filePath) => ({
      rule: "stray-markdown",
      filePath,
      reason:
        "Markdown outside the documented homes (docs/, .agents/, .github/, test_files/, src/**/README.md, or a root document)",
    }));
}

/** Filenames that are neither kebab-case nor a conventional name. */
export function findNamingIssues(filePaths) {
  return filePaths
    .filter(
      (filePath) =>
        !KEBAB_FILE_PATTERN.test(basename(filePath)) &&
        !CONVENTIONAL_NAMES.has(basename(filePath)),
    )
    .map((filePath) => ({
      rule: "naming",
      filePath,
      reason: "filename must be lowercase kebab-case, or a conventional name",
    }));
}

/**
 * Documents under docs/ that no other tracked Markdown file links to. A
 * warning, not a failure: an orphan can be a deliberate entry point.
 */
export function findOrphanDocuments(documents) {
  const inbound = new Set();

  for (const { filePath, source } of documents) {
    for (const link of extractLinks(source)) {
      const { resolved, inside } = resolveTarget(
        ROOT_DIR,
        filePath,
        link.target,
      );
      if (inside) {
        inbound.add(relative(ROOT_DIR, resolved).replace(/\\/g, "/"));
      }
    }
  }

  return documents
    .filter(({ filePath }) => filePath.startsWith("docs/"))
    .filter(({ filePath }) => !filePath.startsWith("docs/archive/"))
    .filter(({ filePath }) => basename(filePath) !== "README.md")
    .filter(({ filePath }) => !inbound.has(filePath))
    .map(({ filePath }) => ({
      rule: "orphan",
      filePath,
      reason: "no other tracked document links to this file",
    }));
}

/** Archived plans carry a frontmatter block recording their outcome. */
export function findArchivedPlanFrontmatterIssues(documents) {
  return documents
    .filter(({ filePath }) => filePath.startsWith(ARCHIVED_PLANS_PREFIX))
    .filter(({ filePath }) => basename(filePath) !== "README.md")
    .filter(({ source }) => !/^---\r?\n[\s\S]*?\r?\n---/.test(source))
    .map(({ filePath }) => ({
      rule: "archive-frontmatter",
      filePath,
      reason: "archived plan has no frontmatter block recording its outcome",
    }));
}

/**
 * Severity for each finding. Orphans only warn. A rule break in a document
 * this change added or modified fails the audit. A break in an untouched
 * document is historical: recorded, but not blocking.
 */
export function classifyFindings(findings, changedPaths) {
  return findings
    .map((finding) => {
      let severity = "historical";
      if (finding.rule === "orphan") {
        severity = "warn";
      } else if (changedPaths.has(finding.filePath)) {
        severity = "fail";
      }
      return { ...finding, severity };
    })
    .sort(
      (a, b) =>
        a.severity.localeCompare(b.severity) ||
        a.filePath.localeCompare(b.filePath) ||
        a.rule.localeCompare(b.rule),
    );
}

/** Runs every rule over a set of documents, given as {filePath, source}. */
export function runRules(documents, changedPaths) {
  const markdownPaths = documents.map((document) => document.filePath);
  const adrFiles = documents.filter(({ filePath }) =>
    filePath.startsWith("docs/adr/"),
  );
  const indexSource =
    documents.find(({ filePath }) => filePath === ADR_INDEX)?.source ?? "";

  const findings = [
    ...findAdrIssues(adrFiles, indexSource),
    ...findStrayMarkdown(markdownPaths),
    ...findNamingIssues(markdownPaths),
    ...findArchivedPlanFrontmatterIssues(documents),
    ...findOrphanDocuments(documents),
  ];

  return classifyFindings(findings, changedPaths);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function refExists(ref) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the full audit against committed content: the diff between `base`
 * and `head`, and every tracked Markdown document at `head`. Returns null when
 * `base` is missing, so a checkout without it is skipped with a notice.
 */
export function buildDocsAudit({ base, head }) {
  if (!refExists(base) || !refExists(head)) {
    return null;
  }

  const diff = parseNameStatus(
    git(["diff", "-M", "--name-status", base, head, "--", "*.md"]),
  );
  // A document is "changed" when its content was added or edited. A pure
  // rename (100% similar) moved a file without touching it, so its gaps
  // predate this change and stay historical.
  const changedPaths = new Set(
    diff
      .filter(
        (entry) =>
          entry.status === "A" ||
          entry.status === "M" ||
          (entry.status === "R" && entry.similarity < 100),
      )
      .map((entry) => entry.filePath),
  );
  const documents = git(["ls-tree", "-r", "--name-only", head])
    .split("\n")
    .filter((filePath) => filePath.endsWith(".md") && !isExcludedPath(filePath))
    .map((filePath) => ({
      filePath,
      source: git(["show", `${head}:${filePath}`]),
    }));

  return {
    base,
    head,
    diff,
    documentCount: documents.length,
    findings: runRules(documents, changedPaths),
  };
}

function diffSection(title, entries) {
  if (entries.length === 0) {
    return `### ${title}\n\nNone.\n`;
  }

  const rows = entries
    .map(
      (entry) =>
        `| \`${entry.filePath}\` | ${entry.oldPath ? `\`${entry.oldPath}\`` : "-"} |`,
    )
    .join("\n");
  return `### ${title} (${entries.length})\n\n| File | Previous path |\n| --- | --- |\n${rows}\n`;
}

function findingSection(title, findings) {
  if (findings.length === 0) {
    return `### ${title}\n\nNone.\n`;
  }

  const rows = findings
    .map(
      (finding) =>
        `- \`${finding.filePath}\` (${finding.rule}): ${finding.reason}`,
    )
    .join("\n");
  return `### ${title} (${findings.length})\n\n${rows}\n`;
}

/** Markdown report: the diff against base, then findings by severity. */
export function renderReport(audit) {
  const byStatus = (code) =>
    audit.diff
      .filter((entry) => entry.status === code)
      .sort((a, b) => a.filePath.localeCompare(b.filePath));
  const bySeverity = (severity) =>
    audit.findings.filter((finding) => finding.severity === severity);

  return [
    `# Docs audit: ${audit.base}...${audit.head}`,
    "",
    `Documents checked: ${audit.documentCount}. Fail: ${bySeverity("fail").length}. Historical: ${bySeverity("historical").length}. Warn: ${bySeverity("warn").length}.`,
    "",
    "## Changes since base",
    "",
    diffSection("New", byStatus("A")),
    diffSection("Changed", byStatus("M")),
    diffSection("Renamed", byStatus("R")),
    diffSection("Deleted", byStatus("D")),
    "## Findings",
    "",
    findingSection("Fail (blocks the release)", bySeverity("fail")),
    findingSection(
      "Historical (recorded, not blocking)",
      bySeverity("historical"),
    ),
    findingSection("Warn", bySeverity("warn")),
  ].join("\n");
}

/** Release-gate items for check:release-ready: only failing findings. */
export function findDocsAuditIssues(audit) {
  return audit.findings
    .filter((finding) => finding.severity === "fail")
    .map((finding) => ({
      filePath: finding.filePath,
      reason: `docs audit (${finding.rule}): ${finding.reason}`,
    }));
}

function parseArgs(argv) {
  const options = { base: "origin/master", head: "HEAD", out: null };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") {
      options.base = argv[(index += 1)];
    } else if (arg === "--head") {
      options.head = argv[(index += 1)];
    } else if (arg === "--out") {
      options.out = argv[(index += 1)];
    }
  }

  return options;
}

function main() {
  if (!isGitCheckout(ROOT_DIR)) {
    skipWithoutGit("check:docs-audit");
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const audit = buildDocsAudit(options);

  if (!audit) {
    console.log(
      `check:docs-audit: ${options.base} or ${options.head} is not available locally, so the audit is skipped. Run git fetch origin first.`,
    );
    return;
  }

  const report = renderReport(audit);
  console.log(report);

  if (options.out) {
    writeFileSync(options.out, `${report}\n`, "utf8");
  }

  if (findDocsAuditIssues(audit).length > 0) {
    console.error(
      "\ncheck:docs-audit failed: new or changed documents break the documentation rules. See docs/development/docs-audit-checklist.md.",
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
