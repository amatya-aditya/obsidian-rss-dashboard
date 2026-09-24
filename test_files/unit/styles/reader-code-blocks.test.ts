import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

// jsdom does not compute layout or cascade, so the reader's code-block
// presentation is asserted as a stylesheet contract: the declarations that
// reach an element matching each selector, later rules overriding earlier ones.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const readerCss = readFileSync(
  path.resolve(testDir, "../../../src/styles/reader.css"),
  "utf-8",
);

function declarationsFor(...selectors: string[]): Map<string, string> {
  const declarations = new Map<string, string>();
  postcss.parse(readerCss).walkRules((rule) => {
    if (!rule.selectors.some((selector) => selectors.includes(selector))) {
      return;
    }
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
    });
  });
  return declarations;
}

const CONTAINERS = [
  ".rss-reader-article-content",
  ".rss-reader-description-body",
];

describe("Reader stylesheet - code blocks", () => {
  it.each(CONTAINERS)(
    "wraps long or collapsed lines in %s pre blocks instead of clipping them",
    (container) => {
      const pre = declarationsFor(`${container} pre`);

      expect(pre.get("white-space")).toBe("pre-wrap");
      expect(pre.get("overflow-wrap")).toBe("anywhere");
      expect(pre.get("overflow-x")).toBe("auto");
      expect(pre.get("max-width")).toBe("100%");
    },
  );

  it.each(CONTAINERS)(
    "presents %s pre blocks as a left-aligned monospace box",
    (container) => {
      const pre = declarationsFor(`${container} pre`);

      expect(pre.get("font-family")).toBe("var(--font-monospace)");
      expect(pre.get("background-color")).toBe("var(--code-background)");
      expect(pre.get("border-radius")).toBe("var(--code-radius)");
      expect(pre.get("text-align")).toBe("left");
      // A fixed value, not the prose line-height setting the reader inherits.
      expect(pre.get("line-height")).toBe("1.5");
    },
  );

  it.each(CONTAINERS)(
    "shades inline code in %s prose, including code outside a paragraph",
    (container) => {
      const inline = declarationsFor(`${container} code`);

      expect(inline.get("font-family")).toBe("var(--font-monospace)");
      expect(inline.get("background-color")).toBe("var(--code-background)");
      expect(inline.get("border-radius")).toBe("var(--code-radius)");
      expect(inline.get("padding")).toBe("0.1em 0.3em");
    },
  );

  it.each(CONTAINERS)(
    "keeps code at any depth in %s pre blocks from drawing a second box",
    (container) => {
      // The reset must come after the inline rule so it wins at equal specificity.
      const nested = declarationsFor(`${container} code`, `${container} pre code`);

      expect(nested.get("background-color")).toBe("transparent");
      expect(nested.get("padding")).toBe("0");
      expect(nested.get("border-radius")).toBe("0");
      expect(nested.get("font-size")).toBe("inherit");
    },
  );
});
