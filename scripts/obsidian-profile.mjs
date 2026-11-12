// Answers "which Obsidian is this test actually running?" before a checklist
// starts, and makes the answer true when it is not.
//
// A disposable `--user-data-dir` has no app archive, so Obsidian boots the
// installer's bundled build - which stays the same forever, because updates ship
// as `obsidian-<version>.asar` downloaded into the user-data directory and
// loaded at the *next* launch. A drive can therefore spend an hour on last
// year's build without a single signal saying so (#732 did exactly that).
//
// The expected version is never written down here. It is derived, in order, from
// the archive the profile will load, the newest archive on this machine, or the
// installer - whichever exists. A literal version in a script or a doc goes
// stale within weeks; the archive on disk cannot.
//
//   npm run fixture:doctor                       # passive: files and the log
//   npm run fixture:doctor -- --json
//   node scripts/obsidian-profile.mjs prime --profile <dir>
//   node scripts/obsidian-profile.mjs doctor --profile <dir> --verify
//
// The profile is primed by copying an archive Obsidian itself downloaded, so a
// run starts on the build the maintainer actually runs, offline. Downloading is
// opt-in (`--fetch`) and documented as unverified-signature: only Obsidian's own
// updater checks the signature.
//
// Attaching to the running app lives in obsidian-cdp.mjs; this script only reads
// the profile, the log, and the fixture's build files, and never touches a
// window unless asked to launch one.

import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import {
  ObsidianReleaseError,
  compareVersions,
  downloadReleaseAsar,
  fetchNewestRelease,
  isOlder,
  listLocalAsars,
  newestLocalAsar,
  readAsarVersion,
  VERSION_PATTERN,
} from "./obsidian-release.mjs";

const SCRIPT_DIR = import.meta.dirname;
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const HARNESS = join(SCRIPT_DIR, "obsidian-cdp.mjs");

const DEFAULT_INSTALLER = "C:\\Program Files\\Obsidian\\Obsidian.exe";
const LOG_NAME = "obsidian.log";
const INSTALLER_ASAR = "resources/obsidian.asar";
const FIXTURE_VAULT = ".fixture-vault";

/** The line Obsidian writes when it picks the app package to load. */
const LOADED_APP_LINE = /Loaded (?:main|updated) app (?:package )?(.+)$/gm;

const COMMANDS = ["prime", "version", "doctor", "help"];

const USAGE = `Check, and make true, which Obsidian build a test drive runs.

Usage: node scripts/obsidian-profile.mjs [options] <command>

Commands:
  prime              Put the newest app archive this machine already has into
                     <profile>, so the next launch loads it. Offline; it copies
                     an archive Obsidian itself downloaded.
  version            Print the versions involved: the profile's archive, the
                     newest archive on this machine, and the installer's.
  doctor             Compare what the profile will load, what the log says
                     loaded, and the fixture build. Exits non-zero when the run
                     would test an older build than intended.

Options:
  --profile <dir>        Disposable --user-data-dir. Required by prime; doctor
                         and version read it when given.
  --app-data <dir>       Obsidian's real user-data directory, where its
                         downloaded archives live. Default:
                         %APPDATA%\\obsidian.
  --installer <path>     The installed executable. Default:
                         ${DEFAULT_INSTALLER}
  --repo <dir>           Repository root holding .fixture-vault and main.js.
                         Default: this script's parent.
  --vault <dir>          Fixture vault. Default: <repo>/${FIXTURE_VAULT}.
  --expect-version <v>   Assert this version instead of the derived one. Use it
                         for a release-gate run, never as a standing default.
  --allow-version-mismatch
                         Downgrade a version failure to a warning, and say so in
                         the output. For an unblocking emergency, not routine.
  --refresh              With prime, replace an archive the profile already
                         holds when a newer one is available.
  --fetch                With prime, download the newest public archive when
                         this machine has none. Asks for nothing: passing the
                         flag is the consent. Obsidian's signature is NOT
                         verified by this path.
  --verify               With doctor, attach over CDP and read the running
                         version as well. Read-only; needs the app running.
  --launch               With doctor, start the installed app on the primed
                         profile with a debug port and then verify it.
  --json                 Print machine-readable output.
  -h, --help             Show this help.`;

