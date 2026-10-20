import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(
  path.resolve(testDir, "../../../src/styles/sidebar.css"),
  "utf-8",
);

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();

  postcss.parse(stylesheet).walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });

  return declarations;
}

function declarationsInCoarsePointerMedia(
  selector: string,
): Map<string, string> {
  const declarations = new Map<string, string>();

  postcss.parse(stylesheet).walkAtRules("media", (mediaRule) => {
    if (!mediaRule.params.includes("(pointer: coarse)")) return;
    mediaRule.walkRules((rule) => {
      const selectors = rule.selectors.map((ruleSelector) =>
        ruleSelector.replace(/\s+/g, " ").trim(),
      );
      if (!selectors.includes(selector)) return;
      rule.walkDecls((declaration) => {
        declarations.set(declaration.prop, declaration.value);
      });
    });
  });

  return declarations;
}

describe("Sidebar folder chevron hit area", () => {
  it("keeps the visible chevron at 16x16 and makes it the positioning context", () => {
    const toggle = declarationsFor(".rss-dashboard-feed-folder-toggle");

    expect(toggle.get("width")).toBe("16px");
    expect(toggle.get("height")).toBe("16px");
    expect(toggle.get("position")).toBe("relative");
  });

  it("expands the pointer target to 32x32 without changing the layout", () => {
    const hitArea = declarationsFor(".rss-dashboard-feed-folder-toggle::after");

    expect(hitArea.get("content")).toBe('""');
    expect(hitArea.get("position")).toBe("absolute");
    expect(hitArea.get("inset")).toBe("-8px");
  });

  it("keeps the expanded target out of a clipping ancestor and reserves the row height", () => {
    // The toggle starts 5px into the folder, so the 8px left overhang is only
    // reachable while the folder itself does not clip. A 32px row keeps the
    // 32px target inside the folder vertically at the default spacing.
    expect(declarationsFor(".rss-dashboard-feed-folder").get("overflow")).toBe(
      "visible",
    );
    expect(
      declarationsFor(".rss-dashboard-feed-folder-header").get("min-height"),
    ).toBe("32px");
  });

  it("grows the target to 40px tall on touch, inside the row's 44px height", () => {
    const hitArea = declarationsInCoarsePointerMedia(
      ".rss-dashboard-feed-folder-toggle::after",
    );

    expect(hitArea.get("inset")).toBe("-12px -8px");
  });
});
