// Creates or updates the single tracked `obsidian-update` issue from the
// stub-drift canary's Markdown report (issue #1063, DEC-006).
//
// The weekly `.github/workflows/obsidian-canary.yml` calls this after
// `check:stub-drift` exits non-zero, so a finding updates one open issue
// instead of opening a new one every week. It reads the report written by
// `check:stub-drift --report`, finds an open issue carrying the label, and
// edits it (keeping the stable title) or creates it.
//
//   node scripts/upsert-obsidian-update-issue.mjs --report drift.md
//
// The `gh` calls are injected (`run`), so the decision helpers and the whole
// upsert sequence are unit tested in
// test_files/unit/upsert-obsidian-update-issue.test.ts without shelling out.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULT_LABEL = "obsidian-update";
export const DEFAULT_TITLE = "Obsidian test stub drift";
export const LABEL_COLOR = "d93f0b";
export const LABEL_DESCRIPTION =
  "Filed by the weekly Obsidian stub drift canary (#1063).";

const USAGE = `Create or update the tracked obsidian-update issue from a drift report.

Usage: node scripts/upsert-obsidian-update-issue.mjs --report <file> [options]

Options:
  --report <file>    Markdown report written by check:stub-drift --report. Required.
  --label <name>     Issue label that marks the tracking issue. Default: ${DEFAULT_LABEL}.
  --title <text>     Title used only when creating the issue. Default: ${DEFAULT_TITLE}.
  -h, --help         Show this help.`;

export class UpsertError extends Error {
  constructor(message) {
    super(message);
    this.name = "UpsertError";
  }
}

/**
 * @typedef {(args: string[]) => { status: number, stdout: string, stderr: string }} GhRun
 */

/**
 * @typedef {object} UpsertOptions
 * @property {string} [reportPath] Markdown report written by check:stub-drift.
 * @property {string} [label] Issue label that marks the tracking issue.
 * @property {string} [title] Title used only when creating the issue.
 * @property {GhRun} [run] The `gh` runner; injected in tests.
 * @property {(message: string) => void} [log] Progress logger; injected in tests.
 */

/**
 * Runs `gh` with `args` and returns `{ status, stdout, stderr }`. Throws when
 * the executable itself cannot start (for example `gh` is not installed).
 */
export function runGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) {
    throw new UpsertError(`Failed to run gh: ${result.error.message}`);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function parseArgs(argv) {
  const options = {
    reportPath: undefined,
    label: DEFAULT_LABEL,
    title: DEFAULT_TITLE,
    help: false,
  };

  const readValue = (arg, next) => {
    const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : next();
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UpsertError(`Option "${arg.split("=")[0]}" needs a value.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--report" || arg.startsWith("--report=")) {
      options.reportPath = readValue(arg, () => argv[++i]);
    } else if (arg === "--label" || arg.startsWith("--label=")) {
      options.label = readValue(arg, () => argv[++i]);
    } else if (arg === "--title" || arg.startsWith("--title=")) {
      options.title = readValue(arg, () => argv[++i]);
    } else {
      throw new UpsertError(`Unknown option "${arg}".\n\n${USAGE}`);
    }
  }

  return options;
}

/**
 * Reads the number of the open tracking issue from `gh issue list --json
 * number` output, or `undefined` when none is open. Throws when the output is
 * not the JSON list the command should return.
 */
export function selectOpenIssueNumber(stdout) {
  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new UpsertError("gh issue list did not return JSON.");
  }
  if (!Array.isArray(data)) {
    throw new UpsertError("gh issue list did not return a list.");
  }
  const first = data[0];
  if (first === undefined) {
    return undefined;
  }
  const number = first?.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    throw new UpsertError(
      `gh issue list returned an unexpected issue: ${JSON.stringify(first)}.`,
    );
  }
  return number;
}

/**
 * The `gh` arguments that create the issue, or edit the existing one without
 * renaming it (the title stays stable across updates).
 */
export function planIssueUpsert({ number, label, title, reportPath }) {
  if (number !== undefined) {
    return {
      action: "update",
      args: ["issue", "edit", String(number), "--body-file", reportPath],
    };
  }
  return {
    action: "create",
    args: [
      "issue",
      "create",
      "--label",
      label,
      "--title",
      title,
      "--body-file",
      reportPath,
    ],
  };
}

/** Ensures the tracking label exists, idempotently (`--force`). */
export function ensureLabel(label, run = runGh, log = console.log) {
  const result = run([
    "label",
    "create",
    label,
    "--color",
    LABEL_COLOR,
    "--description",
    LABEL_DESCRIPTION,
    "--force",
  ]);
  if (result.status !== 0) {
    throw new UpsertError(
      `gh label create failed: ${result.stderr.trim() || result.status}`,
    );
  }
  log(`Ensured label "${label}".`);
}

/**
 * Ensures the label, finds the open tracking issue, and creates or updates it
 * from the report. Returns the planned action and, on update, the issue
 * number, so a caller can log or assert the outcome.
 *
 * @param {UpsertOptions} [options]
 * @returns {{ action: string, args: string[] }}
 */
export function upsertIssue({
  reportPath,
  label = DEFAULT_LABEL,
  title = DEFAULT_TITLE,
  run = runGh,
  log = console.log,
} = {}) {
  if (!reportPath) {
    throw new UpsertError("A --report path is required.");
  }

  ensureLabel(label, run, log);

  const listed = run([
    "issue",
    "list",
    "--label",
    label,
    "--state",
    "open",
    "--json",
    "number",
    "--limit",
    "50",
  ]);
  if (listed.status !== 0) {
    throw new UpsertError(
      `gh issue list failed: ${listed.stderr.trim() || listed.status}`,
    );
  }

  const number = selectOpenIssueNumber(listed.stdout);
  const plan = planIssueUpsert({ number, label, title, reportPath });

  const applied = run(plan.args);
  if (applied.status !== 0) {
    throw new UpsertError(
      `gh issue ${plan.action} failed: ${applied.stderr.trim() || applied.status}`,
    );
  }

  if (plan.action === "update") {
    log(`Updated issue #${number}.`);
  } else {
    log("Created issue.");
  }
  return plan;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  if (!options.reportPath) {
    console.error(`--report is required.\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  if (!existsSync(options.reportPath)) {
    console.error(`Report not found at ${options.reportPath}.`);
    process.exitCode = 1;
    return;
  }

  try {
    upsertIssue(options);
  } catch (error) {
    console.error(
      `upsert-obsidian-update-issue failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
