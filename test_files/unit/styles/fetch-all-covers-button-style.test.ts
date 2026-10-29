import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(
  path.resolve(testDir, "../../../src/styles/controls.css"),
  "utf-8",
);

const FETCH_ALL = ".rss-dashboard-fetch-all-covers-button";
const HAMBURGER = ".rss-dashboard-hamburger-button";

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();

  postcss.parse(stylesheet).walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });

  return declarations;
}

// The header button sits between the filter button and the hamburger button
// (#1702), so it has to read as one of that row: the same bordered box, not a
// bare icon.
describe("Fetch-all-covers header button style (#1702)", () => {
  it("is the same bordered 40px box as the hamburger button", () => {
    const fetchAll = declarationsFor(FETCH_ALL);
    const hamburger = declarationsFor(HAMBURGER);

    for (const property of [
      "display",
      "width",
      "height",
      "padding",
      "border",
      "border-radius",
      "background",
      "color",
      "cursor",
    ]) {
      expect(hamburger.get(property), `hamburger ${property}`).toBeDefined();
      expect(fetchAll.get(property), property).toBe(hamburger.get(property));
    }
  });

  it("draws its icon at the hamburger's size and weight", () => {
    const fetchAll = declarationsFor(`${FETCH_ALL} svg`);
    const hamburger = declarationsFor(`${HAMBURGER} svg`);

    for (const property of ["width", "height", "stroke-width"]) {
      expect(hamburger.get(property), `hamburger ${property}`).toBeDefined();
      expect(fetchAll.get(property), property).toBe(hamburger.get(property));
    }
  });

  it("highlights on hover and shows a focus ring like its neighbours", () => {
    const hover = declarationsFor(`${FETCH_ALL}:hover`);
    const hamburgerHover = declarationsFor(`${HAMBURGER}:hover`);
    const focus = declarationsFor(`${FETCH_ALL}:focus`);
    const hamburgerFocus = declarationsFor(`${HAMBURGER}:focus`);

    expect(hover.get("background")).toBe(hamburgerHover.get("background"));
    expect(hover.get("border-color")).toBe(hamburgerHover.get("border-color"));
    expect(focus.get("outline")).toBe(hamburgerFocus.get("outline"));
    expect(focus.get("outline")).toBeDefined();
  });

  it("keeps its dimmed look while unavailable", () => {
    const unavailable = declarationsFor(`${FETCH_ALL}[aria-disabled="true"]`);

    expect(unavailable.get("opacity")).toBeDefined();
    expect(unavailable.get("cursor")).toBe("not-allowed");
  });

  it("does not light up on hover while unavailable", () => {
    const resting = declarationsFor(FETCH_ALL);
    const hover = declarationsFor(`${FETCH_ALL}[aria-disabled="true"]:hover`);

    expect(hover.get("background")).toBe(resting.get("background"));
    expect(hover.get("border-color")).toBeDefined();
  });
});
