import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";

import { createPackageWithOptions } from "@electron/asar";
import { afterEach, describe, expect, it } from "vitest";

import {
  DESKTOP_FLOOR,
  assessVersion,
  assessViewport,
  buildDoctorReport,
  compareFixtureBuild,
  installerAsarPath,
  parseArgs,
  parseLoadedAppLog,
  pathFlavour,
  primeProfile,
  readPluginFloor,
  selectExpectedVersion,
} from "../../scripts/obsidian-profile.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "rss-dashboard-profile-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function buildAsar(
  directory: string,
  version: string,
  name = `obsidian-${version}.asar`,
): Promise<string> {
  const source = join(directory, `source-${version}-${name}`);
  mkdirSync(source, { recursive: true });
  writeFileSync(
    join(source, "package.json"),
    JSON.stringify({ name: "obsidian-dev", version }),
  );
  const asarPath = join(directory, name);
  await createPackageWithOptions(source, asarPath, {});
  return asarPath;
}

describe("parseArgs", () => {
  it("defaults to the installed app and the repo's fixture vault", () => {
    const options = parseArgs(["doctor"], {
      APPDATA: "C:\\Users\\me\\AppData\\Roaming",
    });

    expect(options).toMatchObject({
      command: "doctor",
      installer: "C:\\Program Files\\Obsidian\\Obsidian.exe",
      appData: join("C:\\Users\\me\\AppData\\Roaming", "obsidian"),
      refresh: false,
      fetch: false,
      verify: false,
      allowMismatch: false,
    });
    expect(String(options.vault).endsWith(".fixture-vault")).toBe(true);
  });

  it("reads every flag, with and without an equals sign", () => {
    const options = parseArgs([
      "--profile=C:\\tmp\\p",
      "--installer",
      "D:\\Obsidian\\Obsidian.exe",
      "--repo",
      "C:\\repo",
      "--vault=C:\\repo\\.fixture-vault",
      "--expect-version",
      "1.15.0",
      "--allow-version-mismatch",
      "--refresh",
      "--json",
      "doctor",
    ]);

    expect(options).toMatchObject({
      command: "doctor",
      profile: "C:\\tmp\\p",
      installer: "D:\\Obsidian\\Obsidian.exe",
      repo: "C:\\repo",
      vault: "C:\\repo\\.fixture-vault",
      expectVersion: "1.15.0",
      allowMismatch: true,
      refresh: true,
      json: true,
    });
  });

  it("requires a profile for prime and refuses a malformed expected version", () => {
    expect(() => parseArgs(["prime"], {})).toThrow(/needs --profile/);
    expect(() => parseArgs(["--expect-version", "1.15", "doctor"], {})).toThrow(
      /version like 1\.15\.0/,
    );
    expect(() => parseArgs(["--nope"], {})).toThrow(/Unknown option/);
    expect(() => parseArgs(["frobnicate"], {})).toThrow(/Unknown command/);
  });

  it("recognises help without a command", () => {
    expect(parseArgs(["--help"], {}).help).toBe(true);
  });
});

describe("installerAsarPath", () => {
  it("points at the installer's app archive, not its bootstrapper", () => {
    expect(installerAsarPath("C:\\Program Files\\Obsidian\\Obsidian.exe")).toBe(
      "C:\\Program Files\\Obsidian\\resources\\obsidian.asar",
    );
  });

  it("reads a POSIX install path on any host, without turning it into a relative one", () => {
    expect(installerAsarPath("/opt/Obsidian/obsidian")).toBe(
      "/opt/Obsidian/resources/obsidian.asar",
    );
  });

  it("chooses the path flavour from the path, not the host", () => {
    expect(pathFlavour("C:\\Program Files\\Obsidian\\Obsidian.exe")).toBe(
      win32,
    );
    expect(pathFlavour("/opt/Obsidian/obsidian")).toBe(posix);
  });
});