export function parseArgs(argv, env = process.env) {
  const options = {
    command: undefined,
    args: [],
    profile: env.CDP_PROFILE || undefined,
    appData: env.APPDATA ? join(env.APPDATA, "obsidian") : undefined,
    installer: DEFAULT_INSTALLER,
    repo: ROOT_DIR,
    vault: undefined,
    expectVersion: undefined,
    allowMismatch: false,
    refresh: false,
    fetch: false,
    verify: false,
    launch: false,
    json: false,
    help: false,
  };

  const value = (index, name, inline) => {
    if (inline !== undefined) return inline;
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new ObsidianReleaseError(`Option ${name} needs a value.`);
    }
    return next;
  };

  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inline] = arg.startsWith("--")
      ? [
          arg.slice(0, arg.includes("=") ? arg.indexOf("=") : undefined),
          arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : undefined,
        ]
      : [arg, undefined];

    if (flag === "-h" || flag === "--help") {
      options.help = true;
    } else if (flag === "--json") {
      options.json = true;
    } else if (flag === "--refresh") {
      options.refresh = true;
    } else if (flag === "--fetch") {
      options.fetch = true;
    } else if (flag === "--verify") {
      options.verify = true;
    } else if (flag === "--launch") {
      options.launch = true;
    } else if (flag === "--allow-version-mismatch") {
      options.allowMismatch = true;
    } else if (flag === "--profile") {
      options.profile = value(index, "--profile", inline);
      if (inline === undefined) index += 1;
    } else if (flag === "--app-data") {
      options.appData = value(index, "--app-data", inline);
      if (inline === undefined) index += 1;
    } else if (flag === "--installer") {
      options.installer = value(index, "--installer", inline);
      if (inline === undefined) index += 1;
    } else if (flag === "--repo") {
      options.repo = value(index, "--repo", inline);
      if (inline === undefined) index += 1;
    } else if (flag === "--vault") {
      options.vault = value(index, "--vault", inline);
      if (inline === undefined) index += 1;
    } else if (flag === "--expect-version") {
      options.expectVersion = value(index, "--expect-version", inline);
      if (inline === undefined) index += 1;
      if (!VERSION_PATTERN.test(options.expectVersion)) {
        throw new ObsidianReleaseError(
          `--expect-version expects a version like 1.15.0, got "${options.expectVersion}".`,
        );
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw new ObsidianReleaseError(`Unknown option "${arg}".\n\n${USAGE}`);
    } else {
      positionals.push(arg);
    }
  }

  const [command, ...args] = positionals;
  if (options.help) return options;
  if (command === undefined) {
    throw new ObsidianReleaseError(`No command given.\n\n${USAGE}`);
  }
  if (!COMMANDS.includes(command)) {
    throw new ObsidianReleaseError(`Unknown command "${command}".\n\n${USAGE}`);
  }
  if (command === "help") {
    options.help = true;
    return options;
  }
  if (command === "prime" && !options.profile) {
    throw new ObsidianReleaseError(
      "prime needs --profile: the disposable --user-data-dir to prime.",
    );
  }
  options.command = command;
  options.args = args;
  options.vault = options.vault ?? join(options.repo, FIXTURE_VAULT);
  return options;
}

/**
 * A path's flavour, chosen from the path itself rather than the host. A drive
 * letter or a backslash means Windows even when the tests run on Linux, where
 * `dirname("C:\\...")` would otherwise answer ".".
 */
export function pathFlavour(value) {
  const text = String(value ?? "");
  return /^[A-Za-z]:[\\/]/.test(text) || text.includes("\\") ? win32 : posix;
}

