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
      ".rss-dashboard-settings-tab-content:where( :not(.rss-dashboard-settings-reviewed) ) .setting-item:not(.setting-item-heading)",
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
    file: "settings-icon-proxy.css",
    selector: ".rss-proxy-setting-item.setting-item",
    maxWidth: 768,
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
  containerWidth?: number,
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

    if (containerWidth !== undefined) {
      let ancestor:
        | { type: string; name?: string; params?: string; parent?: unknown }
        | undefined = rule.parent;
      let insideContainer = false;
      while (ancestor && !insideContainer) {
        if (
          ancestor.type === "atrule" &&
          ancestor.name === "container" &&
          /rss-dashboard-settings/.test(ancestor.params ?? "") &&
          new RegExp(`max-width:\\s*${containerWidth}px`).test(
            ancestor.params ?? "",
          )
        ) {
          insideContainer = true;
        }
        ancestor = ancestor.parent as typeof ancestor;
      }
      if (!insideContainer) return;
    }

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

/** Every value declared for `prop` on rules with exactly this selector. */
function declarationsFor(
  file: string,
  selector: string,
  prop: string,
): string[] {
  const css = readFileSync(
    path.resolve(testDir, `../../../src/styles/${file}`),
    "utf8",
  );
  const root = postcss.parse(css);
  const values: string[] = [];

  root.walkRules((rule) => {
    const normalizedSelectors = rule.selectors?.map((value) =>
      value.replace(/\s+/g, " ").trim(),
    );
    if (!normalizedSelectors?.includes(selector)) return;
    rule.walkDecls(prop, (decl) => {
      values.push(decl.value);
    });
  });

  return values;
}

/** Reviewed-row stacking rules that the touch media query still forces. */
function reviewedStackRulesInTouchMedia(file: string): string[] {
  const css = readFileSync(
    path.resolve(testDir, `../../../src/styles/${file}`),
    "utf8",
  );
  const root = postcss.parse(css);
  const selectors: string[] = [];

  root.walkRules((rule) => {
    const stacksRow = rule.nodes?.some(
      (node) =>
        node.type === "decl" &&
        (node.prop === "flex-direction" ||
          node.prop === "grid-template-columns") &&
        (node.value === "column" || node.value === "minmax(0, 1fr)"),
    );
    if (!stacksRow) return;

    let ancestor:
      | { type: string; name?: string; params?: string; parent?: unknown }
      | undefined = rule.parent;
    let inTouchMedia = false;
    while (ancestor && !inTouchMedia) {
      if (
        ancestor.type === "atrule" &&
        ancestor.name === "media" &&
        /\(hover:\s*none\)/.test(ancestor.params ?? "")
      ) {
        inTouchMedia = true;
      }
      ancestor = ancestor.parent as typeof ancestor;
    }
    if (!inTouchMedia) return;

    const normalized = rule.selector.replace(/\s+/g, " ").trim();
    // Ignore the reviewed class when it appears inside `:not(...)`.
    if (/(^|[^(\w-])\.rss-dashboard-settings-reviewed\b/.test(normalized)) {
      selectors.push(normalized);
    }
  });

  return selectors;
}

describe("responsive settings row layout", () => {
  it.each(responsiveSettingsRows)(
    "stacks $selector only for touch-first devices at its narrow-width breakpoint",
    ({ file, selector, maxWidth }) => {
      expect(hasTouchFirstStackRule(file, selector, maxWidth)).toBe(true);
    },
  );

  it("keeps Highlights and badge toggles next to wrapping help", () => {
    expect(
      hasCssDeclarations(
        "settings.css",
        ".rss-dashboard-settings-reviewed :is( .rss-dashboard-sidebar-badge-setting, .rss-dashboard-highlight-word-setting ).setting-item",
        [
          ["display", "grid"],
          ["grid-template-columns", "minmax(0, 1fr) auto"],
        ],
      ),
    ).toBe(true);
  });

  it("gives Highlights actions their own line in a telephone-width pane", () => {
    expect(
      hasCssDeclarations(
        "settings.css",
        ".rss-dashboard-settings-reviewed .rss-dashboard-highlight-word-actions",
        [["flex-basis", "100%"]],
        400,
      ),
    ).toBe(true);
  });

  it("wraps both tag palette controls together below the width that fits the value", () => {
    expect(
      hasCssDeclarations(
        "tag-color-palette.css",
        ".rss-dashboard-settings-reviewed .rss-dashboard-tag-color-setting .rss-dashboard-tag-color-palette-control",
        [
          ["display", "grid"],
          ["flex", "1 1 18rem"],
        ],
        560,
      ),
    ).toBe(true);
  });

  it("stacks reviewed dropdown rows only at the phone-width pane breakpoint", () => {
    expect(
      hasCssDeclarations(
        "settings.css",
        ".rss-dashboard-settings-reviewed .setting-item:has(> .setting-item-control > select)",
        [
          ["flex-direction", "column"],
          ["align-items", "stretch"],
        ],
        400,
      ),
    ).toBe(true);
  });

  it("sizes reviewed controls by their text and lets the label flex", () => {
    expect(
      declarationsFor(
        "settings.css",
        ".rss-dashboard-settings-reviewed .setting-item",
        "flex-wrap",
      ),
    ).toContain("wrap");
    expect(
      declarationsFor(
        "settings.css",
        ".rss-dashboard-settings-reviewed .setting-item-control",
        "flex",
      ),
    ).toEqual(["0 0 auto"]);
    expect(
      declarationsFor(
        "settings.css",
        ".rss-dashboard-settings-reviewed .setting-item-control",
        "max-width",
      ),
    ).toEqual(["100%"]);
    expect(
      declarationsFor(
        "settings.css",
        ".rss-dashboard-settings-reviewed .setting-item-control > select",
        "min-width",
      ),
    ).toEqual([]);
    expect(
      declarationsFor(
        "settings.css",
        ".rss-dashboard-settings-reviewed .setting-item-control > :is(select, button)",
        "flex",
      ),
    ).toEqual(["0 0 auto"]);
  });

  it("leaves reviewed rows unstacked on a tablet-sized touch pane", () => {
    expect(reviewedStackRulesInTouchMedia("settings.css")).toEqual([]);
    expect(reviewedStackRulesInTouchMedia("tag-color-palette.css")).toEqual([]);
  });

  it("reserves a shared auto-tag column and pins the button beside wrapping chips", () => {
    expect(
      hasCssDeclarations(
        "settings.css",
        ".rss-dashboard-settings-reviewed .rss-dashboard-auto-tag-setting.setting-item",
        [["grid-template-columns", "minmax(0, 1fr) minmax(0, 58%)"]],
      ),
    ).toBe(true);
    expect(
      hasCssDeclarations(
        "settings.css",
        ".rss-dashboard-auto-tag-field .rss-dashboard-auto-tag-add",
        [
          ["grid-column", "2"],
          ["grid-row", "1"],
        ],
      ),
    ).toBe(true);
  });

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
