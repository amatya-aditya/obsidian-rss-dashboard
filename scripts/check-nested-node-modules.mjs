// Guard: `node_modules/node_modules` must not exist (issue #1637).
//
// Runs as `npm run check:node-modules`, from `check:compliance`, so
// `npm run build`, the pre-commit hook, and CI all run it.
//
// A nested `node_modules` is a partial second install, usually left by an
// `npm install` or `npm ci` run through a worktree's `node_modules` junction.
// It puts a second copy of jsdom in play, and jsdom refuses to move a node
// between windows built by different copies. The cross-window unit tests then
// fail with `Failed to execute 'appendChild' on 'Node'`, which reads as a bug in
// the tests rather than in the install.
//
// Every worktree junctions its `node_modules` to the main checkout's, so the
// path is resolved through the junction and one stray copy shows up everywhere.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = join(import.meta.dirname, "..");

/**
 * Returns the nested `node_modules` paths under `rootDir`, or an empty array.
 *
 * @param {string} rootDir
 * @returns {string[]}
 */
export function findNestedNodeModules(rootDir) {
  const nested = join(rootDir, "node_modules", "node_modules");
  return existsSync(nested) ? [nested] : [];
}

/**
 * @param {string[]} nestedPaths
 * @returns {string}
 */
export function formatNestedNodeModulesMessage(nestedPaths) {
  return [
    ...nestedPaths.map((path) => `Nested node_modules found: ${path}`),
    "",
    "It is a partial second install. It loads a second copy of jsdom, and the",
    "cross-window unit tests then fail with \"Failed to execute 'appendChild' on",
    "'Node': parameter 1 is not of type 'Node'\".",
    "",
    "Delete the nested directory itself (not the node_modules junction above",
    "it). Do not run `npm install` or `npm ci` through a worktree's",
    "node_modules junction; see 'Worktree dependencies' in AGENTS.md.",
  ].join("\n");
}

function main() {
  const nestedPaths = findNestedNodeModules(ROOT_DIR);
  if (nestedPaths.length === 0) return;

  console.error(formatNestedNodeModulesMessage(nestedPaths));
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
