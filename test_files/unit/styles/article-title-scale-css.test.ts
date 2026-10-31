/**
 * Every article-list title size multiplies by the "Article title size"
 * setting (#1640). A rule that sets a fixed `font-size` on an article title
 * would silently ignore the slider, so this pins that each one reads the
 * `--rss-dashboard-article-title-scale` variable.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from the repository root.
const STYLES_DIR = "src/styles";
const SCALE_VARIABLE = "--rss-dashboard-article-title-scale";
const STYLE_FILES = [
  "articles.css",
  "card-view.css",
  "feed-view.css",
  "list-view.css",
];

// An article title selector ends in the title class, so `::before` icons and
// `:focus-visible` rules on the same element are not size declarations.
const TITLE_SELECTOR = /\.rss-dashboard-(?:article|list)-title$/;

interface TitleSizeRule {
  file: string;
  selector: string;
  fontSize: string;
}

function findTitleSizeRules(file: string): TitleSizeRule[] {
  const css = readFileSync(resolve(STYLES_DIR, file), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const rules: TitleSizeRule[] = [];
  // Innermost blocks only, so rules inside a media query match on their own.
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const fontSize = /(?:^|;|\s)font-size:\s*([^;]+);/.exec(match[2]);
    if (!fontSize) continue;
    for (const selector of match[1].split(",").map((s) => s.trim())) {
      if (TITLE_SELECTOR.test(selector)) {
        rules.push({ file, selector, fontSize: fontSize[1].trim() });
      }
    }
  }
  return rules;
}

describe("article title font sizes", () => {
  const rules = STYLE_FILES.flatMap(findTitleSizeRules);

  it("finds the title size rules in every article-list view", () => {
    const files = new Set(rules.map((rule) => rule.file));
    expect([...files].sort()).toEqual(STYLE_FILES);
  });

  it("multiplies every title size by the scale variable", () => {
    const unscaled = rules.filter(
      (rule) => !rule.fontSize.includes(`var(${SCALE_VARIABLE}`),
    );
    expect(unscaled).toEqual([]);
  });

  it("falls back to 1 so titles keep their size when the variable is unset", () => {
    for (const rule of rules) {
      expect(rule.fontSize).toContain(`var(${SCALE_VARIABLE}, 1)`);
    }
  });
});