/** The installed build's app archive, the one a fresh profile boots. */
export function installerAsarPath(installerPath) {
  const flavour = pathFlavour(installerPath);
  return flavour.join(flavour.dirname(String(installerPath)), INSTALLER_ASAR);
}

/**
 * The last app package Obsidian's log names, with the version that package
 * carries. `readVersion` is injected so the parsing is tested without archives.
 *
 * The log is the only local record of what actually loaded: Obsidian writes
 * `Loaded main app package <path>` when it boots the installer build and
 * `Loaded updated app <path>` when it boots a downloaded archive.
 */
export function parseLoadedAppLog(text, readVersion = readAsarVersion) {
  let last;
  for (const match of String(text ?? "").matchAll(LOADED_APP_LINE)) {
    last = match[1].trim();
  }
  if (!last) return undefined;
  return { path: last, version: readVersion(last) };
}

/**
 * The version a drive should expect, and where that expectation came from.
 * Order: an explicit --expect-version, the profile's archive, the newest archive
 * on this machine, the installer's.
 *
 * @param {{ expectVersion?: string, profileAsar?: { version: string }, newestLocal?: { version: string }, installerVersion?: string }} [input]
 * @returns {{ version: string | undefined, source: string }}
 */
export function selectExpectedVersion({
  expectVersion,
  profileAsar,
  newestLocal,
  installerVersion,
} = {}) {
  if (expectVersion) {
    return { version: expectVersion, source: "expect-version" };
  }
  if (profileAsar?.version) {
    return { version: profileAsar.version, source: "profile" };
  }
  if (newestLocal?.version) {
    return { version: newestLocal.version, source: "newest-local" };
  }
  if (installerVersion) {
    return { version: installerVersion, source: "installer" };
  }
  return { version: undefined, source: "unknown" };
}

/**
 * Judges the identity of a run. Older-than-expected fails: that is #732, an
 * hour of evidence for the wrong build. Newer-than-expected only warns, because
 * it means the local archive moved ahead, not that the claim is wrong.
 *
 * @param {{ expected?: { version?: string, source?: string }, loaded?: { version?: string, path?: string }, installerVersion?: string, allowMismatch?: boolean }} [input]
 * @returns {{ status: "ok" | "warn" | "fail", severity: string, message: string }}
 */
export function assessVersion({
  expected,
  loaded,
  installerVersion,
  allowMismatch = false,
} = {}) {
  const expectedVersion = expected?.version;
  const loadedVersion = loaded?.version;

  if (!expectedVersion) {
    return {
      status: "warn",
      severity: "unknown",
      message:
        "No app archive found, so the expected version is unknown. Run prime, or pass --expect-version.",
    };
  }
  if (!loadedVersion) {
    return {
      status: "warn",
      severity: "unloaded",
      message: `No load line in ${LOG_NAME} yet. Launch Obsidian once on this profile, then re-run doctor.`,
    };
  }

  const mismatch = compareVersions(loadedVersion, expectedVersion);
  if (mismatch === 0) {
    return {
      status: "ok",
      severity: "none",
      message: `Running ${loadedVersion}, the expected build.`,
    };
  }

  const older = mismatch < 0;
  const detail = older
    ? `Running ${loadedVersion}, older than the expected ${expectedVersion} (${expected?.source}).`
    : `Running ${loadedVersion}, newer than the expected ${expectedVersion} (${expected?.source}).`;

  if (!older) {
    return { status: "warn", severity: "newer", message: detail };
  }

  const remedy =
    expected?.source === "profile"
      ? " The profile holds that archive but did not load it: relaunch Obsidian so it picks it up, and check the load line."
      : ` Prime the profile (node scripts/obsidian-profile.mjs prime --profile <dir>), then relaunch.`;

  const message = `${detail}${installerVersion && loadedVersion === installerVersion ? ` That is the installer's build; the exe's ProductVersion (${installerVersion}) is never the running version.` : ""}${remedy}`;

  return allowMismatch
    ? {
        status: "warn",
        severity: "older-bypassed",
        message: `${message} Allowed by --allow-version-mismatch.`,
      }
    : { status: "fail", severity: "older", message };
}

