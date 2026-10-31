import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

// Every declaration any stylesheet makes for the selector, in source order.
function declarationsFor(selector: string): Array<[string, string]> {
  const declarations: Array<[string, string]> = [];
  for (const file of readdirSync(stylesDir).filter((f) => f.endsWith(".css"))) {
    postcss
      .parse(readFileSync(path.join(stylesDir, file), "utf-8"))
      .walkRules((rule) => {
        if (!rule.selectors.includes(selector)) return;
        rule.walkDecls((decl) => {
          declarations.push([decl.prop, decl.value]);
        });
      });
  }
  return declarations;
}

describe("Discover header scrolling (#1684)", () => {
  const declarations = declarationsFor(".rss-discover-controls-container");

  it("scrolls away with the page instead of pinning to the top", () => {
    const positions = declarations
      .filter(([prop]) => prop === "position")
      .map(([, value]) => value);

    expect(positions).not.toContain("sticky");
    expect(positions).not.toContain("fixed");
    expect(declarations.some(([prop]) => prop === "top")).toBe(false);
  });

  it("stays positioned so its filter menu paints above the cards below", () => {
    const positions = declarations
      .filter(([prop]) => prop === "position")
      .map(([, value]) => value);

    // A static element ignores z-index, and the filter menu inside it relies
    // on this container's stacking context to clear the feed cards.
    expect(positions[positions.length - 1]).toBe("relative");
    expect(declarations).toContainEqual(["z-index", "100"]);
  });
});
