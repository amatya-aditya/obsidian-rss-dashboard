import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(
  path.resolve(testDir, "../../../src/styles/card-view.css"),
  "utf-8",
);

describe("card Preview reveal stylesheet (#1530)", () => {
  it("reveals the Preview on :hover only inside a (hover: hover) media query", () => {
    const ungated: string[] = [];
    let gated = 0;
    postcss.parse(stylesheet).walkRules((rule) => {
      if (!rule.selector.includes("cover-container.has-summary:hover")) return;
      const parent = rule.parent;
      if (
        parent?.type === "atrule" &&
        (parent as postcss.AtRule).params === "(hover: hover)"
      ) {
        gated += 1;
      } else {
        ungated.push(rule.selector);
      }
    });

    expect(ungated).toEqual([]);
    expect(gated).toBeGreaterThan(0);
  });
});
