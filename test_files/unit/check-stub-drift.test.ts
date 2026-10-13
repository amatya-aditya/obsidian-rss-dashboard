import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execPath } from "node:process";
import { fileURLToPath } from "node:url";

import { createPackageWithOptions } from "@electron/asar";
import { afterEach, describe, expect, it } from "vitest";

import {
  FACT_CATALOG,
  StubDriftError,
  asarAssetName,
  diffFacts,
  indexRelease,
  parseArgs,
  parseBaseline,
  selectNewestStableRelease,
  serializeBaseline,
  versionFromTag,
} from "../../scripts/check-stub-drift.mjs";

type ReleaseRecord = {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  published_at?: string;
  assets: { name: string }[];
};

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, "..", "..");
const SCRIPT_PATH = join(ROOT_DIR, "scripts", "check-stub-drift.mjs");
const RELEASES: ReleaseRecord[] = (
  JSON.parse(
    readFileSync(join(TEST_DIR, "fixtures", "obsidian-releases.json"), "utf8"),
  ) as { releases: ReleaseRecord[] }
).releases;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "rss-dashboard-stub-drift-"));
  temporaryDirectories.push(directory);
  return directory;
}

/**
 * Builds a real asar whose app.css and app.js contain `matches`, one per line.
 * The CLI reads it back through @electron/asar, so the archive read is
 * exercised rather than mocked.
 */
async function buildReleaseAsar(
  directory: string,
  matches: string[],
): Promise<string> {
  const source = join(directory, "release-source");
  mkdirSync(source, { recursive: true });
  const text = matches.join("\n");
  writeFileSync(join(source, "app.css"), text);
  writeFileSync(join(source, "app.js"), text);
  const asarPath = join(directory, "release.asar");
  await createPackageWithOptions(source, asarPath, {});
  return asarPath;
}

/** Seeds a cache directory with the asar the CLI would otherwise download. */
async function seedCache(
  directory: string,
  version: string,
  matches: string[],
): Promise<string> {
  const cacheDir = join(directory, `cache-${version}`);
  mkdirSync(cacheDir, { recursive: true });
  copyFileSync(
    await buildReleaseAsar(directory, matches),
    join(cacheDir, `obsidian-${version}.asar`),
  );
  return cacheDir;
}