/**
 * The narrowest desktop canvas the harness allows. Below it a drive is in the
 * compact layout, which hides the sidebar and moves header controls into the
 * menu — so a row "passing" there is testing a different screen.
 */
export const DESKTOP_FLOOR = 1400;

/**
 * Judges the viewport a verified run is using. The floor is the only hard rule:
 * a row captured below it exercises the compact layout, so it cannot stand in
 * for a desktop row. Exported for unit tests.
 *
 * @param {{ width?: number, band?: string, onEdge?: boolean } | undefined} viewport
 */
export function assessViewport(viewport) {
  if (!viewport || typeof viewport.width !== "number") {
    return {
      status: "warn",
      message: "Viewport not reported; record it beside every capture.",
    };
  }
  if (viewport.width < DESKTOP_FLOOR) {
    return {
      status: "fail",
      message: `Viewport ${viewport.width}px is below the desktop floor ${DESKTOP_FLOOR}px. Run "node scripts/obsidian-cdp.mjs --profile <dir> viewport desktop" before the desktop rows.`,
    };
  }
  if (viewport.onEdge) {
    return {
      status: "warn",
      message: `Viewport ${viewport.width}px sits on a layout breakpoint (band ${viewport.band}); re-run at a width inside a band.`,
    };
  }
  return {
    status: "ok",
    message: `Viewport ${viewport.width}px, band ${viewport.band}.`,
  };
}

/** Trims an archive to a printable label, keeping the path for evidence. */
function describeAsar(entry) {
  if (!entry) return undefined;
  return { version: entry.version, path: entry.path };
}

/**
 * Puts the newest archive this machine has into `profile`, so the next launch
 * loads it. Returns the archive the profile now holds.
 *
 * @param {object} [input]
 * @param {string} [input.profile]
 * @param {string} [input.appData]
 * @param {boolean} [input.refresh]
 * @param {boolean} [input.fetch]
 * @param {(message: string) => void} [input.log]
 * @param {(version: string) => Promise<Buffer | Uint8Array>} [input.downloadAsar]
 * @param {() => Promise<{ version: string }>} [input.newestRelease]
 * @returns {Promise<{ version: string, path: string, copied: boolean }>}
 */
export async function primeProfile({
  profile,
  appData,
  refresh = false,
  fetch: allowFetch = false,
  log = console.log,
  downloadAsar = downloadReleaseAsar,
  newestRelease = fetchNewestRelease,
} = {}) {
  if (!profile) {
    throw new ObsidianReleaseError("prime needs a profile directory.");
  }
  mkdirSync(profile, { recursive: true });
  const flavour = pathFlavour(profile);

  const existing = newestLocalAsar(profile);
  const local = newestLocalAsar(appData);

  if (existing && !local) {
    const verified = readAsarVersion(existing.path);
    if (!verified) {
      throw new ObsidianReleaseError(
        `The profile's archive ${existing.path} does not declare a readable version; delete it and prime again.`,
      );
    }
    log(
      `Profile already holds Obsidian ${existing.version}; this machine has no newer archive to copy.`,
    );
    return { version: existing.version, path: existing.path, copied: false };
  }

  if (existing && !refresh && !isOlder(existing.version, local.version)) {
    const verified = readAsarVersion(existing.path);
    if (!verified) {
      throw new ObsidianReleaseError(
        `The profile's archive ${existing.path} does not declare a readable version; delete it and prime again.`,
      );
    }
    log(
      `Profile already holds Obsidian ${existing.version} (${existing.path}). Pass --refresh to replace it.`,
    );
    return { version: existing.version, path: existing.path, copied: false };
  }

  let source = local;
  if (!source) {
    if (!allowFetch) {
      throw new ObsidianReleaseError(
        `No obsidian-<version>.asar in ${appData ?? "(no app-data directory)"}, so there is nothing to copy. Pass --fetch to download the newest public archive (Obsidian's signature is not verified by that path), or launch Obsidian once so its updater downloads the archive.`,
      );
    }
    const release = await newestRelease();
    const bytes = await downloadAsar(release.version);
    const path = flavour.join(profile, `obsidian-${release.version}.asar`);
    writeFileSync(path, bytes);
    const verified = readAsarVersion(path);
    if (verified !== release.version) {
      throw new ObsidianReleaseError(
        `Downloaded ${release.version} but the archive declares ${verified ?? "nothing"}; refusing to launch it.`,
      );
    }
    log(`Downloaded and primed Obsidian ${verified} (${path}).`);
    return { version: verified, path, copied: true };
  }

  const target = flavour.join(profile, flavour.basename(String(source.path)));
  copyFileSync(source.path, target);
  const verified = readAsarVersion(target);
  if (verified !== source.version) {
    throw new ObsidianReleaseError(
      `Copied ${source.version} but the archive declares ${verified ?? "nothing"}; among ${
        listLocalAsars(profile)
          .map((entry) => entry.version)
          .join(", ") || "none"
      } the next launch may load another build. Delete ${target} and re-prime.`,
    );
  }
  log(`Primed ${profile} with Obsidian ${verified} (${target}).`);
  return { version: verified, path: target, copied: true };
}

