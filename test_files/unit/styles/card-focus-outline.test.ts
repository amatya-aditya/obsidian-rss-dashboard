import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

// jsdom does not run the cascade, so the card focus ring is asserted as a
// stylesheet contract on card-view.css.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  path.resolve(testDir, "../../../src/styles/card-view.css"),
  "utf-8",
);

function outlineSelectors(): string[] {
  const selectors: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    const hasOutline = rule.nodes.some(
      (node) => node.type === "decl" && node.prop === "outline",
    );
    if (hasOutline) selectors.push(...rule.selectors.map((s) => s.trim()));
  });
  return selectors;
}

describe("Article card focus ring", () => {
  it("does not outline the whole card when a tap focuses its cover or summary", () => {
    expect(outlineSelectors()).not.toContain(
      ".rss-dashboard-article-card:focus-within",
    );
  });

  it("still outlines the card for keyboard focus", () => {
    expect(outlineSelectors()).toContain(
      ".rss-dashboard-article-card:has(:focus-visible)",
    );
  });
});
