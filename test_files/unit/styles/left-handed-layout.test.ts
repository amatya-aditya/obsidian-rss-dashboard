import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheets = ["card-view.css", "feed-view.css"].map((file) =>
  readFileSync(path.resolve(testDir, `../../../src/styles/${file}`), "utf-8"),
);

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

function declarationsFor(selector: string): Map<string, string> {
  const wanted = normalize(selector);
  const declarations = new Map<string, string>();

  for (const css of stylesheets) {
    postcss.parse(css).walkRules((rule) => {
      if (
        !rule.selectors.some(
          (ruleSelector) => normalize(ruleSelector) === wanted,
        )
      ) {
        return;
      }

      rule.walkDecls((declaration) => {
        declarations.set(declaration.prop, declaration.value);
      });
    });
  }

  return declarations;
}

describe("Left-handed layout styles", () => {
  it("mirrors the card footer and keeps its date left-to-right", () => {
    const footer = declarationsFor(
      ".rss-dashboard-articles-list.rss-dashboard-mirrored-footer .rss-dashboard-card-footer",
    );
    expect(footer.get("direction")).toBe("rtl");

    const date = declarationsFor(
      ".rss-dashboard-articles-list.rss-dashboard-mirrored-footer .rss-dashboard-card-footer .rss-dashboard-article-date",
    );
    expect(date.get("direction")).toBe("ltr");
  });

  it("mirrors the feed footer and keeps its date left-to-right", () => {
    const footer = declarationsFor(
      ".rss-dashboard-articles-list.rss-dashboard-mirrored-footer .rss-dashboard-feed-footer",
    );
    expect(footer.get("direction")).toBe("rtl");

    const date = declarationsFor(
      ".rss-dashboard-articles-list.rss-dashboard-mirrored-footer .rss-dashboard-feed-footer .rss-dashboard-article-date",
    );
    expect(date.get("direction")).toBe("ltr");
  });

  it("scopes the mirror rules to the mirrored-footer root class", () => {
    expect(
      declarationsFor(".rss-dashboard-card-footer").get("direction"),
    ).toBeUndefined();
    expect(
      declarationsFor(".rss-dashboard-feed-footer").get("direction"),
    ).toBeUndefined();
  });
});