function runCli(args: string[]): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(execPath, [SCRIPT_PATH, ...args], {
    encoding: "utf8",
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("indexRelease", () => {
  const catalog = [
    { id: "message.alpha", kind: "message", match: "Alpha." },
    { id: "class.beta", kind: "class", match: "beta" },
    { id: "class.gamma", kind: "class", match: "gamma" },
  ];

  it("records which release members carry each catalog fact", () => {
    const index = indexRelease(
      { "app.css": "gamma", "app.js": "Alpha. gamma" },
      catalog,
    );

    expect(index["message.alpha"]).toEqual({
      kind: "message",
      match: "Alpha.",
      sources: ["app.js"],
    });
    expect(index["class.beta"].sources).toEqual([]);
    expect(index["class.gamma"].sources).toEqual(["app.css", "app.js"]);
  });
});

describe("diffFacts", () => {
  const catalog = [
    { id: "a", kind: "message", match: "Alpha." },
    { id: "b", kind: "class", match: "beta" },
    { id: "c", kind: "class", match: "gamma" },
  ];
  const baseline = {
    obsidian: "1.2.3",
    facts: {
      a: { kind: "message", match: "Alpha.", sources: ["app.js"] },
      b: { kind: "class", match: "beta", sources: ["app.css"] },
    },
  };

  it("reports a pinned fact the release has dropped as gone", () => {
    // The canned release keeps `a` and adds `c`, but has lost `b`.
    const index = indexRelease({ "app.js": "Alpha. gamma" }, catalog);
    const diff = diffFacts(index, baseline);

    expect(diff.gone.map((fact) => fact.id)).toEqual(["b"]);
    expect(diff.gone[0].baselineSources).toEqual(["app.css"]);
  });

  it("reports a fact present but not certified as new, without failing", () => {
    const index = indexRelease({ "app.js": "Alpha. beta gamma" }, catalog);
    const diff = diffFacts(index, baseline);

    expect(diff.gone).toEqual([]);
    expect(diff.newFacts.map((fact) => fact.id)).toEqual(["c"]);
    expect(diff.absent).toEqual([]);
    expect(diff.retired).toEqual([]);
  });

  it("reports a catalog fact neither certified nor present as absent", () => {
    const index = indexRelease({ "app.js": "Alpha." }, catalog);
    const diff = diffFacts(index, baseline);

    expect(diff.gone.map((fact) => fact.id)).toEqual(["b"]);
    expect(diff.absent.map((fact) => fact.id)).toEqual(["c"]);
  });

  it("reports a baseline fact the catalog no longer lists as retired", () => {
    const index = indexRelease({ "app.js": "Alpha. beta" }, [
      catalog[0],
      catalog[1],
    ]);
    const diff = diffFacts(index, {
      obsidian: "1.2.3",
      facts: {
        ...baseline.facts,
        dropped: { kind: "class", match: "gone", sources: ["app.css"] },
      },
    });

    expect(diff.gone).toEqual([]);
    expect(diff.retired.map((fact) => fact.id)).toEqual(["dropped"]);
  });
});

describe("baseline round-trip", () => {
  it("serializes the certified release and its facts, and parses them back", () => {
    const index = indexRelease({ "app.css": "beta", "app.js": "Alpha. beta" }, [
      { id: "message.alpha", kind: "message", match: "Alpha." },
      { id: "class.beta", kind: "class", match: "beta" },
    ]);
    const text = serializeBaseline("1.14.4", index);

    // Pins the exact shape Prettier writes (two-space JSON, inline short
    // arrays), so regenerating the baseline does not fail `format:check`.
    expect(text).toBe(
      [
        "{",
        '  "obsidian": "1.14.4",',
        '  "facts": {',
        '    "class.beta": {',
        '      "kind": "class",',
        '      "match": "beta",',
        '      "sources": ["app.css", "app.js"]',
        "    },",
        '    "message.alpha": {',
        '      "kind": "message",',
        '      "match": "Alpha.",',
        '      "sources": ["app.js"]',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    );

    const baseline = parseBaseline(text);
    expect(baseline.obsidian).toBe("1.14.4");
    expect(baseline.facts["message.alpha"]).toEqual({
      kind: "message",
      match: "Alpha.",
      sources: ["app.js"],
    });
  });
});

describe("selectNewestStableRelease", () => {
  it("picks the newest public stable release that ships a desktop asar", () => {
    expect(selectNewestStableRelease(RELEASES)?.version).toBe("1.14.4");
  });

  it("skips a mobile-only newest release and picks the next desktop one", () => {
    const mobileOnlyNewest = RELEASES.filter(
      (release) => release.tag_name !== "v1.14.4",
    );

    expect(selectNewestStableRelease(mobileOnlyNewest)?.version).toBe("1.13.7");
  });

  it("skips prereleases and drafts ahead of a stable release", () => {
    const withUnstable = [
      { tag_name: "v1.99.0", prerelease: true, draft: false, assets: [] },
      { tag_name: "v1.98.0", prerelease: false, draft: true, assets: [] },
      ...RELEASES,
    ];

    expect(selectNewestStableRelease(withUnstable)?.version).toBe("1.14.4");
  });

  it("returns null when no release ships a desktop asar", () => {
    expect(selectNewestStableRelease([RELEASES[1]])).toBeNull();
    expect(selectNewestStableRelease([])).toBeNull();
  });
});

describe("asarAssetName and versionFromTag", () => {
  it("names the desktop asar asset for a version", () => {
    expect(asarAssetName("1.14.4")).toBe("obsidian-1.14.4.asar.gz");
  });

  it("strips the release-tag prefix", () => {
    expect(versionFromTag("v1.14.4")).toBe("1.14.4");
    expect(versionFromTag("1.14.4")).toBe("1.14.4");
  });
});

describe("parseArgs", () => {
  it("defaults to the newest release, the committed baseline, and the cache", () => {
    expect(parseArgs([])).toMatchObject({
      obsidian: undefined,
      updateBaseline: false,
      reportPath: undefined,
      help: false,
    });
  });

  it("reads every flag, with and without an equals sign", () => {
    expect(
      parseArgs([
        "--obsidian=1.14.4",
        "--update-baseline",
        "--report",
        "drift.md",
        "--baseline",
        "some/baseline.json",
        "--cache=some/cache",
      ]),
    ).toMatchObject({
      obsidian: "1.14.4",
      updateBaseline: true,
      reportPath: "drift.md",
      baselinePath: "some/baseline.json",
      cacheDir: "some/cache",
    });
  });

  it("rejects an unknown option and a malformed version", () => {
    expect(() => parseArgs(["--nope"])).toThrow(StubDriftError);
    expect(() => parseArgs(["--obsidian", "1.14"])).toThrow(StubDriftError);
    expect(() => parseArgs(["--obsidian"])).toThrow(StubDriftError);
  });
});

describe("check:stub-drift CLI against a canned release asar", () => {
  const version = "9.9.9";

  it("certifies a release, then passes when every pinned fact is present", async () => {
    const directory = makeTemporaryDirectory();
    const matches = FACT_CATALOG.map((fact) => fact.match);
    const cacheDir = await seedCache(directory, version, matches);
    const baselinePath = join(directory, "baseline.json");

    const certify = runCli([
      "--obsidian",
      version,
      "--update-baseline",
      "--cache",
      cacheDir,
      "--baseline",
      baselinePath,
    ]);

    expect(certify.status).toBe(0);
    const baseline = parseBaseline(readFileSync(baselinePath, "utf8"));
    expect(baseline.obsidian).toBe(version);
    expect(Object.keys(baseline.facts)).toHaveLength(FACT_CATALOG.length);

    const check = runCli([
      "--obsidian",
      version,
      "--cache",
      cacheDir,
      "--baseline",
      baselinePath,
    ]);

    expect(check.status).toBe(0);
    expect(check.stdout).toContain("No stub drift");
  });

  it("fails and names each fact the release has dropped", async () => {
    const directory = makeTemporaryDirectory();
    const missing = "Folder already exists.";
    const matches = FACT_CATALOG.map((fact) => fact.match).filter(
      (match) => match !== missing,
    );
    const cacheDir = await seedCache(directory, version, matches);
    const baselinePath = join(directory, "baseline.json");
    writeFileSync(
      baselinePath,
      serializeBaseline(
        version,
        indexRelease({
          "app.js": FACT_CATALOG.map((fact) => fact.match).join("\n"),
        }),
      ),
    );

    const check = runCli([
      "--obsidian",
      version,
      "--cache",
      cacheDir,
      "--baseline",
      baselinePath,
      "--report",
      join(directory, "drift.md"),
    ]);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain("message.create-folder-exists");
    expect(check.stderr).toContain(missing);
    const report = readFileSync(join(directory, "drift.md"), "utf8");
    expect(report).toContain("drift detected");
    expect(report).toContain("message.create-folder-exists");
  });

  it("refuses to certify a release that already lacks a pinned fact", async () => {
    const directory = makeTemporaryDirectory();
    const matches = FACT_CATALOG.map((fact) => fact.match).filter(
      (match) => match !== "File already exists.",
    );
    const cacheDir = await seedCache(directory, version, matches);

    const certify = runCli([
      "--obsidian",
      version,
      "--update-baseline",
      "--cache",
      cacheDir,
      "--baseline",
      join(directory, "baseline.json"),
    ]);

    expect(certify.status).toBe(1);
    expect(certify.stderr).toContain("Refusing to certify");
    expect(certify.stderr).toContain("message.create-file-exists");
  });
});
