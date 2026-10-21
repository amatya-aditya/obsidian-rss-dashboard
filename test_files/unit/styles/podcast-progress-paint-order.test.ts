import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom paints nothing, so the seek bar's paint order is pinned as a stylesheet
// contract: parse the stylesheets index.css imports, in import order.
//
// Why (#1409): the native <progress> element sits above the themed
// .podcast-progress-bar-filled in the stacking order, and Chromium still paints
// its UA value and track pseudo-elements even with `appearance: none` and a
// transparent element background. Every podcast theme therefore showed the UA
// green value and gray track instead of the theme's colours. The contract is
// that those pseudo-elements paint nothing, leaving the wrapper's themed track
// and the themed fill as the only visible bar.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

const PROGRESS_SELECTOR = ".podcast-progress-bar";
const UA_PSEUDO_ELEMENTS = [
  "::-webkit-progress-bar",
  "::-webkit-progress-value",
  "::-moz-progress-bar",
];

const PODCAST_THEMES = [
  "obsidian",
  "minimal",
  "gradient",
  "spotify",
  "nord",
  "dracula",
  "solarized",
  "catppuccin",
  "gruvbox",
  "tokyonight",
];

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

function collectDecls(): StyleDecl[] {
  cachedDecls ??= parseDecls();
  return cachedDecls;
}

function describeDecl(decl: StyleDecl): string {
  return `${decl.file}: ${decl.selector} { ${decl.prop}: ${decl.value} }`;
}

/** `background: transparent` and its background-color equivalents. */
function isTransparent(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === "transparent" ||
    normalized === "rgba(0, 0, 0, 0)" ||
    normalized === "rgb(0 0 0 / 0)"
  );
}

describe("Podcast seek bar paint order", () => {
  it.each(UA_PSEUDO_ELEMENTS)(
    "leaves the UA progress pseudo-element %s transparent",
    (pseudo) => {
      const selector = `${PROGRESS_SELECTOR}${pseudo}`;
      const backgrounds = collectDecls().filter(
        (decl) =>
          decl.selector === selector &&
          (decl.prop === "background" || decl.prop === "background-color"),
      );

      expect(
        backgrounds.filter((decl) => isTransparent(decl.value)),
        `${selector} must not paint a background over the themed fill (#1409); found: ${
          backgrounds.map(describeDecl).join("; ") || "nothing"
        }`,
      ).not.toEqual([]);
    },
  );

  it.each(PODCAST_THEMES)(
    "keeps a themed track and fill visible for the %s theme",
    (theme) => {
      const themed = collectDecls().filter((decl) =>
        decl.selector.includes(`[data-podcast-theme="${theme}"]`),
      );
      const backgrounds = (suffix: string) =>
        themed.filter(
          (decl) =>
            decl.selector.endsWith(suffix) &&
            (decl.prop === "background" || decl.prop === "background-color") &&
            !isTransparent(decl.value),
        );

      expect(
        backgrounds(".podcast-progress-bar-wrapper").map(describeDecl),
        `the ${theme} theme needs a wrapper track now that the UA track is transparent`,
      ).not.toEqual([]);
      expect(
        backgrounds(".podcast-progress-bar-filled").map(describeDecl),
        `the ${theme} theme needs a fill now that the UA value is transparent`,
      ).not.toEqual([]);
    },
  );
});
