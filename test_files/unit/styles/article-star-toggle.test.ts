import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheets = [
  "articles.css",
  "card-view.css",
  "reader.css",
].map((file) =>
  readFileSync(path.resolve(testDir, `../../../src/styles/${file}`), "utf-8"),
);

function declarationsFor(...selectors: string[]): Map<string, string> {
  const declarations = new Map<string, string>();

  for (const css of stylesheets) {
    postcss.parse(css).walkRules((rule) => {
      if (!rule.selectors.some((selector) => selectors.includes(selector))) {
        return;
      }

      rule.walkDecls((declaration) => {
        declarations.set(declaration.prop, declaration.value);
      });
    });
  }

  return declarations;
}

describe("Article star toggle styles", () => {
  it("shows every starred article control with a filled yellow star", () => {
    const dashboard = declarationsFor(
      ".rss-dashboard-star-toggle.starred",
      ".rss-dashboard-star-toggle.starred svg",
    );
    const reader = declarationsFor(
      ".rss-reader-star-toggle.starred",
      ".rss-reader-star-toggle.starred svg",
    );

    expect(dashboard.get("color")).toBe("var(--color-yellow)");
    expect(dashboard.get("fill")).toBe("var(--color-yellow)");
    expect(reader.get("color")).toBe(dashboard.get("color"));
    expect(reader.get("fill")).toBe(dashboard.get("fill"));
  });

  it("darkens the star outline on hover while keeping its yellow fill", () => {
    const dashboardHover = declarationsFor(
      ".rss-dashboard-star-toggle:hover svg",
    );
    const readerHover = declarationsFor(".rss-reader-star-toggle:hover svg");
    const starred = declarationsFor(
      ".rss-dashboard-star-toggle.starred svg",
      ".rss-reader-star-toggle.starred svg",
    );

    expect(dashboardHover.get("stroke")).toBe(
      "color-mix(in srgb, var(--color-yellow) 50%, #000)",
    );
    expect(readerHover.get("stroke")).toBe(dashboardHover.get("stroke"));
    expect(starred.get("fill")).toBe("var(--color-yellow)");
  });

  it("keeps the circular button background specific to dashboard stars", () => {
    const dashboard = declarationsFor(".rss-dashboard-star-toggle");
    const reader = declarationsFor(".rss-reader-star-toggle");

    expect(dashboard.get("border-radius")).toBe("50%");
    expect(dashboard.get("background-color")).toBe(
      "var(--background-primary-alt)",
    );
    expect(reader.get("border-radius")).not.toBe("50%");
  });
});
