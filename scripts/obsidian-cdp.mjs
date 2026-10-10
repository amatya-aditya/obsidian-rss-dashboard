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
//
// Dependency-free: it uses Node's built-in http module and the global
// WebSocket, so it needs Node 22 or newer. The app under test must have been
// started with --remote-debugging-port=<port>; running without that flag is
// unattachable.

import { readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/** Electron and Chromium debug ports worth probing when none is given. */
export const DEFAULT_PORTS = [9222, 9333, 9334];
const DEFAULT_HOST = "localhost";
const ENV_PORT = "CDP_PORT";
const ENV_TARGET = "CDP_TARGET";
const OBSIDIAN_URL_PREFIX = "app://obsidian.md";

const COMMANDS = ["targets", "eval", "shot", "repl", "batch", "help"];
const STEP_NAMES = ["eval", "shot", "wait", "target"];

const USAGE = `Drive a running Obsidian instance over the Chrome DevTools Protocol.

Usage: node scripts/obsidian-cdp.mjs [options] <command> [argument]

Commands:
  targets            List debuggable page targets on the probed ports.
  eval <file|->      Evaluate JavaScript in the target and print the result.
  shot <out.png>     Capture a PNG screenshot of the target.
  repl [file|->]     Run a batch of steps over one connection (alias: batch).

Options:
  --port <n>         Debug port to use (default: probe ${DEFAULT_PORTS.join(", ")}).
  --host <host>      Debug host (default: ${DEFAULT_HOST}).
  --target <text>    Pick the page whose title contains <text>.
  --json             Print machine-readable output where supported.
  -h, --help         Show this help.

Environment:
  ${ENV_PORT}        Same as --port.
  ${ENV_TARGET}      Same as --target.`;

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
    json: false,
    help: false,
  };

  let port;
  if (env[ENV_PORT] !== undefined && env[ENV_PORT] !== "") {
    port = parsePort(env[ENV_PORT], ENV_PORT);
  }

  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
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
  if (options.help && command === undefined) {
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

  const obsidian = candidates.filter((target) =>
    String(target.url || "").startsWith(OBSIDIAN_URL_PREFIX),
  );
  if (obsidian.length > 0) {
    return obsidian[0];
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
      while (i < lines.length && !lines[i].startsWith("@")) {
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
    req.on("error", (error) => reject(new CdpError(error.message)));
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

async function discover(host, ports) {
  const attempts = [];
  for (const port of ports) {
    let pages;
    try {
      pages = await pageTargetsOn(host, port);
    } catch (error) {
      attempts.push(`  ${port}: ${errorMessage(error)}`);
      continue;
    }
    if (pages.length === 0) {
      attempts.push(`  ${port}: no page targets`);
      continue;
    }
    return { port, pages };
  }
  throw noDebuggablePage(host, ports, attempts.join("\n"));
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () =>
      reject(new CdpError(`Could not open ${webSocketUrl}.`)),
    );
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
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { opened, send, close: () => socket.close() };
}

async function evaluate(connection, expression) {
  await connection.send("Runtime.enable");
  const result = await connection.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const description =
      details.exception?.description ?? details.text ?? "evaluation failed";
    throw new CdpError(description);
  }
  return result.result;
}

function renderValue(result) {
  if (!result) return "undefined";
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
  writeFileSync(path, Buffer.from(data, "base64"));
  return path;
}

async function openTarget(host, ports, title) {
  const { port, pages } = await discover(host, ports);
  const target = selectTarget(pages, { title });
  const connection = connect(target.webSocketDebuggerUrl);
  await connection.opened;
  return { connection, port, target };
}

/** Runs every step over one connection, reconnecting only on `@target`. */
async function runBatch(options, initialConnection, steps) {
  let connection = initialConnection;
  try {
    for (const step of steps) {
      if (step.kind === "target") {
        connection.close();
        ({ connection } = await openTarget(
          options.host,
          options.ports,
          step.title,
        ));
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

  const { connection } = await openTarget(
    options.host,
    options.ports,
    options.target,
  );
  try {
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
    await runBatch(options, connection, parseBatch(readInput(options.args[0])));
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
