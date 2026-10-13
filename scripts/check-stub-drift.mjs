// Detects when an Obsidian release drops something the test stub relies on.
//
// The stub (test_files/stubs/obsidian.ts) reproduces observed Obsidian
// behavior and is pinned to a reference desktop release (ADR 0014). This check
// is the app-free half of that drift detection (issue #1063, DEC-001): it
// downloads the public `obsidian-<version>.asar.gz` release asset, reads
// `app.css` and `app.js` from the asar, and confirms every fact in the
// certified baseline is still there. It reads names and strings only and
// commits no Obsidian code (DEC-004).
//
// The behavioral half — whether the stub still imitates the observed behavior
// — needs a real Obsidian install and stays manual: `npm run stub:probes` and
// the ledger in test_files/stubs/obsidian-console-probes.md.
//
// This is a canary, not a required gate (DEC-002): it is not part of
// `check:compliance`, `npm run build`, or any pull-request check. The
// weekly `.github/workflows/obsidian-canary.yml` runs it, files one
// `obsidian-update` issue from `--report`, and fails only when a pinned fact is
// gone.
//
//   npm run check:stub-drift                        # newest public stable release
//   npm run check:stub-drift -- --obsidian 1.14.4   # a pinned release
//   npm run check:stub-drift -- --update-baseline   # certify the current release
//   npm run check:stub-drift -- --report drift.md   # write findings as Markdown
//   npm run check:stub-drift -- --help

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { extractFile } from "@electron/asar";

const ROOT_DIR = join(import.meta.dirname, "..");

export const DEFAULT_BASELINE_PATH = join(
  ROOT_DIR,
  "test_files",
  "stubs",
  "obsidian-baseline.json",
);

// Avoid the repository root and any `.gitignore` change: node_modules is
// already ignored, and the tsc build info lives under the same `.cache` folder.
export const DEFAULT_CACHE_DIR = join(
  ROOT_DIR,
  "node_modules",
  ".cache",
  "obsidian-stub-drift",
);

/** The release members the fact index reads. */
export const ASAR_FILES = ["app.css", "app.js"];

const RELEASES_API =
  "https://api.github.com/repos/obsidianmd/obsidian-releases/releases?per_page=100";
const RELEASE_DOWNLOAD_BASE =
  "https://github.com/obsidianmd/obsidian-releases/releases/download";
const USER_AGENT = "rss-dashboard-stub-drift";
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const USAGE = `Detect when an Obsidian release drops something the test stub relies on.

Downloads the public obsidian-<version>.asar.gz release asset, reads app.css
and app.js from it, and diffs a fact index against a certified baseline. Needs
no Obsidian install. Exits 0 when every pinned fact is present; exits non-zero,
naming each missing fact, when one is gone. Facts present in the release but
not yet in the baseline are reported without failing.

Usage: npm run check:stub-drift -- [options]

Options:
  --obsidian <x.y.z>     Check this release. Default: the newest public stable
                         release that ships a desktop asar (prereleases,
                         drafts, and mobile-only releases are skipped).
  --update-baseline      Certify --obsidian (or the selected release) and write
                         ${relative(ROOT_DIR, DEFAULT_BASELINE_PATH).replace(/\\/g, "/")}.
                         Refuses to certify a release that lacks a pinned fact.
  --report <file>        Also write the findings as a Markdown file.
  --baseline <file>      Baseline to read or write. Default:
                         ${relative(ROOT_DIR, DEFAULT_BASELINE_PATH).replace(/\\/g, "/")}.
  --cache <dir>          Where the downloaded asar is cached. Default:
                         ${relative(ROOT_DIR, DEFAULT_CACHE_DIR).replace(/\\/g, "/")}.
  -h, --help             Show this help.`;

