import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  METADATA_PATH,
  TEMPLATE_DIR,
  USER_STATE_PATH,
} from "../../scripts/generate-fixture-vault.mjs";
import { MARKER_FILE } from "../../scripts/setup-fixture-vault.mjs";
import {
  DOT_FOLDER,
  PRESETS,
  SYNC_FEED_ID,
  SimulateSyncError,
  parseArgs,
  planPreset,
  simulateSync,
} from "../../scripts/simulate-sync.mjs";

const temporaryDirectories: string[] = [];

function fixtureVault(storage = "shard-v2"): string {
  const vault = mkdtempSync(join(tmpdir(), "rss-dashboard-sync-sim-"));
  temporaryDirectories.push(vault);
  cpSync(TEMPLATE_DIR, vault, { recursive: true });
  writeFileSync(join(vault, MARKER_FILE), JSON.stringify({ storage }));
  return vault;
}

function files(directory: string): Record<string, string> {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : [join(dir, entry.name)],
    );
  return Object.fromEntries(
    walk(directory).map((file) => [
      relative(directory, file).replace(/\\/g, "/"),
      readFileSync(file, "utf8"),
    ]),
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("simulate-sync marker guard", () => {
  it("refuses a folder without the fixture marker and writes nothing", async () => {
    const folder = mkdtempSync(join(tmpdir(), "rss-dashboard-not-fixture-"));
    temporaryDirectories.push(folder);
    cpSync(TEMPLATE_DIR, folder, { recursive: true });
    const before = files(folder);

    await expect(
      simulateSync({ vault: folder, preset: "data-first" }),
    ).rejects.toThrow(SimulateSyncError);
    await expect(
      simulateSync({ vault: folder, preset: "data-first" }),
    ).rejects.toThrow(MARKER_FILE);

    expect(files(folder)).toEqual(before);
  });

  it("refuses a missing folder", async () => {
    await expect(
      simulateSync({
        vault: join(tmpdir(), "rss-dashboard-no-such-vault"),
        preset: "reverse",
      }),
    ).rejects.toThrow(SimulateSyncError);
  });

  it("refuses a deprecated storage variant", async () => {
    const vault = fixtureVault("legacy-json");
    await expect(simulateSync({ vault, preset: "data-first" })).rejects.toThrow(
      /only Shard storage v2/,
    );
  });
});

describe("simulate-sync dry run", () => {
  it("names the vault and every file in order and writes nothing", async () => {
    const vault = fixtureVault();
    const before = files(vault);
    const lines: string[] = [];

    const result = await simulateSync({
      vault,
      preset: "late-shard",
      dryRun: true,
      log: (line: string) => {
        lines.push(line);
      },
    });

    const output = lines.join("\n");
    expect(output).toContain(vault);
    expect(result.written).toEqual([]);
    for (const step of result.steps as { path: string }[]) {
      expect(output).toContain(step.path);
    }
    expect(output).toContain("Nothing was written.");
    expect(files(vault)).toEqual(before);
  });
});

describe("simulate-sync presets", () => {
  const paths = (preset: string) =>
    (planPreset(preset, fixtureVault()) as { path: string }[]).map(
      (step) => step.path,
    );
  const shard = `rss-dashboard-data/feeds/${SYNC_FEED_ID}.json`;

  it("orders each preset's files", () => {
    expect(paths("data-first")).toEqual([
      METADATA_PATH,
      shard,
      USER_STATE_PATH,
    ]);
    expect(paths("reverse")).toEqual([USER_STATE_PATH, shard, METADATA_PATH]);
    expect(paths("late-shard")).toEqual([
      METADATA_PATH,
      USER_STATE_PATH,
      shard,
    ]);
    expect(paths("user-state-late")).toEqual([
      METADATA_PATH,
      shard,
      USER_STATE_PATH,
    ]);
    expect(paths("empty-newer-wins")).toEqual([METADATA_PATH]);
  });

  it("marks only the late file", () => {
    const late = (preset: string) =>
      (planPreset(preset, fixtureVault()) as { path: string; late?: boolean }[])
        .filter((step) => step.late)
        .map((step) => step.path);
    expect(late("late-shard")).toEqual([shard]);
    expect(late("user-state-late")).toEqual([USER_STATE_PATH]);
    expect(late("data-first")).toEqual([]);
  });

  it("keeps the dot-folder preset out of the plugin's folders", () => {
    for (const path of paths("dot-folder-skip")) {
      expect(path.startsWith(`${DOT_FOLDER}/`)).toBe(true);
    }
  });

  it.each(Object.keys(PRESETS))(
    "%s changes mtime and size of every file it writes",
    async (preset) => {
      const vault = fixtureVault();
      const before = new Map<string, { mtimeMs: number; size: number }>();
      for (const step of planPreset(preset, vault) as { path: string }[]) {
        const path = join(vault, ...step.path.split("/"));
        if (existsSync(path)) before.set(step.path, statSync(path));
      }

      const { written } = await simulateSync({
        vault,
        preset,
        gapMs: 0,
        lateMs: 0,
      });

      expect(written.length).toBeGreaterThan(0);
      for (const { path } of written as { path: string }[]) {
        const after = statSync(join(vault, ...path.split("/")));
        const prior = before.get(path);
        if (prior) {
          expect(after.mtimeMs).toBeGreaterThan(prior.mtimeMs);
          expect(after.size).not.toBe(prior.size);
        }
      }
    },
  );

  it("writes an empty newer data.json for empty-newer-wins", async () => {
    const vault = fixtureVault();
    await simulateSync({ vault, preset: "empty-newer-wins" });
    const data = JSON.parse(
      readFileSync(join(vault, ...METADATA_PATH.split("/")), "utf8"),
    ) as { feeds: unknown[]; folders: unknown[] };
    expect(data.feeds).toEqual([]);
    expect(data.folders).toEqual([]);
  });

  it("leaves the plugin's own files untouched for dot-folder-skip", async () => {
    const vault = fixtureVault();
    const before = files(vault);
    await simulateSync({ vault, preset: "dot-folder-skip", gapMs: 0 });
    const after = files(vault);
    for (const [path, content] of Object.entries(before)) {
      expect(after[path]).toBe(content);
    }
    expect(Object.keys(after).some((p) => p.startsWith(`${DOT_FOLDER}/`))).toBe(
      true,
    );
  });
});

describe("simulate-sync parseArgs", () => {
  it("reads a preset and options", () => {
    expect(
      parseArgs(["reverse", "--vault", "v", "--dry-run", "--gap", "5"]),
    ).toMatchObject({ preset: "reverse", vault: "v", dryRun: true, gapMs: 5 });
  });

  it("rejects an unknown preset, a conflict preset and an unknown option", () => {
    expect(() => parseArgs(["nope"])).toThrow(/Unknown preset/);
    expect(() => parseArgs(["conflict-copy"])).toThrow(/Unknown preset/);
    expect(() => parseArgs(["reverse", "--x"])).toThrow(/Unknown option/);
    expect(() => parseArgs([])).toThrow(/Name a preset/);
  });
});
