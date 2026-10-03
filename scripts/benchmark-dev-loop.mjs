// Measures the contributor loop (checks, lint, type-check, bundle, tests, the
// full build, and the git hooks) so changes to it can be compared against a
// recorded baseline. See docs/plans/370-performance-program.md for the rules.
//
//   node scripts/benchmark-dev-loop.mjs run --cwd <checkout> --label before --out before.json [--runs 3]
//   node scripts/benchmark-dev-loop.mjs compare before.json after.json
//
// `run` needs a checkout with no uncommitted changes: hook scenarios stage a
// one-line probe edit and restore the file afterwards.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROBE_LINE = "// dev-loop benchmark probe";

const STAGE_LABELS = {
  compliance: "`check:compliance`",
  lint: "`eslint .`",
  typecheck: "type-check (as `npm run build` runs it)",
  bundle: "esbuild production bundle",
  test: "full unit suite",
  build: "`npm run build`",
};

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// A run is contaminated when another checkout's lint, test, or type-check
// process was alive at its start or end; those runs are reported but excluded
// from the median whenever a clean run exists.
export function summarizeStage(stage) {
  const clean = stage.warm.filter((r) => r.foreign === 0);
  const pool = clean.length > 0 ? clean : stage.warm;
  const all = [stage.cold, ...stage.warm];
  return {
    cold: stage.cold.secs,
    warm: median(pool.map((r) => r.secs)),
    cleanWarmRuns: clean.length,
    contaminatedRuns: all.filter((r) => r.foreign > 0).length,
    failed: all.some((r) => r.exit !== 0),
  };
}

export function typecheckCommandFromBuild(buildScript) {
  const step = buildScript
    .split("&&")
    .map((part) => part.trim())
    .find((part) => /^tsc\b/.test(part));
  return step ?? null;
}

function secs(value) {
  return value === null || value === undefined ? "-" : `${value.toFixed(1)}s`;
}

function describeResult(result) {
  const m = result.machine;
  return `\`${result.commit}\` on ${m.cpu} (${m.threads} threads, ${m.memoryGb} GB), ${m.os}, Node ${m.node}, ${result.date}`;
}

export function formatComparison(before, after) {
  const names = [
    ...new Set([...Object.keys(before.stages), ...Object.keys(after.stages)]),
  ];
  const lines = [
    `- **Before (${before.label}):** ${describeResult(before)}`,
    `- **After (${after.label}):** ${describeResult(after)}`,
    "",
    "| Stage | Before (warm) | After (warm) | Change |",
    "| --- | --- | --- | --- |",
  ];
  const notes = [];

  for (const name of names) {
    const b = before.stages[name] ? summarizeStage(before.stages[name]) : null;
    const a = after.stages[name] ? summarizeStage(after.stages[name]) : null;
    const change =
      b && a && b.warm ? `${Math.round(((a.warm - b.warm) / b.warm) * 100)}%` : "-";
    const signed = change !== "-" && !change.startsWith("-") ? `+${change}` : change;
    lines.push(
      `| ${STAGE_LABELS[name] ?? name} | ${secs(b?.warm)} | ${secs(a?.warm)} | ${signed} |`,
    );
    for (const [side, s] of [
      ["before", b],
      ["after", a],
    ]) {
      if (!s) continue;
      if (s.failed) notes.push(`${name} (${side}): at least one run exited non-zero.`);
      if (s.contaminatedRuns > 0) {
        notes.push(
          `${name} (${side}): ${s.contaminatedRuns} run(s) overlapped other lint/test processes` +
            (s.cleanWarmRuns === 0 ? "; no clean warm run, so the median includes them." : "."),
        );
      }
    }
  }

  lines.push(
    "",
    "Warm = median of warm runs that had the machine to themselves. Cold runs are kept in the JSON.",
  );
  if (notes.length > 0) {
    lines.push("", "**Notes**", "", ...notes.map((n) => `- ${n}`));
  }
  return lines.join("\n");
}

// --- measurement -----------------------------------------------------------

function exec(command, cwd, options = {}) {
  return spawnSync(command, { cwd, shell: true, encoding: "utf8", ...options });
}

function foreignToolProcesses(cwd) {
  const marker = path.resolve(cwd).toLowerCase();
  const probe =
    process.platform === "win32"
      ? spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.CommandLine }",
          ],
          { encoding: "utf8" },
        )
      : spawnSync("ps", ["-eo", "args"], { encoding: "utf8" });
  return (probe.stdout ?? "")
    .split(/\r?\n/)
    .filter((line) => /vitest|eslint|\btsc\b/.test(line))
    .filter((line) => !line.toLowerCase().includes(marker))
    .filter((line) => !line.includes("benchmark-dev-loop")).length;
}