describe("parseLoadedAppLog", () => {
  it("takes the last load line, because a relaunch appends another", () => {
    const text = [
      "2026-11-11 18:06:12 Loaded main app package C:\\Program Files\\Obsidian\\resources\\obsidian.asar",
      "2026-11-11 18:06:13 Checking for update using Github",
      "2026-11-11 18:06:15 Update complete.",
      "2026-11-11 18:10:02 Loaded updated app C:\\Users\\me\\AppData\\Roaming\\obsidian\\obsidian-1.15.0.asar",
    ].join("\n");

    const loaded = parseLoadedAppLog(text, (path) =>
      path.endsWith("obsidian-1.15.0.asar") ? "1.15.0" : "1.14.4",
    );

    expect(loaded).toEqual({
      path: "C:\\Users\\me\\AppData\\Roaming\\obsidian\\obsidian-1.15.0.asar",
      version: "1.15.0",
    });
  });

  it("reports nothing when the log has no load line yet", () => {
    expect(parseLoadedAppLog("", () => "1.15.0")).toBeUndefined();
    expect(
      parseLoadedAppLog("Checking for update using Github"),
    ).toBeUndefined();
  });
});

describe("selectExpectedVersion", () => {
  const profileAsar = {
    version: "1.15.0",
    path: "profile/obsidian-1.15.0.asar",
  };
  const newestLocal = {
    version: "1.15.0",
    path: "roaming/obsidian-1.15.0.asar",
  };

  it("prefers an explicit expectation over anything derived", () => {
    expect(
      selectExpectedVersion({
        expectVersion: "1.16.0",
        profileAsar,
        newestLocal,
        installerVersion: "1.14.4",
      }),
    ).toEqual({ version: "1.16.0", source: "expect-version" });
  });

  it("falls back from the profile to the machine to the installer", () => {
    expect(
      selectExpectedVersion({
        profileAsar,
        newestLocal,
        installerVersion: "1.14.4",
      }),
    ).toEqual({ version: "1.15.0", source: "profile" });
    expect(
      selectExpectedVersion({ newestLocal, installerVersion: "1.14.4" }),
    ).toEqual({ version: "1.15.0", source: "newest-local" });
    expect(selectExpectedVersion({ installerVersion: "1.14.4" })).toEqual({
      version: "1.14.4",
      source: "installer",
    });
    expect(selectExpectedVersion({})).toEqual({
      version: undefined,
      source: "unknown",
    });
  });
});

describe("assessVersion", () => {
  const expected = { version: "1.15.0", source: "profile" };

  it("passes when the loaded build is the expected one", () => {
    const verdict = assessVersion({
      expected,
      loaded: { version: "1.15.0", path: "x" },
      installerVersion: "1.14.4",
    });

    expect(verdict.status).toBe("ok");
  });

  it("fails when the run loaded the installer build instead, and names both", () => {
    const verdict = assessVersion({
      expected,
      loaded: { version: "1.14.4", path: "resources/obsidian.asar" },
      installerVersion: "1.14.4",
    });

    expect(verdict.status).toBe("fail");
    expect(verdict.severity).toBe("older");
    expect(verdict.message).toContain("1.14.4");
    expect(verdict.message).toContain("1.15.0");
    expect(verdict.message).toContain("installer");
    expect(verdict.message).toContain("relaunch");
  });

  it("warns, and does not fail, when the run is newer than expected", () => {
    const verdict = assessVersion({
      expected,
      loaded: { version: "1.16.0", path: "x" },
      installerVersion: "1.14.4",
    });

    expect(verdict.status).toBe("warn");
    expect(verdict.severity).toBe("newer");
  });

  it("downgrades an older build to a warning when the bypass is passed", () => {
    const verdict = assessVersion({
      expected,
      loaded: { version: "1.14.4", path: "x" },
      installerVersion: "1.14.4",
      allowMismatch: true,
    });

    expect(verdict.status).toBe("warn");
    expect(verdict.severity).toBe("older-bypassed");
    expect(verdict.message).toContain("--allow-version-mismatch");
  });

  it("warns rather than fails when there is no log line or no archive", () => {
    expect(
      assessVersion({ expected, loaded: undefined, installerVersion: "1.14.4" })
        .severity,
    ).toBe("unloaded");
    expect(assessVersion({ expected: { source: "unknown" } }).severity).toBe(
      "unknown",
    );
  });
});

