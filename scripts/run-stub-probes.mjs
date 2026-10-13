// Re-runs every committed Obsidian console probe in one command, so a
// reference-pin bump or an Obsidian update can be diffed against the ledger
// (test_files/stubs/obsidian-console-probes.md). See "Re-running these probes
// (drift check)" in that ledger for the setup, the diff rule, and the triggers.
//
//   npm run stub:probes                  # every driver, the version guard first
//   npm run stub:probes -- --port 9333   # extra options reach obsidian-cdp.mjs
//   npm run stub:probes -- --help        # this help
//
// It only reads the running app; it never writes to a vault, and the probe
// output is not committed. Requires Obsidian started with a debug port on a
// disposable profile and a throwaway vault open (see "Driving the vault over
// CDP" in docs/development/fixture-vault.md).

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");
export const PROBES_DIR = join(ROOT_DIR, "test_files", "stubs", "probes");
const HARNESS = join(ROOT_DIR, "scripts", "obsidian-cdp.mjs");

// The version guard runs first: it records the running app version and writes
// window.__obsidianApi, the bootstrap the API-class drivers rely on.
export const VERSION_DRIVER = "version-and-platform.repl";

const USAGE = `Re-run every committed Obsidian console probe (drift check).

Usage: npm run stub:probes -- [obsidian-cdp.mjs options]

Runs ${VERSION_DRIVER} first, then the remaining *.repl drivers under
test_files/stubs/probes/ in name order, each over scripts/obsidian-cdp.mjs.
Any options (for example --port 9333) are passed to the harness for every
driver. Diff the output against test_files/stubs/obsidian-console-probes.md.

See "Re-running these probes (drift check)" in that ledger, and
"Driving the vault over CDP" in docs/development/fixture-vault.md.`;

/** Every probe driver, the version guard first, then the rest by name. */
export function listProbeFiles(dir = PROBES_DIR) {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".repl"))
    .sort();
  return [
    ...(files.includes(VERSION_DRIVER) ? [VERSION_DRIVER] : []),
    ...files.filter((name) => name !== VERSION_DRIVER),
  ];
}

/** Runs one driver over the CDP harness and returns its exit code. */
function runDriver(file, harnessArgs) {
  const result = spawnSync(
    process.execPath,
    [HARNESS, ...harnessArgs, "repl", join(PROBES_DIR, file)],
    { stdio: "inherit" },
  );
  return result.status ?? 1;
}

/**
 * Runs each probe file, printing a `### <file>` delimiter first, and returns
 * the exit code (1 when any driver fails). Every driver runs even after one
 * fails, so a single broken probe still yields the rest of the drift output.
 */
export function runProbes({
  files = listProbeFiles(),
  harnessArgs = [],
  log = console.log,
  error = console.error,
} = {}) {
  const failed = [];
  for (const file of files) {
    log(`\n### ${file}\n`);
    if (runDriver(file, harnessArgs) !== 0) {
      failed.push(file);
    }
  }

  if (failed.length > 0) {
    error(`\n${failed.length} probe driver(s) failed: ${failed.join(", ")}`);
    return 1;
  }

  log(`\nRan ${files.length} probe driver(s).`);
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    console.log(USAGE);
    return;
  }
  process.exitCode = runProbes({ harnessArgs: args });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
