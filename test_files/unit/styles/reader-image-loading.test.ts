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
  it("fades a revealed image in with an opacity animation", () => {
    const revealed = declarationsFor(
      readerCss,
      ".rss-reader-lazy-img.is-revealed",
    );

    expect(revealed.get("animation")).toMatch(/rss-reader-img-fade-in/);
    expect(readerCss).toMatch(
      /@keyframes rss-reader-img-fade-in\s*\{[^}]*from\s*\{\s*opacity:\s*0/,
    );
  });

  // AC8, AC9
  it("never hides a pending image with opacity, so the skeleton stays visible", () => {
    const base = declarationsFor(readerCss, ".rss-reader-lazy-img");
    const loading = declarationsFor(
      readerCss,
      ".rss-reader-lazy-img.is-loading",
    );

    expect(base.get("opacity")).toBeUndefined();
    expect(loading.get("opacity")).toBeUndefined();
    expect(loading.get("visibility")).toBeUndefined();
  });

  // AC9
  it("shows a visible skeleton sized by the reserved aspect ratio", () => {
    const skeleton = declarationsFor(
      readerCss,
      ".rss-reader-lazy-img.is-loading",
    );

    expect(skeleton.get("aspect-ratio")).toBe("var(--rss-img-ratio)");
    // An unloaded image has no intrinsic size and `width: auto` beats the
    // width attribute, so the skeleton needs an explicit width to get a height.
    expect(skeleton.get("width")).toBe("var(--rss-img-width, auto)");
    expect(skeleton.get("background")).toBe("var(--background-modifier-hover)");
    expect(skeleton.get("color")).toBe("transparent");
  });

  // AC10
  it("respects the reduced-motion preference for the image fade", () => {
    const reduced = declarationsFor(
      reducedMotionCss,
      ".rss-reader-lazy-img.is-revealed",
    );

    expect(reduced.get("animation-duration")).toBe("0.01ms");
  });

  // AC11
  it("adds no important declarations", () => {
    expect(readerCss).not.toMatch(/!important/);
  });
});