/** sha256 of a file, or undefined when it is absent. */
export function hashFile(path) {
  if (!existsSync(path)) return undefined;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * The repo build vs the build copied into the fixture vault. `main.js` and
 * `styles.css` are gitignored, so a fresh worktree has neither until it builds.
 *
 * @param {{ repo?: string, vault?: string }} [input]
 * @returns {{ name: string, repo?: string, fixture?: string, state: string }[]}
 */
export function compareFixtureBuild({ repo, vault } = {}) {
  const pluginDir = join(
    vault ?? join(repo, FIXTURE_VAULT),
    ".obsidian",
    "plugins",
    "rss-dashboard",
  );
  const artifacts = ["main.js", "styles.css"];
  const rows = [];
  for (const name of artifacts) {
    const repoHash = hashFile(join(repo, name));
    const fixtureHash = hashFile(join(pluginDir, name));
    rows.push({
      name,
      repo: repoHash,
      fixture: fixtureHash,
      state:
        repoHash === undefined
          ? "no-repo-build"
          : fixtureHash === undefined
            ? "not-copied"
            : repoHash === fixtureHash
              ? "match"
              : "stale",
    });
  }
  return rows;
}

/** The plugin's own declared support floor, from the repo's manifest. */
export function readPluginFloor(repo) {
  const text = readFileSyncSafe(join(repo, "manifest.json"));
  if (!text) return undefined;
  try {
    const manifest = JSON.parse(text);
    return {
      version: String(manifest.version ?? ""),
      minAppVersion: String(manifest.minAppVersion ?? ""),
    };
  } catch {
    return undefined;
  }
}

function readFileSyncSafe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** Asks the harness for the running version, without changing the window. */
function verifyRunningVersion({ options, env }) {
  if (!options.profile) return undefined;
  const result = spawnSync(
    process.execPath,
    [HARNESS, "--profile", options.profile, "--json", "version"],
    { encoding: "utf8", env },
  );
  if (result.status !== 0) return undefined;
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return undefined;
  }
}

/** Asks the harness what the window's viewport is right now. Read-only. */
function verifyViewport({ options, env }) {
  if (!options.profile) return undefined;
  const result = spawnSync(
    process.execPath,
    [HARNESS, "--profile", options.profile, "--json", "viewport", "report"],
    { encoding: "utf8", env },
  );
  if (result.status !== 0) return undefined;
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return undefined;
  }
}

