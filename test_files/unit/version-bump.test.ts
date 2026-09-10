import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cwd, env, execPath } from "node:process";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = resolve(env.INIT_CWD ?? cwd(), "version-bump.mjs");
const temporaryDirectories: string[] = [];

function createVersionBumpFixture(
  targetVersion: string,
  minAppVersion: string,
  versions: Record<string, string>,
) {
  const directory = mkdtempSync(join(tmpdir(), "rss-dashboard-version-bump-"));
  temporaryDirectories.push(directory);

  writeFileSync(
    join(directory, "manifest.json"),
    JSON.stringify({ version: "0.0.0", minAppVersion }),
  );
  writeFileSync(join(directory, "versions.json"), JSON.stringify(versions));

  const environment = Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => key.toLowerCase() !== "npm_package_version",
    ),
  );
  environment.npm_package_version = targetVersion;

  execFileSync(execPath, [scriptPath], {
    cwd: directory,
    env: environment,
  });

  return {
    manifest: JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as {
      version: string;
      minAppVersion: string;
    },
    versions: JSON.parse(readFileSync(join(directory, "versions.json"), "utf8")) as Record<
      string,
      string
    >,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("version-bump", () => {
  it("preserves the recorded compatibility floor for an existing target version", () => {
    const result = createVersionBumpFixture("2.7.0", "1.12.0", {
      "2.7.0": "1.8.7",
    });

    expect(result.manifest.version).toBe("2.7.0");
    expect(result.versions).toEqual({ "2.7.0": "1.8.7" });
  });

  it("adds the manifest compatibility floor for a missing target version", () => {
    const result = createVersionBumpFixture("2.8.0", "1.12.0", {
      "2.7.0": "1.8.7",
    });

    expect(result.manifest.version).toBe("2.8.0");
    expect(result.versions).toEqual({ "2.7.0": "1.8.7", "2.8.0": "1.12.0" });
  });
});
