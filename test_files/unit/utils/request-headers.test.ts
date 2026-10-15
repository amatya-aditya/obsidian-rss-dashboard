import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FEED_ACCEPT,
  JSON_ACCEPT,
  PAGE_ACCEPT,
  feedRequestHeaders,
  jsonRequestHeaders,
  pageRequestHeaders,
} from "../../../src/utils/request-headers";

/**
 * The User-Agent policy settled in #1162, extending #1109: no outbound request
 * identifies itself as a browser. A request that claims `Chrome/…` without the
 * matching `sec-ch-ua`, `sec-ch-ua-mobile` and `sec-ch-ua-platform` headers is
 * read as a bot signal by anti-bot filters, which answer 403 for an address a
 * browser loads normally — while the same address served an unoverridden
 * request passes.
 *
 * `src/utils/request-headers.ts` is the one place that policy lives, so this
 * file checks both halves: the header sets it hands out, and that no
 * production module hard-codes a User-Agent of its own again.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

/** Every `src/**\/*.ts` file, as repository-relative slash-separated paths. */
function productionFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts")) {
        found.push(path.relative(repoRoot, full).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(repoRoot, "src"));
  return found;
}

/** A header key written as a string literal, e.g. `"User-Agent": …`. */
const USER_AGENT_KEY = /["'`]user-agent["'`]\s*:/i;

function headerNames(headers: Record<string, string>): string[] {
  return Object.keys(headers).map((name) => name.toLowerCase());
}

describe("the request header policy", () => {
  it("sends no User-Agent with a feed request", () => {
    expect(headerNames(feedRequestHeaders())).not.toContain("user-agent");
  });

  it("sends no User-Agent with a page request", () => {
    expect(headerNames(pageRequestHeaders())).not.toContain("user-agent");
  });

  it("sends no User-Agent with a JSON request", () => {
    expect(headerNames(jsonRequestHeaders())).not.toContain("user-agent");
  });

  it("asks for feeds, pages and JSON by their documented Accept values", () => {
    expect(feedRequestHeaders()).toEqual({ Accept: FEED_ACCEPT });
    expect(pageRequestHeaders()).toEqual({ Accept: PAGE_ACCEPT });
    expect(jsonRequestHeaders()).toEqual({ Accept: JSON_ACCEPT });
  });

  it("returns a fresh header object per call, so a caller cannot alter the policy", () => {
    const headers = feedRequestHeaders();
    headers.Accept = "changed";
    expect(feedRequestHeaders()).toEqual({ Accept: FEED_ACCEPT });
  });

  it("hard-codes no User-Agent in production code", () => {
    const offenders = productionFiles().filter((file) =>
      USER_AGENT_KEY.test(readFileSync(path.join(repoRoot, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
