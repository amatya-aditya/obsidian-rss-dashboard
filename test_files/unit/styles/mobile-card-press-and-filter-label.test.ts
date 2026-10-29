import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string): string =>
  readFileSync(path.resolve(testDir, "../../../src/styles", file), "utf-8");

function declarationsFor(
  css: string,
  matches: (selector: string) => boolean,
): postcss.Declaration[] {
  const found: postcss.Declaration[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (!matches(rule.selector)) return;
    rule.walkDecls((decl) => {
      found.push(decl);
    });
  });
  return found;
}

describe("article card press feedback (#1703)", () => {
  it("applies no transform to a card while it is pressed", () => {
    const transforms = declarationsFor(
      read("card-view.css"),
      (selector) =>
        selector.includes(".rss-dashboard-article-card:active") ||
        selector.includes(".rss-dashboard-article-card:active "),
    ).filter((decl) => decl.prop === "transform");

    expect(transforms).toEqual([]);
  });
});

describe("filter status bar label (#1704)", () => {
  it("hides the label only at mobile widths", () => {
    let hiddenAtMobile = false;
    let hiddenOutsideMobile = false;
    postcss.parse(read("controls.css")).walkRules((rule) => {
      if (!rule.selector.includes("rss-dashboard-viewing-filter-stats-label"))
        return;
      let hides = false;
      rule.walkDecls("display", (decl) => {
        if (decl.value === "none") hides = true;
      });
      if (!hides) return;
      const parent = rule.parent;
      if (
        parent?.type === "atrule" &&
        (parent as postcss.AtRule).params === "(max-width: 768px)"
      ) {
        hiddenAtMobile = true;
      } else {
        hiddenOutsideMobile = true;
      }
    });

    expect(hiddenAtMobile).toBe(true);
    expect(hiddenOutsideMobile).toBe(false);
  });
});
