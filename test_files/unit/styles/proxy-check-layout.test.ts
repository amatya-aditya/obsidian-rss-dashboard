import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

// jsdom does not run the cascade, so the proxy check's results box is asserted
// as a stylesheet contract: parse every file in src/styles in the order
// index.css imports it and inspect which rules decide the row's flex layout.
//
// The layout these declarations produce is the whole point of putting the rows
// "inside the box" (#1298, #1316): the row wraps, the board takes a full line
// of it, and the info column takes the width left over from the controls so the
// buttons stay on the first line.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

interface LayoutDecl {
  file: string;
  selectors: string[];
  prop: string;
  value: string;
  important: boolean;
}

function importOrder(): string[] {
  const index = readFileSync(path.join(stylesDir, "index.css"), "utf-8");
  return [...index.matchAll(/@import\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

// The stylesheets do not change during a run, so parse them once per file.
let cachedDecls: LayoutDecl[] | undefined;

function collectDecls(): LayoutDecl[] {
  cachedDecls ??= parseDecls();
  return cachedDecls;
}

function parseDecls(): LayoutDecl[] {
  const decls: LayoutDecl[] = [];
  for (const file of importOrder()) {
    const css = readFileSync(path.join(stylesDir, file), "utf-8");
    postcss.parse(css).walkRules((rule) => {
      rule.each((node) => {
        if (node.type === "decl") {
          decls.push({
            file,
            selectors: rule.selectors.map(normalize),
            prop: node.prop,
            value: node.value.replace(/\s+/g, " ").trim(),
            important: node.important === true,
          });
        }
      });
    });
  }
  return decls;
}

// The declaration that wins for one exact selector, in import order.
function effectiveValue(selector: string, prop: string): string | undefined {
  const matching = collectDecls().filter(
    (decl) => decl.selectors.includes(selector) && decl.prop === prop,
  );
  return matching[matching.length - 1]?.value;
}

const ROW = ".rss-proxy-check-setting";
const BOARD = ".rss-proxy-check-board";

describe("Proxy check results box - stylesheet contract", () => {
  it("wraps the row so the board can take its own line", () => {
    expect(effectiveValue(ROW, "flex-wrap")).toBe("wrap");
  });

  it("gives the board a full line of the row", () => {
    expect(effectiveValue(BOARD, "flex")).toBe("1 1 100%");
    expect(effectiveValue(BOARD, "min-width")).toBe("0");
  });

  it("keeps the info column flexible and the controls at their natural width", () => {
    expect(effectiveValue(`${ROW} .setting-item-info`, "flex")).toBe("1 1 0");
    expect(effectiveValue(`${ROW} .setting-item-info`, "min-width")).toBe("0");
    expect(effectiveValue(`${ROW} .setting-item-control`, "flex")).toBe(
      "0 0 auto",
    );
  });

  it("anchors every declaration on the plugin's own classes", () => {
    const boxDecls = collectDecls().filter(
      (decl) =>
        decl.selectors.includes(ROW) ||
        decl.selectors.includes(BOARD) ||
        decl.selectors.some((selector) => selector.startsWith(`${ROW} `)),
    );

    expect(boxDecls.length).toBeGreaterThan(0);
    for (const decl of boxDecls) {
      expect(decl.important, `${decl.prop} in ${decl.file}`).toBe(false);
    }
  });
});
