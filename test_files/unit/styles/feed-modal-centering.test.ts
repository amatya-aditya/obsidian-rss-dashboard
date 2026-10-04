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
  it("centers add and edit feed dialogs independently of transform animations", () => {
    for (const dialogClass of ["rss-add-feed-modal", "rss-edit-feed-modal"]) {
      const declarations = declarationsFor(
        `.modal-container .modal.rss-dashboard-modal-container.${dialogClass}`,
      );

      expect(declarations.get("transform")).toBe("none");
      expect(declarations.get("translate")).toBe("-50% -50%");
    }
  });
});
