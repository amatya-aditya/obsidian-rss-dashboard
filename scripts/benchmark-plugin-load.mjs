// Measures plugin load in a real Obsidian over the Chrome DevTools Protocol: a
// CPU profile of a cold launch, and warm plugin reloads that time `onload` and
// count the shard reads and writes behind it. Two runs of it, before and after
// a change, make a comparable table. See docs/development/plugin-load-benchmark.md
// and docs/planning/370-performance-program.md (Track 5) for the rules.
//
//   node scripts/benchmark-plugin-load.mjs run --exe <Obsidian executable> --vault <vault folder> --label before --out before.json [--port 9444] [--warm-runs 4] [--plugin-id rss-dashboard]
//   node scripts/benchmark-plugin-load.mjs compare before.json after.json
//
// `run` launches Obsidian itself, so Obsidian must be closed first: a second
// launch hands over to the running instance and ignores the debug port. It
// opens whichever vault Obsidian last had open and refuses to measure any
// other than --vault. It leaves Obsidian running afterwards; close it yourself.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { request } from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { assessVaultOwnership, connect } from "./obsidian-cdp.mjs";

const VAULT_PAGE_PREFIX = "app://obsidian.md/index.html";
const DEFAULT_PORT = 9444;
const DEFAULT_WARM_RUNS = 4;
const DEFAULT_PLUGIN_ID = "rss-dashboard";
/** Sampling interval for the CPU profiler, in microseconds. */
const SAMPLING_INTERVAL_US = 200;
/** How long to keep profiling after layout and the plugin are ready, so work the load queues is seen. */
const COLD_SETTLE_MS = 2500;
/** How long a warm run waits after `enablePlugin` returns, so a post-load save is counted. */
const WARM_SETTLE_MS = 7000;
const COLD_TIMEOUT_MS = 90_000;
/** A launch whose window never answers a trivial call is stuck; fail fast instead of waiting. */
const COLD_CALL_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 120_000;
const TOOL_PROCESS_PATTERN = /vitest|eslint|\btsc\b|esbuild|stryker/i;

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    port: DEFAULT_PORT,
    warmRuns: DEFAULT_WARM_RUNS,
    pluginId: DEFAULT_PLUGIN_ID,
    files: [],
  };
  const names = {
    "--exe": "exe",
    "--vault": "vault",
    "--label": "label",
    "--out": "out",
    "--port": "port",
    "--warm-runs": "warmRuns",
    "--plugin-id": "pluginId",
  };
  for (let i = 0; i < rest.length; i += 1) {
    const key = names[rest[i]];
    if (key === undefined) {
      if (rest[i].startsWith("--"))
        throw new Error(`Unknown option "${rest[i]}".`);
      options.files.push(rest[i]);
      continue;
    }
    if (i + 1 >= rest.length)
      throw new Error(`Option ${rest[i]} needs a value.`);
    i += 1;
    options[key] =
      key === "port" || key === "warmRuns" ? Number(rest[i]) : rest[i];
  }
  if (!["run", "compare"].includes(command)) {
    throw new Error("Use `run` or `compare`.");
  }
  if (command === "compare" && options.files.length !== 2) {
    throw new Error("compare needs two result files: before.json after.json.");
  }
  if (command === "run") {
    for (const need of ["exe", "vault", "label", "out"]) {
      if (!options[need]) throw new Error(`run needs --${need}.`);
    }
    if (!Number.isInteger(options.port) || options.port < 1) {
      throw new Error("--port must be a positive whole number.");
    }
    if (!Number.isInteger(options.warmRuns) || options.warmRuns < 1) {
      throw new Error("--warm-runs must be a positive whole number.");
    }
  }
  return options;
}

/**
 * Reduces a Chrome CPU profile to the numbers a before/after table needs: the
 * sampled span, the CPU spent under the plugin's own frames (Obsidian names a
 * plugin's script `plugin:<id>`), idle time, and the plugin's most expensive
 * named frames by inclusive time. A minified bundle keeps class method names
 * but not local function names, so the named frames are the readable ones.
 */
