import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss, { type AtRule, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function readStyles(file: string): string {
  return readFileSync(
    path.resolve(testDir, `../../../src/styles/${file}`),
    "utf-8",
  );
}

function mediaChain(rule: Rule): string[] {
  const chain: string[] = [];
  let parent: Rule["parent"] = rule.parent;
  while (parent && parent.type === "atrule") {
    const atRule: AtRule = parent;
    if (atRule.name === "media") chain.push(atRule.params);
    parent = atRule.parent;
  }
  return chain;
}

// A tap leaves `:hover` stuck on the button on a touch screen. The unstarred
// star swaps in a filled "preview" star on hover, so unstarring an article from
// the Reader left a filled star showing on a button that was already unstarred.
// Only a pointer that can really hover may drive that preview; the keyboard
// path (`:focus-visible`) stays available everywhere.
describe.each([
  ["reader.css", ".rss-reader-star-toggle"],
  ["articles.css", ".rss-dashboard-star-toggle"],
])("%s star preview on touch", (file, toggle) => {
  const rules: Rule[] = [];
  postcss.parse(readStyles(file)).walkRules((rule) => {
    if (rule.selectors.some((s) => s.includes(`${toggle}.unstarred:`))) {
      rules.push(rule);
    }
  });

  const hoverRules = rules.filter((rule) =>
    rule.selectors.some((s) => s.includes(`${toggle}.unstarred:hover`)),
  );
  const focusRules = rules.filter((rule) =>
    rule.selectors.some((s) => s.includes(`${toggle}.unstarred:focus-visible`)),
  );

  it("finds the hover and focus preview rules", () => {
    expect(hoverRules.length).toBeGreaterThanOrEqual(2);
    expect(focusRules.length).toBeGreaterThanOrEqual(2);
  });

  it("applies the hover preview only where the pointer can hover", () => {
    for (const rule of hoverRules) {
      expect(mediaChain(rule), rule.selector).toContain("(hover: hover)");
    }
  });

  it("keeps the focus preview for the keyboard on every device", () => {
    for (const rule of focusRules) {
      expect(mediaChain(rule), rule.selector).not.toContain("(hover: hover)");
      expect(
        rule.selectors.some((s) => s.includes(":hover")),
        rule.selector,
      ).toBe(false);
    }
  });
});
