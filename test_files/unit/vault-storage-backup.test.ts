import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MANIFEST_FILE,
  DEFAULT_FOLDERS,
  createBackup,
  parseArgs,
  restoreBackup,
} from "../../scripts/vault-storage-backup.mjs";

// Read the plugin folder from the script's defaults rather than spell the config dir.
const PLUGIN_FOLDER = DEFAULT_FOLDERS[0];
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "rss-dashboard-backup-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function write(root: string, path: string, content: string): void {
  const full = join(root, ...path.split("/"));
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function read(root: string, path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

/** A vault holding the three storage folders the script backs up by default. */
function fakeVault(): string {
  const vault = temporaryDirectory();
  write(vault, `${PLUGIN_FOLDER}/data.json`, '{"a":1}');
  write(vault, `${PLUGIN_FOLDER}/main.js`, "// build");
  write(vault, "rss-dashboard-data/data.json", '{"feeds":[]}');
  write(vault, "rss-dashboard-data/user-state.json", '{"states":{}}');
  write(vault, "rss-dashboard-data/feeds/one.json", '{"items":[1]}');
  write(vault, "notes/unrelated.md", "not part of the backup");
  return vault;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("createBackup", () => {
  it("copies the three storage folders and records a manifest the copy matches", () => {
    const vault = fakeVault();
    const dest = temporaryDirectory();

    const { backupDir, fileCount, manifest } = createBackup({ vault, dest });

    expect(fileCount).toBe(5);
    expect(manifest.files.map((file: { path: string }) => file.path)).toEqual([
      `${PLUGIN_FOLDER}/data.json`,
      `${PLUGIN_FOLDER}/main.js`,
      "rss-dashboard-data/data.json",
      "rss-dashboard-data/feeds/one.json",
      "rss-dashboard-data/user-state.json",
    ]);
    expect(manifest.files[0]).toMatchObject({
      size: 7,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(existsSync(join(backupDir, MANIFEST_FILE))).toBe(true);
    expect(
      read(join(backupDir, "files"), "rss-dashboard-data/feeds/one.json"),
    ).toBe('{"items":[1]}');
    expect(existsSync(join(backupDir, "files", "notes"))).toBe(false);
  });

  it("fails when a copied file does not match its manifest hash", () => {
    const vault = fakeVault();
    const dest = temporaryDirectory();
    const corruptingCopy = (from: string | URL, to: string | URL): void => {
      cpSync(from, to);
      if (String(to).endsWith("one.json")) writeFileSync(to, '{"items":[2]}');
    };

    expect(() =>
      createBackup({ vault, dest, copyFile: corruptingCopy }),
    ).toThrow(/hash mismatch: rss-dashboard-data\/feeds\/one\.json/);
    const [leftover] = readdirSync(dest);
    expect(existsSync(join(dest, leftover, MANIFEST_FILE))).toBe(false);
  });

  it("fails when a file is missing from the copy", () => {
    const vault = fakeVault();
    const dest = temporaryDirectory();
    const droppingCopy = (from: string | URL, to: string | URL): void => {
      if (!String(to).endsWith("user-state.json")) cpSync(from, to);
    };

    expect(() => createBackup({ vault, dest, copyFile: droppingCopy })).toThrow(
      /missing: rss-dashboard-data\/user-state\.json/,
    );
  });

  it("refuses a destination inside the vault and copies nothing", () => {
    const vault = fakeVault();
    const dest = join(vault, "backups");

    expect(() => createBackup({ vault, dest })).toThrow(/inside the vault/);
    expect(existsSync(dest)).toBe(false);
  });

  it("fails when a storage folder is missing from the vault", () => {
    const vault = fakeVault();
    rmSync(join(vault, "rss-dashboard-data", "feeds"), { recursive: true });

    expect(() =>
      createBackup({
        vault,
        dest: temporaryDirectory(),
        folders: ["rss-dashboard-data/feeds"],
      }),
    ).toThrow(/does not exist in the vault/);
  });

  it("keeps earlier backups when it makes another", () => {
    const vault = fakeVault();
    const dest = temporaryDirectory();

    const first = createBackup({
      vault,
      dest,
      now: new Date("2026-10-20T10:00:00Z"),
    });
    const second = createBackup({
      vault,
      dest,
      now: new Date("2026-10-20T11:00:00Z"),
    });

    expect(first.backupDir).not.toBe(second.backupDir);
    expect(existsSync(join(first.backupDir, MANIFEST_FILE))).toBe(true);
    expect(readdirSync(dest)).toHaveLength(2);
  });
});

describe("restoreBackup", () => {
  it("refuses to run unless Sync is confirmed paused", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    write(vault, "rss-dashboard-data/data.json", "changed");

    expect(() => restoreBackup({ vault, backup: backupDir })).toThrow(
      /Sync is paused/,
    );
    expect(read(vault, "rss-dashboard-data/data.json")).toBe("changed");
  });

  it("restores changed and deleted files and reports success only after they match", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    write(vault, "rss-dashboard-data/data.json", '{"feeds":["wiped"]}');
    rmSync(join(vault, "rss-dashboard-data", "feeds", "one.json"));
    write(vault, "rss-dashboard-data/feeds/newer.json", "{}");

    const result = restoreBackup({
      vault,
      backup: backupDir,
      syncPaused: true,
    });

    expect(result.fileCount).toBe(5);
    expect(read(vault, "rss-dashboard-data/data.json")).toBe('{"feeds":[]}');
    expect(read(vault, "rss-dashboard-data/feeds/one.json")).toBe(
      '{"items":[1]}',
    );
    // Files the backup never held are reported, not deleted.
    expect(result.extraFiles).toEqual(["rss-dashboard-data/feeds/newer.json"]);
    expect(existsSync(join(vault, "rss-dashboard-data/feeds/newer.json"))).toBe(
      true,
    );
  });

  it("fails when a restored file does not match the manifest", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    const corruptingCopy = (from: string | URL, to: string | URL): void => {
      cpSync(from, to);
      if (String(to).endsWith("main.js")) writeFileSync(to, "tampered");
    };

    expect(() =>
      restoreBackup({
        vault,
        backup: backupDir,
        syncPaused: true,
        copyFile: corruptingCopy,
      }),
    ).toThrow(/Restore failed verification[\s\S]*hash mismatch: .*main\.js/);
  });

  it("restores nothing from a backup that no longer matches its manifest", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    write(join(backupDir, "files"), "rss-dashboard-data/data.json", "rotted");
    write(vault, "rss-dashboard-data/user-state.json", "keep me");

    expect(() =>
      restoreBackup({ vault, backup: backupDir, syncPaused: true }),
    ).toThrow(/nothing was restored/);
    expect(read(vault, "rss-dashboard-data/user-state.json")).toBe("keep me");
  });

  it("refuses a backup that has no manifest", () => {
    const vault = fakeVault();
    const unfinished = temporaryDirectory();

    expect(() =>
      restoreBackup({ vault, backup: unfinished, syncPaused: true }),
    ).toThrow(/no manifest/);
  });

  it("never deletes the backup it restores from", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });

    restoreBackup({ vault, backup: backupDir, syncPaused: true });

    expect(existsSync(join(backupDir, MANIFEST_FILE))).toBe(true);
    expect(
      existsSync(join(backupDir, "files", "rss-dashboard-data", "data.json")),
    ).toBe(true);
  });
});

