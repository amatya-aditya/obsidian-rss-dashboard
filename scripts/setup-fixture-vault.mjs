// Creates or resets a working copy of the fixture vault and installs the
// current plugin build into it. See docs/development/fixture-vault.md.
//
//   npm run fixture:vault                         # reset .fixture-vault/
//   npm run fixture:vault -- <folder>             # reset another folder
//   npm run fixture:vault -- --storage legacy-json
//   npm run fixture:vault -- --plugin-only        # copy a new build only
//
// The template in test_files/fixture-vault is never modified. A folder is
// only ever deleted when it carries the marker file this script writes, so an
// arbitrary folder passed by mistake is refused rather than wiped.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  METADATA_FOLDER,
  METADATA_PATH,
  PLUGIN_DATA_PATH,
  PLUGIN_ID,
  STORAGE_FOLDER,
  TEMPLATE_DIR,
  USER_STATE_PATH,
} from "./generate-fixture-vault.mjs";

const ROOT_DIR = join(import.meta.dirname, "..");

export const DEFAULT_TARGET = ".fixture-vault";
export const MARKER_FILE = ".rss-dashboard-fixture-vault.json";
export const BUILD_FILES = ["main.js", "manifest.json", "styles.css"];
export const STORAGE_VARIANTS = ["shard-v2", "shard-v1", "legacy-json"];
export const PLUGIN_DIR = `.obsidian/plugins/${PLUGIN_ID}`;

const USAGE = `Usage: npm run fixture:vault -- [folder] [options]

Creates, or resets, a working copy of the RSS Dashboard fixture vault and
copies the current build (main.js, manifest.json, styles.css) into it.

  folder                 Where to put the vault (default: ${DEFAULT_TARGET}/
                         in the repository root). An existing folder is only
                         replaced if this script created it.

Options:
  --storage <variant>    shard-v2 (default), shard-v1, or legacy-json. The
                         deprecated variants seed the same content for
                         testing the storage migration prompt.
  --plugin-only          Copy a new build into an existing fixture vault
                         without resetting its data.
  --show-whats-new       Leave "last shown version" unset so the What's New
                         note opens on first launch.
  -h, --help             Show this help.`;

export class FixtureVaultError extends Error {
  constructor(message) {
    super(message);
    this.name = "FixtureVaultError";
  }
}

export function parseArgs(argv) {
  const options = {
    target: undefined,
    storage: "shard-v2",
    pluginOnly: false,
    showWhatsNew: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--plugin-only") {
      options.pluginOnly = true;
    } else if (arg === "--show-whats-new") {
      options.showWhatsNew = true;
    } else if (arg === "--storage" || arg.startsWith("--storage=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++i];
      if (!STORAGE_VARIANTS.includes(value)) {
        throw new FixtureVaultError(
          `Unknown storage variant "${value ?? ""}". Use one of: ${STORAGE_VARIANTS.join(", ")}.`,
        );
      }
      options.storage = value;
    } else if (arg.startsWith("-")) {
      throw new FixtureVaultError(`Unknown option "${arg}".\n\n${USAGE}`);
    } else if (options.target === undefined) {
      options.target = arg;
    } else {
      throw new FixtureVaultError(`Unexpected extra argument "${arg}".`);
    }
  }

  return options;
}

function isSameOrInside(child, parent) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/**
 * Throws unless `target` is a folder this script may delete and recreate:
 * missing, empty, or marked as a fixture vault by a previous run, and never a
 * folder that holds the repository, the template, or the user's home.
 */
