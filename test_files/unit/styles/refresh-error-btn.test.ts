import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss, { type Rule } from "postcss";

// jsdom does not run the cascade, so the error icon's colour contract is
// asserted as a stylesheet contract: the button must inherit the refresh
// status row's text colour rather than paint a red token of its own (#1353).
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");
const cssPath = path.join(stylesDir, "controls-filter-bar.css");

const BASE_SELECTOR =
  ".rss-dashboard-refresh-status-row .rss-dashboard-refresh-error-btn";

interface Declaration {
  prop: string;
  value: string;
  important: boolean;
  selector: string;
  inMediaQuery: boolean;
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

function declarations(): Declaration[] {
  const decls: Declaration[] = [];
  const root = postcss.parse(readFileSync(cssPath, "utf-8"));
  root.walkRules((rule: Rule) => {
    let inMediaQuery = false;
    for (
      let parent = rule.parent;
      parent !== undefined && parent.type !== "root";
      parent = parent.parent
    ) {
      if (parent.type === "atrule" && parent.name === "media") {
        inMediaQuery = true;
      }
    }
    rule.each((node) => {
      if (node.type !== "decl") return;
      decls.push({
        prop: node.prop,
        value: node.value.replace(/\s+/g, " ").trim(),
        important: node.important === true,
        selector: normalize(rule.selector),
        inMediaQuery,
      });
    });
  });
  return decls;
}

function declsFor(selector: string): Declaration[] {
  return declarations().filter((d) => d.selector === selector);
}

function valueOf(selector: string, prop: string): string | undefined {
  const matching = declsFor(selector).filter(
    (d) => d.prop === prop && !d.inMediaQuery,
  );
  return matching[matching.length - 1]?.value;
}

describe("refresh error button stylesheet contract", () => {
  it("takes the row's text colour instead of a red token", () => {
    const colourDecls = declsFor(BASE_SELECTOR).filter(
      (d) => d.prop === "color",
    );

    expect(colourDecls.map((d) => d.value)).toEqual(["inherit"]);
  });

  it("leaves no red token on the error button", () => {
    const colourValues = declarations()
      .filter(
        (d) =>
          d.selector.includes("rss-dashboard-refresh-error-btn") &&
          d.prop === "color",
      )
      .map((d) => d.value);

    for (const value of colourValues) {
      expect(value).not.toMatch(/red/i);
      expect(value).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("keeps the control's size, target and reset affordances", () => {
    expect(valueOf(BASE_SELECTOR, "--icon-size")).toBe("16px");
    expect(valueOf(BASE_SELECTOR, "width")).toBe("32px");
    expect(valueOf(BASE_SELECTOR, "height")).toBe("32px");
    expect(valueOf(BASE_SELECTOR, "min-width")).toBe("32px");
    expect(valueOf(BASE_SELECTOR, "min-height")).toBe("32px");
    expect(valueOf(BASE_SELECTOR, "padding")).toBe("0");
    expect(valueOf(BASE_SELECTOR, "border")).toBe("none");
    expect(valueOf(BASE_SELECTOR, "border-radius")).toBe("4px");
    expect(valueOf(BASE_SELECTOR, "background")).toBe("transparent");
    expect(valueOf(BASE_SELECTOR, "box-shadow")).toBe("none");
    expect(valueOf(BASE_SELECTOR, "cursor")).toBe("pointer");
  });

  it("keeps the coarse-pointer target at 40px and adds no !important", () => {
    const coarse = declsFor(BASE_SELECTOR).filter((d) => d.inMediaQuery);
    expect(coarse.map((d) => `${d.prop}: ${d.value}`)).toEqual([
      "width: 40px",
      "height: 40px",
      "min-width: 40px",
      "min-height: 40px",
    ]);
    expect(
      declarations().some(
        (d) =>
          d.selector.includes("rss-dashboard-refresh-error-btn") && d.important,
      ),
    ).toBe(false);
  });
});
