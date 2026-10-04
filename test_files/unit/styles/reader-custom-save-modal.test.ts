import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = postcss.parse(
  readFileSync(path.resolve(testDir, "../../../src/styles/modals.css"), "utf8"),
);

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });
  return declarations;
}

describe("Reader custom save modal styles", () => {
  it("puts the template label and textarea on separate full-width rows", () => {
    expect(
      declarationsFor(".rss-dashboard-custom-save-modal label").get("display"),
    ).toBe("block");

    const textarea = declarationsFor(
      ".rss-dashboard-custom-save-modal textarea",
    );
    expect(textarea.get("display")).toBe("block");
    expect(textarea.get("width")).toBe("100%");
  });
});
