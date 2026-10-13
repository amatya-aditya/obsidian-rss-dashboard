// Drives a running Obsidian instance (or any Chromium) over the Chrome
// DevTools Protocol, so an agent or maintainer can read the app's DOM, click,
// and screenshot without a human at the keyboard. See "Driving the vault over
// CDP" in docs/development/fixture-vault.md.
//
//   node scripts/obsidian-cdp.mjs targets
//   node scripts/obsidian-cdp.mjs eval ./probe.js
//   echo '1 + 1' | node scripts/obsidian-cdp.mjs eval -
//   node scripts/obsidian-cdp.mjs shot ./dashboard.png
//   node scripts/obsidian-cdp.mjs repl ./steps.txt
//   node scripts/obsidian-cdp.mjs open-settings rss-dashboard
//   node scripts/obsidian-cdp.mjs --settings shot ./settings.png
//
// Dependency-free: it uses Node's built-in http module and the global
// WebSocket, so it needs Node 22 or newer. The app under test must have been
// started with --remote-debugging-port=<port>; running without that flag is
// unattachable.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/** Electron and Chromium debug ports worth probing when none is given. */
export const DEFAULT_PORTS = [9222, 9333, 9334];
const DEFAULT_HOST = "localhost";
const ENV_PORT = "CDP_PORT";
const ENV_TARGET = "CDP_TARGET";
const ENV_EXPECT_VAULT = "CDP_EXPECT_VAULT";
const ENV_PROFILE = "CDP_PROFILE";
const ENV_WAIT = "CDP_WAIT";
const OBSIDIAN_URL_PREFIX = "app://obsidian.md";
/** The real vault window. The picker (starter.html) opens without a vault. */
const OBSIDIAN_VAULT_URL = "app://obsidian.md/index.html";
/** Abandons a DevTools call that never answers, so the CLI cannot hang. */
const DEFAULT_CALL_TIMEOUT_MS = 30_000;
/** Gap between polls while waiting for a ready target. */
const DEFAULT_POLL_INTERVAL_MS = 150;
/** How long open-settings waits for the Settings window when --wait is 0. */
const DEFAULT_SETTINGS_WAIT_MS = 10_000;
/** Obsidian 1.14 opens Settings as its own page; this is its url. */
const SETTINGS_URL = "about:blank";
/** `Settings - <vault name> - Obsidian <version>`; a vault name may hold " - ". */
const SETTINGS_TITLE = /^Settings - (.+) - Obsidian (\S+)$/;
/** Chromium writes this into --user-data-dir, naming the bound debug port. */
const DEVTOOLS_ACTIVE_PORT_FILE = "DevToolsActivePort";

const COMMANDS = [
  "targets",
  "eval",
  "shot",
  "repl",
  "batch",
  "open-settings",
  "help",
];
const STEP_NAMES = ["eval", "shot", "wait", "target", "settings"];
const STEP_LINE = new RegExp(`^@(?:${STEP_NAMES.join("|")})(?:[ \\t]|$)`);

const USAGE = `Drive a running Obsidian instance over the Chrome DevTools Protocol.

Usage: node scripts/obsidian-cdp.mjs [options] <command> [argument]

Commands:
  targets            List debuggable page targets on the probed ports.
  eval <file|->      Evaluate JavaScript in the target and print the result.
  shot <out.png>     Capture a PNG screenshot of the target.
  repl [file|->]     Run a batch of steps over one connection (alias: batch).
  open-settings <id> Open Settings on the tab with this id (for example
                     rss-dashboard) and wait for the Settings window. Needs
                     --profile and --expect-vault.

Options:
  --port <n>         Debug port to use (default: probe ${DEFAULT_PORTS.join(", ")}).
  --host <host>      Debug host (default: ${DEFAULT_HOST}).
  --target <text>    Pick the page whose title contains <text>.
  --expect-vault <p> Refuse unless this vault path is the one open in the target.
  --profile <dir>    Pin the port recorded in <dir>/${DEVTOOLS_ACTIVE_PORT_FILE}, and
                     refuse any target that is not the expected vault.
  --settings         Attach to the Settings window (Obsidian 1.14 opens it as its
                     own page) instead of the vault window, for eval, shot and
                     repl. Needs --profile and --expect-vault; the window must
                     be titled for the expected vault. In a repl, the
                     @settings step switches to it.
  --wait <ms>        Poll for a ready vault target for up to <ms> before failing
                     (default: 0, fail fast).
  --json             Print machine-readable output where supported.
  -h, --help         Show this help.

Environment:
  ${ENV_PORT}        Same as --port.
  ${ENV_TARGET}      Same as --target.
  ${ENV_EXPECT_VAULT}   Same as --expect-vault.
  ${ENV_PROFILE}     Same as --profile.
  ${ENV_WAIT}        Same as --wait.`;