function timed(command, cwd) {
  const foreignBefore = foreignToolProcesses(cwd);
  const start = performance.now();
  const result = exec(command, cwd, { stdio: "ignore" });
  const elapsed = (performance.now() - start) / 1000;
  const foreignAfter = foreignToolProcesses(cwd);
  return {
    secs: Math.round(elapsed * 10) / 10,
    exit: result.status ?? 1,
    foreign: Math.max(foreignBefore, foreignAfter),
  };
}

function shellPath() {
  if (process.platform !== "win32") return "sh";
  const execPath = exec("git --exec-path", process.cwd()).stdout.trim();
  // <git>/mingw64/libexec/git-core -> <git>/bin/sh.exe
  return `"${path.resolve(execPath, "..", "..", "..", "bin", "sh.exe")}"`;
}

function clearCaches(cwd) {
  fs.rmSync(path.join(cwd, "node_modules", ".cache"), { recursive: true, force: true });
}

function assertClean(cwd) {
  const status = exec("git status --porcelain", cwd).stdout.trim();
  if (status) {
    throw new Error(`Refusing to benchmark ${cwd}: it has uncommitted changes.`);
  }
}

// Stages a one-line probe edit to `file`, runs `measure`, then restores it.
function withStagedProbe(cwd, file, measure) {
  const target = path.join(cwd, file);
  const original = fs.readFileSync(target);
  try {
    fs.appendFileSync(target, `\n${PROBE_LINE}\n`);
    exec(`git add -- "${file}"`, cwd);
    return measure();
  } finally {
    exec(`git reset -q -- "${file}"`, cwd);
    fs.writeFileSync(target, original);
  }
}

function measureStage(runs, cwd, runOnce) {
  clearCaches(cwd);
  const cold = runOnce();
  const warm = [];
  for (let i = 0; i < runs; i++) warm.push(runOnce());
  return { cold, warm };
}

function machineInfo() {
  const cpus = os.cpus();
  return {
    cpu: cpus[0]?.model.trim() ?? "unknown",
    threads: cpus.length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    os: `${process.platform} ${os.release()}`,
    node: process.version,
  };
}

function runBenchmark({ cwd, label, runs, only }) {
  assertClean(cwd);
  const sh = shellPath();
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  const typecheck = typecheckCommandFromBuild(pkg.scripts.build);

  const plain = {
    compliance: "npm run --silent check:compliance",
    lint: "npm exec -- eslint . --max-warnings=0",
    ...(typecheck ? { typecheck: `npm exec -- ${typecheck}` } : {}),
    bundle: "node esbuild.config.mjs production",
    test: "npm run --silent test:unit",
    build: "npm run --silent build",
  };
  const hooks = {
    "pre-commit: prose only": ["README.md", `${sh} .githooks/pre-commit`],
    "pre-commit: one source file": ["src/views/reader-view.ts", `${sh} .githooks/pre-commit`],
    "pre-commit: whole-suite trigger": ["vitest.config.mjs", `${sh} .githooks/pre-commit`],
    "pre-push": [null, `${sh} .githooks/pre-push`],
  };

  const stages = {};
  const wanted = (name) => !only || name.includes(only);
  for (const [name, command] of Object.entries(plain)) {
    if (!wanted(name)) continue;
    process.stdout.write(`[benchmark] ${label}: ${name}\n`);
    stages[name] = measureStage(runs, cwd, () => timed(command, cwd));
  }
  for (const [name, [file, command]] of Object.entries(hooks)) {
    if (!wanted(name)) continue;
    process.stdout.write(`[benchmark] ${label}: ${name}\n`);
    stages[name] = measureStage(runs, cwd, () =>
      file ? withStagedProbe(cwd, file, () => timed(command, cwd)) : timed(command, cwd),
    );
  }

  return {
    label,
    commit: exec("git rev-parse --short HEAD", cwd).stdout.trim(),
    date: new Date().toISOString(),
    machine: machineInfo(),
    runsPerStage: runs,
    stages,
  };
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      args[token.slice(2)] = argv[i + 1];
      i++;
    } else {
      args._.push(token);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, ...rest] = args._;

  if (command === "run") {
    const cwd = path.resolve(args.cwd ?? ".");
    const result = runBenchmark({
      cwd,
      label: args.label ?? "run",
      runs: Number(args.runs ?? 3),
      only: args.only,
    });
    const out = args.out ?? `benchmark-${result.label}.json`;
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    process.stdout.write(`[benchmark] wrote ${out}\n`);
    return;
  }

  if (command === "compare" && rest.length === 2) {
    const [before, after] = rest.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
    process.stdout.write(`${formatComparison(before, after)}\n`);
    return;
  }

  process.stderr.write(
    "Usage:\n" +
      "  node scripts/benchmark-dev-loop.mjs run --cwd <checkout> --label <name> --out <file.json> [--runs 3] [--only <stage>]\n" +
      "  node scripts/benchmark-dev-loop.mjs compare <before.json> <after.json>\n",
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
