/**
 * Loads RSS Dashboard's real, production FreshRSS subscription OPML export
 * function (`generateFreshRssSubscriptionOpml` in
 * `src/services/freshrss-opml-export.ts`, ticket 09) for use by the live
 * FreshRSS Docker OPML round-trip scenario (ticket 12).
 *
 * This is the deliberate OPPOSITE choice from `greader-client.mjs`, and the
 * reasoning is worth stating explicitly: `greader-client.mjs` intentionally
 * does NOT reuse `src/services/freshrss-sync-client.ts` because the whole
 * point of that half of the contract is to check the plugin's *protocol
 * assumptions* against a real server independently of the plugin's own
 * request-building code. The OPML scenario is different -- its entire
 * purpose is to prove that the *actual production OPML generator's actual
 * output* imports correctly into a real FreshRSS instance. Re-implementing
 * `generateFreshRssSubscriptionOpml` here (the way `greader-client.mjs`
 * re-implements the protocol client) would test a second, hand-written OPML
 * generator against FreshRSS -- not RSS Dashboard's own export -- which is
 * not what the ticket asks the contract to prove.
 *
 * `src/services/freshrss-opml-export.ts` has no Obsidian runtime dependency
 * (it only reads plain fields off a `Feed`-shaped object and does string/XML
 * building), so esbuild can bundle+transpile it standalone. The compiled
 * output is written to `docker/freshrss-contract/.generated/` (git-ignored)
 * purely so it can be `import()`-ed as a real ES module; esbuild only strips
 * TypeScript types and bundles the one internal type-only import, it does
 * not change behavior.
 */

import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SOURCE_FILE = path.join(REPO_ROOT, "src", "services", "freshrss-opml-export.ts");
const OUT_DIR = path.join(__dirname, "..", ".generated");
const OUT_FILE = path.join(OUT_DIR, "freshrss-opml-export.bundle.mjs");

/** @type {Promise<typeof import("../../../src/services/freshrss-opml-export.js")> | null} */
let cachedModulePromise = null;

/**
 * Compiles (once per process, cached) and returns the real exports of
 * `src/services/freshrss-opml-export.ts` -- in practice
 * `generateFreshRssSubscriptionOpml` and `escapeFreshRssCategorySegment`.
 */
export function loadFreshRssOpmlExportModule() {
  if (!cachedModulePromise) {
    cachedModulePromise = (async () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const result = await esbuild.build({
        entryPoints: [SOURCE_FILE],
        outfile: OUT_FILE,
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node20",
        write: true,
        logLevel: "silent",
      });
      if (result.errors.length > 0) {
        throw new Error(
          `esbuild failed to compile ${SOURCE_FILE}: ${result.errors.map((e) => e.text).join("; ")}`,
        );
      }
      return import(pathToFileURL(OUT_FILE).href);
    })();
  }
  return cachedModulePromise;
}