/** The three versions that matter before a launch, without the doctor's noise. */
function renderVersionTable(report) {
  const rows = [
    [
      "profile app",
      report.profileAsar
        ? `${report.profileAsar.version}  ${report.profileAsar.path}`
        : report.profile
          ? "(none yet — run prime)"
          : "(no profile given)",
    ],
    [
      "newest local",
      report.newestLocal
        ? `${report.newestLocal.version}  ${report.newestLocal.path}`
        : "(none)",
    ],
    [
      "installer",
      report.installerVersion
        ? `${report.installerVersion}  ${report.installerAsar}`
        : "not readable",
    ],
    [
      "expected",
      report.expected.version
        ? `${report.expected.version}  (${report.expected.source})`
        : "unknown",
    ],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(([label, value]) => `  ${label.padEnd(width)}  ${value}`)
    .join("\n");
}

function formatIdentityTable(report) {
  const rows = [];
  const add = (label, value) => rows.push([label, value ?? "-"]);
  add("profile", report.profile);
  add(
    "profile app",
    report.profileAsar
      ? `${report.profileAsar.version}  ${report.profileAsar.path}`
      : undefined,
  );
  add(
    "loaded (log)",
    report.loaded
      ? `${report.loaded.version ?? "unreadable"}  ${report.loaded.path}`
      : "no load line yet",
  );
  add(
    "newest local",
    report.newestLocal
      ? `${report.newestLocal.version}  ${report.newestLocal.path}`
      : undefined,
  );
  add(
    "installer",
    report.installerVersion
      ? `${report.installerVersion}  ${report.installerAsar}`
      : "not readable",
  );
  add(
    "expected",
    report.expected.version
      ? `${report.expected.version}  (${report.expected.source})`
      : undefined,
  );
  add(
    "running (attached)",
    report.running ? (report.running.version ?? "unreadable") : undefined,
  );
  add(
    "plugin floor",
    report.pluginFloor
      ? `minAppVersion ${report.pluginFloor.minAppVersion}  (plugin ${report.pluginFloor.version})`
      : undefined,
  );
  for (const row of report.build ?? []) {
    add(
      `fixture ${row.name}`,
      `${row.state}${row.state === "match" ? "" : `  repo ${row.repo?.slice(0, 12) ?? "-"} / vault ${row.fixture?.slice(0, 12) ?? "-"}`}`,
    );
  }
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(([label, value]) => `  ${label.padEnd(width)}  ${value}`)
    .join("\n");
}

/** Collects the identity report from files, the log, and optionally the app. */
export async function buildDoctorReport(options, env = process.env) {
  const profile = options.profile;
  const profileAsar = profile ? newestLocalAsar(profile) : undefined;
  const newestLocal = newestLocalAsar(options.appData);
  const installerAsar = installerAsarPath(options.installer);
  const installerVersion = readAsarVersion(installerAsar);
  const expected = selectExpectedVersion({
    expectVersion: options.expectVersion,
    profileAsar,
    newestLocal,
    installerVersion,
  });

  const logText = profile
    ? readFileSyncSafe(join(profile, LOG_NAME))
    : undefined;
  const loaded = logText ? parseLoadedAppLog(logText) : undefined;

  const pluginFloor = readPluginFloor(options.repo);
  const build = compareFixtureBuild({
    repo: options.repo,
    vault: options.vault,
  });

  let running;
  let viewport;
  if (options.verify && profile) {
    running = verifyRunningVersion({ options, env });
    viewport = verifyViewport({ options, env });
  }
  const viewportVerdict = options.verify
    ? assessViewport(viewport)
    : { status: "ok", message: "Not checked (pass --verify)." };

  const verdict = options.profile
    ? assessVersion({
        expected,
        loaded,
        installerVersion,
        allowMismatch: options.allowMismatch,
      })
    : {
        status: "warn",
        severity: "no-profile",
        message:
          "No --profile given, so this machine's archives were checked but no run's identity was. Pass --profile <dir> to check a drive.",
      };

  const floorVerdict =
    pluginFloor?.minAppVersion && (expected.version ?? loaded?.version)
      ? compareVersions(
          expected.version ?? loaded.version,
          pluginFloor.minAppVersion,
        ) < 0
        ? {
            status: "fail",
            message: `The expected build ${expected.version ?? loaded.version} is below the plugin's minAppVersion ${pluginFloor.minAppVersion}.`,
          }
        : {
            status: "ok",
            message: `At or above minAppVersion ${pluginFloor.minAppVersion}.`,
          }
      : { status: "warn", message: "minAppVersion not compared." };

  return {
    profile,
    appData: options.appData,
    installer: options.installer,
    installerAsar,
    installerVersion,
    profileAsar,
    newestLocal: describeAsar(newestLocal),
    loaded,
    expected,
    running,
    verifyRequested: Boolean(options.verify),
    viewport,
    viewportVerdict,
    pluginFloor,
    build,
    verdict,
    floorVerdict,
  };
}

function renderReport(report) {
  const lines = ["Obsidian harness identity", formatIdentityTable(report), ""];
  lines.push(
    `  ${report.verdict.status === "ok" ? "ok" : report.verdict.status}: ${report.verdict.message}`,
  );
  lines.push(`  floor: ${report.floorVerdict.message}`);
  const viewportVerdict = report.viewportVerdict;
  if (viewportVerdict) {
    lines.push(
      `  viewport: ${viewportVerdict.status === "ok" ? "" : `${viewportVerdict.status}: `}${viewportVerdict.message}`,
    );
  }
  if (report.verifyRequested && !report.running) {
    lines.push(
      "  warn: --verify could not attach; the app may not be running on this profile. The log and archive were still checked.",
    );
  }
  for (const row of report.build ?? []) {
    if (row.state === "stale") {
      lines.push(
        `  warn: ${row.name} in the fixture vault is stale — run npm run fixture:vault -- --plugin-only`,
      );
    }
    if (row.state === "no-repo-build") {
      lines.push(
        `  warn: no repo ${row.name}; run npm run build before comparing the fixture build`,
      );
    }
  }
  return lines.join("\n");
}

async function runCommand(options, env = process.env) {
  if (options.command === "version") {
    const profileAsar = options.profile
      ? newestLocalAsar(options.profile)
      : undefined;
    const newestLocal = newestLocalAsar(options.appData);
    const installerAsar = installerAsarPath(options.installer);
    const installerVersion = readAsarVersion(installerAsar);
    const expected = selectExpectedVersion({
      expectVersion: options.expectVersion,
      profileAsar,
      newestLocal,
      installerVersion,
    });
    const report = {
      profile: options.profile,
      appData: options.appData,
      profileAsar: describeAsar(profileAsar),
      newestLocal: describeAsar(newestLocal),
      installerAsar,
      installerVersion,
      expected,
    };
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : renderVersionTable(report),
    );
    return 0;
  }

  if (options.command === "prime") {
    const result = await primeProfile({
      profile: options.profile,
      appData: options.appData,
      refresh: options.refresh,
      fetch: options.fetch,
      log: options.json ? () => {} : console.log,
    });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (options.launch) {
    launchObsidian(options);
  }

  const report = await buildDoctorReport(options, env);
  console.log(
    options.json ? JSON.stringify(report, null, 2) : renderReport(report),
  );
  return report.verdict.status === "fail" ||
    report.floorVerdict.status === "fail" ||
    report.viewportVerdict?.status === "fail"
    ? 1
    : 0;
}

/** Starts the installed app on the primed profile and leaves it running. */
export function launchObsidian({ installer, profile, log = console.log }) {
  if (!profile) {
    throw new ObsidianReleaseError("--launch needs --profile.");
  }
  if (!existsSync(installer)) {
    throw new ObsidianReleaseError(`No Obsidian at ${installer}.`);
  }
  const child = spawn(
    installer,
    ["--remote-debugging-port=0", `--user-data-dir=${profile}`],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  log(
    `Launched ${installer} on ${profile}. The debug port is in that profile's DevToolsActivePort.`,
  );
  return child.pid;
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
    process.exitCode = await runCommand(options);
  } catch (error) {
    console.error(
      `obsidian-profile failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
