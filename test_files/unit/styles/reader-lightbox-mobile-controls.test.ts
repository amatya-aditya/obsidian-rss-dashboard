import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom does not run the cascade or media queries, so where the lightbox
// controls sit on a touch device is asserted as a stylesheet contract, like
// reader-bottom-bar-clearance.test.ts. On iPhone the status bar and Dynamic
// Island cover a toolbar pinned to the top edge (#1722).
const testDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  path.resolve(testDir, "../../../src/styles/reader-lightbox.css"),
  "utf-8",
);
const root = postcss.parse(css);

const TOUCH_GATE = "(hover: none) and (pointer: coarse)";

function declarations(
  selector: string,
  scope: "base" | "touch",
): Map<string, string> {
  const found = new Map<string, string>();
  root.walkRules((rule) => {
    if (
      !rule.selectors
        .map((s) => s.replace(/\s+/g, " ").trim())
        .includes(selector)
    )
      return;
    const parent = rule.parent;
    const inTouch =
      parent?.type === "atrule" &&
      (parent as postcss.AtRule).name === "media" &&
      (parent as postcss.AtRule).params.trim() === TOUCH_GATE;
    if ((scope === "touch") !== inTouch) return;
    rule.walkDecls((decl) => {
      found.set(decl.prop, decl.value.replace(/\s+/g, " ").trim());
    });
  });
  return found;
}

describe("Reader lightbox controls on a touch device (#1722)", () => {
  // AC-004
  it("keeps the toolbar pinned to the top edge outside the touch gate", () => {
    const toolbar = declarations(".rss-reader-lightbox-toolbar", "base");

    expect(toolbar.get("top")).toBe("0");
    expect(toolbar.get("bottom")).toBeUndefined();
  });

  // AC-001
  it("moves the toolbar from the top edge to the bottom edge", () => {
    const toolbar = declarations(".rss-reader-lightbox-toolbar", "touch");

    expect(toolbar.get("top")).toBe("auto");
    expect(toolbar.get("bottom")).toBe("0");
    expect(toolbar.get("height")).toBe("auto");
  });

  // AC-002
  it("pads the bottom bar by the home-indicator inset", () => {
    const toolbar = declarations(".rss-reader-lightbox-toolbar", "touch");

    expect(toolbar.get("padding")).toContain("env(safe-area-inset-bottom");
  });

  // AC-001
  it("pins the close button to the bar's corner and centres the other controls", () => {
    const end = declarations(".rss-reader-lightbox-toolbar-end", "touch");
    const close = declarations(
      ".rss-reader-lightbox-btn.rss-reader-lightbox-btn-close",
      "touch",
    );

    expect(end.get("justify-content")).toBe("center");
    expect(close.get("position")).toBe("absolute");
    expect(close.get("right")).toBeDefined();
    expect(close.get("bottom")).toContain("env(safe-area-inset-bottom");
  });

  // AC-001
  it("lets the link pill take the bar's width and hides the empty start section", () => {
    const pill = declarations(
      ".rss-reader-lightbox-btn.rss-reader-lightbox-external-link",
      "touch",
    );
    const emptyStart = declarations(
      ".rss-reader-lightbox-toolbar-start:empty",
      "touch",
    );

    expect(pill.get("max-width")).toBe("100%");
    expect(emptyStart.get("display")).toBe("none");
  });

  // AC-003
  it("lifts the caption above the bar, higher when the link pill adds a row", () => {
    const caption = declarations(".rss-reader-lightbox-caption", "touch");
    const captionWithLink = declarations(
      ".rss-reader-lightbox-backdrop:has(.rss-reader-lightbox-external-link) .rss-reader-lightbox-caption",
      "touch",
    );

    expect(caption.get("bottom")).toContain("env(safe-area-inset-bottom");
    expect(captionWithLink.get("bottom")).toContain(
      "env(safe-area-inset-bottom",
    );
    expect(captionWithLink.get("bottom")).not.toBe(caption.get("bottom"));
  });

  it("adds no !important", () => {
    expect(css).not.toMatch(/!important/);
  });
});
