// Guard: every lucide icon id the production code names is carried by the
// Obsidian test stub (ADR 0014).
//
// Runs as `npm run check:icons`, from `check:compliance`, so `npm run build`,
// the pre-commit hook, and CI all run it.
//
// Why a check script and not a unit test: the scan reads and TypeScript-parses
// every file under `src/` (270 files, ~470 ms idle on a 16-core machine). As a
// unit test that work was measured against Vitest's default 5000 ms per-test
// timeout, and under full-suite load with `--coverage` the same work took
// 4.5-6.4 s, so it failed intermittently (issue #1104; the file-skipping
// prefilter added in #1121 lowered the cost but could not close a
// load-dependent gap). A check script has no per-test budget, and it also runs
// where no test runner is installed.
//
// Icon ids reach the renderer in a few shapes, so this reads the TypeScript AST
// for a fixed list of "sinks" - helper calls with the icon argument position,
// `*.setIcon` method calls, and `icon`/`lucideIcon` properties, plus an
// `ICONS`-suffixed object-literal map. When a new helper that takes an icon is
// introduced, add it to `CALL_SINKS`; formatting does not matter because the
// scan is on the AST, not the text.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT_DIR = join(import.meta.dirname, "..");
export const DEFAULT_SRC_DIR = join(ROOT_DIR, "src");
export const DEFAULT_STUB_PATH = join(
  ROOT_DIR,
  "test_files",
  "stubs",
  "lucide-icons.ts",
);

const USAGE = `Check that every lucide icon id the production code names is carried by the
Obsidian test stub (ADR 0014).

Exits 0 when every id is carried; exits non-zero, naming each offending file
and id, when one is not.

Usage: npm run check:icons -- [options]

Options:
  --src <dir>    Directory to scan. Default:
                 ${relative(ROOT_DIR, DEFAULT_SRC_DIR).replace(/\\/g, "/")}.
  --stub <file>  Icon stub to read. Default:
                 ${relative(ROOT_DIR, DEFAULT_STUB_PATH).replace(/\\/g, "/")}.
  -h, --help     Show this help.`;

/** Helper calls that take an icon id, mapped to the argument index it sits at. */
export const CALL_SINKS = {
  setIcon: 1,
  addRibbonIcon: 0,
  addActionButtonContent: 1,
  createSelector: 1,
  makeButton: 1,
  createNewTagsActionButton: 2,
  createHeaderNavButton: 4,
};

/** Methods that take an icon id as their first argument. */
export const METHOD_SINKS = {
  setIcon: 0,
};

/** Object properties whose string value is an icon id. */
export const PROPERTY_SINKS = new Set(["icon", "lucideIcon"]);

/** Suffix of an identifier that maps names to icon ids, e.g. `SIDEBAR_ICONS`. */
export const ICON_MAP_SUFFIX = "ICONS";

/** An object literal that maps names to icon ids, e.g. a view-style map. */
const ICON_MAP = new RegExp(`${ICON_MAP_SUFFIX}$`);

/** Every name this scan treats as naming an icon id. */
export const ICON_SINK_NAMES = [
  ...Object.keys(CALL_SINKS),
  ...Object.keys(METHOD_SINKS),
  ...PROPERTY_SINKS,
];

/**
 * Cheap substring prefilter. Every shape the AST visitor recognizes contains
 * one of these tokens verbatim, so a file that contains none cannot name an
 * icon id and its AST parse is skipped. Derived from the sink vocabulary so a
 * new sink cannot silently fall out of the prefilter.
 */
export const SINK_TOKENS = [...ICON_SINK_NAMES, ICON_MAP_SUFFIX];

/** Whether `text` could name an icon id, so the AST scan is worth running. */
export function mayNameIcon(text) {
  return SINK_TOKENS.some((token) => text.includes(token));
}

/** Every `.ts` file under `dir`, in directory-walk order. */
export function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

function stringLiteralText(node) {
  return node && ts.isStringLiteral(node) ? node.text : undefined;
}

