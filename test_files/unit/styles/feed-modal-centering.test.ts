import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = postcss.parse(
  readFileSync(
    path.resolve(testDir, "../../../src/styles/feed-manager-modal.css"),
    "utf-8",
  ),
);

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

describe("Feed manager modal positioning", () => {
  it("centers feed management dialogs independently of transform animations", () => {
    for (const dialogClass of ["rss-add-feed-modal", "rss-edit-feed-modal"]) {
      const declarations = declarationsFor(
        `.modal-container .modal.rss-dashboard-modal-container.${dialogClass}`,
      );

      expect(declarations.get("transform")).toBe("none");
      expect(declarations.get("translate")).toBe("-50% -50%");
    }
  });

  it("centers Manage Feeds with viewport insets instead of transform offsets", () => {
    const declarations = declarationsFor(
      ".modal-container .modal.rss-dashboard-modal-container.rss-feed-manager-modal",
    );

    expect(declarations.get("position")).toBe("fixed");
    expect(declarations.get("inset")).toBe("0");
    expect(declarations.get("margin")).toBe("auto");
    expect(declarations.get("translate")).toBe("none");
  });
});

describe("Mobile modal positioning scope (#753)", () => {
  const modalsStylesheet = postcss.parse(
    readFileSync(
      path.resolve(testDir, "../../../src/styles/modals.css"),
      "utf-8",
    ),
  );

  function phoneMediaRules(root: postcss.Root): postcss.Rule[] {
    const rules: postcss.Rule[] = [];
    root.walkAtRules("media", (atRule) => {
      if (!/max-width:\s*768px/.test(atRule.params)) return;
      atRule.walkRules((rule) => {
        rules.push(rule);
      });
    });
    return rules;
  }

  it("applies the centered-card override only to opted-in feed-management dialogs", () => {
    const centeringRules = phoneMediaRules(stylesheet).filter((rule) => {
      let centers = false;
      rule.walkDecls("top", (decl) => {
        if (decl.value === "50%") centers = true;
      });
      return centers;
    });

    expect(centeringRules.length).toBeGreaterThan(0);
    for (const rule of centeringRules) {
      for (const selector of rule.selectors) {
        if (!selector.includes("rss-dashboard-modal-container")) continue;
        // :where() keeps the opt-in at zero specificity, so the per-dialog
        // `transform: none` / width rules below still win the cascade.
        expect(selector).toContain(":where(.rss-mobile-feed-manager-modal)");
      }
    }
  });

  it("keeps the folder-name modal pinned to the top safe area with a 60vh cap", () => {
    const declarations = new Map<string, string>();
    modalsStylesheet.walkRules((rule) => {
      if (
        !rule.selectors.includes(
          "body .rss-folder-name-modal.rss-dashboard-modal-container",
        )
      )
        return;
      rule.walkDecls((decl) => {
        declarations.set(decl.prop, decl.value);
      });
    });

    expect(declarations.get("top")).toBe("env(safe-area-inset-top, 0px)");
    expect(declarations.get("max-height")).toBe("60vh");
    expect(declarations.get("border-radius")).toBe("0 0 16px 16px");
  });

  it("does not let any phone-width rule outrank the folder-name modal's placement", () => {
    const phoneSelectors = phoneMediaRules(stylesheet).flatMap(
      (rule) => rule.selectors,
    );
    const unscoped = phoneSelectors.filter(
      (selector) =>
        selector.endsWith(".rss-dashboard-modal-container") &&
        !selector.includes(".rss-mobile-feed-manager-modal"),
    );

    expect(unscoped).toEqual([]);
  });
});
