import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  path.resolve(testDir, "../../../src/styles/modals.css"),
  "utf-8",
);

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();

  postcss.parse(css).walkRules((rule) => {
    const selectors = rule.selectors.map((candidate) =>
      candidate.replace(/\s+/g, " ").trim(),
    );
    if (!selectors.includes(selector)) {
      return;
    }
    // Rules inside a media query are not the base layout.
    if (rule.parent?.type === "atrule") {
      return;
    }
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });

  return declarations;
}

describe("FreshRSS sync modal layout", () => {
  it("pins the status line and buttons to the bottom of the scrolling preview", () => {
    const footer = declarationsFor(
      ".rss-freshrss-sync-modal .rss-freshrss-sync-footer",
    );

    expect(footer.get("position")).toBe("sticky");
    // Opaque, so the preview does not show through behind the buttons.
    expect(footer.get("background")).toMatch(/var\(--/);
  });

  it("reaches over the content area's bottom padding so no list text shows beneath the footer", () => {
    const footer = declarationsFor(
      ".rss-freshrss-sync-modal .rss-freshrss-sync-footer",
    );
    const padding = footer.get("padding-bottom");

    // The offset below the scroll area equals the padding added back inside.
    expect(padding).toMatch(/^var\(--size-4-4, 16px\)$/);
    expect(footer.get("bottom")).toBe(`calc(-1 * ${padding})`);
  });

  it("wraps long URLs in the incoming preview instead of clipping them", () => {
    const preview = declarationsFor(
      ".rss-freshrss-sync-modal .rss-freshrss-sync-preview",
    );

    expect(preview.get("overflow-wrap")).toBe("anywhere");
  });

  it("adds no !important to the FreshRSS sync modal rules", () => {
    const important: string[] = [];
    postcss.parse(css).walkRules((rule) => {
      if (!rule.selector.includes("rss-freshrss-sync")) return;
      rule.walkDecls((declaration) => {
        if (declaration.important) {
          important.push(`${rule.selector} { ${declaration.prop} }`);
        }
      });
    });

    expect(important).toEqual([]);
  });
});
