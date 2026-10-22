import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom does not run Obsidian's stylesheet, so the cascade is pinned as a
// stylesheet contract (#1478). Obsidian paints every `<button>` without the
// clickable-icon class through `button:not(.clickable-icon)`: grey fill, input
// shadow, input height. A bare `.class` rule has lower specificity, so once
// these controls became native buttons their accent and danger fills lost to
// Obsidian's grey. Naming the element (`button.class`) ties with that rule, and
// the plugin stylesheet loads later, so it wins.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

const NATIVE_BUTTONS = [
  {
    cls: "rss-dashboard-empty-state-button",
    file: "article-empty-state.css",
  },
  {
    cls: "rss-discover-selected-filter-remove",
    file: "discover-sidebar-filters.css",
  },
];

function selectorsFor(file: string, cls: string): string[] {
  const css = readFileSync(path.join(stylesDir, file), "utf-8");
  const found: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    for (const selector of rule.selectors) {
      const normalized = selector.replace(/\s+/g, " ").trim();
      // A descendant of the button (its svg) is not the button itself.
      if (new RegExp(String.raw`\.${cls}\s+\S`).test(normalized)) continue;
      if (normalized.includes(`.${cls}`)) found.push(normalized);
    }
  });
  return found;
}

describe("native buttons keep their plugin look over Obsidian's button rule", () => {
  for (const { cls, file } of NATIVE_BUTTONS) {
    it(`styles .${cls} through button.${cls} in every state`, () => {
      const selectors = selectorsFor(file, cls);
      expect(selectors.length).toBeGreaterThan(0);
      for (const selector of selectors) {
        expect(selector).toMatch(new RegExp(String.raw`^button\.${cls}`));
      }
    });
  }
});