export function summarizeProfile(profile, pluginId) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parent.set(child, node.id);
  }
  const prefix = `plugin:${pluginId}`;
  const inclusive = new Map();
  let spanUs = 0;
  let pluginUs = 0;
  let idleUs = 0;
  profile.samples.forEach((id, index) => {
    const delta = profile.timeDeltas[index] ?? 0;
    spanUs += delta;
    if (byId.get(id).callFrame.functionName === "(idle)") {
      idleUs += delta;
      return;
    }
    const seen = new Set();
    let inPlugin = false;
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const frame = byId.get(cur).callFrame;
      if (!frame.url.startsWith(prefix)) continue;
      inPlugin = true;
      if (frame.functionName && !seen.has(frame.functionName)) {
        seen.add(frame.functionName);
        inclusive.set(
          frame.functionName,
          (inclusive.get(frame.functionName) ?? 0) + delta,
        );
      }
    }
    if (inPlugin) pluginUs += delta;
  });
  const ms = (us) => Math.round(us / 1000);
  return {
    spanMs: ms(spanUs),
    pluginCpuMs: ms(pluginUs),
    idleMs: ms(idleUs),
    otherCpuMs: ms(spanUs - pluginUs - idleUs),
    topPluginFrames: [...inclusive.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, us]) => ({ name, ms: ms(us) })),
  };
}

function normalizeFolder(folder) {
  return String(folder).replace(/\/+$/, "");
}

/** Paths of `.json` files directly inside `folder`: the feed shards. */
export function shardPaths(paths, folder) {
  const prefix = `${normalizeFolder(folder)}/`;
  return paths.filter(
    (p) =>
      p.startsWith(prefix) &&
      p.endsWith(".json") &&
      !p.slice(prefix.length).includes("/"),
  );
}

/** Counts writes by kind, keeping only file names so no vault path is recorded. */
export function summarizeWrites(paths, folder) {
  const shards = shardPaths(paths, folder).length;
  const other = {};
  for (const p of paths) {
    if (shardPaths([p], folder).length > 0) continue;
    const name = p.slice(p.lastIndexOf("/") + 1);
    other[name] = (other[name] ?? 0) + 1;
  }
  return { shards, other };
}

/**
 * Lint, test and type-check processes alive beyond the ambient count taken
 * before the run began (an editor's ESLint server always matches). A rise at
 * either end of a measurement means other work shared the machine.
 */
export function foreignProcesses(ambient, before, after) {
  return Math.max(0, Math.max(before, after) - ambient);
}

/**
 * Warm runs that overlapped other lint, test or type-check processes are
 * reported but left out of the median whenever a clean run exists.
 */
export function summarizeWarm(runs) {
  const clean = runs.filter((run) => run.foreignProcesses === 0);
  const pool = clean.length > 0 ? clean : runs;
  return {
    onloadMs: median(pool.map((run) => run.onloadMs)),
    shardReads: median(pool.map((run) => run.shardReads)),
    shardWrites: median(pool.map((run) => run.writes.shards)),
    cleanRuns: clean.length,
    contaminatedRuns: runs.length - clean.length,
  };
}

function describeResult(result) {
  const m = result.machine;
  return `\`${result.commit}\`${result.dirty ? " (dirty tree)" : ""} on ${m.cpu} (${m.threads} threads, ${m.memoryGb} GB), ${m.os}, Obsidian ${result.obsidian}, plugin ${result.plugin}, ${result.date}`;
}

