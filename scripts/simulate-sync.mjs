// Replays Shard storage v2 arrival orders into a fixture vault from outside
// Obsidian, the way an Obsidian Sync delivery reaches the plugin: files change
// on disk behind the vault adapter. See "Simulating Sync" in
// docs/development/fixture-vault.md.
//
//   npm run fixture:sync -- <preset> [--vault <folder>] [--dry-run]
//
// The script only writes into a folder that carries the marker file
// `npm run fixture:vault` writes, so it can never touch a real vault. It is
// not a model of Sync: it reproduces arrival orders, not Sync's merge or
// conflict handling (#1401 DEC-001, DEC-011).

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  METADATA_PATH,
  STORAGE_FOLDER,
  USER_STATE_PATH,
} from "./generate-fixture-vault.mjs";
import { DEFAULT_TARGET, MARKER_FILE } from "./setup-fixture-vault.mjs";

export const SYNC_FEED_ID = "fx-sync-sim";
export const DOT_FOLDER = ".sync-sim";
export const DEFAULT_GAP_MS = 300;
export const DEFAULT_LATE_MS = 4000;

const SYNC_ARTICLE_GUID =
  "https://example.com/rss-dashboard-fixture/sync-sim/1";
const SHARD_PATH = `${STORAGE_FOLDER}/${SYNC_FEED_ID}.json`;

export const PRESETS = {
  "late-shard":
    "data.json and user-state.json arrive, then the new feed's shard lands after the reload debounce.",
  "user-state-late":
    "data.json and the shard arrive, then user-state.json lands after the reload debounce.",
  "data-first": "data.json, then the shard, then user-state.json.",
  reverse: "user-state.json, then the shard, then data.json.",
  "empty-newer-wins":
    "A newer data.json with no feeds or folders, as a clean device would write.",
  "dot-folder-skip": `The data-first files written under ${DOT_FOLDER}/, a dot-folder the plugin should ignore.`,
};

const USAGE = `Usage: npm run fixture:sync -- <preset> [options]

Writes the files of one Shard storage v2 Sync delivery into a fixture vault, in
the order the preset names, from outside Obsidian.

Presets:
${Object.entries(PRESETS)
  .map(([name, text]) => `  ${name.padEnd(17)}${text}`)
  .join("\n")}

Options:
  --vault <folder>   Fixture vault to write into (default: ${DEFAULT_TARGET}/
                     in the repository root). Must carry ${MARKER_FILE}.
  --dry-run          Print the vault and every file, in order, and write nothing.
  --gap <ms>         Pause between writes (default: ${DEFAULT_GAP_MS}).
  --late <ms>        Pause before a "late" file (default: ${DEFAULT_LATE_MS}, past the
                     plugin's 1500 ms reload debounce).
  -h, --help         Show this help.`;

export class SimulateSyncError extends Error {
  constructor(message) {
    super(message);
    this.name = "SimulateSyncError";
  }
}

function readNumber(flag, value) {
  const number = Number(value);
  if (value === undefined || !Number.isInteger(number) || number < 0) {
    throw new SimulateSyncError(
      `${flag} needs a whole number of milliseconds, got "${value ?? ""}".`,
    );
  }
  return number;
}

export function parseArgs(argv) {
  const options = {
    preset: undefined,
    vault: undefined,
    dryRun: false,
    gapMs: DEFAULT_GAP_MS,
    lateMs: DEFAULT_LATE_MS,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--vault") {
      options.vault = argv[++i];
      if (options.vault === undefined) {
        throw new SimulateSyncError("--vault needs a folder.");
      }
    } else if (arg === "--gap") {
      options.gapMs = readNumber(arg, argv[++i]);
    } else if (arg === "--late") {
      options.lateMs = readNumber(arg, argv[++i]);
    } else if (arg.startsWith("-")) {
      throw new SimulateSyncError(`Unknown option "${arg}".\n\n${USAGE}`);
    } else if (options.preset === undefined) {
      options.preset = arg;
    } else {
      throw new SimulateSyncError(`Unexpected extra argument "${arg}".`);
    }
  }

  if (!options.help) {
    if (options.preset === undefined) {
      throw new SimulateSyncError(`Name a preset.\n\n${USAGE}`);
    }
    if (!Object.hasOwn(PRESETS, options.preset)) {
      throw new SimulateSyncError(
        `Unknown preset "${options.preset}". Use one of: ${Object.keys(PRESETS).join(", ")}.`,
      );
    }
  }

  return options;
}