describe("primeProfile", () => {
  it("copies the newest archive the machine already has, offline", async () => {
    const directory = makeTemporaryDirectory();
    const appData = join(directory, "roaming");
    const profile = join(directory, "profile");
    mkdirSync(appData, { recursive: true });
    await buildAsar(appData, "1.15.0");
    writeFileSync(join(appData, "obsidian-1.13.7.asar.backup"), "");

    const result = await primeProfile({
      profile,
      appData,
      log: () => {},
      newestRelease: async () => {
        throw new Error("prime must not need the network");
      },
    });

    expect(result).toMatchObject({ version: "1.15.0", copied: true });
    expect(
      readFileSync(join(profile, "obsidian-1.15.0.asar")).length,
    ).toBeGreaterThan(0);
  });

  it("keeps a profile that already holds the newest archive", async () => {
    const directory = makeTemporaryDirectory();
    const appData = join(directory, "roaming");
    const profile = join(directory, "profile");
    mkdirSync(appData, { recursive: true });
    mkdirSync(profile, { recursive: true });
    await buildAsar(appData, "1.15.0");
    await buildAsar(profile, "1.15.0");

    const result = await primeProfile({ profile, appData, log: () => {} });

    expect(result).toMatchObject({ version: "1.15.0", copied: false });
  });

  it("replaces an older profile archive with the machine's newer one", async () => {
    const directory = makeTemporaryDirectory();
    const appData = join(directory, "roaming");
    const profile = join(directory, "profile");
    mkdirSync(appData, { recursive: true });
    mkdirSync(profile, { recursive: true });
    await buildAsar(appData, "1.15.0");
    await buildAsar(profile, "1.14.4");

    const result = await primeProfile({ profile, appData, log: () => {} });

    expect(result).toMatchObject({ version: "1.15.0", copied: true });
  });

  it("refuses to guess when no archive exists and download is not allowed", async () => {
    const directory = makeTemporaryDirectory();

    await expect(
      primeProfile({
        profile: join(directory, "profile"),
        appData: join(directory, "roaming"),
        log: () => {},
        newestRelease: async () => ({ version: "1.16.0" }),
      }),
    ).rejects.toThrow(/Pass --fetch/);
  });

  it("downloads only when --fetch is passed, and verifies what it wrote", async () => {
    const directory = makeTemporaryDirectory();
    const profile = join(directory, "profile");
    const bytes = readFileSync(await buildAsar(directory, "1.16.0"));

    const result = await primeProfile({
      profile,
      appData: join(directory, "roaming"),
      fetch: true,
      log: () => {},
      newestRelease: async () => ({ version: "1.16.0" }),
      downloadAsar: async () => bytes,
    });

    expect(result).toMatchObject({ version: "1.16.0", copied: true });
  });

  it("refuses a downloaded archive whose own version disagrees", async () => {
    const directory = makeTemporaryDirectory();
    const bytes = readFileSync(await buildAsar(directory, "9.9.9"));

    await expect(
      primeProfile({
        profile: join(directory, "profile"),
        appData: join(directory, "roaming"),
        fetch: true,
        log: () => {},
        newestRelease: async () => ({ version: "1.16.0" }),
        downloadAsar: async () => bytes,
      }),
    ).rejects.toThrow(/refusing to launch/i);
  });
});

describe("compareFixtureBuild and readPluginFloor", () => {
  it("reports a matching, stale and missing build", () => {
    const repo = makeTemporaryDirectory();
    const vault = join(repo, ".fixture-vault");
    const pluginDir = join(vault, ".obsidian", "plugins", "rss-dashboard");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(repo, "main.js"), "same");
    writeFileSync(join(pluginDir, "main.js"), "same");
    writeFileSync(join(repo, "styles.css"), "new");
    writeFileSync(join(pluginDir, "styles.css"), "old");

    const rows = compareFixtureBuild({ repo, vault });

    expect(rows).toEqual([
      expect.objectContaining({ name: "main.js", state: "match" }),
      expect.objectContaining({ name: "styles.css", state: "stale" }),
    ]);
  });

  it("says so when the worktree has not been built yet", () => {
    const repo = makeTemporaryDirectory();

    expect(compareFixtureBuild({ repo }).map((row) => row.state)).toEqual([
      "no-repo-build",
      "no-repo-build",
    ]);
  });

  it("reads the plugin's declared floor from its manifest", () => {
    const repo = makeTemporaryDirectory();
    writeFileSync(
      join(repo, "manifest.json"),
      JSON.stringify({ version: "2.7.1", minAppVersion: "1.8.7" }),
    );

    expect(readPluginFloor(repo)).toEqual({
      version: "2.7.1",
      minAppVersion: "1.8.7",
    });
    expect(readPluginFloor(makeTemporaryDirectory())).toBeUndefined();
  });
});