function change(before, after) {
  if (before === null || after === null || before === 0) return "-";
  const pct = Math.round(((after - before) / before) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

export function formatComparison(before, after) {
  const bw = summarizeWarm(before.warm.runs);
  const aw = summarizeWarm(after.warm.runs);
  const row = (label, b, a) =>
    `| ${label} | ${b ?? "-"} | ${a ?? "-"} | ${change(b ?? null, a ?? null)} |`;
  const lines = [
    `- **Before (${before.label}):** ${describeResult(before)}`,
    `- **After (${after.label}):** ${describeResult(after)}`,
    "",
    "| Measure | Before | After | Change |",
    "| --- | --- | --- | --- |",
    row("Warm `onload`, median ms", bw.onloadMs, aw.onloadMs),
    row("Shard reads per plugin start", bw.shardReads, aw.shardReads),
    row("Shard writes per plugin start", bw.shardWrites, aw.shardWrites),
    row(
      "Cold launch: plugin CPU ms",
      before.cold.profile.pluginCpuMs,
      after.cold.profile.pluginCpuMs,
    ),
    row(
      "Cold launch: workspace ready, page ms",
      before.cold.layoutReadyMs,
      after.cold.layoutReadyMs,
    ),
    "",
    "Warm = median of warm reloads that had the machine to themselves. The cold launch is one run and is reported separately; its raw profile is kept beside the JSON.",
  ];
  const notes = [];
  for (const [side, w] of [
    ["before", bw],
    ["after", aw],
  ]) {
    if (w.contaminatedRuns > 0) {
      notes.push(
        `${side}: ${w.contaminatedRuns} warm run(s) overlapped other lint/test processes` +
          (w.cleanRuns === 0
            ? "; no clean run, so the median includes them."
            : "."),
      );
    }
  }
  if (before.cold.foreignProcesses > 0 || after.cold.foreignProcesses > 0) {
    notes.push("The cold launch overlapped other lint/test processes.");
  }
  if (notes.length > 0) {
    lines.push("", "**Notes**", "", ...notes.map((n) => `- ${n}`));
  }
  return lines.join("\n");
}

// --- measurement -----------------------------------------------------------

function toolProcessCount() {
  const probe =
    process.platform === "win32"
      ? spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }",
          ],
          { encoding: "utf8" },
        )
      : spawnSync("ps", ["-eo", "args"], { encoding: "utf8" });
  if (probe.status !== 0 || !probe.stdout) return 0;
  return probe.stdout
    .split("\n")
    .filter((line) => TOOL_PROCESS_PATTERN.test(line)).length;
}

/**
 * Whether an Obsidian that owns the default profile is running. Only that one
 * would take over a new launch: an instance started with its own
 * `--user-data-dir` (a fixture-vault session) has its own lock and is ignored.
 */
export function usesDefaultProfile(commandLines) {
  return commandLines.some(
    (line) => !line.includes("--type=") && !line.includes("--user-data-dir"),
  );
}

function obsidianIsRunning() {
  if (process.platform !== "win32") return false;
  const probe = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='Obsidian.exe'\" | ForEach-Object { $_.CommandLine }",
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) return false;
  return usesDefaultProfile(
    (probe.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error(`timed out: ${url}`)));
    req.end();
  });
}

async function listPages(port) {
  try {
    const pages = await getJson(`http://127.0.0.1:${port}/json/list`);
    return Array.isArray(pages) ? pages : [];
  } catch {
    return [];
  }
}

async function evaluate(connection, expression) {
  const result = await connection.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text,
    );
  }
  return result.result.value;
}

function readyProbe(pluginId) {
  return `(() => { try { return { now: performance.now(), layout: Boolean(app.workspace && app.workspace.layoutReady), plugin: Boolean(app.plugins.plugins[${JSON.stringify(pluginId)}]) }; } catch (e) { return null; } })()`;
}

/**
 * One warm reload: disable the plugin, time `enablePlugin` (which awaits
 * `onload`), keep counting adapter reads and writes for `settleMs` so work the
 * load queues after it returns is included, then restore the adapter.
 */