describe("parseArgs", () => {
  it("reads paths from environment variables and flags from arguments", () => {
    const options = parseArgs(["restore", "--backup", "b", "--sync-paused"], {
      RSS_DASHBOARD_VAULT: "v",
    });

    expect(options).toMatchObject({
      command: "restore",
      vault: "v",
      backup: "b",
      syncPaused: true,
    });
  });
});

describe("refusals and manifest checks", () => {
  it("refuses a destination that is the vault itself", () => {
    const vault = fakeVault();

    expect(() => createBackup({ vault, dest: vault })).toThrow(
      /inside the vault/,
    );
  });

  it("refuses a destination inside the vault whose name starts with two dots", () => {
    const vault = fakeVault();
    const dest = join(vault, "..backups");

    expect(() => createBackup({ vault, dest })).toThrow(/inside the vault/);
    expect(existsSync(dest)).toBe(false);
  });

  it("refuses a destination that reaches into the vault through a link", () => {
    const vault = fakeVault();
    const link = join(temporaryDirectory(), "link");
    symlinkSync(vault, link, "junction");

    expect(() => createBackup({ vault, dest: join(link, "backups") })).toThrow(
      /inside the vault/,
    );
    expect(existsSync(join(vault, "backups"))).toBe(false);
  });

  it("refuses to restore from a backup stored inside the vault", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    const inside = join(vault, "kept-backup");
    cpSync(backupDir, inside, { recursive: true });

    expect(() =>
      restoreBackup({ vault, backup: inside, syncPaused: true }),
    ).toThrow(/inside the vault/);
  });

  it("fails when a file is missing from the vault after the restore copy", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    const droppingCopy = (from: string | URL, to: string | URL): void => {
      if (!String(to).endsWith("user-state.json")) cpSync(from, to);
    };
    rmSync(join(vault, "rss-dashboard-data", "user-state.json"));

    expect(() =>
      restoreBackup({
        vault,
        backup: backupDir,
        syncPaused: true,
        copyFile: droppingCopy,
      }),
    ).toThrow(/Restore failed verification[\s\S]*missing: .*user-state\.json/);
  });

  function tamperWithManifest(
    backupDir: string,
    change: (manifest: any) => void,
  ): void {
    const path = join(backupDir, MANIFEST_FILE);
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    change(manifest);
    writeFileSync(path, JSON.stringify(manifest));
  }

  it("refuses a manifest entry outside the folders the backup recorded", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    tamperWithManifest(backupDir, (manifest) => {
      manifest.files.push({ ...manifest.files[0], path: "notes/unrelated.md" });
    });

    expect(() =>
      restoreBackup({ vault, backup: backupDir, syncPaused: true }),
    ).toThrow(/outside its folders/);
    expect(read(vault, "notes/unrelated.md")).toBe("not part of the backup");
  });

  it("refuses a manifest entry that climbs out of the vault", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    tamperWithManifest(backupDir, (manifest) => {
      manifest.files[0].path = "rss-dashboard-data/../../escape.txt";
    });

    expect(() =>
      restoreBackup({ vault, backup: backupDir, syncPaused: true }),
    ).toThrow(/not a vault-relative/);
  });

  it("refuses a manifest entry without a size or SHA-256", () => {
    const vault = fakeVault();
    const { backupDir } = createBackup({ vault, dest: temporaryDirectory() });
    tamperWithManifest(backupDir, (manifest) => {
      delete manifest.files[0].sha256;
    });

    expect(() =>
      restoreBackup({ vault, backup: backupDir, syncPaused: true }),
    ).toThrow(/malformed entry/);
  });
});

describe("parseArgs flags", () => {
  it("collects repeated --folder values and accepts --flag=value", () => {
    const options = parseArgs(
      ["backup", "--vault=v", "--dest=d", "--folder", "a", "--folder=b"],
      {},
    );

    expect(options).toMatchObject({
      vault: "v",
      dest: "d",
      folders: ["a", "b"],
    });
  });

  it("rejects an unknown option, a missing value and a second command", () => {
    expect(() => parseArgs(["backup", "--nope"], {})).toThrow(/Unknown option/);
    expect(() => parseArgs(["backup", "--vault"], {})).toThrow(/needs a value/);
    expect(() => parseArgs(["backup", "restore"], {})).toThrow(
      /extra argument/,
    );
  });
});