export class CdpError extends Error {
  constructor(message) {
    super(message);
    this.name = "CdpError";
  }
}

function optionValue(argv, index, name) {
  const arg = argv[index];
  if (arg.includes("=")) {
    return arg.slice(arg.indexOf("=") + 1);
  }
  if (index + 1 >= argv.length) {
    throw new CdpError(`Option ${name} needs a value.`);
  }
  return argv[index + 1];
}

function parsePort(value, source) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CdpError(`Invalid port "${value ?? ""}" from ${source}.`);
  }
  return port;
}

function parseWait(value, source) {
  const ms = Number(value);
  if (!Number.isInteger(ms) || ms < 0) {
    throw new CdpError(
      `Invalid wait "${value ?? ""}" from ${source}; use a whole number of milliseconds.`,
    );
  }
  return ms;
}

function nonEmptyValue(value, name) {
  const text = String(value ?? "").trim();
  if (text === "") {
    throw new CdpError(`Option ${name} needs a value.`);
  }
  return text;
}

function assertArity(command, args) {
  if (command === "targets" && args.length > 0) {
    throw new CdpError(`targets takes no argument, got "${args[0]}".`);
  }
  if (command === "eval" && args.length !== 1) {
    throw new CdpError(
      'eval needs one argument: a file path, or "-" for stdin.',
    );
  }
  if (command === "shot" && args.length !== 1) {
    throw new CdpError(
      "shot needs an output path, for example shot dashboard.png.",
    );
  }
  if (command === "repl" && args.length > 1) {
    throw new CdpError(`repl takes at most one argument, got ${args.length}.`);
  }
  if (command === "open-settings" && args.length !== 1) {
    throw new CdpError(
      "open-settings needs one argument: a settings tab id, for example rss-dashboard.",
    );
  }
}

function assertSettingsFlag(options) {
  if (!options.settings) return;
  if (options.command === "targets" || options.command === "open-settings") {
    throw new CdpError(`--settings does not apply to ${options.command}.`);
  }
  if (options.target) {
    throw new CdpError(
      "--settings and --target both pick the window; pass only one.",
    );
  }
}

/**
 * Turns the command line and environment into the options main() consumes.
 * Exported so the parsing rules are unit-tested without a live app.
 */
export function parseArgs(argv, env = process.env) {
  const options = {
    command: undefined,
    args: [],
    ports: [...DEFAULT_PORTS],
    host: DEFAULT_HOST,
    target: env[ENV_TARGET] || undefined,
    expectVault: env[ENV_EXPECT_VAULT] || undefined,
    profile: env[ENV_PROFILE] || undefined,
    settings: false,
    waitMs: 0,
    json: false,
    help: false,
  };

  let port;
  if (env[ENV_PORT] !== undefined && env[ENV_PORT] !== "") {
    port = parsePort(env[ENV_PORT], ENV_PORT);
  }
  if (env[ENV_WAIT] !== undefined && env[ENV_WAIT] !== "") {
    options.waitMs = parseWait(env[ENV_WAIT], ENV_WAIT);
  }

  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--settings") {
      options.settings = true;
    } else if (arg === "--port" || arg.startsWith("--port=")) {
      port = parsePort(optionValue(argv, i, "--port"), "--port");
      if (!arg.includes("=")) i += 1;
    } else if (arg === "--host" || arg.startsWith("--host=")) {
      options.host = optionValue(argv, i, "--host");
      if (!arg.includes("=")) i += 1;
      if (options.host.trim() === "") {
        throw new CdpError("Option --host needs a value.");
      }
    } else if (arg === "--target" || arg.startsWith("--target=")) {
      options.target = optionValue(argv, i, "--target");
      if (!arg.includes("=")) i += 1;
    } else if (arg === "--expect-vault" || arg.startsWith("--expect-vault=")) {
      options.expectVault = nonEmptyValue(
        optionValue(argv, i, "--expect-vault"),
        "--expect-vault",
      );
      if (!arg.includes("=")) i += 1;
    } else if (arg === "--profile" || arg.startsWith("--profile=")) {
      options.profile = nonEmptyValue(
        optionValue(argv, i, "--profile"),
        "--profile",
      );
      if (!arg.includes("=")) i += 1;
    } else if (arg === "--wait" || arg.startsWith("--wait=")) {
      options.waitMs = parseWait(optionValue(argv, i, "--wait"), "--wait");
      if (!arg.includes("=")) i += 1;
    } else if (arg.startsWith("-") && arg !== "-") {
      throw new CdpError(`Unknown option "${arg}".\n\n${USAGE}`);
    } else {
      positionals.push(arg);
    }
  }

  if (port !== undefined) {
    options.ports = [port];
  }

  const [command, ...args] = positionals;
  if (options.help) {
    return options;
  }
  if (command === "help") {
    options.help = true;
    return options;
  }
  if (command === undefined) {
    throw new CdpError(`No command given.\n\n${USAGE}`);
  }
  if (!COMMANDS.includes(command)) {
    throw new CdpError(`Unknown command "${command}".\n\n${USAGE}`);
  }

  options.command = command === "batch" ? "repl" : command;
  assertArity(options.command, args);
  assertSettingsFlag(options);
  options.args = args;
  return options;
}

