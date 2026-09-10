import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { findObsidian110CompatibilityViolations } from "../../scripts/check-obsidian-110-compat.mjs";

const ROOT_DIR = join(import.meta.dirname, "..", "..");

function listTypeScriptFiles(dirPath: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    if (statSync(fullPath).isDirectory()) {
      listTypeScriptFiles(fullPath, results);
    } else if (entry.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("Obsidian 1.1.0 API compatibility", () => {
  it("does not load APIs introduced after the advertised minimum version", () => {
    const productionFiles = [
      join(ROOT_DIR, "main.ts"),
      ...listTypeScriptFiles(join(ROOT_DIR, "src")),
    ];

    const violations = productionFiles.flatMap((filePath) => {
      const fileName = relative(ROOT_DIR, filePath).replace(/\\/g, "/");
      return findObsidian110CompatibilityViolations(
        readFileSync(filePath, "utf8"),
        fileName,
      );
    });

    expect(violations).toEqual([]);
  });

  it("keeps custom modal borders valid on the older theme token set", () => {
    const modalStyles = readFileSync(
      join(ROOT_DIR, "src", "styles", "modals.css"),
      "utf8",
    );

    expect(modalStyles).toMatch(
      /\.rss-dashboard-modal\s*\{[^}]*border:\s*1px solid\s*var\(--background-modifier-border-hover, var\(--background-modifier-border\)\);/s,
    );
  });

  it("styles legacy folder suggestions as an anchored dropdown", () => {
    const modalStyles = readFileSync(
      join(ROOT_DIR, "src", "styles", "modals.css"),
      "utf8",
    );

    expect(modalStyles).toMatch(
      /\.rss-dashboard-folder-suggestion-container\s*\{[^}]*position:\s*absolute[^}]*background:[^}]*border:[^}]*box-shadow:/s,
    );
  });
});
