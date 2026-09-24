import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

// jsdom does not compute layout, so the reader's code-block presentation is
// asserted as a stylesheet contract: the declarations each selector must carry.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const readerCss = readFileSync(
  path.resolve(testDir, "../../../src/styles/reader.css"),
  "utf-8",
);

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  postcss.parse(readerCss).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => {
      declarations.set(
        decl.prop,
        decl.important ? `${decl.value} !important` : decl.value,
      );
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
      expect(pre.get("background-color")).toBeDefined();
      expect(pre.get("padding")).toBeDefined();
      expect(pre.get("border-radius")).toBeDefined();
      expect(pre.get("text-align")).toBe("left");
      expect(pre.get("line-height")).toBeDefined();
    },
  );

  it.each(CONTAINERS)(
    "keeps code nested in %s pre blocks from drawing a second box",
    (container) => {
      const nested = declarationsFor(`${container} pre code`);

      expect(nested.get("background-color")).toBe("transparent");
      expect(nested.get("padding")).toBe("0");
      expect(nested.get("border-radius")).toBe("0");
    },
  );

  it.each(CONTAINERS)(
    "shades inline code in %s prose",
    (container) => {
      const inline = declarationsFor(`${container} :not(pre) > code`);

      expect(inline.get("font-family")).toBe("var(--font-monospace)");
      expect(inline.get("background-color")).toBeDefined();
      expect(inline.get("padding")).toBeDefined();
      expect(inline.get("border-radius")).toBeDefined();
    },
  );

  it("styles code without !important declarations", () => {
    const selectors = CONTAINERS.flatMap((container) => [
      `${container} pre`,
      `${container} pre code`,
      `${container} :not(pre) > code`,
    ]);

    for (const selector of selectors) {
      for (const value of declarationsFor(selector).values()) {
        expect(value).not.toContain("!important");
      }
    }
  });
});