/**
 * The pinned facts. Each one is a distinctive string the stub reproduces
 * (ADR 0014): an error/exception message it throws, or a CSS class name in the
 * DOM it builds. They are index-only — the check never runs Obsidian code.
 *
 * Numeric literals (vault.cacheLimit), lucide alias mappings, and icon counts
 * are deliberately absent: they do not survive as distinctive strings, so a
 * false result would be worse than no check. They stay with the contract test
 * and the device probe. The `ENOENT: ... open '<path>'` and
 * `EPERM: ... unlink '<path>'` message shapes are also absent: Node generates
 * them from `fs` at run time, so they are in no Obsidian release artifact.
 */
export const FACT_CATALOG = [
  {
    id: "message.create-folder-exists",
    kind: "message",
    match: "Folder already exists.",
  },
  {
    id: "message.create-file-exists",
    kind: "message",
    match: "File already exists.",
  },
  {
    id: "message.rename-destination-exists",
    kind: "message",
    match: "Destination file already exists!",
  },
  {
    id: "class.setting-item-heading",
    kind: "class",
    match: "setting-item-heading",
  },
  { id: "class.mod-cta", kind: "class", match: "mod-cta" },
  { id: "class.mod-destructive", kind: "class", match: "mod-destructive" },
  { id: "class.is-disabled", kind: "class", match: "is-disabled" },
  { id: "class.is-enabled", kind: "class", match: "is-enabled" },
  {
    id: "class.checkbox-container",
    kind: "class",
    match: "checkbox-container",
  },
  { id: "class.slider-value", kind: "class", match: "slider-value" },
  { id: "class.notice-message", kind: "class", match: "notice-message" },
  { id: "class.modal-container", kind: "class", match: "modal-container" },
  { id: "class.menu-item", kind: "class", match: "menu-item" },
  { id: "class.mod-checked", kind: "class", match: "mod-checked" },
  { id: "class.math", kind: "class", match: "math" },
  { id: "class.is-loaded", kind: "class", match: "is-loaded" },
  { id: "class.mjx-container", kind: "class", match: "mjx-container" },
  {
    id: "class.extra-setting-button",
    kind: "class",
    match: "extra-setting-button",
  },
];

export class StubDriftError extends Error {
  constructor(message) {
    super(message);
    this.name = "StubDriftError";
  }
}

/** The release-asset name that carries the desktop asar for `version`. */
export function asarAssetName(version) {
  return `obsidian-${version}.asar.gz`;
}

/** The bare version behind a release tag (`v1.14.4` -> `1.14.4`). */
export function versionFromTag(tag) {
  return String(tag ?? "").replace(/^v/, "");
}

/**
 * The newest public stable release that ships a desktop asar.
 *
 * `releases` is the GitHub releases API list, newest first. Drafts and
 * prereleases are skipped, and so is a release with no `obsidian-<v>.asar.gz`
 * asset — the real `v1.13.8` is mobile-only (an APK alone), and the version
 * after it, `v1.13.7`, is the one to pick. Returns `null` when none matches.
 */
export function selectNewestStableRelease(releases) {
  for (const release of releases ?? []) {
    if (!release || release.draft || release.prerelease) {
      continue;
    }
    const version = versionFromTag(release.tag_name);
    const assetName = asarAssetName(version);
    const assets = release.assets ?? [];
    if (assets.some((asset) => asset?.name === assetName)) {
      return {
        version,
        tag: release.tag_name,
        assetName,
        publishedAt: release.published_at ?? "",
      };
    }
  }
  return null;
}

/**
 * @typedef {object} FactEntry
 * @property {string} kind
 * @property {string} match
 * @property {string[]} sources
 */

/**
 * Finds each catalog fact in the extracted release sources. Returns a record
 * keyed by fact id, where `sources` lists the files the fact appears in and is
 * empty when the release has dropped it.
 *
 * @param {Record<string, string>} sources
 * @param {{ id: string, kind: string, match: string }[]} [catalog]
 * @returns {Record<string, FactEntry>}
 */
