import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

const stylesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/styles",
);
const readerCss = readFileSync(path.join(stylesDir, "reader.css"), "utf-8");

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  postcss.parse(readerCss).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
    });
  });
  return declarations;
}

describe("Reader stylesheet - fetch status", () => {
  it("visually hides the status while preserving its accessibility-tree presence", () => {
    const status = declarationsFor(
      ".rss-reader-content .rss-reader-fetch-status",
    );

    expect(status.get("position")).toBe("absolute");
    expect(status.get("width")).toBe("1px");
    expect(status.get("height")).toBe("1px");
    expect(status.get("overflow")).toBe("hidden");
    expect(status.get("clip")).toBe("rect(0, 0, 0, 0)");
    expect(status.get("display")).not.toBe("none");
  });
});
