import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const readerCss = readFileSync(
  path.resolve(testDir, "../../../src/styles/reader.css"),
  "utf-8",
);

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  postcss.parse(readerCss).walkRules((rule) => {
    const normalizedSelectors = rule.selectors.map((value) =>
      value.replace(/\s+/g, " ").trim(),
    );
    if (!normalizedSelectors.includes(selector)) return;
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
    });
  });
  return declarations;
}

describe("Reader stylesheet formatting", () => {
  it.each([
    '.rss-reader-view[data-rss-reader-align="left"] .rss-reader-article-content',
    '.rss-reader-view[data-rss-reader-align="left"] .rss-reader-description-body',
    '.inline-reader-content[data-rss-reader-align="left"] .rss-reader-article-content',
    '.inline-reader-content[data-rss-reader-align="left"] .rss-reader-description-body',
  ])("left-aligns article prose through %s", (selector) => {
    expect(declarationsFor(selector).get("text-align")).toBe("left");
  });

  it.each([".rss-reader-article-content", ".rss-reader-description-body"])(
    "uses the selected line height and default alignment for %s in both Reader locations",
    (selector) => {
      const declarations = declarationsFor(selector);

      expect(declarations.get("line-height")).toBe(
        "var(--rss-reader-line-height)",
      );
      expect(declarations.get("text-align")).toBe("justify");
    },
  );
});