function isPageTarget(candidate) {
  return Boolean(
    candidate &&
    candidate.type === "page" &&
    typeof candidate.webSocketDebuggerUrl === "string" &&
    candidate.webSocketDebuggerUrl !== "",
  );
}

function isObsidianTarget(target) {
  return String(target.url || "").startsWith(OBSIDIAN_URL_PREFIX);
}

function isStarterTarget(target) {
  return String(target.url || "").includes("starter.html");
}

/**
 * True only for the real vault window (`index.html`), not the vault picker.
 * Exported for unit tests.
 */
export function isObsidianVaultTarget(target) {
  const url = String(target.url || "");
  return (
    url === OBSIDIAN_VAULT_URL ||
    url.startsWith(`${OBSIDIAN_VAULT_URL}?`) ||
    url.startsWith(`${OBSIDIAN_VAULT_URL}#`)
  );
}

function describeTarget(target) {
  return `${target.title || "(untitled)"} — ${target.url || "(no url)"}`;
}

function describeTargets(pages) {
  return pages.map((target) => `  ${describeTarget(target)}`).join("\n");
}

/**
 * Picks the page target to attach to: the one whose title matches `title`, or
 * the Obsidian app window, or the only page. Exported for unit tests.
 */
export function selectTarget(pages, { title } = {}) {
  const candidates = (Array.isArray(pages) ? pages : []).filter(isPageTarget);
  if (candidates.length === 0) {
    throw new CdpError("No debuggable page target found on this port.");
  }

  if (title) {
    const needle = String(title).toLowerCase();
    const matches = candidates.filter((target) =>
      String(target.title || "")
        .toLowerCase()
        .includes(needle),
    );
    if (matches.length === 0) {
      throw new CdpError(
        `No page title contains "${title}". Open targets:\n${describeTargets(candidates)}`,
      );
    }
    if (matches.length > 1) {
      throw new CdpError(
        `Several page titles contain "${title}"; narrow it. Open targets:\n${describeTargets(matches)}`,
      );
    }
    return matches[0];
  }

  const vaults = candidates.filter(isObsidianVaultTarget);
  if (vaults.length > 0) {
    return vaults[0];
  }
  // The picker (starter.html) is not an Obsidian app window with a vault, so
  // never treat it as "the Obsidian target" while other pages are open.
  const apps = candidates.filter(
    (target) => isObsidianTarget(target) && !isStarterTarget(target),
  );
  if (apps.length > 0) {
    return apps[0];
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  throw new CdpError(
    `Several page targets match; pass --target. Open targets:\n${describeTargets(candidates)}`,
  );
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

function dedent(lines) {
  const widths = lines
    .filter((line) => line.trim() !== "")
    .map((line) => /^[ \t]*/.exec(line)[0].length);
  const width = widths.length > 0 ? Math.min(...widths) : 0;
  return lines.map((line) => line.slice(width));
}

/**
 * Reads a batch script into steps. Each step starts on a line beginning with
 * `@`: `@eval` (with an inline expression or a multi-line body up to the next
 * `@` line), `@shot <path>`, `@wait <ms>`, or `@target <title>`. Blank lines
 * between steps are ignored. Exported for unit tests.
 */
export function parseBatch(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const steps = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (!line.startsWith("@")) {
      throw new CdpError(
        `Line ${i + 1}: expected a step starting with "@", got ${JSON.stringify(line)}.`,
      );
    }
    const match = /^@([A-Za-z]+)(?:[ \t](.*))?$/.exec(line);
    if (!match) {
      throw new CdpError(
        `Line ${i + 1}: could not read the step ${JSON.stringify(line)}.`,
      );
    }
    const name = match[1];
    const inline = match[2] ?? "";
    const stepLine = i + 1;
    i += 1;

    if (name === "eval") {
      if (inline.trim() !== "") {
        steps.push({ kind: "eval", code: inline });
        continue;
      }
      const body = [];
      while (i < lines.length && !STEP_LINE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      steps.push({
        kind: "eval",
        code: dedent(trimBlankLines(body)).join("\n"),
      });
    } else if (name === "shot") {
      if (inline.trim() === "") {
        throw new CdpError(`Line ${stepLine}: @shot needs an output path.`);
      }
      steps.push({ kind: "shot", path: inline.trim() });
    } else if (name === "wait") {
      const ms = Number(inline.trim());
      if (inline.trim() === "" || !Number.isFinite(ms) || ms < 0) {
        throw new CdpError(
          `Line ${stepLine}: @wait needs a number of milliseconds.`,
        );
      }
      steps.push({ kind: "wait", ms });
    } else if (name === "target") {
      if (inline.trim() === "") {
        throw new CdpError(
          `Line ${stepLine}: @target needs a title substring.`,
        );
      }
      steps.push({ kind: "target", title: inline.trim() });
    } else if (name === "settings") {
      if (inline.trim() !== "") {
        throw new CdpError(`Line ${stepLine}: @settings takes no argument.`);
      }
      steps.push({ kind: "settings" });
    } else {
      throw new CdpError(
        `Line ${stepLine}: unknown step "@${name}". Use ${STEP_NAMES.map((step) => `@${step}`).join(", ")}.`,
      );
    }
  }

  if (steps.length === 0) {
    throw new CdpError("No steps found. A batch needs at least one @step.");
  }
  return steps;
}

/**
 * Reads `Settings - <vault name> - Obsidian <version>`, the title Obsidian 1.14
 * gives its Settings window, or returns undefined for any other title.
 * Exported for unit tests.
 */
export function parseSettingsTitle(title) {
  const match = SETTINGS_TITLE.exec(String(title ?? ""));
  return match ? { vaultName: match[1], version: match[2] } : undefined;
}

/**
 * The vault's folder name, lower case: the last segment of a vault path.
 * Exported for unit tests.
 */
export function vaultBasename(value) {
  const normalized = normalizeVaultPath(value);
  if (normalized === undefined) return undefined;
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/**
 * @typedef {object} CompanionVerdict
 * @property {boolean} ok
 * @property {string} code
 * @property {string} [message] Why it was refused; set when `ok` is false.
 * @property {any} [target] The accepted page; set when `ok` is true.
 */

/** @returns {CompanionVerdict | undefined} */
function companionPreconditions({ expectedVault, pinned }) {
  if (normalizeVaultPath(expectedVault) === undefined) {
    return {
      ok: false,
      code: "no-expectation",
      message:
        "Refusing the Settings window: pass --expect-vault so it can be " +
        "matched to the vault you meant.",
    };
  }
  if (!pinned) {
    return {
      ok: false,
      code: "unpinned",
      message:
        "Refusing the Settings window: pass --profile so the port is pinned " +
        "to this session's own Obsidian. Without it the window may belong to " +
        "another session.",
    };
  }
  return undefined;
}

/**
 * Decides whether a page is the Settings window of the expected vault. The
 * Settings window has no `app`, so its identity is its title, and the title is
 * only trusted on a port that --profile pinned to this session's own
 * instance. Pure; exported so the rule is unit-tested without a live socket.
 *
 * @returns {CompanionVerdict}
 */
export function assessCompanionTarget({ target, expectedVault, pinned } = {}) {
  const refusal = companionPreconditions({ expectedVault, pinned });
  if (refusal) return refusal;
  const parsed = parseSettingsTitle(target?.title);
  if (!parsed || String(target?.url ?? "") !== SETTINGS_URL) {
    return {
      ok: false,
      code: "not-settings",
      message:
        `Refusing to attach: ${describeTarget(target ?? {})} is not an ` +
        "Obsidian Settings window.",
    };
  }
  if (parsed.vaultName.toLowerCase() !== vaultBasename(expectedVault)) {
    return {
      ok: false,
      code: "wrong-vault",
      message:
        `Refusing to attach: the Settings window is for the vault ` +
        `"${parsed.vaultName}", but ${expectedVault} was expected.`,
    };
  }
  return { ok: true, code: "ok", target };
}

/**
 * Picks the Settings window among a port's pages. Returns `{ ok: true, target }`,
 * or `{ ok: false, code, message }`; `none-open` means it may simply not have
 * appeared yet, so a caller can keep polling. Exported for unit tests.
 *
 * @returns {CompanionVerdict}
 */
export function selectSettingsTarget(pages, { expectedVault, pinned } = {}) {
  const refusal = companionPreconditions({ expectedVault, pinned });
  if (refusal) return refusal;
  const titled = (Array.isArray(pages) ? pages : []).filter(
    (candidate) =>
      isPageTarget(candidate) && parseSettingsTitle(candidate.title),
  );
  if (titled.length === 0) {
    return {
      ok: false,
      code: "none-open",
      message: "No Obsidian Settings window is open on this port.",
    };
  }
  const verdicts = titled.map((target) =>
    assessCompanionTarget({ target, expectedVault, pinned }),
  );
  const accepted = verdicts.filter((verdict) => verdict.ok);
  if (accepted.length === 1) return accepted[0];
  if (accepted.length > 1) {
    return {
      ok: false,
      code: "ambiguous",
      message: `Several Settings windows match ${expectedVault}:\n${describeTargets(titled)}`,
    };
  }
  return verdicts[0];
}

/** Fails with a pointed message when the runtime lacks a global WebSocket. */
export function assertWebSocket(
  hasWebSocket = typeof WebSocket === "function",
) {
  if (!hasWebSocket) {
    throw new CdpError(
      "This harness needs Node 22 or newer, which provides a global WebSocket.",
    );
  }
}

function readInput(spec) {
  if (spec === undefined || spec === "-") {
    return readFileSync(0, "utf8");
  }
  return readFileSync(spec, "utf8");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new CdpError(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new CdpError(`invalid JSON from ${url}`));
        }
      });
    });
    req.on("error", (error) =>
      reject(new CdpError(error.message || error.code || "request failed")),
    );
    req.setTimeout(2000, () =>
      req.destroy(new CdpError(`timed out requesting ${url}`)),
    );
    req.end();
  });
}

