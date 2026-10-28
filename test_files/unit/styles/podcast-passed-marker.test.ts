import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom paints nothing, so the passed marker's dim treatment is pinned as a
// stylesheet contract: parse the stylesheets index.css imports, in import
// order.
//
// Why (#1409, DEC-010): the played fill now paints in every podcast theme, and
// the whole-marker `opacity: 0.5` dimmed the one-pixel dark ring too. The ring
// is what keeps a 3:1 boundary against the themed fill (WCAG 1.4.11), so the
// dim moves to the tick body and colour edge alone and the ring stays opaque.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

const PASSED = ".seek-bar-marker.is-passed";
const PASSED_TICK = ".seek-bar-marker.is-passed::before";
const FOCUSED_PASSED_TICK = ".seek-bar-marker.is-passed:focus-visible::before";

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

function declsFor(selector: string, prop: string): StyleDecl[] {
  return collectDecls().filter(
    (decl) => decl.selector === selector && decl.prop === prop,
  );
}

function describeDecl(decl: StyleDecl): string {
  return `${decl.file}: ${decl.selector} { ${decl.prop}: ${decl.value} }`;
}

/** The tick body painted at half strength instead of at full opacity. */
function dimsTickBody(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("color-mix") &&
    normalized.includes("50%") &&
    normalized.includes("transparent")
  );
}

describe("Podcast passed chapter marker", () => {
  it("keeps the whole marker opaque so both rings stay at full strength", () => {
    expect(
      declsFor(PASSED, "opacity").map(describeDecl),
      "dim the tick body, not the button; the dark ring must keep its contrast",
    ).toEqual([]);
  });

  it("dims the tick body and its colour edge", () => {
    const backgrounds = declsFor(PASSED_TICK, "background");

    expect(
      backgrounds.filter((decl) => dimsTickBody(decl.value)),
      `the passed tick body must be half-transparent; found: ${
        backgrounds.map(describeDecl).join("; ") || "nothing"
      }`,
    ).not.toEqual([]);
  });

  it("keeps the one-pixel dark ring in the passed state", () => {
    const shadows = declsFor(PASSED_TICK, "box-shadow");

    expect(
      shadows.some((decl) =>
        decl.value.includes("1px var(--background-primary)"),
      ),
      `the passed tick must keep its dark ring; found: ${
        shadows.map(describeDecl).join("; ") || "nothing"
      }`,
    ).toBe(true);
  });

  it("restores the tick body on keyboard focus", () => {
    const backgrounds = declsFor(FOCUSED_PASSED_TICK, "background");

    expect(
      backgrounds.map((decl) => decl.value),
      "focus must restore the passed tick to its full colour",
    ).toContain("currentColor");
  });
});
