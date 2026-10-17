import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom does not run the cascade, so the clearance both reading panes reserve
// for Obsidian's floating mobile bottom bar is asserted as a stylesheet
// contract, like reader-format-mobile-sheet.test.ts: parse every file under
// src/styles in the order index.css imports it and resolve which declaration
// wins for the element the reader mounts.
//
// The shorthand trap this guards: `.inline-reader-content` carries both
// reading-pane classes and its base `padding: 10px` is declared later in
// reader.css, so a bottom-padding rule placed before it loses by source order
// and the pane keeps 10px of clearance.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");

const CLEARANCE = "--rss-mobile-bottom-bar-clearance";
const CLEARANCE_VALUE = "110px";
const GATE = "(max-width: 1200px)";

interface Winner {
  value: string;
  selector: string;
  medias: string[];
}

interface Candidate {
  classes: string[];
  props: Array<{ prop: string; value: string; important: boolean }>;
  medias: string[];
  selector: string;
}

function importOrder(): string[] {
  const index = readFileSync(path.join(stylesDir, "index.css"), "utf-8");
  return [...index.matchAll(/@import\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

// Only class-only selectors (single or compound) can match the pane here.
// Anything with a type, id, pseudo, attribute, or combinator is skipped.
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

// Split a shorthand value on top-level whitespace, keeping the comma inside
// var(--size-4-1, 4px) together with its token.
function splitValues(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current) parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

// Expand the padding shorthands an element can reach into the four longhands,
// so a later shorthand is not mistaken for a separate property.
function longhands(prop: string, value: string): Array<[string, string]> {
  const values = splitValues(value);
  const side = (top: string, right: string, bottom: string, left: string) =>
    [
      ["padding-top", top],
      ["padding-right", right],
      ["padding-bottom", bottom],
      ["padding-left", left],
    ] as Array<[string, string]>;

  switch (prop) {
    case "padding": {
      if (values.length === 1)
        return side(values[0], values[0], values[0], values[0]);
      if (values.length === 2)
        return side(values[0], values[1], values[0], values[1]);
      if (values.length === 3)
        return side(values[0], values[1], values[2], values[1]);
      if (values.length === 4)
        return side(values[0], values[1], values[2], values[3]);
      return [];
    }
    case "padding-block":
      if (values.length === 1) return side(values[0], "", values[0], "");
      if (values.length === 2) return side(values[0], "", values[1], "");
      return [];
    case "padding-inline":
      if (values.length === 1) return side("", values[0], "", values[0]);
      if (values.length === 2) return side("", values[1], "", values[0]);
      return [];
    default:
      return [[prop, value]];
  }
}

const PADDING_PROPS = new Set([
  "padding",
  "padding-block",
  "padding-inline",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
]);

function collectCandidates(): Candidate[] {
  const candidates: Candidate[] = [];
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
          unsupported = true;
        }
        parent = parent.parent;
      }
      if (unsupported) return;

      const props: Candidate["props"] = [];
      rule.walkDecls((decl) => {
        if (!PADDING_PROPS.has(decl.prop)) return;
        const value = decl.value.replace(/\s+/g, " ").trim();
        for (const [prop, longhandValue] of longhands(decl.prop, value)) {
          if (!longhandValue) continue;
          props.push({
            prop,
            value: longhandValue,
            important: decl.important === true,
          });
        }
      });
      if (props.length === 0) return;

      for (const selector of rule.selectors.map(normalize)) {
        const classes = classNames(selector);
        if (!classes) continue;
        candidates.push({ classes, props, medias, selector });
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

// Resolve the winning padding longhands for an element carrying `classSet` at
// a given viewport width, following specificity, source order, then
// !important.
function resolve(classSet: string[], width: number): Map<string, Winner> {
  const resolved = new Map<
    string,
    Winner & { order: number; specificity: number; important: boolean }
  >();
  let order = 0;
  for (const candidate of candidates) {
    if (!candidate.medias.every((media) => mediaMatches(media, width)))
      continue;
    if (!candidate.classes.every((name) => classSet.includes(name))) continue;

    order += 1;
    const specificity = candidate.classes.length;
    for (const { prop, value, important } of candidate.props) {
      const entry = {
        specificity,
        order,
        important,
        value,
        selector: candidate.selector,
        medias: candidate.medias,
      };
      const previous = resolved.get(prop);
      if (!previous || wins(entry, previous)) resolved.set(prop, entry);
    }
  }
  return new Map(
    [...resolved].map(([prop, winner]) => [
      prop,
      {
        value: winner.value,
        selector: winner.selector,
        medias: winner.medias,
      },
    ]),
  );
}

// Collect every declaration of the clearance token in the bundle, keeping the
// file and the at-rule chain it sits under.
function clearanceDeclarations(): Array<{
  file: string;
  value: string;
  selector: string;
  medias: string[];
}> {
  const declarations: Array<{
    file: string;
    value: string;
    selector: string;
    medias: string[];
  }> = [];
  for (const file of importOrder()) {
    const css = readFileSync(path.join(stylesDir, file), "utf-8");
    postcss.parse(css).walkDecls(CLEARANCE, (decl) => {
      const medias: string[] = [];
      let parent = decl.parent;
      let selector = "";
      let inRule = false;
      while (parent && parent.type !== "root") {
        if (parent.type === "atrule" && parent.name === "media") {
          medias.push(parent.params);
        }
        if (parent.type === "rule") {
          selector = normalize(parent.selector);
          inRule = true;
        }
        parent = parent.parent;
      }
      declarations.push({
        file,
        value: decl.value.trim(),
        selector: inRule ? selector : "",
        medias,
      });
    });
  }
  return declarations;
}

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1300;
const READER = ["rss-reader-content"];
const INLINE_READER = ["rss-reader-content", "inline-reader-content"];
const ARTICLE_LIST = ["rss-dashboard-articles"];
const PANE_CLASSES = ["rss-reader-content", "inline-reader-content"];

describe("Reader bottom-bar clearance stylesheet", () => {
  // AC-003, DEC-006
  it("declares the clearance token once, in the plugin-wide :root block", () => {
    const declarations = clearanceDeclarations();

    expect(declarations).toHaveLength(1);
    expect(declarations[0].file).toBe("modals.css");
    expect(declarations[0].selector).toBe(":root");
    expect(declarations[0].value).toBe(CLEARANCE_VALUE);
    // AC-004: the token itself is not redefined behind the mobile gate.
    expect(declarations[0].medias).toEqual([]);
  });

  // AC-001, TEST-001
  it("reserves the clearance at the Reader pane's bottom at phone width", () => {
    const pane = resolve(READER, PHONE_WIDTH);

    expect(pane.get("padding-bottom")?.value).toBe(`var(${CLEARANCE})`);
    expect(pane.get("padding-bottom")?.medias).toEqual([GATE]);
    expect(pane.get("padding-top")?.value).toBe("5px");
    expect(pane.get("padding-right")?.value).toBe("5px");
    expect(pane.get("padding-left")?.value).toBe("5px");
  });

  // AC-002, TEST-002
  it("reserves the clearance at the inline pane's bottom and keeps its other sides", () => {
    const pane = resolve(INLINE_READER, PHONE_WIDTH);

    expect(pane.get("padding-bottom")?.value).toBe(`var(${CLEARANCE})`);
    expect(pane.get("padding-bottom")?.medias).toEqual([GATE]);
    expect(pane.get("padding-top")?.value).toBe("10px");
    expect(pane.get("padding-right")?.value).toBe("10px");
    expect(pane.get("padding-left")?.value).toBe("10px");
  });

  // AC-001, AC-002, AC-004, TEST-004
  it("leaves both panes' bottom padding at their base value above the gate", () => {
    expect(resolve(READER, DESKTOP_WIDTH).get("padding-bottom")?.value).toBe(
      "5px",
    );
    expect(
      resolve(INLINE_READER, DESKTOP_WIDTH).get("padding-bottom")?.value,
    ).toBe("10px");
    expect(
      resolve(ARTICLE_LIST, DESKTOP_WIDTH).get("padding-bottom")?.value,
    ).toBe("10px");
  });

  // AC-003, TEST-003
  it("has the article list consume the token while keeping its value and gate", () => {
    const list = resolve(ARTICLE_LIST, PHONE_WIDTH);

    expect(list.get("padding-bottom")?.value).toBe(`var(${CLEARANCE})`);
    expect(list.get("padding-bottom")?.medias).toEqual([GATE]);
    expect(list.get("padding-top")?.value).toBe("0");
    expect(list.get("padding-right")?.value).toBe("10px");
    expect(list.get("padding-left")?.value).toBe("10px");

    const articlesCss = readFileSync(
      path.join(stylesDir, "articles.css"),
      "utf-8",
    );
    expect(articlesCss).not.toMatch(/110px/);
  });

  // Fidelity guard for TEST-001/TEST-002: the resolver only models class-only
  // selectors, so a later rule such as `.theme-dark .inline-reader-content {
  // padding: ... }` would win in the browser while this test still passed.
  it("sees every rule that could override a pane's padding", () => {
    const unmodelled: string[] = [];
    for (const file of importOrder()) {
      const css = readFileSync(path.join(stylesDir, file), "utf-8");
      postcss.parse(css).walkRules((rule) => {
        let declaresPadding = false;
        rule.walkDecls((decl) => {
          if (PADDING_PROPS.has(decl.prop)) declaresPadding = true;
        });
        if (!declaresPadding) return;

        for (const selector of rule.selectors.map(normalize)) {
          // The subject is the rightmost compound selector: the pane is only
          // styled by a rule whose subject carries its class.
          const subject = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
          const last = subject[subject.length - 1] ?? "";
          const stylesPane = PANE_CLASSES.some((name) =>
            new RegExp(`\\.${name}(?![\\w-])`).test(last),
          );
          if (stylesPane && !classNames(selector)) {
            unmodelled.push(`${file}: ${selector}`);
          }
        }
      });
    }

    expect(unmodelled).toEqual([]);
  });

  // AC-005, TEST-005
  it("introduces no !important in the changed stylesheets", () => {
    for (const file of ["reader.css", "articles.css", "modals.css"]) {
      const css = readFileSync(path.join(stylesDir, file), "utf-8");
      expect(css, file).not.toMatch(/!important/);
    }
  });
});