async function fetchTargets(host, port) {
  const payload = await httpGetJson(`http://${host}:${port}/json/list`);
  if (!Array.isArray(payload)) {
    throw new CdpError("unexpected /json/list response");
  }
  return payload;
}

async function pageTargetsOn(host, port) {
  return (await fetchTargets(host, port)).filter(isPageTarget);
}

function noDebuggablePage(host, ports, detail) {
  return new CdpError(
    `No debuggable page found on ${ports.join(", ")} (host ${host}).\n` +
      "Start Obsidian with --remote-debugging-port=<port> and a disposable " +
      "--user-data-dir, then try again. See docs/development/fixture-vault.md." +
      (detail ? `\n${detail}` : ""),
  );
}

/**
 * Prefers a port with a real Obsidian vault window, then one with any Obsidian
 * page (for example a picker), over one that only has other pages (such as a
 * Chrome on 9222); falls back to the first reachable port. Exported for tests.
 */
export function choosePort(candidates) {
  if (candidates.length === 0) {
    return undefined;
  }
  return (
    candidates.find((candidate) =>
      candidate.pages.some(isObsidianVaultTarget),
    ) ??
    candidates.find((candidate) => candidate.pages.some(isObsidianTarget)) ??
    candidates[0]
  );
}

/**
 * Normalizes a vault path for comparison: forward slashes, no trailing slash,
 * lower case, so Windows paths compare case-insensitively. Exported for tests.
 */