export function assertSafeTarget(target, { repoRoot, templateDir }) {
  const refuse = (reason) => {
    throw new FixtureVaultError(`Refusing to use ${target} as a fixture vault: ${reason}.`);
  };

  if (parse(target).root === target) refuse("it is a filesystem root");
  if (target === resolve(homedir())) refuse("it is your home folder");
  if (isSameOrInside(repoRoot, target)) refuse("it contains the repository");
  if (isSameOrInside(target, templateDir) || isSameOrInside(templateDir, target)) {
    refuse("it overlaps the committed template");
  }

  if (!existsSync(target)) return;
  if (!statSync(target).isDirectory()) refuse("it is a file");
  if (readdirSync(target).length === 0) return;
  if (!existsSync(join(target, MARKER_FILE))) {
    refuse(
      `it is not empty and has no ${MARKER_FILE} marker, so it was not made by this script`,
    );
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function vaultPath(vaultDir, relativePath) {
  return join(vaultDir, ...relativePath.split("/"));
}

/**
 * Feeds as the plugin holds them in memory: each feed config with its shard's
 * articles and every article's user state applied, the way Shard storage v2
 * hydrates them.
 */
function hydrateFeeds(vaultDir, metadata) {
  const { states } = readJson(vaultPath(vaultDir, USER_STATE_PATH));
  return metadata.feeds.map((feed) => {
    const shard = readJson(vaultPath(vaultDir, `${STORAGE_FOLDER}/${feed.feedId}.json`));
    const items = shard.items.map((item) => {
      const state = states[`${feed.feedId}:${item.guid}`] ?? {};
      const hydrated = {
        ...item,
        read: state.read ?? false,
        starred: state.starred ?? false,
        tags: state.tags ?? [],
        saved: state.saved ?? false,
      };
      if (state.savedFilePath) hydrated.savedFilePath = state.savedFilePath;
      if (state.playbackProgress) hydrated.playbackProgress = state.playbackProgress;
      return hydrated;
    });
    return { feed, shard, items };
  });
}

/**
 * Rewrites a freshly copied Shard storage v2 vault into a deprecated storage
 * layout holding the same feeds, articles, and article state.
 *
 * - shard-v1: settings in the plugin's own data.json, article state inside
 *   each shard, no user-state.json.
 * - legacy-json: everything, articles included, in the plugin's data.json.
 */
export function convertStorage(vaultDir, storage) {
  if (storage === "shard-v2") return;
  if (!STORAGE_VARIANTS.includes(storage)) {
    throw new FixtureVaultError(`Unknown storage variant "${storage}".`);
  }

  const metadata = readJson(vaultPath(vaultDir, METADATA_PATH));
  const hydrated = hydrateFeeds(vaultDir, metadata);
  const settings = { ...metadata, metadataStorageMode: "plugin-default" };
  delete settings.metadataStorageSchemaVersion;

  if (storage === "legacy-json") {
    settings.storageMode = "legacy-json";
    settings.feeds = hydrated.map(({ feed, items }) => ({ ...feed, items }));
    rmSync(vaultPath(vaultDir, METADATA_FOLDER), { recursive: true, force: true });
  } else {
    settings.storageMode = "vault-shards";
    for (const { feed, shard, items } of hydrated) {
      writeJson(vaultPath(vaultDir, `${STORAGE_FOLDER}/${feed.feedId}.json`), {
        ...shard,
        items,
      });
    }
    rmSync(vaultPath(vaultDir, METADATA_PATH), { force: true });
    rmSync(vaultPath(vaultDir, USER_STATE_PATH), { force: true });
  }

  writeJson(vaultPath(vaultDir, PLUGIN_DATA_PATH), settings);
}

/** The data.json that holds the vault's full settings for this variant. */
function settingsFilePath(vaultDir, storage) {
  return storage === "shard-v2"
    ? vaultPath(vaultDir, METADATA_PATH)
    : vaultPath(vaultDir, PLUGIN_DATA_PATH);
}

function assertBuildPresent(repoRoot) {
  const missing = BUILD_FILES.filter((file) => !existsSync(join(repoRoot, file)));
  if (missing.length > 0) {
    throw new FixtureVaultError(
      `No plugin build found (missing ${missing.join(", ")} in ${repoRoot}). ` +
        "Run `npm run build` or `npm run dev` first.",
    );
  }
}

function copyBuild(repoRoot, vaultDir) {
  assertBuildPresent(repoRoot);
  const pluginDir = vaultPath(vaultDir, PLUGIN_DIR);
  mkdirSync(pluginDir, { recursive: true });
  for (const file of BUILD_FILES) {
    cpSync(join(repoRoot, file), join(pluginDir, file));
  }
  return readJson(join(repoRoot, "manifest.json")).version;
}

/**
 * Creates or resets the fixture vault at `target`, or with `pluginOnly`
 * refreshes only the plugin build inside an existing one. Returns the
 * absolute vault path and the installed plugin version.
 */
export function setupFixtureVault({
  repoRoot = ROOT_DIR,
  templateDir = TEMPLATE_DIR,
  target = DEFAULT_TARGET,
  storage = "shard-v2",
  pluginOnly = false,
  showWhatsNew = false,
} = {}) {
  const vaultDir = resolve(repoRoot, target);
  const resolvedTemplate = resolve(templateDir);
  assertSafeTarget(vaultDir, { repoRoot: resolve(repoRoot), templateDir: resolvedTemplate });

  if (pluginOnly) {
    if (!existsSync(join(vaultDir, MARKER_FILE))) {
      throw new FixtureVaultError(
        `${vaultDir} is not a fixture vault yet. Run without --plugin-only first.`,
      );
    }
    const version = copyBuild(repoRoot, vaultDir);
    return { vaultDir, version, storage: readJson(join(vaultDir, MARKER_FILE)).storage };
  }

  // Fail before deleting anything.
  assertBuildPresent(repoRoot);

  try {
    rmSync(vaultDir, { recursive: true, force: true });
  } catch (error) {
    throw new FixtureVaultError(
      `Could not remove the old fixture vault at ${vaultDir}. Close it in Obsidian and try again. (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  cpSync(resolvedTemplate, vaultDir, { recursive: true });
  convertStorage(vaultDir, storage);
  const version = copyBuild(repoRoot, vaultDir);

  if (!showWhatsNew) {
    // Record the installed release as already announced, so What's New does
    // not open over the dashboard on every reset.
    const settingsPath = settingsFilePath(vaultDir, storage);
    writeJson(settingsPath, { ...readJson(settingsPath), lastShownVersion: version });
  }

  writeJson(join(vaultDir, MARKER_FILE), {
    createdBy: "scripts/setup-fixture-vault.mjs",
    template: relative(resolve(repoRoot), resolvedTemplate).replace(/\\/g, "/"),
    storage,
    pluginVersion: version,
    createdAt: new Date().toISOString(),
  });

  return { vaultDir, version, storage };
}

function main() {
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
    // npm runs scripts from the repository root; resolve a folder the user
    // typed against the directory they typed it in.
    const invokedFrom = process.env.INIT_CWD ?? process.cwd();
    const result = setupFixtureVault({
      target:
        options.target === undefined
          ? DEFAULT_TARGET
          : resolve(invokedFrom, options.target),
      storage: options.storage,
      pluginOnly: options.pluginOnly,
      showWhatsNew: options.showWhatsNew,
    });
    if (options.pluginOnly) {
      console.log(
        `Copied RSS Dashboard ${result.version} into the fixture vault at:\n  ${result.vaultDir}\n` +
          "Reload the plugin in Obsidian (turn it off and on in Community plugins) to use it.",
      );
      return;
    }
    console.log(
      `Fixture vault ready (${result.storage} storage, RSS Dashboard ${result.version}).\n` +
        `Open this folder in Obsidian with "Open folder as vault":\n  ${result.vaultDir}`,
    );
  } catch (error) {
    if (error instanceof FixtureVaultError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
