import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(
  path.resolve(testDir, "../../../src/styles/articles.css"),
  "utf-8",
);

const CARD_CONTROL =
  ".rss-dashboard-article-card .rss-dashboard-fetch-cover-button";
const FEED_CONTROL =
  ".rss-dashboard-feed-item .rss-dashboard-fetch-cover-button";

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

function declarationsInNoHoverMedia(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();

  postcss.parse(stylesheet).walkAtRules("media", (mediaRule) => {
    if (!mediaRule.params.includes("(hover: none)")) return;
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

describe("Cover control touch target (#1529)", () => {
  it("reveals the control wherever the primary pointer has no hover", () => {
    for (const selector of [CARD_CONTROL, FEED_CONTROL]) {
      const control = declarationsInNoHoverMedia(selector);

      expect(control.get("opacity")).toBe("1");
      expect(control.get("pointer-events")).toBe("auto");
    }
  });

  it("keeps the visible 24px box so the tag row and desktop sizing are unchanged", () => {
    for (const selector of [CARD_CONTROL, FEED_CONTROL]) {
      const control = declarationsFor(selector);

      expect(control.get("width")).toBe("24px");
      expect(control.get("height")).toBe("24px");
      // The pseudo-element needs a positioning context that adds no layout.
      expect(control.get("position")).toBe("relative");
    }
  });

  it("expands the no-hover target to 40x40 with an overhanging pseudo-element", () => {
    for (const selector of [CARD_CONTROL, FEED_CONTROL]) {
      const hitArea = declarationsInNoHoverMedia(`${selector}::after`);

      expect(hitArea.get("content")).toBe('""');
      expect(hitArea.get("position")).toBe("absolute");
      // 24px + 8px on each side.
      expect(hitArea.get("inset")).toBe("-8px");
    }
  });
});