export function normalizeVaultPath(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (text === "") return undefined;
  const slashed = text.replace(/\\/g, "/").replace(/\/+$/, "");
  return slashed === "" ? undefined : slashed.toLowerCase();
}

/**
 * Decides whether the attached window is the intended vault. Pure: give it the
 * target URL, the vault path read from the page, and the expected vault.
 * Exported so the guard is unit-tested without a live socket. With no
 * expectation it has no opinion, which keeps the default CLI behavior.
 */
export function assessVaultOwnership({
  targetUrl,
  vaultPath,
  expectedVault,
} = {}) {
  const expectation = normalizeVaultPath(expectedVault);
  const found = normalizeVaultPath(vaultPath);

  if (expectation === undefined) {
    return { ok: true, code: "no-expectation", foundVault: vaultPath };
  }
  if (!isObsidianVaultTarget({ url: targetUrl })) {
    return {
      ok: false,
      code: "not-a-vault",
      foundVault: vaultPath,
      message:
        `Refusing to attach: ${targetUrl || "(no url)"} is not an open ` +
        "Obsidian vault window (the picker and other targets have none). " +
        "Open the expected vault, or pass --port/--profile to target the " +
        "right instance.",
    };
  }
  if (found === undefined) {
    return {
      ok: false,
      code: "no-vault",
      foundVault: vaultPath,
      message:
        "Refusing to attach: the target reports no vault path " +
        "(app.vault.adapter.getBasePath() returned nothing). Expected " +
        `${expectedVault}.`,
    };
  }
  if (found !== expectation) {
    return {
      ok: false,
      code: "mismatch",
      foundVault: vaultPath,
      message:
        `Refusing to attach: the open vault is ${vaultPath}, but ` +
        `${expectedVault} was expected. Pass --port/--profile for the ` +
        "instance that has the expected vault.",
    };
  }
  return { ok: true, code: "ok", foundVault: vaultPath };
}

/**
 * Reads the bound port from a ${DEVTOOLS_ACTIVE_PORT_FILE} file's first line.
 * Exported for tests.
 */
