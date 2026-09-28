import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const modalCss = readFileSync(
  path.resolve(testDir, "../../../src/styles/modals.css"),
  "utf-8",
);
const stylesheet = postcss.parse(modalCss);

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
    });
  });
  return declarations;
}

function expectBothNativeCloseButtonSelectors(
  selectorPrefix: string,
  suffix = "",
): void {
  const selectors = new Set<string>();
  stylesheet.walkRules((rule) => {
    for (const selector of rule.selectors) {
      const normalizedSelector = selector.replace(/\s+/g, " ").trim();
      if (
        normalizedSelector ===
          `${selectorPrefix}.modal-close-button${suffix}`.trim() ||
        normalizedSelector ===
          `${selectorPrefix}.modal-header-button${suffix}`.trim()
      ) {
        selectors.add(normalizedSelector);
      }
    }
  });

  expect(selectors).toEqual(
    new Set([
      `${selectorPrefix}.modal-close-button${suffix}`,
      `${selectorPrefix}.modal-header-button${suffix}`,
    ]),
  );
}

describe("Modal stylesheet - native close buttons", () => {
  it("hides Obsidian's 1.13 close button in shortcut help", () => {
    expect(
      declarationsFor("body .rss-shortcut-help-modal .modal-header-button").get(
        "display",
      ),
    ).toBe("none");
  });

  it("styles both Obsidian close button generations in plugin modals", () => {
    expectBothNativeCloseButtonSelectors(
      ".modal-container .modal.rss-dashboard-modal-container ",
    );
  });

  it("styles both Obsidian close button generations in mobile modals", () => {
    expectBothNativeCloseButtonSelectors(
      ".modal.rss-mobile-navigation-modal ",
    );
    expectBothNativeCloseButtonSelectors(
      ".modal.rss-mobile-discover-filters-modal ",
    );
    expectBothNativeCloseButtonSelectors(
      ".modal.rss-mobile-navigation-modal ",
      "::before",
    );
    expectBothNativeCloseButtonSelectors(
      ".modal.rss-mobile-discover-filters-modal ",
      "::before",
    );
    expectBothNativeCloseButtonSelectors(
      ".modal-container .modal.rss-dashboard-modal-container ",
      "::before",
    );
  });
});
