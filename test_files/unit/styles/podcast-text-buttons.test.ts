import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom lays nothing out, so the episode list's text chips are pinned as a
// stylesheet contract: parse every file in src/styles in the order index.css
// imports it and inspect the declarations that decide their box.
//
// Why (#1400): both chips once shared the old .playlist-nav-btn rule, an icon
// button fixed at 32x32. Their labels ("Load 20 more episodes", "Current
// episode") are wider than that, and Obsidian's base `button` rule keeps them
// on one line, so the text painted outside the border box.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

const TEXT_CHIPS = [
  { selector: ".episode-list-load-more", label: "Load 20 more episodes" },
  { selector: ".episode-list-current", label: "Current episode" },
];

/** Absolute and viewport-relative lengths; a percentage clips a long label too. */
const FIXED_LENGTH =
  /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|ch|ex|cap|ic|lh|rlh|vw|vh|vmin|vmax|cm|mm|in|pt|pc|q|%)$/i;

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

/** Declarations from any rule that targets the chip, themed or not. */
function chipDecls(selector: string): StyleDecl[] {
  return collectDecls().filter((decl) => decl.selector.includes(selector));
}

function describeDecl(decl: StyleDecl): string {
  return `${decl.file}: ${decl.selector} { ${decl.prop}: ${decl.value} }`;
}

function pxValue(value: string): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  return match ? Number(match[1]) : undefined;
}

describe("Podcast episode list text chips", () => {
  it.each(TEXT_CHIPS)(
    "lets $selector grow to its label instead of a fixed width",
    ({ selector, label }) => {
      const fixedWidths = chipDecls(selector).filter(
        (decl) =>
          (decl.prop === "width" || decl.prop === "inline-size") &&
          FIXED_LENGTH.test(decl.value),
      );

      expect(
        fixedWidths.map(describeDecl),
        `${selector} holds "${label}", so its width must follow the text`,
      ).toEqual([]);
    },
  );

  it.each(TEXT_CHIPS)(
    "keeps at least the old 32px target for $selector",
    ({ selector }) => {
      const minHeights = chipDecls(selector).filter(
        (decl) => decl.prop === "min-height",
      );
      const minHeight = minHeights[minHeights.length - 1];

      if (!minHeight) {
        throw new Error(`${selector} has no min-height declaration`);
      }
      expect(
        pxValue(minHeight.value),
        `${selector} needs a literal px minimum: ${describeDecl(minHeight)}`,
      ).toBeGreaterThanOrEqual(32);
    },
  );
});