export function warmRunExpression(pluginId, settleMs) {
  return `(async () => {
  const id = ${JSON.stringify(pluginId)};
  const adapter = app.vault.adapter;
  const folder = String(app.plugins.plugins[id].settings.storageFolder || '');
  const reads = [];
  const writes = [];
  const read = adapter.read;
  const write = adapter.write;
  const ownRead = Object.prototype.hasOwnProperty.call(adapter, 'read');
  const ownWrite = Object.prototype.hasOwnProperty.call(adapter, 'write');
  adapter.read = function (p, ...rest) { reads.push(String(p)); return read.call(this, p, ...rest); };
  adapter.write = function (p, d, ...rest) { writes.push(String(p)); return write.call(this, p, d, ...rest); };
  try {
    await app.plugins.disablePlugin(id);
    const t0 = performance.now();
    await app.plugins.enablePlugin(id);
    const onloadMs = performance.now() - t0;
    await new Promise((resolve) => setTimeout(resolve, ${settleMs}));
    return { onloadMs, reads, writes, folder };
  } finally {
    if (ownRead) adapter.read = read; else delete adapter.read;
    if (ownWrite) adapter.write = write; else delete adapter.write;
  }
})()`;
}

async function launchAndAttach(options) {
  const existing = await listPages(options.port);
  if (existing.length > 0) {
    throw new Error(
      `Something already answers on debug port ${options.port}. Close it, or pass another --port.`,
    );
  }
  if (obsidianIsRunning()) {
    throw new Error(
      "Obsidian is already running. Close it first: a second launch hands over to the running instance and ignores --remote-debugging-port.",
    );
  }
  const launchedAt = performance.now();
  const child = spawn(
    options.exe,
    [`--remote-debugging-port=${options.port}`],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  const deadline = launchedAt + COLD_TIMEOUT_MS;
  while (performance.now() < deadline) {
    const page = (await listPages(options.port)).find(
      (candidate) =>
        candidate.type === "page" &&
        String(candidate.url).startsWith(VAULT_PAGE_PREFIX),
    );
    if (page) {
      const connection = connect(page.webSocketDebuggerUrl, {
        timeoutMs: COLD_CALL_TIMEOUT_MS,
      });
      await connection.opened;
      return {
        connection,
        page,
        attachedAfterLaunchMs: Math.round(performance.now() - launchedAt),
      };
    }
    await sleep(15);
  }
  throw new Error("Obsidian did not open a vault window in time.");
}

async function confirmVault(connection, page, expectedVault) {
  const probe =
    "(() => { try { return app.vault.adapter.getBasePath(); } catch (e) { return null; } })()";
  let vaultPath = null;
  const deadline = performance.now() + COLD_TIMEOUT_MS;
  while (!vaultPath && performance.now() < deadline) {
    vaultPath = await evaluate(connection, probe).catch(() => null);
    if (!vaultPath) await sleep(50);
  }
  if (!vaultPath) {
    throw new Error(
      "The vault window never answered. The launch is stuck: close Obsidian and run again.",
    );
  }
  const verdict = assessVaultOwnership({
    targetUrl: page.url,
    vaultPath: vaultPath ?? undefined,
    expectedVault,
  });
  if (!verdict.ok) throw new Error(verdict.message);
}

async function measureCold(options, ambient) {
  const processesBefore = toolProcessCount();
  const { connection, page, attachedAfterLaunchMs } =
    await launchAndAttach(options);
  try {
    await connection.send("Profiler.enable");
    await connection.send("Profiler.setSamplingInterval", {
      interval: SAMPLING_INTERVAL_US,
    });
    await connection.send("Profiler.start");
    await confirmVault(connection, page, options.vault);
    const marks = {};
    const probe = readyProbe(options.pluginId);
    const deadline = performance.now() + COLD_TIMEOUT_MS;
    while (performance.now() < deadline) {
      const state = await evaluate(connection, probe).catch(() => null);
      if (state) {
        if (state.layout && marks.layoutReadyMs === undefined)
          marks.layoutReadyMs = Math.round(state.now);
        if (state.plugin && marks.pluginPresentMs === undefined)
          marks.pluginPresentMs = Math.round(state.now);
        if (
          marks.layoutReadyMs !== undefined &&
          marks.pluginPresentMs !== undefined
        ) {
          await sleep(COLD_SETTLE_MS);
          break;
        }
      }
      await sleep(40);
    }
    if (
      marks.layoutReadyMs === undefined ||
      marks.pluginPresentMs === undefined
    ) {
      throw new Error("The workspace or the plugin never became ready.");
    }
    const { profile } = await connection.send("Profiler.stop");
    const environment = await evaluate(
      connection,
      `({ ua: navigator.userAgent, plugin: app.plugins.manifests[${JSON.stringify(options.pluginId)}] ? app.plugins.manifests[${JSON.stringify(options.pluginId)}].version : null })`,
    );
    return {
      profile,
      environment,
      attachedAfterLaunchMs,
      ...marks,
      foreignProcesses: foreignProcesses(
        ambient,
        processesBefore,
        toolProcessCount(),
      ),
    };
  } finally {
    connection.close();
  }
}

async function measureWarm(options, port, ambient) {
  const page = (await listPages(port)).find(
    (candidate) =>
      candidate.type === "page" &&
      String(candidate.url).startsWith(VAULT_PAGE_PREFIX),
  );
  if (!page)
    throw new Error("The vault window went away before the warm runs.");
  const connection = connect(page.webSocketDebuggerUrl, {
    timeoutMs: CALL_TIMEOUT_MS,
  });
  await connection.opened;
  try {
    const runs = [];
    for (let i = 0; i < options.warmRuns; i += 1) {
      const processesBefore = toolProcessCount();
      const raw = await evaluate(
        connection,
        warmRunExpression(options.pluginId, WARM_SETTLE_MS),
      );
      runs.push({
        onloadMs: Math.round(raw.onloadMs),
        shardReads: shardPaths(raw.reads, raw.folder).length,
        writes: summarizeWrites(raw.writes, raw.folder),
        foreignProcesses: foreignProcesses(
          ambient,
          processesBefore,
          toolProcessCount(),
        ),
      });
    }
    return { runs };
  } finally {
    connection.close();
  }
}

function gitValue(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function run(options) {
  const ambient = toolProcessCount();
  const cold = await measureCold(options, ambient);
  const warm = await measureWarm(options, options.port, ambient);
  const obsidian =
    /obsidian\/([\d.]+)/i.exec(cold.environment.ua)?.[1] ?? "unknown";
  const profilePath = `${options.out}.cold.cpuprofile`;
  fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify(cold.profile));
  const result = {
    label: options.label,
    date: new Date().toISOString(),
    commit: gitValue(["rev-parse", "--short", "HEAD"]),
    dirty: Boolean(gitValue(["status", "--porcelain"])),
    obsidian,
    plugin: cold.environment.plugin,
    vaultName: path.basename(options.vault),
    ambientToolProcesses: ambient,
    machine: {
      cpu: os.cpus()[0]?.model.trim() ?? "unknown",
      threads: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / 1e9),
      os: `${os.type()} ${os.release()}`,
      node: process.versions.node,
    },
    cold: {
      attachedAfterLaunchMs: cold.attachedAfterLaunchMs,
      layoutReadyMs: cold.layoutReadyMs,
      pluginPresentMs: cold.pluginPresentMs,
      foreignProcesses: cold.foreignProcesses,
      profile: summarizeProfile(cold.profile, options.pluginId),
      profileFile: path.basename(profilePath),
    },
    warm,
  };
  fs.writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`);
  const w = summarizeWarm(warm.runs);
  console.log(
    `${options.label}: warm onload median ${w.onloadMs} ms over ${warm.runs.length} runs, ${w.shardReads} shard reads per start, cold plugin CPU ${result.cold.profile.pluginCpuMs} ms.`,
  );
  console.log(
    `Wrote ${options.out} and ${profilePath}. Obsidian is still running; close it yourself.`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "compare") {
    const [before, after] = options.files.map((file) =>
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
    console.log(formatComparison(before, after));
    return;
  }
  await run(options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
