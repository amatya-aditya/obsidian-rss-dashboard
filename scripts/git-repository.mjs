import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Whether `dir` is the root of a git checkout. A linked worktree has a `.git`
 * file rather than a folder, so this only tests that the entry exists.
 */
export function isGitCheckout(dir) {
  return existsSync(join(dir, ".git"));
}

/**
 * Tells the reader why a check that needs git did nothing. A source archive or
 * a clean-environment build, such as the community directory scanner's, has no
 * `.git`, and `npm run build` must still complete there. The checks stay
 * enforced wherever git exists: the pre-commit hook and CI.
 */
export function skipWithoutGit(checkName) {
  console.log(`${checkName}: not a git checkout, so this check is skipped.`);
}
