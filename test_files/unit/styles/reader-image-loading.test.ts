import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

// jsdom does not compute layout, so the reader's image presentation is
// asserted as a stylesheet contract, like reader-code-blocks.test.ts.
const stylesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/styles",
);
const readerCss = readFileSync(path.join(stylesDir, "reader.css"), "utf-8");
const reducedMotionCss = readFileSync(
  path.join(stylesDir, "reduced-motion.css"),
  "utf-8",
);

function declarationsFor(css: string, selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
    });
  });
  return declarations;
}

describe("Reader stylesheet - image loading", () => {
  // AC7
  it("caps image height relative to the pane without distorting the image", () => {
    const img = declarationsFor(readerCss, ".rss-reader-lazy-img");

    expect(img.get("max-height")).toBe("min(60vh, 600px)");
    expect(img.get("max-width")).toBe("100%");
    expect(img.get("width")).toBe("auto");
    expect(img.get("height")).toBe("auto");
    expect(img.get("object-fit")).toBe("contain");
  });

  // AC8
  it("fades images in by transitioning opacity", () => {
    const img = declarationsFor(readerCss, ".rss-reader-lazy-img");

    expect(img.get("transition")).toMatch(/opacity/);
  });

  // AC8
  it("only hides an image while the script has marked it as loading", () => {
    const base = declarationsFor(readerCss, ".rss-reader-lazy-img");
    const loading = declarationsFor(
      readerCss,
      ".rss-reader-lazy-img.is-loading",
    );

    expect(base.get("opacity")).toBeUndefined();
    expect(loading.get("opacity")).toBe("0");
  });

  // AC9
  it("shows a skeleton placeholder sized by the reserved aspect ratio", () => {
    const skeleton = declarationsFor(
      readerCss,
      ".rss-reader-lazy-img.is-loading",
    );

    expect(skeleton.get("aspect-ratio")).toBe("var(--rss-img-ratio)");
  });

  // AC10
  it("respects the reduced-motion preference for the image fade", () => {
    const reduced = declarationsFor(reducedMotionCss, ".rss-reader-lazy-img");

    expect(reduced.get("transition-duration")).toBe("0.01ms");
  });

  // AC11
  it("adds no important declarations", () => {
    expect(readerCss).not.toMatch(/!important/);
  });
});