export function indexRelease(sources, catalog = FACT_CATALOG) {
  const index = {};
  for (const fact of catalog) {
    const found = [];
    for (const [file, text] of Object.entries(sources)) {
      if (text.includes(fact.match)) {
        found.push(file);
      }
    }
    index[fact.id] = { kind: fact.kind, match: fact.match, sources: found };
  }
  return index;
}

/**
 * Compares a release index against the certified baseline.
 *
 * - `gone` — a pinned fact the release no longer carries. A failure.
 * - `newFacts` — a catalog fact present in the release but not yet certified.
 *   Reported, never a failure, until `--update-baseline` certifies it.
 * - `absent` — a catalog fact neither certified nor present in this release.
 * - `retired` — a baseline fact the catalog no longer lists.
 */
export function diffFacts(index, baseline) {
  const facts = baseline?.facts ?? {};
  const gone = [];
  const retired = [];

  for (const [id, entry] of Object.entries(facts)) {
    const observed = index[id];
    if (!observed) {
      retired.push({ id, ...entry });
    } else if (observed.sources.length === 0) {
      gone.push({
        id,
        ...observed,
        baselineSources: [...(entry.sources ?? [])],
      });
    }
  }

  const newFacts = [];
  const absent = [];
  for (const [id, entry] of Object.entries(index)) {
    if (id in facts) {
      continue;
    }
    if (entry.sources.length > 0) {
      newFacts.push({ id, ...entry });
    } else {
      absent.push({ id, ...entry });
    }
  }

  return { gone, newFacts, absent, retired };
}

/** Parses a baseline file's contents into `{ obsidian, facts }`. */
export function parseBaseline(text) {
  const data = JSON.parse(text);
  if (data === null || typeof data !== "object") {
    throw new StubDriftError("Baseline is not a JSON object.");
  }
  return {
    obsidian: String(data.obsidian ?? ""),
    facts: data.facts ?? {},
  };
}

/** Serializes a release index as the baseline file Prettier will accept. */
export function serializeBaseline(version, index) {
  const ids = Object.keys(index).sort();
  const lines = [
    "{",
    `  "obsidian": ${JSON.stringify(version)},`,
    '  "facts": {',
  ];

  ids.forEach((id, position) => {
    const entry = index[id];
    lines.push(`    ${JSON.stringify(id)}: {`);
    lines.push(`      "kind": ${JSON.stringify(entry.kind)},`);
    lines.push(`      "match": ${JSON.stringify(entry.match)},`);
    // Prettier keeps a short array inline even when the source broke it.
    const sources = [...entry.sources]
      .sort()
      .map((name) => JSON.stringify(name));
    lines.push(`      "sources": [${sources.join(", ")}]`);
    lines.push(`    }${position === ids.length - 1 ? "" : ","}`);
  });

  lines.push("  }", "}");
  return `${lines.join("\n")}\n`;
}

