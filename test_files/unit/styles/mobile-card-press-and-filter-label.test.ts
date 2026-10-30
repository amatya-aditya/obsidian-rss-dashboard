import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string): string =>
  readFileSync(path.resolve(testDir, "../../../src/styles", file), "utf-8");

describe("article card press feedback (#1703, #1727)", () => {
  const pressRules = (): postcss.Rule[] => {
    const found: postcss.Rule[] = [];
    postcss.parse(read("card-view.css")).walkRules((rule) => {
      if (rule.selector.includes(".rss-dashboard-article-card:active")) {
        found.push(rule);
      }
    });
    return found;
  };

  const atRuleParams = (rule: postcss.Rule): string[] => {
    const params: string[] = [];
    let node: postcss.Container | postcss.Document | undefined = rule.parent;
    while (node && node.type === "atrule") {
      params.push((node as postcss.AtRule).params);
      node = node.parent;
    }
    return params;
  };

  it("scales a pressed card only behind the setting's root class", () => {
    const scaled = pressRules().filter((rule) =>
      rule.some((n) => n.type === "decl" && n.prop === "transform"),
    );

    expect(scaled).toHaveLength(1);
    expect(scaled[0].selector).toContain(".rss-dashboard-card-press-scale");
    expect(
      scaled[0].nodes.find((n) => n.type === "decl" && n.prop === "transform"),
    ).toMatchObject({ value: "scale(0.98)" });
  });

  it("scales only on touch devices that have not asked for reduced motion", () => {
    const [rule] = pressRules();
    const params = atRuleParams(rule).join(" | ");

    expect(params).toContain("(hover: none)");
    expect(params).toContain("(prefers-reduced-motion: no-preference)");
  });

  it("lists the pressed-card transition in reduced-motion.css", () => {
    const [rule] = pressRules();
    expect(read("reduced-motion.css").replace(/\s+/g, " ")).toContain(
      rule.selector.replace(/\s+/g, " "),
    );
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