describe("buildDoctorReport", () => {
  async function seedMachine(version: string): Promise<{
    repo: string;
    appData: string;
    installer: string;
  }> {
    const root = makeTemporaryDirectory();
    const repo = join(root, "repo");
    const appData = join(root, "roaming");
    const installerDir = join(root, "install");
    mkdirSync(repo, { recursive: true });
    mkdirSync(appData, { recursive: true });
    mkdirSync(join(installerDir, "resources"), { recursive: true });
    writeFileSync(
      join(repo, "manifest.json"),
      JSON.stringify({ version: "2.7.1", minAppVersion: "1.8.7" }),
    );
    await buildAsar(appData, version);
    const installer = join(installerDir, "Obsidian.exe");
    writeFileSync(installer, "");
    await buildAsar(installerDir, "1.14.4", join("resources", "obsidian.asar"));
    return { repo, appData, installer };
  }

  it("names the machine's newest archive when no profile is given", async () => {
    const { repo, appData, installer } = await seedMachine("1.15.0");

    const report = await buildDoctorReport({
      repo,
      appData,
      installer,
      vault: join(repo, ".fixture-vault"),
    });

    expect(report.expected).toEqual({
      version: "1.15.0",
      source: "newest-local",
    });
    expect(report.verdict.severity).toBe("no-profile");
  });

  it("fails a run whose log shows the installer build loaded", async () => {
    const { repo, appData, installer } = await seedMachine("1.15.0");
    const profile = join(repo, "profile");
    mkdirSync(profile, { recursive: true });
    await buildAsar(profile, "1.15.0");
    writeFileSync(
      join(profile, "obsidian.log"),
      `2026-11-11 18:06:12 Loaded main app package ${installerAsarPath(installer)}\n`,
    );

    const report = await buildDoctorReport({
      repo,
      appData,
      installer,
      profile,
      vault: join(repo, ".fixture-vault"),
    });

    expect(report.expected.source).toBe("profile");
    expect(report.loaded?.version).toBe("1.14.4");
    expect(report.verdict.status).toBe("fail");
  });

  it("passes when the profile holds and loads the newest archive", async () => {
    const { repo, appData, installer } = await seedMachine("1.15.0");
    const profile = join(repo, "profile");
    mkdirSync(profile, { recursive: true });
    const asarPath = await buildAsar(profile, "1.15.0");
    writeFileSync(
      join(profile, "obsidian.log"),
      `2026-11-11 18:10:02 Loaded updated app ${asarPath}\n`,
    );

    const report = await buildDoctorReport({
      repo,
      appData,
      installer,
      profile,
      vault: join(repo, ".fixture-vault"),
    });

    expect(report.verdict.status).toBe("ok");
    expect(report.floorVerdict.status).toBe("ok");
  });
});

describe("assessViewport", () => {
  it("passes a width inside a band, above the desktop floor", () => {
    expect(
      assessViewport({ width: 1440, band: "1400-1600", onEdge: false }),
    ).toMatchObject({ status: "ok" });
  });

  it("fails a row captured below the desktop floor, naming the remedy", () => {
    const verdict = assessViewport({
      width: 1023,
      band: "920-1024",
      onEdge: false,
    });

    expect(verdict.status).toBe("fail");
    expect(verdict.message).toContain("1023");
    expect(verdict.message).toContain(String(DESKTOP_FLOOR));
    expect(verdict.message).toContain("viewport desktop");
  });

  it("warns, without failing, when the width sits on a breakpoint", () => {
    expect(
      assessViewport({ width: 1400, band: "1400", onEdge: true }),
    ).toMatchObject({
      status: "warn",
    });
  });

  it("warns when no viewport could be read", () => {
    expect(assessViewport(undefined).status).toBe("warn");
  });
});

describe("primeProfile with a refresh and nothing new to copy", () => {
  it("keeps the archive the profile already holds", async () => {
    const directory = makeTemporaryDirectory();
    const profile = join(directory, "profile");
    mkdirSync(profile, { recursive: true });
    await buildAsar(profile, "1.15.0");

    const result = await primeProfile({
      profile,
      appData: join(directory, "roaming"),
      refresh: true,
      log: () => {},
    });

    expect(result).toMatchObject({ version: "1.15.0", copied: false });
  });
});
