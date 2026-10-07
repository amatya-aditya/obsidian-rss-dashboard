import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");
const REDUCED_MOTION_FILE = "reduced-motion.css";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

function readStyle(file: string): string {
  return readFileSync(path.join(stylesDir, file), "utf-8");
}

function isInsideKeyframes(node: postcss.Node): boolean {
  let current: postcss.Node["parent"] = node.parent;
  while (current) {
    if (
      current.type === "atrule" &&
      /keyframes$/i.test((current as postcss.AtRule).name)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/** Selectors of every rule in `css` that starts or declares motion. */
function motionSelectors(css: string): Set<string> {
  const selectors = new Set<string>();
  postcss.parse(css).walkRules((rule) => {
    if (isInsideKeyframes(rule)) return;
    let hasMotion = false;
    rule.each((child) => {
      if (
        child.type === "decl" &&
        /^(animation|transition)(-|$)/.test(child.prop) &&
        child.value.trim() !== "none"
      ) {
        hasMotion = true;
      }
    });
    if (!hasMotion) return;
    for (const selector of rule.selectors) selectors.add(normalize(selector));
  });
  return selectors;
}

const sourceFiles = readdirSync(stylesDir).filter(
  (file) => file.endsWith(".css") && file !== REDUCED_MOTION_FILE,
);

const reducedMotionExists = existsSync(
  path.join(stylesDir, REDUCED_MOTION_FILE),
);
const reducedMotionCss = reducedMotionExists
  ? readStyle(REDUCED_MOTION_FILE)
  : "";
const reducedMotionRoot = postcss.parse(reducedMotionCss);

/** Selectors the reduced-motion stylesheet restates, with what it sets. */
const reducedSelectors = new Map<string, Map<string, string>>();
reducedMotionRoot.walkAtRules("media", (media) => {
  if (media.params.trim() !== REDUCED_MOTION_QUERY) return;
  media.walkRules((rule) => {
    const declarations = new Map<string, string>();
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
    });
    for (const selector of rule.selectors) {
      reducedSelectors.set(normalize(selector), declarations);
    }
  });
});

describe("reduced motion stylesheet", () => {
  it("exists and is imported last so its rules win same-specificity ties", () => {
    expect(reducedMotionExists).toBe(true);
    const imports = [
      ...readStyle("index.css").matchAll(/@import "\.\/(.+?)";/g),
    ];
    expect(imports[imports.length - 1]?.[1]).toBe(REDUCED_MOTION_FILE);
  });

  it("puts every rule inside a prefers-reduced-motion media query", () => {
    const outside: string[] = [];
    reducedMotionRoot.walkRules((rule) => {
      const parent = rule.parent;
      const inside =
        parent?.type === "atrule" &&
        (parent as postcss.AtRule).name === "media" &&
        (parent as postcss.AtRule).params.trim() === REDUCED_MOTION_QUERY;
      if (!inside) outside.push(rule.selector);
    });
    expect(reducedSelectors.size).toBeGreaterThan(0);
    expect(outside).toEqual([]);
  });

  it("uses no !important declarations", () => {
    const important: string[] = [];
    reducedMotionRoot.walkDecls((decl) => {
      if (decl.important) important.push(decl.toString());
    });
    expect(reducedMotionCss).not.toMatch(/!important/i);
    expect(important).toEqual([]);
  });

  it("covers every selector that animates or transitions in the plugin stylesheets", () => {
    const uncovered: string[] = [];
    for (const file of sourceFiles) {
      for (const selector of motionSelectors(readStyle(file))) {
        if (!reducedSelectors.has(selector)) {
          uncovered.push(`${file}: ${selector}`);
        }
      }
    }
    expect(uncovered).toEqual([]);
  });

  it("ends one-shot animations and transitions at once instead of removing them", () => {
    // A near-zero duration keeps animation-fill-mode end states and
    // animationend/transitionend events, which `animation: none` would drop.
    const instant = reducedSelectors.get(".rss-dashboard-articles-list");
    expect(instant?.get("animation-duration")).toBe("0.01ms");
    expect(instant?.get("animation-iteration-count")).toBe("1");
    expect(instant?.get("transition-duration")).toBe("0.01ms");
    expect(instant?.get("transition-delay")).toBe("0s");
  });

  it("slows loading spinners instead of removing the busy indicator", () => {
    const spinnerSelectors = [
      ".rss-dashboard-load-button.loading::after",
      ".rss-discover-add-all-spinner",
      ".rss-reader-lightbox-spinner",
      ".rss-dashboard-refresh-button.refreshing .rss-dashboard-filter-icon",
    ];
    for (const selector of spinnerSelectors) {
      const declarations = reducedSelectors.get(selector);
      expect(declarations, selector).toBeDefined();
      expect(declarations?.get("animation-iteration-count"), selector).toBe(
        "infinite",
      );
      expect(declarations?.get("animation-duration"), selector).toBe("3s");
    }
  });
});
