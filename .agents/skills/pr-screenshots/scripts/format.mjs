#!/usr/bin/env node
/**
 * Render a before/after screenshot block for a GitHub pull request body, and
 * print the exact files to upload with `gh pr edit --attach`.
 *
 * One `--case` names a comparison; every case takes one `--before` and one
 * `--after`. Cases become rows of a single table whose first column is the
 * description:
 *
 *   | Case | Before | After |
 *   |:--|:--|:--|
 *   | <case> | ![Before — <case>](<ref>) | ![After — <case>](<ref>) |
 *
 * References are relative to the working directory, so run this and `gh` from
 * the same directory. `gh --attach` uploads the files and rewrites matching
 * references in the body to GitHub-hosted URLs.
 *
 * Images only. `gh --attach` does not rewrite `<video src>`, so recordings are
 * out of scope here.
 */
import { existsSync, readFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

export const MARKER_START = "<!-- pr-screenshots:start -->";
export const MARKER_END = "<!-- pr-screenshots:end -->";

const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export function mediaKind(file) {
  const extension = extname(file).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  throw new Error(
    `Unsupported media file "${file}" (images only: png, jpg, jpeg, gif, webp)`,
  );
}

/** A reference that survives `gh --attach`, relative to the working directory. */
export function localRef(file, cwd = process.cwd()) {
  const path = relative(cwd, resolve(cwd, file));
  if (path === ".." || path.startsWith(`..${sep}`)) {
    throw new Error(
      `Media files must be inside the working directory: "${file}"`,
    );
  }
  // Forward slashes and an explicit `./` prefix in both the body reference and
  // the --attach argument, so gh's documented `![alt](./x.png)` rewrite matches
  // — including paths under a dot-directory such as `.agent/…`.
  const posix = path.split(/[\\/]/).join("/");
  const ref = `./${posix}`;
  if (/\s/.test(ref))
    throw new Error(`Media paths cannot contain whitespace: "${ref}"`);
  return ref;
}

export function buildCases({ cases = [], before = [], after = [] }) {
  if (after.length === 0)
    throw new Error("At least one --after file is required");
  if (before.length !== after.length) {
    throw new Error(
      `Provide one --before file for every --after file (got ${before.length} before, ${after.length} after)`,
    );
  }
  if (cases.length !== after.length) {
    throw new Error(
      `Provide one --case label for every --after file (got ${cases.length} case, ${after.length} after)`,
    );
  }
  return after.map((afterFile, index) => ({
    name: cases[index],
    before: before[index],
    after: afterFile,
  }));
}

export function renderTable(
  caseList,
  { beforeLabel = "Before", afterLabel = "After", cwd = process.cwd() } = {},
) {
  const lines = [
    MARKER_START,
    `| Case | ${beforeLabel} | ${afterLabel} |`,
    "|:--|:--|:--|",
  ];
  for (const { name, before: beforeFile, after: afterFile } of caseList) {
    lines.push(
      `| ${name} | ![${beforeLabel} — ${name}](${localRef(beforeFile, cwd)}) | ![${afterLabel} — ${name}](${localRef(afterFile, cwd)}) |`,
    );
  }
  lines.push(MARKER_END);
  return `${lines.join("\n")}\n`;
}

export function attachList(caseList, { cwd = process.cwd() } = {}) {
  return [
    ...new Set(
      caseList
        .flatMap((c) => [c.before, c.after])
        .map((file) => localRef(file, cwd)),
    ),
  ];
}

/** Insert or replace this skill's marked block, preserving all other prose. */
export function replaceMarkedBlock(body, block) {
  const start = body.indexOf(MARKER_START);
  const end = body.indexOf(MARKER_END);

  if (start === -1 && end === -1) {
    const prefix = body.trimEnd();
    return prefix ? `${prefix}\n\n${block.trim()}\n` : block;
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "PR body contains an incomplete pr-screenshots marker block",
    );
  }
  if (
    body.indexOf(MARKER_START, start + MARKER_START.length) !== -1 ||
    body.indexOf(MARKER_END, end + MARKER_END.length) !== -1
  ) {
    throw new Error(
      "PR body contains more than one pr-screenshots marker block",
    );
  }

  const afterEnd = end + MARKER_END.length;
  const prefix = body.slice(0, start).trimEnd();
  const suffix = body.slice(afterEnd).trim();
  return `${[prefix, block.trim(), suffix].filter(Boolean).join("\n\n")}\n`;
}

function validateFiles(caseList, cwd) {
  for (const file of caseList.flatMap((c) => [c.before, c.after])) {
    localRef(file, cwd);
    if (!existsSync(resolve(cwd, file)))
      throw new Error(`Media file does not exist: "${file}"`);
    mediaKind(file);
  }
}

const USAGE = `Usage: node format.mjs --case <label> --before <file> --after <file> [more cases...]
                    [--before-label <text>] [--after-label <text>]
                    [--body-file <file>] [--attach-list]

Repeat --case/--before/--after once per comparison. Prints the table block, or
replaces the marked block in --body-file. --attach-list prints the files to pass
to \`gh pr edit --attach\`.`;

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      case: { type: "string", multiple: true },
      before: { type: "string", multiple: true },
      after: { type: "string", multiple: true },
      "before-label": { type: "string" },
      "after-label": { type: "string" },
      "body-file": { type: "string" },
      "attach-list": { type: "boolean" },
    },
  });

  if ((argv.includes("--help") || argv.includes("-h")) && !values.after) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const caseList = buildCases({
    cases: values.case ?? [],
    before: values.before ?? [],
    after: values.after ?? [],
  });
  validateFiles(caseList, process.cwd());

  if (values["attach-list"]) {
    process.stdout.write(`${attachList(caseList).join("\n")}\n`);
    return;
  }

  const block = renderTable(caseList, {
    beforeLabel: values["before-label"],
    afterLabel: values["after-label"],
  });
  if (values["body-file"]) {
    process.stdout.write(
      replaceMarkedBlock(readFileSync(values["body-file"], "utf-8"), block),
    );
  } else {
    process.stdout.write(block);
  }
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split(/[\\/]/).at(-1))
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n\n${USAGE}\n`);
    process.exit(1);
  }
}