/** The icon ids `text` names, in source order. */
export function iconIdsIn(text) {
  const found = [];
  const source = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest);

  const visit = (node) => {
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

/** The string-valued property name/value pairs of the object literal `name` holds. */
function namedObjectProperties(sourceFile, name) {
  let literal;
  const visit = (node) => {
    if (literal) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      literal = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const properties = new Map();
  if (!literal) return properties;
  for (const property of literal.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : undefined;
    const value = stringLiteralText(property.initializer);
    if (key !== undefined && value !== undefined) properties.set(key, value);
  }
  return properties;
}

/**
 * What the stub carries: `bodies` is the set of ids in `ICON_BODIES`, and
 * `aliases` maps every `ICON_ALIASES` name to the id it resolves to. An empty
 * `bodies` (a renamed map, an unreadable stub) fails the check loudly rather
 * than passing it quietly.
 */
export function readIconStub(sourceText) {
  const sourceFile = ts.createSourceFile(
    "lucide-icons.ts",
    sourceText,
    ts.ScriptTarget.Latest,
  );
  return {
    bodies: new Set(namedObjectProperties(sourceFile, "ICON_BODIES").keys()),
    aliases: namedObjectProperties(sourceFile, "ICON_ALIASES"),
  };
}

/**
 * Whether the stub renders markup for `iconName`. This mirrors
 * `renderIconMarkup` in `test_files/stubs/lucide-icons.ts`;
 * `test_files/unit/check-icons.test.ts` pins the two together, so a change to
 * the stub's resolution fails there instead of diverging here silently.
 */
export function isIconCarried(iconName, stub) {
  const id = stub.aliases.get(iconName) ?? `lucide-${iconName}`;
  return stub.bodies.has(id);
}

/** Every `{ file, id }` the files under `srcDir` name, in walk order. */
export function iconIdsUsedBySource(srcDir = DEFAULT_SRC_DIR) {
  const used = [];
  for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, "utf8");
    if (!mayNameIcon(text)) continue;
    for (const id of iconIdsIn(text)) used.push({ file, id });
  }
  return used;
}

/** The ids under `srcDir` the stub does not carry, each with the file naming it. */
export function scanIconStub({
  srcDir = DEFAULT_SRC_DIR,
  stubPath = DEFAULT_STUB_PATH,
  stubSource,
} = {}) {
  const used = iconIdsUsedBySource(srcDir);
  const stub = readIconStub(stubSource ?? readFileSync(stubPath, "utf8"));
  return { used, missing: used.filter(({ id }) => !isIconCarried(id, stub)) };
}

/** Runs the check end to end and returns the process exit code. */
export function runIconCheck({
  srcDir = DEFAULT_SRC_DIR,
  stubPath = DEFAULT_STUB_PATH,
  log = console.log,
  error = console.error,
} = {}) {
  const { used, missing } = scanIconStub({ srcDir, stubPath });
  const scanned = relative(ROOT_DIR, srcDir).split(sep).join("/") || srcDir;
  const stubName =
    relative(ROOT_DIR, stubPath).split(sep).join("/") || stubPath;

  if (missing.length > 0) {
    error(
      `Icon stub check failed: ${missing.length} icon id(s) named in ${scanned} ` +
        `are not carried by ${stubName}. Add each id to the stub, or use an ` +
        `icon id Obsidian ships.`,
    );
    for (const { file, id } of missing) {
      error(`  ${relative(ROOT_DIR, file).split(sep).join("/")}: "${id}"`);
    }
    return 1;
  }

  log(
    `Icon stub check passed: all ${used.length} icon id(s) named in ${scanned} ` +
      `are carried by the stub.`,
  );
  return 0;
}

function readValue(arg, next) {
  const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : next();
  if (value === undefined || value === "" || value.startsWith("--")) {
    throw new Error(`Option "${arg.split("=")[0]}" needs a value.`);
  }
  return value;
}

export function parseArgs(argv) {
  const options = {
    srcDir: DEFAULT_SRC_DIR,
    stubPath: DEFAULT_STUB_PATH,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--src" || arg.startsWith("--src=")) {
      options.srcDir = resolve(readValue(arg, () => argv[++i]));
    } else if (arg === "--stub" || arg.startsWith("--stub=")) {
      options.stubPath = resolve(readValue(arg, () => argv[++i]));
    } else {
      throw new Error(`Unknown option "${arg}".\n\n${USAGE}`);
    }
  }

  return options;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  try {
    process.exitCode = runIconCheck(options);
  } catch (error) {
    console.error(
      `check:icons failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
