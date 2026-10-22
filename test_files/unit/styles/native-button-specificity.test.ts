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

// The sidebar search toggle is a native button without clickable-icon, but its
// toolbar siblings are still divs sharing the class, so the bare rules stay and
// the button gets its own `button.` rules for every state. The copy-address and
// shortcut-help close buttons carry clickable-icon, which Obsidian's rule skips.
describe("sidebar toolbar search toggle keeps its look over Obsidian's button rule", () => {
  const states = [
    "",
    ":hover",
    ".is-active",
    ":focus-visible",
    ":active",
    ":disabled",
  ];
  const selectors = selectorsFor("sidebar.css", "rss-dashboard-toolbar-button");

  for (const state of states) {
    it(`has a button.rss-dashboard-toolbar-button${state} rule`, () => {
      expect(selectors).toContain(
        `button.rss-dashboard-toolbar-button${state}`,
      );
    });
  }

  it("restates the button in reduced-motion.css", () => {
    expect(
      selectorsFor("reduced-motion.css", "rss-dashboard-toolbar-button"),
    ).toContain("button.rss-dashboard-toolbar-button");
  });
});