function vaultFile(vaultDir, relativePath) {
  return join(vaultDir, ...relativePath.split("/"));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Throws unless `vaultDir` is a fixture vault in Shard storage v2. The marker
 * is what keeps this script away from a real vault, whatever path is typed.
 */
export function assertFixtureVault(vaultDir) {
  const markerPath = join(vaultDir, MARKER_FILE);
  if (!existsSync(markerPath)) {
    throw new SimulateSyncError(
      `Refusing to write into ${vaultDir}: it has no ${MARKER_FILE} marker, so it is not a fixture vault made by npm run fixture:vault.`,
    );
  }
  let marker;
  try {
    marker = readJson(markerPath);
  } catch {
    throw new SimulateSyncError(
      `Refusing to write into ${vaultDir}: its ${MARKER_FILE} marker is not valid JSON.`,
    );
  }
  if (marker.storage !== "shard-v2") {
    throw new SimulateSyncError(
      `Refusing to write into ${vaultDir}: it holds ${String(marker.storage)} storage, and only Shard storage v2 is simulated.`,
    );
  }
}

function syncFeedConfig(template) {
  return {
    ...template,
    feedId: SYNC_FEED_ID,
    title: "Sync simulation feed",
    url: "https://example.com/rss-dashboard-fixture/sync-sim/feed.xml",
    siteUrl: "https://example.com/rss-dashboard-fixture/sync-sim/",
  };
}

function syncShard(template) {
  const item = template.items[0];
  return {
    ...template,
    feedId: SYNC_FEED_ID,
    feedUrl: "https://example.com/rss-dashboard-fixture/sync-sim/feed.xml",
    updatedAt: Date.now(),
    items: [
      {
        ...item,
        title: "Arrived by simulated Sync",
        link: SYNC_ARTICLE_GUID,
        guid: SYNC_ARTICLE_GUID,
      },
    ],
  };
}

/**
 * The content each file of the delivery carries, computed from the vault's
 * current files so the delivery is a believable change from where it stands.
 */
function buildDelivery(vaultDir) {
  const metadata = readJson(vaultFile(vaultDir, METADATA_PATH));
  const userState = readJson(vaultFile(vaultDir, USER_STATE_PATH));
  const template = metadata.feeds[0];
  const templateShard = readJson(
    vaultFile(vaultDir, `${STORAGE_FOLDER}/${template.feedId}.json`),
  );

  const feeds = metadata.feeds.some((feed) => feed.feedId === SYNC_FEED_ID)
    ? metadata.feeds
    : [...metadata.feeds, syncFeedConfig(template)];
  const [firstKey] = Object.keys(userState.states);

  return {
    data: { ...metadata, feeds },
    shard: syncShard(templateShard),
    userState: {
      ...userState,
      states: {
        ...userState.states,
        [`${SYNC_FEED_ID}:${SYNC_ARTICLE_GUID}`]: { read: true, starred: true },
        ...(firstKey
          ? { [firstKey]: { ...userState.states[firstKey], starred: true } }
          : {}),
      },
    },
    empty: { ...metadata, feeds: [], folders: [] },
  };
}

/**
 * The ordered writes of a preset: `{ path, content, late }`, where `path` is
 * relative to the vault and `late` marks a file that lands after the plugin's
 * reload debounce has had time to fire.
 */
export function planPreset(preset, vaultDir) {
  if (!Object.hasOwn(PRESETS, preset)) {
    throw new SimulateSyncError(`Unknown preset "${preset}".`);
  }
  const files = buildDelivery(vaultDir);
  const data = { path: METADATA_PATH, content: files.data };
  const shard = { path: SHARD_PATH, content: files.shard };
  const state = { path: USER_STATE_PATH, content: files.userState };

  switch (preset) {
    case "late-shard":
      return [data, state, { ...shard, late: true }];
    case "user-state-late":
      return [data, shard, { ...state, late: true }];
    case "data-first":
      return [data, shard, state];
    case "reverse":
      return [state, shard, data];
    case "empty-newer-wins":
      return [{ path: METADATA_PATH, content: files.empty }];
    default:
      return [data, shard, state].map((step) => ({
        ...step,
        path: `${DOT_FOLDER}/${step.path}`,
      }));
  }
}

/**
 * Writes one file so that both its mtime and its size differ from what was
 * there, which is what a real delivery looks like to Obsidian's watcher.
 */
export function writeDelivered(vaultDir, relativePath, content) {
  const path = vaultFile(vaultDir, relativePath);
  const before = existsSync(path) ? statSync(path) : undefined;
  let text = `${JSON.stringify(content, null, 2)}\n`;
  if (before && Buffer.byteLength(text) === before.size) text += "\n";

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);

  const after = statSync(path);
  if (before && after.mtimeMs <= before.mtimeMs) {
    const bumped = new Date(before.mtimeMs + 1000);
    utimesSync(path, bumped, bumped);
  }
  return { path: relativePath, size: statSync(path).size };
}

/**
 * Runs a preset against a fixture vault. With `dryRun` nothing is written; the
 * returned `steps` list the files the run would write, in order.
 */
export async function simulateSync({
  vault,
  preset,
  dryRun = false,
  gapMs = DEFAULT_GAP_MS,
  lateMs = DEFAULT_LATE_MS,
  log = (line) => void line,
}) {
  const vaultDir = resolve(vault);
  assertFixtureVault(vaultDir);
  const steps = planPreset(preset, vaultDir);

  log(
    `${dryRun ? "Dry run: would simulate" : "Simulating"} "${preset}" in the fixture vault:\n  ${vaultDir}`,
  );
  for (const [index, step] of steps.entries()) {
    log(`  ${index + 1}. ${step.path}${step.late ? " (late)" : ""}`);
  }
  if (dryRun) {
    log("Nothing was written.");
    return { vaultDir, steps, written: [] };
  }

  const written = [];
  for (const [index, step] of steps.entries()) {
    if (index > 0) await delay(step.late ? lateMs : gapMs);
    written.push(writeDelivered(vaultDir, step.path, step.content));
    log(`  wrote ${step.path}`);
  }
  return { vaultDir, steps, written };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }

  try {
    const invokedFrom = process.env.INIT_CWD ?? process.cwd();
    await simulateSync({
      vault: options.vault
        ? resolve(invokedFrom, options.vault)
        : resolve(join(import.meta.dirname, ".."), DEFAULT_TARGET),
      preset: options.preset,
      dryRun: options.dryRun,
      gapMs: options.gapMs,
      lateMs: options.lateMs,
      log: (line) => console.log(line),
    });
  } catch (error) {
    if (error instanceof SimulateSyncError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
