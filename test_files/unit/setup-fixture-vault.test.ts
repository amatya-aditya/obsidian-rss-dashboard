import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  TEMPLATE_DIR,
  buildFixtureFiles,
} from "../../scripts/generate-fixture-vault.mjs";
import {
  MARKER_FILE,
  PLUGIN_DIR as PLUGIN_DIR_PATH,
  parseArgs,
  setupFixtureVault,
} from "../../scripts/setup-fixture-vault.mjs";

const PLUGIN_DIR = PLUGIN_DIR_PATH.split("/");
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "rss-dashboard-fixture-setup-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** A stand-in repository root holding a plugin build, as `npm run build` leaves it. */
function fakeBuild(version = "9.9.9"): string {
  const repoRoot = temporaryDirectory();
  writeFileSync(join(repoRoot, "main.js"), `// build ${version}\n`);
  writeFileSync(join(repoRoot, "styles.css"), `/* build ${version} */\n`);
  writeFileSync(
    join(repoRoot, "manifest.json"),
    JSON.stringify({ id: "rss-dashboard", version }),
  );
  return repoRoot;
}

function readJson(...segments: string[]): Record<string, unknown> {
  return JSON.parse(readFileSync(join(...segments), "utf8")) as Record<string, unknown>;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function snapshot(directory: string): Record<string, string> {
  return Object.fromEntries(
    listFiles(directory).map((file) => [
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

describe("generate-fixture-vault", () => {
  it("matches the committed template, so the seeded data can be regenerated", () => {
    for (const [path, content] of Object.entries(buildFixtureFiles())) {
      const committed = readFileSync(join(TEMPLATE_DIR, ...path.split("/")), "utf8");
      // Git may check the files out with CRLF line endings on Windows.
      expect(committed.replace(/\r\n/g, "\n"), path).toBe(content);
    }
  });
});

describe("setup-fixture-vault", () => {
  it("copies the template and the current build into a new vault", () => {
    const repoRoot = fakeBuild();
    const target = join(temporaryDirectory(), "vault");
    const templateBefore = snapshot(TEMPLATE_DIR);

    const result = setupFixtureVault({ repoRoot, target });

    expect(result.vaultDir).toBe(target);
    expect(existsSync(join(target, "welcome.md"))).toBe(true);
    expect(existsSync(join(target, "rss-dashboard-data", "user-state.json"))).toBe(true);
    expect(readFileSync(join(target, ...PLUGIN_DIR, "main.js"), "utf8")).toBe(
      "// build 9.9.9\n",
    );
    expect(existsSync(join(target, ...PLUGIN_DIR, "styles.css"))).toBe(true);
    expect(readJson(target, ...PLUGIN_DIR, "manifest.json").version).toBe("9.9.9");
    expect(readJson(target, MARKER_FILE).storage).toBe("shard-v2");
    // The installed release is recorded as announced, so What's New stays shut.
    expect(readJson(target, "rss-dashboard-data", "data.json").lastShownVersion).toBe(
      "9.9.9",
    );
    expect(snapshot(TEMPLATE_DIR)).toEqual(templateBefore);
  });

  it("leaves the last shown version unset when asked to show What's New", () => {
    const target = join(temporaryDirectory(), "vault");

    setupFixtureVault({ repoRoot: fakeBuild(), target, showWhatsNew: true });

    expect(readJson(target, "rss-dashboard-data", "data.json")).not.toHaveProperty(
      "lastShownVersion",
    );
  });

  it("resets a vault it created, discarding changes made while testing", () => {
    const repoRoot = fakeBuild();
    const target = join(temporaryDirectory(), "vault");
    setupFixtureVault({ repoRoot, target });
    writeFileSync(join(target, "welcome.md"), "changed while testing");
    writeFileSync(join(target, "new-note.md"), "created while testing");

    setupFixtureVault({ repoRoot, target });

    expect(readFileSync(join(target, "welcome.md"), "utf8")).not.toBe(
      "changed while testing",
    );
    expect(existsSync(join(target, "new-note.md"))).toBe(false);
  });

  it("refuses to replace a folder it did not create, and leaves it untouched", () => {
    const target = temporaryDirectory();
    writeFileSync(join(target, "important.md"), "not a fixture vault");

    expect(() => setupFixtureVault({ repoRoot: fakeBuild(), target })).toThrow(
      /Refusing .*no \.rss-dashboard-fixture-vault\.json marker/,
    );
    expect(readdirSync(target)).toEqual(["important.md"]);
  });

  it("refuses a folder that overlaps the template or holds the repository", () => {
    const repoRoot = fakeBuild();

    expect(() => setupFixtureVault({ repoRoot, target: TEMPLATE_DIR })).toThrow(
      /overlaps the committed template/,
    );
    expect(() => setupFixtureVault({ repoRoot, target: repoRoot })).toThrow(
      /contains the repository/,
    );
  });

  it("fails before deleting anything when there is no build to copy", () => {
    const repoRoot = fakeBuild();
    const target = join(temporaryDirectory(), "vault");
    setupFixtureVault({ repoRoot, target });
    writeFileSync(join(target, "new-note.md"), "created while testing");
    rmSync(join(repoRoot, "main.js"));

    expect(() => setupFixtureVault({ repoRoot, target })).toThrow(/npm run build/);
    expect(existsSync(join(target, "new-note.md"))).toBe(true);
  });

  it("installs a new build into an existing vault without resetting its data", () => {
    const target = join(temporaryDirectory(), "vault");
    setupFixtureVault({ repoRoot: fakeBuild("1.0.0"), target });
    writeFileSync(join(target, "new-note.md"), "created while testing");

    setupFixtureVault({ repoRoot: fakeBuild("2.0.0"), target, pluginOnly: true });

    expect(readJson(target, ...PLUGIN_DIR, "manifest.json").version).toBe("2.0.0");
    expect(existsSync(join(target, "new-note.md"))).toBe(true);
  });

  it("refuses a plugin-only update of a folder that is not a fixture vault", () => {
    const target = join(temporaryDirectory(), "vault");
    mkdirSync(target);

    expect(() =>
      setupFixtureVault({ repoRoot: fakeBuild(), target, pluginOnly: true }),
    ).toThrow(/not a fixture vault yet/);
  });

  it("seeds the same content in Legacy JSON storage on request", () => {
    const target = join(temporaryDirectory(), "vault");

    setupFixtureVault({ repoRoot: fakeBuild(), target, storage: "legacy-json" });

    const settings = readJson(target, ...PLUGIN_DIR, "data.json");
    const feeds = settings.feeds as Array<{ items: unknown[] }>;
    expect(settings.storageMode).toBe("legacy-json");
    expect(settings.metadataStorageMode).toBe("plugin-default");
    expect(settings.lastShownVersion).toBe("9.9.9");
    expect(feeds.reduce((total, feed) => total + feed.items.length, 0)).toBe(153);
    expect(existsSync(join(target, "rss-dashboard-data"))).toBe(false);
  });

  it("seeds the same content in Shard storage v1 on request", () => {
    const target = join(temporaryDirectory(), "vault");

    setupFixtureVault({ repoRoot: fakeBuild(), target, storage: "shard-v1" });

    const settings = readJson(target, ...PLUGIN_DIR, "data.json");
    const shard = readJson(target, "rss-dashboard-data", "feeds", "fx-rss-tech.json");
    expect(settings.storageMode).toBe("vault-shards");
    expect((shard.items as Array<{ starred: boolean }>).some((item) => item.starred)).toBe(
      true,
    );
    expect(existsSync(join(target, "rss-dashboard-data", "user-state.json"))).toBe(false);
    expect(existsSync(join(target, "rss-dashboard-data", "data.json"))).toBe(false);
  });
});

describe("setup-fixture-vault arguments", () => {
  it("reads a target folder and options", () => {
    expect(parseArgs(["../vault", "--storage", "legacy-json", "--plugin-only"])).toEqual({
      target: "../vault",
      storage: "legacy-json",
      pluginOnly: true,
      showWhatsNew: false,
      help: false,
    });
    expect(parseArgs(["--storage=shard-v1"]).storage).toBe("shard-v1");
  });

  it("rejects an unknown storage variant or option", () => {
    expect(() => parseArgs(["--storage", "sqlite"])).toThrow(/Unknown storage variant/);
    expect(() => parseArgs(["--force"])).toThrow(/Unknown option/);
  });
});
