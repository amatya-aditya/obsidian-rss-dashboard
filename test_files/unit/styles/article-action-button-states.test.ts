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
const designSpec = readFileSync(
  path.resolve(testDir, "../../../docs/development/design-spec.md"),
  "utf-8",
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
  it("documents the same hover and focus contract as the action styles", () => {
    const actionStateRow = designSpec
      .split(/\r?\n/)
      .find((line) => line.startsWith("| Article action buttons"));

    expect(actionStateRow).toBeDefined();
    expect(actionStateRow).toContain(
      "Inactive previews the action color; selected keeps semantic color and brightens",
    );
    expect(actionStateRow).toContain(
      "Action-color preview; selected brightens; visible outline",
    );
    expect(actionStateRow).toContain(
      "Save: `--interactive-accent`; Read: `--color-green`; Star: `--color-yellow`; Tags: neutral unless selected",
    );
    expect(designSpec.replace(/\s+/g, " ")).toContain(
      "Selected actions keep their semantic color and brighten on hover and focus.",
    );
  });

  it("keeps dashboard actions muted at rest and previews each enabled color on hover and focus", () => {
    const dashboardActions = [
      ".rss-dashboard-save-toggle",
      ".rss-dashboard-read-toggle",
      ".rss-dashboard-star-toggle",
      ".rss-dashboard-tags-toggle",
    ];

    for (const selector of dashboardActions) {
      const idle = declarationsFor(selector);
      const state = selector.includes("save")
        ? ".rss-dashboard-save-toggle:not(.saved)"
        : selector.includes("read")
          ? ".rss-dashboard-read-toggle:not(.read)"
          : selector.includes("star")
            ? ".rss-dashboard-star-toggle.unstarred"
            : selector;
      const hover = declarationsFor(`${state}:hover`);
      const focus = declarationsFor(`${state}:focus-visible`);

      expect(idle.get("color")).toBe("var(--text-muted)");
      expect(idle.has("opacity")).toBe(false);
      expect(hover.get("color")).toBe(
        state.includes("save")
          ? "var(--interactive-accent)"
          : state.includes("read")
            ? "var(--color-green)"
            : state.includes("star")
              ? "var(--color-yellow)"
              : "var(--text-normal)",
      );
      expect(focus.get("color")).toBe(hover.get("color"));
    }
  });

  it("keeps Reader actions muted at rest and previews each enabled color on hover and focus", () => {
    const idle = declarationsFor(
      ".rss-reader-actions button.rss-reader-action-button",
    );
    const hover = declarationsFor(
      ".rss-reader-actions button.rss-reader-action-button:hover",
    );

    expect(idle.get("color")).toBe("var(--text-muted)");
    expect(
      declarationsFor(
        ".rss-reader-actions button.rss-reader-save-toggle:not(.saved):hover",
      ).get("color"),
    ).toBe("var(--interactive-accent)");
    expect(
      declarationsFor(
        ".rss-reader-actions button.rss-reader-read-toggle:not(.read):hover",
      ).get("color"),
    ).toBe("var(--color-green)");
    expect(
      declarationsFor(
        ".rss-reader-actions button.rss-reader-star-toggle:not(.starred):hover",
        ".rss-reader-actions button.rss-reader-star-toggle.unstarred:hover",
      ).get("color"),
    ).toBe("var(--color-yellow)");
    expect(hover.get("color")).toBe("var(--text-normal)");
    expect(
      declarationsFor(
        ".rss-reader-actions button.rss-reader-read-toggle:not(.read):focus-visible",
      ).get("color"),
    ).toBe("var(--color-green)");
    expect(
      declarationsFor(
        ".rss-reader-actions button.rss-reader-star-toggle.unstarred:focus-visible",
      ).get("color"),
    ).toBe("var(--color-yellow)");
    expect(
      declarationsFor(
        ".rss-reader-actions button.rss-reader-save-toggle:not(.saved):focus-visible",
      ).get("color"),
    ).toBe("var(--interactive-accent)");
    for (const selector of [
      ".rss-reader-actions button.rss-reader-save-toggle.saved:focus-visible svg",
      ".rss-reader-actions button.rss-reader-read-toggle.read:focus-visible svg",
      ".rss-reader-actions button.rss-reader-star-toggle.starred:focus-visible svg",
    ]) {
      expect(declarationsFor(selector).get("filter")).toBe("brightness(1.2)");
    }
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
    for (const selector of [
      ".rss-dashboard-save-toggle.saved:hover svg",
      ".rss-dashboard-read-toggle.read:hover svg",
      ".rss-dashboard-star-toggle.starred:hover svg",
      ".rss-dashboard-save-toggle.saved:focus-visible svg",
      ".rss-dashboard-read-toggle.read:focus-visible svg",
      ".rss-dashboard-star-toggle.starred:focus-visible svg",
    ]) {
      expect(declarationsFor(selector).get("filter")).toBe("brightness(1.2)");
    }
    for (const selector of [
      ".rss-reader-actions button.rss-reader-save-toggle.saved:hover svg",
      ".rss-reader-actions button.rss-reader-read-toggle.read:hover svg",
      ".rss-reader-actions button.rss-reader-star-toggle.starred:hover svg",
    ]) {
      expect(declarationsFor(selector).get("filter")).toBe("brightness(1.2)");
    }
  });

  it("gives dashboard actions a responsive border while keeping Reader toolbar actions borderless", () => {
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
    expect(reader.has("border")).toBe(false);
  });
});
