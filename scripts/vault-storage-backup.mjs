// Takes a verified backup of the plugin's storage in a vault, and restores it.
// This makes a Real Sync run reversible (#1426, DEC-013 of #1401).
//
//   npm run vault:backup -- backup  --vault <vault> --dest <folder>
//   npm run vault:backup -- restore --vault <vault> --backup <folder> --sync-paused
//
// A backup copies the plugin folder, the metadata folder and the shard folder
// to a dated folder outside the vault, writes a manifest of path, size and
// SHA-256 per file, and re-hashes the copy against the manifest. A restore
// copies back and re-hashes the vault against the manifest. Neither reports
// success until every file matches. The script never deletes anything, and no
// vault path is committed: paths come from arguments or environment variables.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  METADATA_FOLDER,
  PLUGIN_ID,
  STORAGE_FOLDER,
} from "./generate-fixture-vault.mjs";

export const MANIFEST_FILE = "manifest.json";
export const BACKUP_FILES_DIR = "files";
export const BACKUP_PREFIX = "rss-dashboard-backup-";
export const DEFAULT_FOLDERS = [
  `.obsidian/plugins/${PLUGIN_ID}`,
  METADATA_FOLDER,
  STORAGE_FOLDER,
];

const USAGE = `Usage: npm run vault:backup -- <command> [options]

Commands:
  backup    Copy the plugin, metadata and shard folders to a dated folder
            outside the vault and verify the copy against a manifest.
  restore   Copy a backup into the vault and verify against its manifest.

Options:
  --vault <folder>       The vault root (or RSS_DASHBOARD_VAULT).
  --dest <folder>        backup: where dated backups go, outside the vault
                         (or RSS_DASHBOARD_BACKUP_DEST).
  --backup <folder>      restore: one dated backup folder.
  --sync-paused          restore: confirm Sync is paused on every device.
  --folder <path>        Vault-relative folder to include; repeat for more.
                         Default: ${DEFAULT_FOLDERS.join(", ")}.
  -h, --help             Show this help.`;

export class VaultBackupError extends Error {
  constructor(message) {
    super(message);
    this.name = "VaultBackupError";
  }
}

export function parseArgs(argv, env = process.env) {
  const options = {
    command: undefined,
    vault: env.RSS_DASHBOARD_VAULT,
    dest: env.RSS_DASHBOARD_BACKUP_DEST,
    backup: undefined,
    syncPaused: false,
    folders: [],
    help: false,
  };
  const valueFlags = {
    "--vault": "vault",
    "--dest": "dest",
    "--backup": "backup",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith("--")
      ? [
          arg.split("=")[0],
          arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : undefined,
        ]
      : [arg, undefined];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (flag === "--sync-paused") {
      options.syncPaused = true;
    } else if (flag === "--folder" || flag in valueFlags) {
      const value = inline ?? argv[++i];
      if (value === undefined) {
        throw new VaultBackupError(`${flag} needs a value.`);
      }
      if (flag === "--folder") options.folders.push(value);
      else options[valueFlags[flag]] = value;
    } else if (arg.startsWith("-")) {
      throw new VaultBackupError(`Unknown option "${arg}".\n\n${USAGE}`);
    } else if (options.command === undefined) {
      options.command = arg;
    } else {
      throw new VaultBackupError(`Unexpected extra argument "${arg}".`);
    }
  }

  return options;
}

/** Resolves a path through symlinks as far as it exists, then appends the rest. */
function realPathLoose(path) {
  const missing = [];
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(current.slice(parent.length + 1));
    current = parent;
  }
  return join(realpathSync(current), ...missing);
}

function isSameOrInside(child, parent) {
  const path = relative(parent, child);
  // A sibling named "..foo" is inside, so match ".." only as a whole segment.
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

function assertVaultRelative(folder) {
  const clean = folder.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = clean.split("/");
  if (
    clean === "" ||
    isAbsolute(clean) ||
    /^[A-Za-z]:/.test(clean) ||
    parts.some((part) => part === ".." || part === "." || part === "")
  ) {
    throw new VaultBackupError(
      `"${folder}" is not a vault-relative folder path.`,
    );
  }
  return clean;
}

/** Drops duplicates and any folder already covered by another folder in the list. */
function coveringFolders(folders) {
  const unique = [...new Set(folders.map(assertVaultRelative))];
  return unique.filter(
    (folder) =>
      !unique.some(
        (other) => other !== folder && folder.startsWith(`${other}/`),
      ),
  );
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listFiles(root, base = root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full, base));
    } else if (entry.isFile()) {
      files.push(relative(base, full).split(sep).join("/"));
    } else {
      throw new VaultBackupError(
        `${full} is not a regular file or folder, so it cannot be backed up.`,
      );
    }
  }
  return files.sort();
}

