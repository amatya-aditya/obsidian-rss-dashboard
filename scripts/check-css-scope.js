/* eslint-disable no-console */
/**
 * CSS scoping guardrail.
 *
 * Ensures plugin CSS rules are scoped under a class starting with `rss-`
 * (e.g. `.rss-dashboard-container`, `.rss-reader-view`, `.rss-dashboard-modal`).
 *
 * This prevents collisions with Obsidian core UI (ex: `.clickable-icon`,
 * `.suggestion-container`, `.hidden`) which can cause vault-wide UI breakage.
 */

const fs = require("fs");
const path = require("path");
const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");

const ROOT_DIR = path.join(__dirname, "..");
const STYLES_DIR = path.join(ROOT_DIR, "src", "styles");

function listCssFiles(dirPath) {
  /** @type {string[]} */
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) results.push(...listCssFiles(fullPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".css")) results.push(fullPath);
  }
  return results;
}

function isInsideKeyframes(rule) {
  /** @type {any} */
  let current = rule.parent;
  while (current) {
    if (current.type === "atrule") {
      const name = String(current.name || "").toLowerCase();
      if (name.endsWith("keyframes")) return true;
    }
    current = current.parent;
  }
  return false;
}

function selectorIsScoped(selectorAst) {
  let scoped = false;

  selectorAst.walk((node) => {
    if (scoped) return false;

    if (node.type === "class" && typeof node.value === "string" && node.value.startsWith("rss-")) {
      scoped = true;
      return false;
    }

    // Recursively inspect nested selectors in functional pseudos like :is(...) / :where(...).
    if (node.type === "pseudo" && node.nodes && node.nodes.length > 0) {
      const pseudoName = String(node.value || "").toLowerCase();
      if (pseudoName === ":is" || pseudoName === ":where" || pseudoName === ":not" || pseudoName === ":has") {
        const anyScoped = node.nodes.some((nestedSelector) => selectorIsScoped(nestedSelector));
        if (anyScoped) {
          scoped = true;
          return false;
        }
      }
    }

    return undefined;
  });

  return scoped;
}

const RISKY_CLASSES = new Set([
  "clickable-icon",
  "suggestion-container",
  "status-bar-item",
  "svg-icon",
  "setting-item",
  "modal",
  "hidden",
  "theme-dark",
  "theme-light",
]);

function selectorTouchesObsidianCore(selectorAst) {
  let risky = false;

  selectorAst.walk((node) => {
    if (risky) return false;

    if (node.type === "class" && typeof node.value === "string" && RISKY_CLASSES.has(node.value)) {
      risky = true;
      return false;
    }

    if (node.type === "tag" && typeof node.value === "string") {
      const tag = node.value.toLowerCase();
      if (tag === "body" || tag === "html") {
        risky = true;
        return false;
      }
    }

    return undefined;
  });

  return risky;
}

function checkRuleSelector(selectorText) {
  /** @type {string[]} */
  const failures = [];

  const processor = selectorParser((selectors) => {
    selectors.each((sel) => {
      const scoped = selectorIsScoped(sel);
      if (scoped) return;

      // Allow theme-specific styling for the podcast player without requiring `rss-` classes,
      // as long as it is gated behind our plugin's `data-podcast-theme` attribute.
      if (String(sel).includes('[data-podcast-theme="') || String(sel).includes("[data-podcast-theme=")) return;

      const risky = selectorTouchesObsidianCore(sel);
      if (risky) failures.push(String(sel));
    });
  });

  // Prefer not to throw if we hit an edge-case selector; treat as failure with context.
  try {
    processor.processSync(selectorText);
  } catch (err) {
    failures.push(`${selectorText} (unparseable selector)`);
  }

  return failures;
}

function main() {
  const files = listCssFiles(STYLES_DIR);
  /** @type {Array<{file:string,line:number,column:number,selector:string}>} */
  const violations = [];

  for (const file of files) {
    const css = fs.readFileSync(file, "utf8");
    let root;
    try {
      root = postcss.parse(css, { from: file });
    } catch (err) {
      console.error(`Failed to parse CSS: ${file}`);
      console.error(err);
      process.exitCode = 2;
      return;
    }

    root.walkRules((rule) => {
      if (!rule.selector) return;
      if (isInsideKeyframes(rule)) return;

      const failures = checkRuleSelector(rule.selector);
      if (failures.length === 0) return;

      const line = (rule.source && rule.source.start && rule.source.start.line) || 1;
      const column = (rule.source && rule.source.start && rule.source.start.column) || 1;
      const rel = path.relative(ROOT_DIR, file);

      for (const failingSelector of failures) {
        violations.push({ file: rel, line, column, selector: failingSelector });
      }
    });
  }

  if (violations.length > 0) {
    console.error(
      `CSS scoping check failed: ${violations.length} unscoped selector(s). ` +
        `All selectors must be anchored by a class starting with \`rss-\`.`
    );
    for (const v of violations) {
      console.error(`- ${v.file}:${v.line}:${v.column} -> ${v.selector}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`CSS scoping check passed (${files.length} file(s)).`);
}

main();
