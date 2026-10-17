import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// The Reader format sheet and the dashboard tags sheet (#1294) each read a
// `--rss-footer-*` custom-property chain that nothing ever declared, so every
// var() silently took its fallback. Both sheets now read
// env(safe-area-inset-bottom) directly. This scan keeps the removed family
// from returning, because a reference without a producer is invisible to the
// cascade and only a text-level check can catch it.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, "../../../src");

const UNDEFINED_FOOTER_PROPERTIES = [
  "--rss-footer-visual-pad",
  "--rss-footer-safe-bottom",
  "--rss-footer-system-bottom",
  "--rss-footer-platform-fallback-bottom",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return [full];
  });
}

describe("mobile sheet footer offset contract", () => {
  it("leaves no --rss-footer-* custom property anywhere under src", () => {
    const offenders = sourceFiles(srcDir).flatMap((file) => {
      const text = readFileSync(file, "utf-8");
      const relative = path.relative(srcDir, file).split(path.sep).join("/");
      return UNDEFINED_FOOTER_PROPERTIES.filter((name) =>
        text.includes(name),
      ).map((name) => `${relative}: ${name}`);
    });

    expect(offenders).toEqual([]);
  });
});
