import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackageWithOptions } from "@electron/asar";
import { afterEach, describe, expect, it } from "vitest";

import {
  asarAssetName,
  asarVersionFromName,
  compareVersions,
  isOlder,
  listLocalAsars,
  newestLocalAsar,
  readAsarFile,
  readAsarVersion,
  selectNewestStableRelease,
  versionFromTag,
} from "../../scripts/obsidian-release.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "rss-dashboard-release-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** Builds a real asar declaring `version`, so the archive read is exercised. */
async function buildAsar(
  directory: string,
  version: string,
  name = `obsidian-${version}.asar`,
): Promise<string> {
  const source = join(directory, `source-${version}-${name}`);
  mkdirSync(source, { recursive: true });
  writeFileSync(
    join(source, "package.json"),
    JSON.stringify({ name: "obsidian-dev", version }, null, 2),
  );
  const asarPath = join(directory, name);
  await createPackageWithOptions(source, asarPath, {});
  return asarPath;
}

describe("asarVersionFromName", () => {
  it("reads the version Obsidian puts in an app archive's name", () => {
    expect(asarVersionFromName("obsidian-1.15.0.asar")).toBe("1.15.0");
  });

  it("ignores the previous build Obsidian keeps beside the current one", () => {
    // A real profile holds obsidian-1.13.7.asar.backup beside the live archive.
    expect(asarVersionFromName("obsidian-1.13.7.asar.backup")).toBeUndefined();
  });

  it("ignores the installer's own archive, which carries no version", () => {
    expect(asarVersionFromName("obsidian.asar")).toBeUndefined();
    expect(asarVersionFromName("app.asar")).toBeUndefined();
  });
});

describe("compareVersions and isOlder", () => {
  it("orders numerically, not lexically", () => {
    expect(compareVersions("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("1.15.0", "1.15.0")).toBe(0);
    expect(compareVersions("2.0.0", "1.99.9")).toBeGreaterThan(0);
  });

  it("calls an older build older", () => {
    expect(isOlder("1.14.4", "1.15.0")).toBe(true);
    expect(isOlder("1.15.0", "1.15.0")).toBe(false);
    expect(isOlder("1.16.0", "1.15.0")).toBe(false);
  });
});

describe("listLocalAsars", () => {
  it("returns the newest first and ignores anything that is not a versioned archive", () => {
    const directory = makeTemporaryDirectory();
    writeFileSync(join(directory, "obsidian-1.15.0.asar"), "");
    writeFileSync(join(directory, "obsidian-1.9.0.asar"), "");
    writeFileSync(join(directory, "obsidian-1.16.0.asar"), "");
    writeFileSync(join(directory, "obsidian-1.13.7.asar.backup"), "");
    writeFileSync(join(directory, "Preferences"), "{}");

    expect(listLocalAsars(directory).map((entry) => entry.version)).toEqual([
      "1.16.0",
      "1.15.0",
      "1.9.0",
    ]);
    expect(newestLocalAsar(directory)?.version).toBe("1.16.0");
  });

  it("treats a missing directory as empty rather than an error", () => {
    expect(listLocalAsars(join(makeTemporaryDirectory(), "nope"))).toEqual([]);
    expect(newestLocalAsar(undefined)).toBeUndefined();
  });
});

describe("readAsarVersion", () => {
  it("reads the version the archive declares for itself", async () => {
    const directory = makeTemporaryDirectory();
    const asarPath = await buildAsar(directory, "1.15.0");

    expect(readAsarVersion(asarPath)).toBe("1.15.0");
  });

  it("reports nothing rather than throwing when the archive is unreadable", () => {
    const directory = makeTemporaryDirectory();
    const truncated = join(directory, "obsidian-1.15.0.asar");
    writeFileSync(truncated, "not an asar");

    expect(readAsarVersion(truncated)).toBeUndefined();
    expect(readAsarVersion(join(directory, "missing.asar"))).toBeUndefined();
  });

  it("reads any member of the archive", async () => {
    const directory = makeTemporaryDirectory();
    const asarPath = await buildAsar(directory, "1.15.0");

    expect(readAsarFile(asarPath, "package.json")).toContain('"1.15.0"');
    expect(readAsarFile(asarPath, "absent.txt")).toBeUndefined();
  });
});

describe("release helpers", () => {
  it("names the desktop asar asset and strips the release tag", () => {
    expect(asarAssetName("1.15.0")).toBe("obsidian-1.15.0.asar.gz");
    expect(versionFromTag("v1.15.0")).toBe("1.15.0");
  });

  it("skips drafts, prereleases and mobile-only releases", () => {
    const releases = [
      { tag_name: "v9.9.9", prerelease: true, draft: false, assets: [] },
      { tag_name: "v9.8.8", prerelease: false, draft: true, assets: [] },
      {
        tag_name: "v1.13.8",
        prerelease: false,
        draft: false,
        assets: [{ name: "obsidian-1.13.8.apk" }],
      },
      {
        tag_name: "v1.13.7",
        prerelease: false,
        draft: false,
        assets: [{ name: "obsidian-1.13.7.asar.gz" }],
      },
    ];

    expect(selectNewestStableRelease(releases)?.version).toBe("1.13.7");
    expect(selectNewestStableRelease([])).toBeNull();
  });
});
