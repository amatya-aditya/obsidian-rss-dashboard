import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");

// Historical records are frozen: they describe the repo as it was, and their
// links were written against a layout that has since moved. Rewriting them
// would falsify the record, so they are documented rather than enforced.
const EXCLUDED_PREFIXES = ["docs/archive/"];

// node_modules is not tracked, so a link into it resolves only after an
// install — present in CI and a normal clone, absent in a bare worktree.
const UNCHECKABLE_PREFIXES = ["node_modules/"];

const LINK_PATTERN = /\[([^\]]*)\]\(\s*([^)\s]+?)\s*(?:\s+["'][^"']*["'])?\)/g;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Markdown with fenced blocks and inline code spans blanked out, so link
 * syntax quoted as an example is not mistaken for a real link.
 */
export function stripCode(markdown) {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "");
}

/** Link targets worth resolving: relative paths, not URLs or bare anchors. */
export function isCheckableTarget(target) {
  if (!target || target.startsWith("#")) {
    return false;
  }

  if (SCHEME_PATTERN.test(target)) {
    return false;
  }

  return Boolean(target.split("#")[0]);
}

/**
 * Whether a resolved, repo-relative path is one this check can assert on.
 * A link into node_modules is valid in a normal clone but absent until an
 * install has run, so it is skipped rather than reported.
 */
export function isCheckablePath(repoRelativePath) {
  const normalized = repoRelativePath.replace(/\\/g, "/");
  return !UNCHECKABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Whether a file's links are enforced, or only recorded. */
export function isEnforcedFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return !EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Every checkable link target in the document, with the 1-indexed line it sits
 * on, so a failure points at somewhere editable.
 */
export function extractLinks(markdown) {
  const source = stripCode(markdown);
  const links = [];

  for (const match of source.matchAll(LINK_PATTERN)) {
    const target = match[2];

    if (!isCheckableTarget(target)) {
      continue;
    }

    links.push({
      target,
      text: match[1],
      line: source.slice(0, match.index).split("\n").length,
    });
  }

  return links;
}

/**
 * Resolves a link against the document holding it, rejecting one that escapes
 * the repository entirely.
 */
export function resolveTarget(rootDir, filePath, target) {
  const path = target.split("#")[0];
  const resolved = resolve(dirname(join(rootDir, filePath)), path);
  const inside = !relative(rootDir, resolved).startsWith("..");

  return { resolved, inside };
}

function listTrackedMarkdown() {
  const output = execFileSync("git", ["ls-files", "-z", "*.md"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return output.split("\0").filter((filePath) => filePath.endsWith(".md"));
}

function main() {
  const trackedFiles = listTrackedMarkdown();
  const enforcedFiles = trackedFiles.filter(isEnforcedFile);
  const issues = [];
  let checkedLinks = 0;

  for (const filePath of enforcedFiles) {
    let source;

    try {
      source = readFileSync(join(ROOT_DIR, filePath), "utf8");
    } catch {
      continue;
    }

    for (const link of extractLinks(source)) {
      const { resolved, inside } = resolveTarget(ROOT_DIR, filePath, link.target);
      const repoRelative = relative(ROOT_DIR, resolved);

      if (inside && !isCheckablePath(repoRelative)) {
        continue;
      }

      checkedLinks += 1;

      if (!inside) {
        issues.push({
          filePath,
          line: link.line,
          target: link.target,
          reason: "resolves outside the repository",
        });
        continue;
      }

      if (!existsSync(resolved)) {
        issues.push({
          filePath,
          line: link.line,
          target: link.target,
          reason: `no such file (${normalize(relative(ROOT_DIR, resolved)).replace(/\\/g, "/")})`,
        });
      }
    }
  }

  if (issues.length > 0) {
    console.error(
      `Doc link check failed: ${issues.length} broken relative link(s).`,
    );
    for (const issue of issues) {
      console.error(
        `- ${issue.filePath}:${issue.line} -> ${issue.target}: ${issue.reason}`,
      );
    }
    console.error(
      "\nLinks are relative to the file that contains them. Historical records " +
        `under ${EXCLUDED_PREFIXES.join(", ")} are not enforced.`,
    );
    process.exit(1);
  }

  console.log(
    `Doc link check passed (${checkedLinks} relative link(s) in ` +
      `${enforcedFiles.length} of ${trackedFiles.length} tracked Markdown file(s)).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
