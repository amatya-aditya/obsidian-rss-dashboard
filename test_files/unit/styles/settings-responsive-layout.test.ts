import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));

const responsiveSettingsRows = [
  {
    file: "settings.css",
    selector:
      ".rss-dashboard-settings-tab-content .setting-item:not(.setting-item-heading)",
    maxWidth: 1200,
  },
  {
    file: "settings.css",
    selector: ".rss-dashboard-import-export-actions.setting-item",
    maxWidth: 768,
  },
  {
    file: "settings.css",
    selector: ".rss-dashboard-storage-actions.setting-item",
    maxWidth: 768,
  },
  {
    file: "settings.css",
    selector: ".rss-dashboard-tag-new-name-setting.setting-item",
    maxWidth: 520,
  },
  {
    file: "settings-keyword-filters.css",
    selector: ".rss-dashboard-highlight-word-setting.setting-item",
    maxWidth: 1024,
  },
  {
    file: "settings-icon-proxy.css",
    selector: ".rss-proxy-setting-item.setting-item",
    maxWidth: 768,
  },
  {
    file: "tag-color-palette.css",
    selector:
      ".rss-dashboard-settings-tab-content .rss-dashboard-tag-color-setting.setting-item",
    maxWidth: 1200,
  },
] as const;

function hasTouchFirstStackRule(
  file: string,
  selector: string,
  maxWidth: number,
): boolean {
  const css = readFileSync(
    path.resolve(testDir, `../../../src/styles/${file}`),
    "utf8",
  );
  const root = postcss.parse(css);
  let found = false;
  let hasWidthOnlyStack = false;

  root.walkRules((rule) => {
    const selectors = rule.selectors?.map((value) =>
      value.replace(/\s+/g, " ").trim(),
    );
    const stacksRow = rule.nodes?.some(
      (node) =>
        node.type === "decl" &&
        node.prop === "flex-direction" &&
        node.value === "column",
    );
    if (!selectors?.includes(selector) || !stacksRow) return;

    let isTouchFirstStack = false;
    let ancestor:
      | {
          type: string;
          name?: string;
          params?: string;
          parent?: unknown;
        }
      | undefined = rule.parent;
    while (ancestor && !isTouchFirstStack) {
      if (
        ancestor.type === "atrule" &&
        ancestor.name === "media" &&
        new RegExp(`max-width:\\s*${maxWidth}px`).test(ancestor.params ?? "") &&
        /\(hover:\s*none\)/.test(ancestor.params ?? "") &&
        /\(pointer:\s*coarse\)/.test(ancestor.params ?? "")
      ) {
        isTouchFirstStack = true;
      }
      ancestor = ancestor.parent as typeof ancestor;
    }

    found = true;
    if (!isTouchFirstStack) hasWidthOnlyStack = true;
  });

  return found && !hasWidthOnlyStack;
}

function hasCssDeclarations(
  file: string,
  selector: string,
  declarations: ReadonlyArray<Readonly<[string, string]>>,
): boolean {
  const css = readFileSync(
    path.resolve(testDir, `../../../src/styles/${file}`),
    "utf8",
  );
  const root = postcss.parse(css);
  let found = false;

  root.walkRules((rule) => {
    const normalizedSelectors = rule.selectors?.map((value) =>
      value.replace(/\s+/g, " ").trim(),
    );
    if (!normalizedSelectors?.includes(selector)) return;

    const hasAllDeclarations = declarations.every(([prop, value]) =>
      rule.nodes?.some(
        (node) =>
          node.type === "decl" && node.prop === prop && node.value === value,
      ),
    );
    if (hasAllDeclarations) found = true;
  });

  return found;
}

describe("responsive settings row layout", () => {
  it.each(responsiveSettingsRows)(
    "stacks $selector only for touch-first devices at its narrow-width breakpoint",
    ({ file, selector, maxWidth }) => {
      expect(hasTouchFirstStackRule(file, selector, maxWidth)).toBe(true);
    },
  );

  it.each([
    {
      selector:
        ".rss-dashboard-settings-tab-content .rss-dashboard-storage-path-setting.setting-item",
      declarations: [
        ["flex-direction", "column"],
        ["align-items", "stretch"],
      ],
    },
    {
      selector:
        ".rss-dashboard-settings-tab-content .rss-dashboard-storage-path-setting .setting-item-control",
      declarations: [["width", "100%"]],
    },
    {
      selector:
        ".rss-dashboard-settings-tab-content .rss-dashboard-storage-path-setting .setting-item-control > .rss-input-clear-wrap",
      declarations: [
        ["display", "flex"],
        ["width", "100%"],
      ],
    },
    {
      selector:
        ".rss-dashboard-settings-tab-content .rss-dashboard-storage-path-setting .setting-item-control > .rss-input-clear-wrap > input",
      declarations: [
        ["flex", "1 1 auto"],
        ["width", "100%"],
      ],
    },
  ] as const)(
    "gives Storage path rows full width: $selector",
    ({ selector, declarations }) => {
      expect(hasCssDeclarations("settings.css", selector, declarations)).toBe(
        true,
      );
    },
  );
});