export function parseDevToolsActivePort(text) {
  const first = String(text).split(/\r?\n/, 1)[0].trim();
  const port = Number(first);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CdpError(
      `DevToolsActivePort does not name a port (read ${JSON.stringify(first)}).`,
    );
  }
  return port;
}

function readDevToolsActivePort(profileDir) {
  const file = join(profileDir, DEVTOOLS_ACTIVE_PORT_FILE);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new CdpError(
      `Could not read ${file}: ${errorMessage(error)}. Is --profile the ` +
        "--user-data-dir the app was launched with?",
    );
  }
  return parseDevToolsActivePort(text);
}

/**
 * @typedef {object} PollOptions
 * @property {() => Promise<unknown>} attempt Returns a value when ready, else undefined to keep polling.
 * @property {number} [budgetMs] Total time to keep polling; zero tries once and fails fast.
 * @property {number} [intervalMs] Gap between polls.
 * @property {() => number} [now] Clock, injectable for tests.
 * @property {(ms: number) => Promise<void>} [sleep] Delay, injectable for tests.
 * @property {() => Error} [onTimeout] Builds the error thrown when the budget runs out.
 */

/**
 * Polls `attempt` until it returns a value or `budgetMs` runs out. One attempt
 * always runs, so a zero budget fails fast. `now` and `sleep` are injectable so
 * the wait is tested without real time. Exported for tests.
 *
 * @param {PollOptions} options
 */
export async function pollUntilReady({
  attempt,
  budgetMs = 0,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  now = () => Date.now(),
  sleep = delay,
  onTimeout = () => new CdpError("Timed out waiting for a ready target."),
} = {}) {
  const deadline = now() + Math.max(0, budgetMs);
  for (;;) {
    const value = await attempt();
    if (value !== undefined && value !== null) {
      return value;
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw onTimeout();
    }
    await sleep(Math.min(intervalMs, remaining));
  }
}

async function discoverOnce(host, ports) {
  const attempts = [];
  const reachable = [];
  for (const port of ports) {
    try {
      const pages = await pageTargetsOn(host, port);
      if (pages.length === 0) {
        attempts.push(`  ${port}: no page targets`);
        continue;
      }
      reachable.push({ port, pages });
    } catch (error) {
      attempts.push(`  ${port}: ${errorMessage(error)}`);
    }
  }
  return { reachable, attempts };
}

export function connect(
  webSocketUrl,
  { WebSocketImpl = WebSocket, timeoutMs = DEFAULT_CALL_TIMEOUT_MS } = {},
) {
  const socket = new WebSocketImpl(webSocketUrl);
  const pending = new Map();
  let nextId = 1;
  let closed = false;

  const failPending = (error) => {
    for (const waiter of pending.values()) {
      waiter.reject(error);
    }
    pending.clear();
  };

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => {
      const error = new CdpError(`Could not open ${webSocketUrl}.`);
      failPending(error);
      reject(error);
    });
  });

  // A dropped socket (the app reloaded or crashed) must not leave a caller
  // waiting on a reply that will never come.
  socket.addEventListener("close", () => {
    closed = true;
    failPending(new CdpError(`Connection to ${webSocketUrl} closed.`));
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) {
      waiter.reject(
        new CdpError(message.error.message ?? JSON.stringify(message.error)),
      );
    } else {
      waiter.resolve(message.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new CdpError(`Connection to ${webSocketUrl} is closed.`));
        return;
      }
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new CdpError(`Timed out after ${timeoutMs}ms waiting for ${method}.`),
        );
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(new CdpError(errorMessage(error)));
      }
    });

  return { opened, send, close: () => socket.close() };
}

async function evaluate(connection, expression) {
  // replMode lets a batch redeclare `const`/`let` across steps and use
  // top-level `await`, the way the developer console does.
  const result = await connection.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    replMode: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const description =
      details.exception?.description ?? details.text ?? "evaluation failed";
    throw new CdpError(description);
  }
  return result.result;
}

/** Renders a `Runtime.evaluate` result as printable text. Exported for tests. */
export function renderValue(result) {
  if (!result) return "undefined";
  if (result.unserializableValue !== undefined) {
    return String(result.unserializableValue);
  }
  if ("value" in result) {
    const text = JSON.stringify(result.value, null, 2);
    return text === undefined ? "undefined" : text;
  }
  if (result.type === "undefined") return "undefined";
  return result.description ?? JSON.stringify(result);
}

async function screenshot(connection, path) {
  await connection.send("Page.enable");
  const { data } = await connection.send("Page.captureScreenshot", {
    format: "png",
  });
  if (!data) {
    throw new CdpError("screenshot returned no image data");
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(data, "base64"));
  } catch (error) {
    throw new CdpError(`Could not write ${path}: ${errorMessage(error)}`);
  }
  return path;
}

