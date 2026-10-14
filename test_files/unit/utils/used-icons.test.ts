import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ts from "typescript";
import { renderIconMarkup } from "../../stubs/lucide-icons";

/**
 * Guards that every lucide icon id the production code names is carried by the
 * test stub, so a `setIcon` call that would render nothing in tests (and in the
 * app, for a name Obsidian does not ship) is caught by CI instead of by eye
 * (ADR 0014).
 *
 * Icon ids reach the renderer in a few shapes, so this reads the TypeScript AST
 * for a fixed list of "sinks" — helper calls with the icon argument position,
 * `*.setIcon` method calls, and `icon`/`lucideIcon` properties. When a new
 * helper that takes an icon is introduced, add it to `CALL_SINKS`; formatting
 * does not matter because the scan is on the AST, not the text.
 */

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, "../../../src");

/** Helper calls that take an icon id, mapped to the argument index it sits at. */
const CALL_SINKS: Readonly<Record<string, number>> = {
  setIcon: 1,
  addRibbonIcon: 0,
  addActionButtonContent: 1,
  createSelector: 1,
  makeButton: 1,
  createNewTagsActionButton: 2,
  createHeaderNavButton: 4,
};

/** Methods that take an icon id as their first argument. */
const METHOD_SINKS: Readonly<Record<string, number>> = {
  setIcon: 0,
};

/** Object properties whose string value is an icon id. */
const PROPERTY_SINKS = new Set(["icon", "lucideIcon"]);

/** Suffix of an identifier that maps names to icon ids, e.g. `SIDEBAR_ICONS`. */
const ICON_MAP_SUFFIX = "ICONS";

/** An object literal that maps names to icon ids, e.g. a view-style map. */
const ICON_MAP = new RegExp(`${ICON_MAP_SUFFIX}$`);

/** Every name `iconIdsIn` treats as naming an icon id. */
const ICON_SINK_NAMES: readonly string[] = [
  ...Object.keys(CALL_SINKS),
  ...Object.keys(METHOD_SINKS),
  ...PROPERTY_SINKS,
];

/**
 * Cheap substring prefilter. Every shape `iconIdsIn` recognizes contains one of
 * these tokens verbatim, so a file that contains none cannot name an icon id
 * and its AST parse is skipped. Derived from the sink vocabulary so a new sink
 * cannot silently fall out of the prefilter. The scan is CPU-bound and runs
 * inside one default-timeout test, so skipping the files that name no icon
 * keeps it clear of the 5 s limit under full-suite load (#1104).
 */
const SINK_TOKENS: readonly string[] = [...ICON_SINK_NAMES, ICON_MAP_SUFFIX];

/** Whether `text` could name an icon id, so the AST scan is worth running. */
function mayNameIcon(text: string): boolean {
  return SINK_TOKENS.some((token) => text.includes(token));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

function stringLiteralText(node: ts.Node | undefined): string | undefined {
  return node && ts.isStringLiteral(node) ? node.text : undefined;
}

function iconIdsIn(text: string): string[] {
  const found: string[] = [];
  const source = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest);

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isMethod = ts.isPropertyAccessExpression(callee);
      const name = ts.isIdentifier(callee)
        ? callee.text
        : isMethod
          ? callee.name.text
          : undefined;
      const index =
        name === undefined
          ? undefined
          : isMethod
            ? (METHOD_SINKS[name] ?? CALL_SINKS[name])
            : CALL_SINKS[name];
      if (index !== undefined) {
        const value = stringLiteralText(node.arguments[index]);
        if (value !== undefined) found.push(value);
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const propertyName =
        ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
          ? node.name.text
          : undefined;
      if (propertyName !== undefined && PROPERTY_SINKS.has(propertyName)) {
        const value = stringLiteralText(node.initializer);
        if (value !== undefined) found.push(value);
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ICON_MAP.test(node.name.text) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property)) {
          const value = stringLiteralText(property.initializer);
          if (value !== undefined) found.push(value);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

describe("icon-id prefilter", () => {
  // Sources the AST scan names an icon id in, paired with the id it must find.
  // The prefilter must accept every one: a false negative here would silently
  // drop a file from the guard without failing it (#1104).
  const NAMED: ReadonlyArray<readonly [string, string]> = [
    ['setIcon(el, "play");', "play"],
    ['el.setIcon("play");', "play"],
    ['addRibbonIcon("play", "Play");', "play"],
    ['createSelector(el, "play");', "play"],
    ['makeButton(el, "play");', "play"],
    ['createNewTagsActionButton(a, b, "play");', "play"],
    ['createHeaderNavButton(a, b, c, d, "play");', "play"],
    ['const o = { icon: "play" };', "play"],
    ['const o = { lucideIcon: "play" };', "play"],
    ['const FOO_ICONS = { a: "play" };', "play"],
  ];

  it("keeps a file whose text names an icon through any sink", () => {
    for (const [source, id] of NAMED) {
      expect(mayNameIcon(source)).toBe(true);
      expect(iconIdsIn(source)).toContain(id);
    }
  });

  it("skips a file whose text names no icon sink", () => {
    expect(mayNameIcon("const total = items.length;")).toBe(false);
  });

  it("keeps the prefilter in step with the sink vocabulary", () => {
    for (const name of ICON_SINK_NAMES) {
      expect(mayNameIcon(name)).toBe(true);
    }
  });
});

describe("production icon ids", () => {
  it("are all carried by the Obsidian test stub", () => {
    const missing: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const text = readFileSync(file, "utf-8");
      if (!mayNameIcon(text)) continue;
      const relative = path.relative(srcDir, file).split(path.sep).join("/");
      for (const name of iconIdsIn(text)) {
        if (renderIconMarkup(name) === "") {
          missing.push(`${relative}: "${name}"`);
        }
      }
    }

    // Array order is stable (files are walked in directory order), so the
    // failure lists each offending file and icon id.
    expect(missing).toEqual([]);
  });
});