function toPath(root, relativePath) {
  return join(root, ...relativePath.split("/"));
}

/** Manifest entries for every file under the given vault-relative folders. */
function buildManifestEntries(vaultDir, folders) {
  const entries = [];
  for (const folder of folders) {
    const folderPath = toPath(vaultDir, folder);
    if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
      throw new VaultBackupError(
        `The folder "${folder}" does not exist in the vault, so nothing was backed up.`,
      );
    }
    for (const file of listFiles(folderPath)) {
      const path = `${folder}/${file}`;
      const full = toPath(vaultDir, path);
      entries.push({ path, size: statSync(full).size, sha256: sha256(full) });
    }
  }
  return entries;
}

function copyEntries(entries, fromRoot, toRoot, copyFile) {
  for (const entry of entries) {
    const target = toPath(toRoot, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFile(toPath(fromRoot, entry.path), target);
  }
}

/** Vault files under the manifest's folders that the manifest does not list. */
function findExtraFiles(vaultDir, manifest) {
  const listed = new Set(manifest.files.map((entry) => entry.path));
  const extra = [];
  for (const folder of manifest.folders) {
    const folderPath = toPath(vaultDir, folder);
    if (!existsSync(folderPath)) continue;
    for (const file of listFiles(folderPath)) {
      if (!listed.has(`${folder}/${file}`)) extra.push(`${folder}/${file}`);
    }
  }
  return extra;
}

/** Problems found re-hashing `entries` under `root`; empty when all match. */
function verifyEntries(root, entries) {
  const problems = [];
  for (const entry of entries) {
    const full = toPath(root, entry.path);
    if (!existsSync(full) || !statSync(full).isFile()) {
      problems.push(`missing: ${entry.path}`);
    } else if (
      statSync(full).size !== entry.size ||
      sha256(full) !== entry.sha256
    ) {
      problems.push(`hash mismatch: ${entry.path}`);
    }
  }
  return problems;
}

function failWith(action, problems) {
  const shown = problems.slice(0, 10).join("\n  ");
  const more =
    problems.length > 10 ? `\n  ...and ${problems.length - 10} more` : "";
  throw new VaultBackupError(
    `${action} failed verification (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n  ${shown}${more}`,
  );
}

function assertVault(vault) {
  if (!vault) {
    throw new VaultBackupError(
      "No vault given. Pass --vault or set RSS_DASHBOARD_VAULT.",
    );
  }
  const vaultDir = resolve(vault);
  if (!existsSync(vaultDir) || !statSync(vaultDir).isDirectory()) {
    throw new VaultBackupError("The vault folder does not exist.");
  }
  return vaultDir;
}

function assertOutsideVault(path, vaultDir, what) {
  if (isSameOrInside(realPathLoose(path), realpathSync(vaultDir))) {
    throw new VaultBackupError(
      `Refusing: ${what} is inside the vault, where Sync would copy it to other devices.`,
    );
  }
}

function backupName(now) {
  return `${BACKUP_PREFIX}${now.toISOString().replace(/[:.]/g, "-")}`;
}

/**
 * Copies the storage folders to a new dated folder under `dest` and reports
 * success only when every copied file re-hashes to its manifest entry. A
 * failed backup is left in place without a manifest; nothing is deleted.
 * `copyFile` is the seam tests use to simulate a bad copy.
 */
export function createBackup({
  vault,
  dest,
  folders = DEFAULT_FOLDERS,
  now = new Date(),
  copyFile = cpSync,
}) {
  const vaultDir = assertVault(vault);
  if (!dest) {
    throw new VaultBackupError(
      "No backup destination given. Pass --dest or set RSS_DASHBOARD_BACKUP_DEST.",
    );
  }
  assertOutsideVault(dest, vaultDir, "the backup destination");

  const covered = coveringFolders(folders);
  const entries = buildManifestEntries(vaultDir, covered);

  const backupDir = join(resolve(dest), backupName(now));
  if (existsSync(backupDir)) {
    throw new VaultBackupError(
      "A backup with this timestamp already exists; it was not touched. Try again.",
    );
  }
  const filesDir = join(backupDir, BACKUP_FILES_DIR);
  mkdirSync(filesDir, { recursive: true });
  copyEntries(entries, vaultDir, filesDir, copyFile);

  const problems = verifyEntries(filesDir, entries);
  if (problems.length > 0) {
    failWith(`Backup (left unfinished in ${backupDir})`, problems);
  }

  const manifest = {
    version: 1,
    createdAt: now.toISOString(),
    folders: covered,
    files: entries,
  };
  writeFileSync(
    join(backupDir, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { backupDir, fileCount: entries.length, manifest };
}

function readManifest(backupDir) {
  const manifestPath = join(backupDir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    throw new VaultBackupError(
      "The backup has no manifest.json, so it never finished verifying and will not be restored.",
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw new VaultBackupError(
      "The backup manifest is not a version 1 manifest.",
    );
  }
  if (
    !Array.isArray(manifest.folders) ||
    manifest.folders.length === 0 ||
    manifest.folders.some((folder) => assertVaultRelative(folder) !== folder)
  ) {
    throw new VaultBackupError("The backup manifest lists no valid folders.");
  }
  for (const entry of manifest.files) {
    const wellFormed =
      typeof entry?.path === "string" &&
      Number.isSafeInteger(entry.size) &&
      /^[0-9a-f]{64}$/.test(entry.sha256);
    if (!wellFormed) {
      throw new VaultBackupError("The backup manifest has a malformed entry.");
    }
    assertVaultRelative(entry.path);
    // A restore may only write inside the folders the backup recorded.
    if (
      !manifest.folders.some((folder) => entry.path.startsWith(`${folder}/`))
    ) {
      throw new VaultBackupError(
        `The backup manifest lists "${entry.path}" outside its folders; it will not be restored.`,
      );
    }
  }
  return manifest;
}

/**
 * Copies a backup into the vault and reports success only when every restored
 * file matches the manifest. Requires `syncPaused: true`. The backup is
 * verified before anything is written. Files in the vault that are not in the
 * manifest are left alone and returned as `extraFiles`.
 */
export function restoreBackup({
  vault,
  backup,
  syncPaused = false,
  copyFile = cpSync,
}) {
  if (syncPaused !== true) {
    throw new VaultBackupError(
      "Refusing to restore: confirm Sync is paused on every device with --sync-paused.",
    );
  }
  const vaultDir = assertVault(vault);
  if (!backup) {
    throw new VaultBackupError("No backup given. Pass --backup.");
  }
  const backupDir = resolve(backup);
  if (!existsSync(backupDir) || !statSync(backupDir).isDirectory()) {
    throw new VaultBackupError("The backup folder does not exist.");
  }
  assertOutsideVault(backupDir, vaultDir, "the backup");

  const manifest = readManifest(backupDir);
  const filesDir = join(backupDir, BACKUP_FILES_DIR);
  const backupProblems = verifyEntries(filesDir, manifest.files);
  if (backupProblems.length > 0) {
    failWith("The backup itself (nothing was restored)", backupProblems);
  }

  copyEntries(manifest.files, filesDir, vaultDir, copyFile);

  const problems = verifyEntries(vaultDir, manifest.files);
  if (problems.length > 0) failWith("Restore", problems);

  return {
    fileCount: manifest.files.length,
    extraFiles: findExtraFiles(vaultDir, manifest),
  };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (options.help || options.command === undefined) {
    console.log(USAGE);
    return;
  }

  try {
    // npm runs scripts from the repository root; resolve paths against the
    // directory the user typed them in.
    const invokedFrom = process.env.INIT_CWD ?? process.cwd();
    const fromHere = (path) => (path ? resolve(invokedFrom, path) : path);
    if (options.command === "backup") {
      const result = createBackup({
        vault: fromHere(options.vault),
        dest: fromHere(options.dest),
        folders: options.folders.length > 0 ? options.folders : DEFAULT_FOLDERS,
      });
      console.log(
        `Backup verified: ${result.fileCount} files hashed and re-hashed.\n  ${result.backupDir}`,
      );
    } else if (options.command === "restore") {
      const result = restoreBackup({
        vault: fromHere(options.vault),
        backup: fromHere(options.backup),
        syncPaused: options.syncPaused,
      });
      console.log(
        `Restore verified: ${result.fileCount} files match the manifest.`,
      );
      if (result.extraFiles.length > 0) {
        console.log(
          `${result.extraFiles.length} file(s) in the vault are not in the backup and were left in place:\n  ${result.extraFiles.join("\n  ")}`,
        );
      }
    } else {
      throw new VaultBackupError(
        `Unknown command "${options.command}".\n\n${USAGE}`,
      );
    }
  } catch (error) {
    if (error instanceof VaultBackupError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