/** Renders the findings as the Markdown body the canary files as an issue. */
export function renderReport({ version, baselineVersion, index, diff }) {
  const present = Object.values(index).filter(
    (entry) => entry.sources.length > 0,
  ).length;
  const total = Object.keys(index).length;
  const failed = diff.gone.length > 0;
  const lines = [];

  lines.push(
    `# Obsidian stub drift check: ${failed ? "drift detected" : "no drift"}`,
  );
  lines.push("");
  lines.push(`- Obsidian release: \`${version}\``);
  lines.push(
    `- Certified baseline: ${baselineVersion ? `\`${baselineVersion}\`` : "_none_"}`,
  );
  lines.push(`- Pinned facts present: ${present} of ${total}`);
  lines.push("");

  if (failed) {
    lines.push("## Pinned facts missing from the release");
    lines.push("");
    lines.push(
      "Each of these is a fact the test stub relies on (ADR 0014). A missing",
    );
    lines.push(
      "one is drift: re-probe on a real Obsidian install, then either restore",
    );
    lines.push("the behavior or retire the fact from the catalog.");
    lines.push("");
    for (const fact of diff.gone) {
      lines.push(
        `- \`${fact.id}\` — \`${fact.match}\` (${fact.kind}), last seen in ${fact.baselineSources.join(", ") || "unknown"}`,
      );
    }
    lines.push("");
  } else {
    lines.push("Every pinned fact is still present in the release.");
    lines.push("");
  }

  if (diff.newFacts.length > 0) {
    lines.push("## Facts present but not yet certified");
    lines.push("");
    lines.push(
      "Informational: re-run with `--update-baseline` to certify them.",
    );
    lines.push("");
    for (const fact of diff.newFacts) {
      lines.push(
        `- \`${fact.id}\` — \`${fact.match}\` (${fact.kind}) in ${fact.sources.join(", ")}`,
      );
    }
    lines.push("");
  }

  if (diff.absent.length > 0) {
    lines.push("## Catalog facts not present and not certified");
    lines.push("");
    for (const fact of diff.absent) {
      lines.push(`- \`${fact.id}\` — \`${fact.match}\` (${fact.kind})`);
    }
    lines.push("");
  }

  if (diff.retired.length > 0) {
    lines.push("## Baseline facts no longer in the catalog");
    lines.push("");
    lines.push("Re-run `--update-baseline` to retire them from the baseline.");
    lines.push("");
    for (const fact of diff.retired) {
      lines.push(`- \`${fact.id}\` — \`${fact.match}\` (${fact.kind})`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function parseArgs(argv) {
  const options = {
    obsidian: undefined,
    updateBaseline: false,
    reportPath: undefined,
    baselinePath: DEFAULT_BASELINE_PATH,
    cacheDir: DEFAULT_CACHE_DIR,
    help: false,
  };

  const readValue = (arg, next) => {
    const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : next();
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new StubDriftError(`Option "${arg.split("=")[0]}" needs a value.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--update-baseline") {
      options.updateBaseline = true;
    } else if (arg === "--obsidian" || arg.startsWith("--obsidian=")) {
      const value = readValue(arg, () => argv[++i]);
      if (!VERSION_PATTERN.test(value)) {
        throw new StubDriftError(
          `--obsidian expects a version like 1.14.4, got "${value}".`,
        );
      }
      options.obsidian = value;
    } else if (arg === "--report" || arg.startsWith("--report=")) {
      options.reportPath = readValue(arg, () => argv[++i]);
    } else if (arg === "--baseline" || arg.startsWith("--baseline=")) {
      options.baselinePath = readValue(arg, () => argv[++i]);
    } else if (arg === "--cache" || arg.startsWith("--cache=")) {
      options.cacheDir = readValue(arg, () => argv[++i]);
    } else {
      throw new StubDriftError(`Unknown option "${arg}".\n\n${USAGE}`);
    }
  }

  return options;
}

/** Reads the two release members the fact index needs from a local asar. */
export function readReleaseSources(asarPath, files = ASAR_FILES) {
  const sources = {};
  for (const file of files) {
    sources[file] = extractFile(asarPath, file).toString("utf8");
  }
  return sources;
}

/**
 * GETs a URL with Node's `https`, following redirects (GitHub asset downloads
 * redirect to a CDN) and returning the raw body. The Obsidian lint config
 * restricts the browser `fetch` global to `requestUrl`, which does not exist in
 * a Node script, so this uses the built-in module instead.
 */
function httpsGet(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } },
      (response) => {
        const { statusCode, headers } = response;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume();
          if (redirectsLeft <= 0) {
            reject(new StubDriftError(`Too many redirects for ${url}.`));
            return;
          }
          resolve(
            httpsGet(
              new URL(headers.location, url).toString(),
              redirectsLeft - 1,
            ),
          );
          return;
        }
        if (statusCode !== 200) {
          response.resume();
          reject(
            new StubDriftError(
              `GET ${url} returned ${statusCode} ${response.statusMessage ?? ""}.`,
            ),
          );
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.setTimeout(60000, () => {
      request.destroy(new StubDriftError(`Timed out requesting ${url}.`));
    });
  });
}

async function fetchNewestRelease() {
  const body = await httpsGet(RELEASES_API);
  let releases;
  try {
    releases = JSON.parse(body.toString("utf8"));
  } catch {
    throw new StubDriftError("GitHub releases API did not return JSON.");
  }
  const selected = selectNewestStableRelease(releases);
  if (!selected) {
    throw new StubDriftError(
      "No public stable Obsidian release ships a desktop asar.",
    );
  }
  return selected;
}

/** The cached asar path for `version`, downloading and caching it if absent. */
export async function ensureAsarPath(version, cacheDir, readAsset = fetchAsar) {
  const asarPath = join(cacheDir, `obsidian-${version}.asar`);
  if (existsSync(asarPath)) {
    return asarPath;
  }
  const asar = await readAsset(version);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(asarPath, asar);
  return asarPath;
}

async function fetchAsar(version) {
  const url = `${RELEASE_DOWNLOAD_BASE}/v${version}/${asarAssetName(version)}`;
  return gunzipSync(await httpsGet(url));
}

function readBaseline(path) {
  return existsSync(path) ? parseBaseline(readFileSync(path, "utf8")) : null;
}

/**
 * Runs the check end to end and returns the process exit code. `--update-
 * baseline` refuses to certify a release that is missing a catalog fact, so a
 * certification cannot silently accept drift.
 */
export async function runStubDrift({
  obsidian = undefined,
  updateBaseline = false,
  reportPath = undefined,
  baselinePath = DEFAULT_BASELINE_PATH,
  cacheDir = DEFAULT_CACHE_DIR,
  fetchNewest = fetchNewestRelease,
  readAsset = fetchAsar,
  log = console.log,
  error = console.error,
} = {}) {
  const selected = obsidian
    ? {
        version: obsidian,
        tag: `v${obsidian}`,
        assetName: asarAssetName(obsidian),
        publishedAt: "",
      }
    : await fetchNewest();

  const asarPath = await ensureAsarPath(selected.version, cacheDir, readAsset);
  const index = indexRelease(readReleaseSources(asarPath));
  const total = Object.keys(index).length;

  if (updateBaseline) {
    const missing = Object.entries(index)
      .filter(([, entry]) => entry.sources.length === 0)
      .map(([id]) => id);
    if (missing.length > 0) {
      error(
        `Refusing to certify Obsidian ${selected.version}: ${missing.length} pinned fact(s) are missing: ${missing.join(", ")}.`,
      );
      return 1;
    }
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, serializeBaseline(selected.version, index));
    log(
      `Wrote ${relative(ROOT_DIR, baselinePath).replace(/\\/g, "/")} for Obsidian ${selected.version} (${total} facts).`,
    );
    return 0;
  }

  const baseline = readBaseline(baselinePath);
  if (!baseline) {
    error(
      `Baseline not found at ${baselinePath}. Run with --update-baseline to certify ${selected.version}.`,
    );
    return 1;
  }

  const diff = diffFacts(index, baseline);
  const report = renderReport({
    version: selected.version,
    baselineVersion: baseline.obsidian,
    index,
    diff,
  });

  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, report);
  }

  if (diff.gone.length > 0) {
    error(
      `Stub drift: ${diff.gone.length} pinned fact(s) missing from Obsidian ${selected.version}:`,
    );
    for (const fact of diff.gone) {
      error(`  - ${fact.id}: ${JSON.stringify(fact.match)}`);
    }
    if (reportPath) {
      error(`Findings written to ${reportPath}.`);
    }
    return 1;
  }

  const newNote =
    diff.newFacts.length > 0
      ? ` ${diff.newFacts.length} fact(s) are present but not certified.`
      : "";
  log(
    `No stub drift: all ${total} pinned facts present in Obsidian ${selected.version} (baseline ${baseline.obsidian}).${newNote}`,
  );
  return 0;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  try {
    process.exitCode = await runStubDrift(options);
  } catch (error) {
    console.error(
      `check:stub-drift failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
