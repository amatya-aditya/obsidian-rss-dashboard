import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findNestedNodeModules,
  formatNestedNodeModulesMessage,
} from "../../scripts/check-nested-node-modules.mjs";

let workDir: string | null = null;

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = null;
});

function makeRoot(): string {
  workDir = mkdtempSync(join(tmpdir(), "nested-node-modules-"));
  return workDir;
}

describe("findNestedNodeModules", () => {
  it("reports nothing when there is no node_modules", () => {
    expect(findNestedNodeModules(makeRoot())).toEqual([]);
  });

  it("reports nothing for a normal node_modules", () => {
    const root = makeRoot();
    mkdirSync(join(root, "node_modules", "jsdom"), { recursive: true });

    expect(findNestedNodeModules(root)).toEqual([]);
  });

  it("reports a node_modules inside node_modules", () => {
    const root = makeRoot();
    mkdirSync(join(root, "node_modules", "node_modules", "jsdom"), {
      recursive: true,
    });

    expect(findNestedNodeModules(root)).toEqual([
      join(root, "node_modules", "node_modules"),
    ]);
  });
});

describe("formatNestedNodeModulesMessage", () => {
  it("names the path, the symptom, and the fix", () => {
    const message = formatNestedNodeModulesMessage([
      "/repo/node_modules/node_modules",
    ]);

    expect(message).toContain("/repo/node_modules/node_modules");
    expect(message).toContain("appendChild");
    expect(message).toContain("Worktree dependencies");
  });
});
