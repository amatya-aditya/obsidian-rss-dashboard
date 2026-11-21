import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = postcss.parse(
  readFileSync(
    path.resolve(testDir, "../../../src/styles/tag-opacity.css"),
    "utf8",
  ),
);

function declarationsFor(
  ruleSelector: string,
  property: string,
  within?: postcss.AtRule,
): string[] {
  const values: string[] = [];
  const walkRules = within
    ? within.walkRules.bind(within)
    : root.walkRules.bind(root);
  walkRules((rule) => {
    if (rule.selector !== ruleSelector) return;
    rule.walkDecls(property, (decl) => {
      values.push(decl.value);
    });
  });
  return values;
}

describe("tag opacity control layout", () => {
  it("lets the slider fill the row before the compact value entry", () => {
    expect(
      declarationsFor(
        '.rss-dashboard-tag-opacity-row input[type="range"]',
        "flex",
      ),
    ).toContain("1 1 0");
    expect(
      declarationsFor(
        '.rss-dashboard-tag-opacity-row input[type="number"]',
        "flex",
      ),
    ).toContain("0 0 4.5em");
  });

  it("spans its parent grid so the desktop slider has room", () => {
    const baseRule = root.nodes.find(
      (node): node is postcss.Rule =>
        node.type === "rule" && node.selector === ".rss-dashboard-tag-opacity",
    );
    expect(
      baseRule?.nodes?.some(
        (node) =>
          node.type === "decl" &&
          node.prop === "grid-column" &&
          node.value === "1 / -1",
      ),
    ).toBe(true);
  });

  it("spans the available row on touch-first phone and tablet layouts", () => {
    const touchRule = root.nodes.find(
      (node): node is postcss.AtRule =>
        node.type === "atrule" &&
        node.name === "media" &&
        /\(hover:\s*none\)/.test(node.params) &&
        /\(pointer:\s*coarse\)/.test(node.params),
    );
    expect(touchRule).toBeDefined();
    expect(touchRule?.params).not.toMatch(/max-width/);
    expect(
      declarationsFor(".rss-dashboard-tag-opacity", "flex", touchRule),
    ).toContain("0 0 100%");
    expect(
      declarationsFor(".rss-dashboard-tag-opacity", "max-width", touchRule),
    ).toContain("100%");
  });
});
