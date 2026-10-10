import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom does not run the cascade, so the mobile Reader format sheet's geometry
// is asserted as a stylesheet contract: parse every file under src/styles in
// the order index.css imports it and resolve which declaration wins for the
// element the portal mounts. This pins the ordering bug where the shared
// tags-dropdown base rule (equal specificity, later in the bundle) overrode the
// reader sheet's positioning.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

interface Winner {
  value: string;
  specificity: number;
  selector: string;
  important: boolean;
}

interface Candidate {
  classes: string[];
  props: Array<{ prop: string; value: string; important: boolean }>;
}

function importOrder(): string[] {
  const index = readFileSync(path.join(stylesDir, "index.css"), "utf-8");
  return [...index.matchAll(/@import\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

// Only describes class-only selectors (single or compound), which is every
// selector that can match the portal element here. Anything with a type,
// id, pseudo, attribute, or combinator is irrelevant and skipped.
function classNames(selector: string): string[] | null {
  if (!selector.startsWith(".")) return null;
  const classes = selector.split(".").slice(1);
  if (classes.length === 0) return null;
  if (classes.some((name) => !/^[A-Za-z0-9_-]+$/.test(name))) return null;
  return classes;
}

function mediaMatches(params: string, width: number): boolean {
  const match = /^\(\s*max-width:\s*(\d+)px\s*\)$/.exec(params.trim());
  if (!match) return false;
  return width <= Number(match[1]);
}

function collectCandidates(): Array<Candidate & { medias: string[] }> {
  const candidates: Array<Candidate & { medias: string[] }> = [];
  for (const file of importOrder()) {
    const css = readFileSync(path.join(stylesDir, file), "utf-8");
    postcss.parse(css).walkRules((rule) => {
      const medias: string[] = [];
      let parent = rule.parent;
      let unsupported = false;
      while (parent && parent.type !== "root") {
        if (parent.type === "atrule" && parent.name === "media") {
          medias.push(parent.params);
        } else if (parent.type === "atrule") {
          // Keyframes and other at-rules never style the element.
          unsupported = true;
        }
        parent = parent.parent;
      }
      if (unsupported) return;

      const props: Candidate["props"] = [];
      rule.walkDecls((decl) => {
        props.push({
          prop: decl.prop,
          value: decl.value.replace(/\s+/g, " ").trim(),
          important: decl.important === true,
        });
      });
      if (props.length === 0) return;

      for (const selector of rule.selectors.map(normalize)) {
        const classes = classNames(selector);
        if (!classes) continue;
        candidates.push({ classes, props, medias });
      }
    });
  }
  return candidates;
}

const candidates = collectCandidates();

function wins(
  next: { specificity: number; order: number; important: boolean },
  prev: { specificity: number; order: number; important: boolean },
): boolean {
  if (next.important !== prev.important) return next.important;
  if (next.specificity !== prev.specificity) {
    return next.specificity > prev.specificity;
  }
  return next.order > prev.order;
}

// Resolve the winning value of every property for an element carrying
// `classSet`, at a given viewport width, following specificity then source
// order then !important.
function resolve(classSet: string[], width: number): Map<string, Winner> {
  const resolved = new Map<string, Winner & { order: number }>();
  let order = 0;
  for (const candidate of candidates) {
    if (!candidate.medias.every((media) => mediaMatches(media, width))) {
      continue;
    }
    if (!candidate.classes.every((name) => classSet.includes(name))) continue;

    order += 1;
    const selector = candidate.classes.map((name) => `.${name}`).join("");
    const specificity = candidate.classes.length;
    for (const { prop, value, important } of candidate.props) {
      const entry = { specificity, order, important, value, selector };
      const previous = resolved.get(prop);
      if (!previous || wins(entry, previous)) resolved.set(prop, entry);
    }
  }
  return new Map(
    [...resolved].map(([prop, winner]) => [
      prop,
      {
        value: winner.value,
        specificity: winner.specificity,
        selector: winner.selector,
        important: winner.important,
      },
    ]),
  );
}

const PORTAL_BASE = "rss-dashboard-tags-dropdown-content-portal";
const READER_PORTAL = "rss-reader-format-dropdown-portal";
const READER_MOBILE_SHEET = "rss-reader-format-mobile-sheet";
const TAGS_MOBILE_SHEET = "rss-dashboard-tags-mobile-sheet";

const MOBILE_WIDTH = 400;
const DESKTOP_WIDTH = 1200;

describe("Reader format mobile sheet stylesheet", () => {
  const sheet = resolve(
    [PORTAL_BASE, READER_PORTAL, READER_MOBILE_SHEET],
    MOBILE_WIDTH,
  );

  it("anchors the sheet to the bottom instead of the shared anchor origin", () => {
    expect(sheet.get("top")?.value).toBe("auto");
    expect(sheet.get("bottom")?.value).toContain("--rss-footer-visual-pad");
  });

  it("centres the sheet with equal side insets and no fixed sizing", () => {
    expect(sheet.get("left")?.value).toBe("8px");
    expect(sheet.get("right")?.value).toBe("8px");
    expect(sheet.get("width")?.value).toBe("auto");
    expect(sheet.get("min-width")?.value).toBe("0");
    expect(sheet.get("max-width")?.value).toBe("none");
  });

  it("keeps the bottom-sheet corner radius over the shared base radius", () => {
    expect(sheet.get("border-radius")?.value).toBe("12px");
  });

  it("wins each geometry property with a selector scoped above the shared base", () => {
    for (const prop of [
      "top",
      "width",
      "min-width",
      "max-width",
      "border-radius",
    ]) {
      const winner = sheet.get(prop);
      expect(winner, prop).toBeDefined();
      expect(winner?.specificity, prop).toBeGreaterThanOrEqual(2);
      expect(winner?.selector, prop).toBe(
        `.${READER_PORTAL}.${READER_MOBILE_SHEET}`,
      );
    }
  });

  it("uses the same bottom offset contract as the tags mobile sheet", () => {
    const tags = resolve([PORTAL_BASE, TAGS_MOBILE_SHEET], MOBILE_WIDTH);
    expect(sheet.get("bottom")?.value).toBe(tags.get("bottom")?.value);
  });

  it("does not use !important on any mobile sheet declaration", () => {
    const important = candidates
      .filter((candidate) => candidate.classes.includes(READER_MOBILE_SHEET))
      .flatMap((candidate) => candidate.props)
      .filter((prop) => prop.important);
    expect(important).toEqual([]);
  });

  it("leaves the desktop portal anchored by the shared base rule", () => {
    const desktop = resolve([PORTAL_BASE, READER_PORTAL], DESKTOP_WIDTH);
    expect(desktop.get("top")?.value).toBe("var(--dropdown-anchor-top, 0)");
    expect(desktop.get("left")?.value).toBe("var(--dropdown-anchor-left, 0)");
  });
});