// Reads the open vault's base path from the page. A missing `app` (the picker)
// or a missing adapter returns null, which readVaultPath turns into undefined.
const VAULT_PATH_EXPRESSION =
  "(() => { try { return (typeof app !== 'undefined' && app.vault && " +
  "app.vault.adapter && typeof app.vault.adapter.getBasePath === 'function') " +
  "? app.vault.adapter.getBasePath() : null; } catch { return null; } })()";

/** Returns the page's vault base path, or undefined when there is none. */
async function readVaultPath(connection) {
  const result = await evaluate(connection, VAULT_PATH_EXPRESSION);
  const value = result && typeof result.value === "string" ? result.value : "";
  return value.trim() === "" ? undefined : value;
}

/**
 * One attempt to attach. Returns `{ ok: true, ... }` on success, or
 * `{ ok: false, sawTargets, reason }` when nothing usable is up yet. A pinned
 * profile is trusted: a target that is not the expected vault throws loudly
 * instead of falling back to another port.
 */
async function tryAttachOnce({
  host,
  ports,
  title,
  expectVault,
  pinnedPort,
  settings,
}) {
  const { reachable, attempts } = await discoverOnce(host, ports);
  if (reachable.length === 0) {
    return { ok: false, sawTargets: false, reason: attempts.join("\n") };
  }
  const chosen = choosePort(reachable);
  let target;
  try {
    target = selectTarget(chosen.pages, { title });
  } catch (error) {
    return { ok: false, sawTargets: true, reason: errorMessage(error) };
  }
  let connection;
  try {
    connection = connect(target.webSocketDebuggerUrl);
    await connection.opened;
  } catch (error) {
    return { ok: false, sawTargets: true, reason: errorMessage(error) };
  }
  let vaultPath;
  try {
    vaultPath = await readVaultPath(connection);
  } catch (error) {
    connection.close();
    return { ok: false, sawTargets: true, reason: errorMessage(error) };
  }
  const ownership = assessVaultOwnership({
    targetUrl: target.url,
    vaultPath,
    expectedVault: expectVault,
  });
  if (!ownership.ok) {
    connection.close();
    if (pinnedPort) {
      throw new CdpError(ownership.message);
    }
    return { ok: false, sawTargets: true, reason: ownership.message };
  }
  if (!settings) {
    return { ok: true, connection, port: chosen.port, target, vaultPath };
  }

  // The vault window on this port is the expected vault, so the Settings
  // window beside it is a companion target: trust it by its title.
  connection.close();
  const picked = selectSettingsTarget(chosen.pages, {
    expectedVault: expectVault,
    pinned: pinnedPort,
  });
  if (!picked.ok) {
    if (picked.code === "none-open") {
      return { ok: false, sawTargets: true, reason: picked.message };
    }
    throw new CdpError(picked.message);
  }
  try {
    const companion = connect(picked.target.webSocketDebuggerUrl);
    await companion.opened;
    return {
      ok: true,
      connection: companion,
      port: chosen.port,
      target: picked.target,
      vaultPath,
    };
  } catch (error) {
    return { ok: false, sawTargets: true, reason: errorMessage(error) };
  }
}

/**
 * Attaches to the intended target. With `waitMs > 0`, polls until a ready
 * target appears or the budget expires; otherwise a single attempt fails fast.
 */
async function openTarget(host, ports, title, options = {}) {
  const {
    expectVault,
    waitMs = 0,
    pinnedPort = false,
    settings = false,
  } = options;
  const request = { host, ports, title, expectVault, pinnedPort, settings };

  if (waitMs > 0) {
    let lastReason = "";
    return pollUntilReady({
      attempt: async () => {
        const outcome = await tryAttachOnce(request);
        if (outcome.ok) return outcome;
        lastReason = outcome.reason;
        return undefined;
      },
      budgetMs: waitMs,
      onTimeout: () => {
        const base = noDebuggablePage(host, ports, lastReason || undefined);
        return new CdpError(
          `Timed out after ${waitMs}ms waiting for a ready Obsidian vault ` +
            `target${expectVault ? ` (${expectVault})` : ""}.\n${base.message}`,
        );
      },
    });
  }

  const outcome = await tryAttachOnce(request);
  if (outcome.ok) {
    return outcome;
  }
  if (!outcome.sawTargets) {
    throw noDebuggablePage(host, ports, outcome.reason);
  }
  throw new CdpError(outcome.reason);
}

