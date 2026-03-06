import { spawnSync } from "node:child_process";

const proc = globalThis.process;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
}

const insideRepo = run("git", ["rev-parse", "--is-inside-work-tree"]);
if (insideRepo.status !== 0 || insideRepo.stdout.trim() !== "true") {
  proc.stdout.write("[hooks] Not a git repository. Skipping git hook setup.\n");
  proc.exit(0);
}

const setHooksPath = run("git", ["config", "core.hooksPath", ".githooks"]);
if (setHooksPath.status !== 0) {
  proc.stderr.write(
    setHooksPath.stderr || "[hooks] Failed to set core.hooksPath.\n",
  );
  proc.exit(setHooksPath.status ?? 1);
}

proc.stdout.write("[hooks] Installed git hooks path: .githooks\n");
