import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheets = ["articles.css", "card-view.css", "reader.css"].map(
  (file) =>
    readFileSync(path.resolve(testDir, `../../../src/styles/${file}`), "utf-8"),
);

function declarationsFor(...selectors: string[]): Map<string, string> {
  const declarations = new Map<string, string>();

  for (const css of stylesheets) {
    postcss.parse(css).walkRules((rule) => {
      if (!rule.selectors.some((selector) => selectors.includes(selector))) {
        return;
      }

      rule.walkDecls((declaration) => {
        declarations.set(declaration.prop, declaration.value);
      });
    });
  }

  return declarations;
}

function declarationsInCoarsePointerMedia(
  selector: string,
): Map<string, string> {
  const declarations = new Map<string, string>();

  for (const css of stylesheets) {
    postcss.parse(css).walkAtRules("media", (mediaRule) => {
      if (!mediaRule.params.includes("(pointer: coarse)")) {
        return;
      }

      mediaRule.walkRules((rule) => {
        const selectors = rule.selectors.map((ruleSelector) =>
          ruleSelector.replace(/\s+/g, " ").trim(),
        );
        if (!selectors.includes(selector)) {
          return;
        }

        rule.walkDecls((declaration) => {
          declarations.set(declaration.prop, declaration.value);
        });
      });
    });
  }

  return declarations;
}

function declarationsAtMaxWidth(
  maxWidth: number,
  selector: string,
): Map<string, string> {
  const declarations = new Map<string, string>();

  for (const css of stylesheets) {
    postcss.parse(css).walkAtRules("media", (mediaRule) => {
      if (!mediaRule.params.includes(`(max-width: ${maxWidth}px)`)) return;

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
  }

  return declarations;
}

describe("Article star toggle styles", () => {
  it("shows every starred article control with a filled yellow star", () => {
    const dashboard = declarationsFor(
      ".rss-dashboard-star-toggle.starred",
      ".rss-dashboard-star-toggle.starred svg",
    );
    const reader = declarationsFor(
      ".rss-reader-star-toggle.starred",
      ".rss-reader-star-toggle.starred svg",
    );

    expect(dashboard.get("color")).toBe("var(--color-yellow)");
    expect(dashboard.get("fill")).toBe("var(--color-yellow)");
    expect(reader.get("color")).toBe(dashboard.get("color"));
    expect(reader.get("fill")).toBe(dashboard.get("fill"));
  });

  it("previews a filled yellow star on inactive hover and focus", () => {
    const dashboardPreview = declarationsFor(
      ".rss-dashboard-star-preview-icon svg",
    );
    const readerPreview = declarationsFor(".rss-reader-star-preview-icon svg");
    const starred = declarationsFor(
      ".rss-dashboard-star-toggle.starred svg",
      ".rss-reader-star-toggle.starred svg",
    );

    expect(dashboardPreview.get("fill")).toBe("var(--color-yellow)");
    expect(readerPreview.get("fill")).toBe("var(--color-yellow)");
    expect(starred.get("fill")).toBe("var(--color-yellow)");
  });

  it("keeps dashboard star surfaces consistent with the other action icons", () => {
    const dashboard = declarationsFor(".rss-dashboard-star-toggle");
    const save = declarationsFor(".rss-dashboard-save-toggle");
    const read = declarationsFor(".rss-dashboard-read-toggle");
    const tags = declarationsFor(".rss-dashboard-tags-toggle");
    const reader = declarationsFor(".rss-reader-star-toggle");

    expect(dashboard.get("border-radius")).toBe("12px");
    expect(dashboard.get("background-color")).toBe(
      save.get("background-color"),
    );
    expect(dashboard.get("background-color")).toBe(
      read.get("background-color"),
    );
    expect(dashboard.get("background-color")).toBe(
      tags.get("background-color"),
    );
    expect(reader.get("border-radius")).not.toBe("50%");
  });

  it("keeps dashboard stars at a rounded 44px touch target in narrow lists", () => {
    const star = declarationsInCoarsePointerMedia(
      ".rss-dashboard-articles-list.rss-dashboard-mobile-list-style-left-grid .rss-dashboard-grid-actions .rss-dashboard-star-toggle",
    );

    expect(star.get("width")).toBe("44px");
    expect(star.get("height")).toBe("44px");
    expect(star.get("min-width")).toBe("44px");
    expect(star.get("min-height")).toBe("44px");
    expect(star.get("border-radius")).toBe("12px");
    expect(star.has("background-color")).toBe(false);
  });

  it("gives all Dashboard actions the same surface and border at tablet widths", () => {
    for (const action of ["save", "read", "star", "tags"]) {
      const declarations = declarationsAtMaxWidth(
        1200,
        `.rss-dashboard-action-toolbar .rss-dashboard-${action}-toggle`,
      );
      expect(declarations.get("background-color")).toBe(
        "var(--background-primary)",
      );
      expect(declarations.get("border")).toBe(
        "1px solid var(--background-modifier-border)",
      );
    }
  });
});