/** Runs every step over one connection, reconnecting only on `@target`. */
async function runBatch(options, initialConnection, steps) {
  let connection = initialConnection;
  try {
    for (const step of steps) {
      if (step.kind === "target") {
        const next = await openTarget(options.host, options.ports, step.title);
        connection.close();
        connection = next.connection;
      } else if (step.kind === "settings") {
        const next = await openTarget(options.host, options.ports, undefined, {
          expectVault: options.expectVault,
          waitMs: options.waitMs,
          pinnedPort: Boolean(options.profile),
          settings: true,
        });
        connection.close();
        connection = next.connection;
      } else if (step.kind === "wait") {
        await delay(step.ms);
      } else if (step.kind === "shot") {
        await screenshot(connection, step.path);
        console.log(`shot -> ${step.path}`);
      } else {
        console.log(renderValue(await evaluate(connection, step.code)));
      }
    }
  } finally {
    connection.close();
  }
}

/** Refuses before any side effect unless the Settings guard can hold. */
function assertCompanionGuard(options, pinnedPort) {
  const refusal = companionPreconditions({
    expectedVault: options.expectVault,
    pinned: pinnedPort,
  });
  if (refusal) throw new CdpError(refusal.message);
}

/** Waits for the expected vault's Settings window and returns its target. */
async function waitForCompanion(options, budgetMs) {
  const port = options.ports[0];
  return pollUntilReady({
    attempt: async () => {
      const picked = selectSettingsTarget(
        await pageTargetsOn(options.host, port),
        { expectedVault: options.expectVault, pinned: true },
      );
      if (!picked.ok) {
        if (picked.code === "none-open") return undefined;
        throw new CdpError(picked.message);
      }
      const companion = connect(picked.target.webSocketDebuggerUrl);
      try {
        await companion.opened;
        const state = await evaluate(companion, "document.readyState");
        return state.value === "complete" ? picked.target : undefined;
      } finally {
        companion.close();
      }
    },
    budgetMs,
    onTimeout: () =>
      new CdpError(
        `No ready Settings window for ${options.expectVault} appeared within ${budgetMs}ms.`,
      ),
  });
}

/**
 * Opens Settings on one tab from the guarded vault window, then waits for the
 * Settings window to become the ready companion target.
 */
async function openSettings(options, connection) {
  const tabId = options.args[0];
  const budgetMs = options.waitMs || DEFAULT_SETTINGS_WAIT_MS;
  await evaluate(
    connection,
    'app.commands.executeCommandById("app:open-settings")',
  );
  const openTab =
    "(() => { try { return Boolean(app.setting.openTabById(" +
    `${JSON.stringify(tabId)})); } catch { return false; } })()`;
  await pollUntilReady({
    attempt: async () =>
      (await evaluate(connection, openTab)).value === true ? true : undefined,
    budgetMs,
    onTimeout: () =>
      new CdpError(`Obsidian has no settings tab with the id "${tabId}".`),
  });
  const target = await waitForCompanion(options, budgetMs);
  console.log(`Settings tab ${tabId} is open: ${describeTarget(target)}`);
}

async function listTargets(options) {
  const found = [];
  for (const port of options.ports) {
    try {
      const pages = await pageTargetsOn(options.host, port);
      for (const page of pages) found.push({ port, ...page });
    } catch {
      // Port not in use; skip it.
    }
  }
  if (found.length === 0) {
    throw noDebuggablePage(options.host, options.ports);
  }
  if (options.json) {
    console.log(JSON.stringify(found, null, 2));
    return;
  }
  for (const page of found) {
    console.log(
      `${page.port}\t${page.title || "(untitled)"}\t${page.url || ""}`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (options.command === "targets") {
    await listTargets(options);
    return;
  }

  assertWebSocket();

  let ports = options.ports;
  let pinnedPort = false;
  if (options.profile) {
    ports = [readDevToolsActivePort(options.profile)];
    pinnedPort = true;
    options.ports = ports;
  }

  const steps =
    options.command === "repl" ? parseBatch(readInput(options.args[0])) : [];
  if (
    options.settings ||
    options.command === "open-settings" ||
    steps.some((step) => step.kind === "settings")
  ) {
    assertCompanionGuard(options, pinnedPort);
  }

  const { connection } = await openTarget(options.host, ports, options.target, {
    expectVault: options.expectVault,
    waitMs: options.waitMs,
    pinnedPort,
    settings: options.settings,
  });
  try {
    if (options.command === "open-settings") {
      await openSettings(options, connection);
      return;
    }
    if (options.command === "eval") {
      const code = readInput(options.args[0]);
      console.log(renderValue(await evaluate(connection, code)));
      return;
    }
    if (options.command === "shot") {
      await screenshot(connection, options.args[0]);
      console.log(`Wrote ${options.args[0]}`);
      return;
    }
    await runBatch(options, connection, steps);
  } finally {
    connection.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error instanceof CdpError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
}
