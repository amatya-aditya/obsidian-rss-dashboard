import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const stylesheetPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/styles/reader-lightbox.css",
);
const stylesheet = readFileSync(stylesheetPath, "utf-8");

describe("Reader lightbox image fallback", () => {
  it("removes blur and scale from the preview when the full image fails", () => {
    const fallback = new Map<string, string>();
    postcss.parse(stylesheet).walkRules((rule) => {
      if (
        !rule.selectors.includes(".rss-reader-lightbox-preview-img.is-fallback")
      ) {
        return;
      }
      rule.walkDecls((decl) => {
        fallback.set(decl.prop, decl.value);
      });
    });

    expect(fallback.get("filter")).toBe("none");
    expect(fallback.get("transform")).toBe("none");
  });
});
