import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = postcss.parse(
  readFileSync(
    path.resolve(testDir, "../../../src/styles/modals.css"),
    "utf-8",
  ),
);

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
      expect(decl.important).toBeFalsy();
    });
  });
  return declarations;
}

describe("Confirmation modal button alignment", () => {
  it.each(["rss-max-items-apply-buttons", "rss-retention-change-buttons"])(
    "centers the %s row",
    (buttonsClass) => {
      const declarations = declarationsFor(
        `.rss-dashboard-modal .${buttonsClass}`,
      );

      expect(declarations.get("justify-content")).toBe("center");
    },
  );
});

describe("Storage upgrade modal buttons", () => {
  it("wraps the button row", () => {
    const declarations = declarationsFor(
      ".rss-dashboard-storage-migration-modal .rss-dashboard-modal-buttons",
    );

    expect(declarations.get("flex-wrap")).toBe("wrap");
  });

  it("lets button labels wrap inside the button", () => {
    const declarations = declarationsFor(
      ".rss-dashboard-storage-migration-modal .rss-dashboard-modal-buttons button",
    );

    expect(declarations.get("white-space")).toBe("normal");
    expect(declarations.get("height")).toBe("auto");
    expect(declarations.get("max-width")).toBe("100%");
  });
});
