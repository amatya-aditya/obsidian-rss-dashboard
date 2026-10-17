import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom lays nothing out and runs no cascade, so the episode list's hover
// treatment is asserted as a stylesheet contract: parse every file in
// src/styles in the order index.css imports it and inspect the declarations
// that decide how a hovered episode row is painted.
//
// Why the hover state is constrained this way (#1270): .episode-list is a
// scroll container, so it clips anything a hovered row paints outside the
// row's own border box. The row used to lift by 2px, and the first row lost
// its top border and both top corners to that clip. Everything a hover adds
// therefore has to stay inside the row.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

const BASE_HOVER_SELECTOR = ".episode-list-row:hover";

interface StyleDecl {
  file: string;
  selector: string;
  prop: string;
  value: string;
}

function importOrder(): string[] {
  const index = readFileSync(path.join(stylesDir, "index.css"), "utf-8");
  return [...index.matchAll(/@import\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

let cachedDecls: StyleDecl[] | undefined;

function collectDecls(): StyleDecl[] {
  cachedDecls ??= parseDecls();
  return cachedDecls;
}

function parseDecls(): StyleDecl[] {
  const decls: StyleDecl[] = [];
  for (const file of importOrder()) {
    const css = readFileSync(path.join(stylesDir, file), "utf-8");
    postcss.parse(css).walkRules((rule) => {
      rule.each((node) => {
        if (node.type !== "decl") return;
        for (const selector of rule.selectors) {
          decls.push({
            file,
            selector: normalize(selector),
            prop: node.prop,
            value: node.value.replace(/\s+/g, " ").trim(),
          });
        }
      });
    });
  }
  return decls;
}

/** Declarations from any rule that styles the row's hover state, themed or not. */
function hoverDecls(): StyleDecl[] {
  return collectDecls().filter((decl) =>
    decl.selector.endsWith(BASE_HOVER_SELECTOR),
  );
}

function describeDecl(decl: StyleDecl): string {
  return `${decl.file}: ${decl.selector} { ${decl.prop}: ${decl.value} }`;
}

/** Splits a comma-separated value (such as box-shadow layers) at its top level. */
function splitLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      layers.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) layers.push(current.trim());
  return layers;
}

describe("Podcast episode list hover stylesheet", () => {
  it("keeps a hovered row's painting inside the row, where the list's clip cannot cut it", () => {
    const outsideTheRow = hoverDecls()
      .filter((decl) => decl.prop === "box-shadow")
      .flatMap((decl) =>
        splitLayers(decl.value)
          .filter((layer) => !layer.startsWith("inset"))
          .map((layer) => `${describeDecl(decl)} -> ${layer}`),
      );

    expect(outsideTheRow).toEqual([]);
  });

  it("does not move a hovered row, because the list clips the side it moves toward", () => {
    const movement = hoverDecls().filter((decl) =>
      ["transform", "translate"].includes(decl.prop),
    );

    expect(movement.map(describeDecl)).toEqual([]);
  });

  it("still repaints the hovered row so its hover state stays visible", () => {
    const isThemed = (selector: string) =>
      selector.includes("[data-podcast-theme");

    // The base rule keeps the row's own surface change, and every theme adds
    // its own hover background on top of it.
    const baseHoverBackground = hoverDecls().find(
      (decl) => !isThemed(decl.selector) && decl.prop === "background",
    );
    expect(baseHoverBackground).toBeDefined();

    const themeHoverBackgrounds = hoverDecls().filter(
      (decl) => isThemed(decl.selector) && decl.prop === "background",
    );
    expect(themeHoverBackgrounds.length).toBeGreaterThan(0);
  });
});
