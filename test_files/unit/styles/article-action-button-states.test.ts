import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheets = [
  "articles.css",
  "card-view.css",
  "list-view.css",
  "reader.css",
].map((file) =>
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

function declarationsAtMaxWidth(
  maxWidth: number,
  ...selectors: string[]
): Map<string, string> {
  const declarations = new Map<string, string>();

  for (const css of stylesheets) {
    postcss.parse(css).walkAtRules("media", (mediaRule) => {
      if (!mediaRule.params.includes(`(max-width: ${maxWidth}px)`)) {
        return;
      }

      mediaRule.walkRules((rule) => {
        const ruleSelectors = rule.selectors.map((selector) =>
          selector.replace(/\s+/g, " ").trim(),
        );
        if (!selectors.some((selector) => ruleSelectors.includes(selector))) {
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

describe("Article action button states", () => {
  it("keeps inactive dashboard icons muted and brightens them on hover", () => {
    const dashboardActions = [
      ".rss-dashboard-save-toggle",
      ".rss-dashboard-read-toggle",
      ".rss-dashboard-star-toggle",
      ".rss-dashboard-tags-toggle",
    ];

    for (const selector of dashboardActions) {
      const idle = declarationsFor(selector);
      const hover = declarationsFor(`${selector}:hover`);

      expect(idle.get("color")).toBe("var(--text-muted)");
      expect(idle.has("opacity")).toBe(false);
      expect(hover.get("color")).toBe("var(--text-normal)");
    }
  });

  it("keeps inactive Reader toolbar icons muted and brightens them on hover", () => {
    const idle = declarationsFor(
      ".rss-reader-actions button.rss-reader-action-button",
    );
    const hover = declarationsFor(
      ".rss-reader-actions button.rss-reader-action-button:hover",
    );

    expect(idle.get("color")).toBe("var(--text-muted)");
    expect(hover.get("color")).toBe("var(--text-normal)");
  });

  it("uses the same semantic color for matching saved and read actions", () => {
    const dashboardSaved = declarationsFor(".rss-dashboard-save-toggle.saved");
    const readerSaved = declarationsFor(
      ".rss-reader-actions button.rss-reader-action-button.saved",
    );
    const dashboardRead = declarationsFor(
      ".rss-dashboard-read-toggle.read",
      "body .rss-dashboard-read-toggle.read svg",
    );
    const readerRead = declarationsFor(
      ".rss-reader-actions button.rss-reader-read-toggle.read",
    );
    const dashboardStarred = declarationsFor(
      ".rss-dashboard-star-toggle.starred",
    );
    const readerStarred = declarationsFor(
      ".rss-reader-actions button.rss-reader-star-toggle.starred",
    );

    expect(dashboardSaved.get("color")).toBe("var(--interactive-accent)");
    expect(readerSaved.get("color")).toBe(dashboardSaved.get("color"));
    expect(dashboardRead.get("color")).toBe("var(--color-green)");
    expect(readerRead.get("color")).toBe(dashboardRead.get("color"));
    expect(dashboardStarred.get("color")).toBe("var(--color-yellow)");
    expect(readerStarred.get("color")).toBe(dashboardStarred.get("color"));
  });

  it("keeps list view article actions on the shared toolbar selectors", () => {
    const listToolbarRules: string[] = [];

    postcss.parse(stylesheets[2]).walkRules((rule) => {
      if (
        rule.selectors.includes(
          ".rss-dashboard-grid-actions .rss-dashboard-action-toolbar",
        )
      ) {
        listToolbarRules.push(rule.selector);
      }
    });

    expect(listToolbarRules).toContain(
      ".rss-dashboard-grid-actions .rss-dashboard-action-toolbar",
    );

    for (const action of ["save", "read", "star", "tags"]) {
      expect(
        declarationsFor(`.rss-dashboard-${action}-toggle`).get("color"),
      ).toBe("var(--text-muted)");
    }
  });

  it("does not reduce emphasis on a saved action while it is hovered", () => {
    expect(
      declarationsFor(".rss-dashboard-save-toggle.saved:hover").has("opacity"),
    ).toBe(false);
  });

  it("gives dashboard and Reader article action controls a shared responsive border", () => {
    const dashboardActions = [
      ".rss-dashboard-action-toolbar .rss-dashboard-save-toggle",
      ".rss-dashboard-action-toolbar .rss-dashboard-read-toggle",
      ".rss-dashboard-action-toolbar .rss-dashboard-star-toggle",
      ".rss-dashboard-action-toolbar .rss-dashboard-tags-toggle",
    ];

    for (const selector of dashboardActions) {
      const declarations = declarationsAtMaxWidth(1200, selector);

      expect(declarations.get("border")).toBe(
        "1px solid var(--background-modifier-border)",
      );
    }

    const reader = declarationsAtMaxWidth(
      1200,
      ".rss-reader-actions button.rss-reader-action-button",
    );
    expect(reader.get("border")).toBe(
      "1px solid var(--background-modifier-border)",
    );
  });
});
