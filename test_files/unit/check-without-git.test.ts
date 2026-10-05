import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cwd, execPath } from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import {
  isGitCheckout,
  isLocalGitSpawnPermissionError,
} from "../../scripts/git-repository.mjs";

const REPO_ROOT = cwd();
const SCRIPTS = [
  "check-commit-message.mjs",
  "check-pre-release.mjs",
  "check-doc-links.mjs",
];

let workDir: string | null = null;

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = null;
});

function makeSourceArchiveCopy(): string {
  // Inside the repo so the copied scripts still resolve node_modules (ESLint);
  // `.tmp-*` is ignored by git and ESLint.
  workDir = mkdtempSync(join(REPO_ROOT, ".tmp-no-git-"));
  const scriptsDir = join(workDir, "scripts");
  mkdirSync(scriptsDir);
  for (const name of [...SCRIPTS, "git-repository.mjs"]) {
    copyFileSync(join(REPO_ROOT, "scripts", name), join(scriptsDir, name));
  }
  return workDir;
}

describe("isGitCheckout", () => {
  it("is false for a folder with no .git entry", () => {
    workDir = mkdtempSync(join(REPO_ROOT, ".tmp-no-git-"));

    expect(isGitCheckout(workDir)).toBe(false);
  });

  it("is true when .git is a folder or a worktree's .git file", () => {
    workDir = mkdtempSync(join(REPO_ROOT, ".tmp-no-git-"));
    writeFileSync(join(workDir, ".git"), "gitdir: elsewhere\n");

    expect(isGitCheckout(workDir)).toBe(true);
  });

  it("is true for this repository", () => {
    expect(isGitCheckout(REPO_ROOT)).toBe(true);
  });
});

describe("isLocalGitSpawnPermissionError", () => {
  it("allows local checks to identify a sandboxed Git spawn failure", () => {
    expect(isLocalGitSpawnPermissionError({ code: "EPERM" }, false)).toBe(true);
  });

  it("does not skip the check in CI", () => {
    expect(isLocalGitSpawnPermissionError({ code: "EPERM" }, true)).toBe(false);
  });

  it("does not skip other Git failures", () => {
    expect(isLocalGitSpawnPermissionError({ code: "ENOENT" }, false)).toBe(false);
    expect(isLocalGitSpawnPermissionError({ status: 1 }, false)).toBe(false);
  });
});

describe("compliance checks in a source archive without git", () => {
  it.each(SCRIPTS)("%s exits 0 and says it skipped", (script) => {
    const dir = makeSourceArchiveCopy();

    const output = execFileSync(
      execPath,
      [join(dir, "scripts", script)],
      { cwd: dir, encoding: "utf8" },
    );

    expect(output).toContain(script.replace(/^check-/, "check:").replace(/.mjs$/, ""));
    expect(output).toContain("not a git checkout");
  });
});
