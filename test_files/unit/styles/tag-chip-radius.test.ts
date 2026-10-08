import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

// jsdom does not run the cascade, so the tag chip shape is asserted as a
// stylesheet contract: parse every file in src/styles in the order index.css
// imports it and inspect which rules decide each chip's border-radius.
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");
const srcDir = path.resolve(testDir, "../../../src");

const SHARED_RADIUS = "var(--rss-dashboard-tag-chip-radius, 999px)";

interface RadiusDecl {
  file: string;
  selectors: string[];
  value: string;
  important: boolean;
}

function importOrder(): string[] {
  const index = readFileSync(path.join(stylesDir, "index.css"), "utf-8");
  return [...index.matchAll(/@import\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

function collectRadiusDecls(): RadiusDecl[] {
  const decls: RadiusDecl[] = [];
  for (const file of importOrder()) {
    const css = readFileSync(path.join(stylesDir, file), "utf-8");
    postcss.parse(css).walkRules((rule) => {
      rule.each((node) => {
        if (node.type === "decl" && node.prop === "border-radius") {
          decls.push({
            file,
            selectors: rule.selectors.map(normalize),
            value: node.value.replace(/\s+/g, " "),
            important: node.important === true,
          });
        }
      });
    });
  }
  return decls;
}

// A rule styles a chip class when that class is the whole final compound of
// one of its selectors, so a modifier such as `.a.b` is a different target.
function lastCompound(selector: string): string {
  return selector.split(/[\s>+~]+/).pop() ?? "";
}

function declsStyling(className: string): RadiusDecl[] {
  return collectRadiusDecls().filter((d) =>
    d.selectors.some((s) => lastCompound(s) === `.${className}`),
  );
}

function effectiveRadius(selector: string): string | undefined {
  const matching = collectRadiusDecls().filter((d) =>
    d.selectors.includes(selector),
  );
  return matching[matching.length - 1]?.value;
}

const INCLUDED_CHIPS: Array<{ className: string }> = [
  { className: "rss-dashboard-tag-badge" },
  { className: "rss-dashboard-tag-overflow" },
  { className: "rss-dashboard-tag-label" },
  { className: "rss-discover-card-tag" },
  { className: "podcast-tag" },
  { className: "episode-list-row-tag" },
  { className: "rss-reader-tag" },
  { className: "feed-preview-tag" },
];

// The Tags settings tab previews the chosen shape with its own sample chip.
const SHARED_VARIABLE_SAMPLE_RULES = 1;

// Chips whose shape comes from a base class they are always rendered with.
const INHERITING_CHIPS = [
  "podcast-tag-more",
  "episode-list-row-tag-more",
  "import-new-tags-chip",
];

const EXCLUDED_SHAPES: Array<[string, string]> = [
  [".feed-preview-category", "4px"],
  [".rss-discover-card-category", "12px"],
  [".rss-dashboard-tag-color-dot", "50%"],
  [".rss-discover-tag-color-dot", "50%"],
  [".rss-dashboard-tag-multi-select-menu-swatch", "999px"],
  [".rss-dashboard-tag-inline-color", "4px"],
  ["body .rss-dashboard-tag-color-picker", "50%"],
  [".rss-dashboard-tags-toggle", "12px"],
  [".rss-dashboard-tags-dropdown-content", "4px"],
  [".rss-dashboard-tags-mobile-sheet", "12px"],
  [".rss-dashboard-tag-action-button", "4px"],
  [".rss-dashboard-tag-inline-input", "4px"],
  [".rss-dashboard-tag-inline-button", "4px"],
  [".rss-dashboard-tag-filter-mode-btn", "3px"],
  [".rss-dashboard-sidebar-tag-count", "10px"],
  [".rss-discover-tag-count", "10px"],
  [".rss-dashboard-tag-multi-select-trigger", "8px"],
  [".rss-dashboard-tag-multi-select-menu", "12px"],
  [".import-preview-tags-control.rss-dashboard-tag-container", "4px"],
  // Kagi Small Web domain and age labels reuse the discover tag chip but are
  // metadata, so a modifier class keeps their own shape.
  [".rss-discover-card-tag.rss-smallweb-meta-tag", "12px"],
];

describe("Tag chip stylesheet - shared radius", () => {
  it.each(INCLUDED_CHIPS)(
    "gives .$className exactly one radius declaration, the shared variable",
    ({ className }) => {
      const decls = declsStyling(className);

      expect(decls).toHaveLength(1);
      expect(decls[0].value).toBe(SHARED_RADIUS);
      expect(decls[0].selectors).toEqual([`.${className}`]);
    },
  );

  it.each(INHERITING_CHIPS)(
    "leaves .%s without its own radius so it follows its base chip class",
    (className) => {
      expect(declsStyling(className)).toHaveLength(0);
    },
  );

  it("renders the inheriting chips together with their base chip class", () => {
    const read = (file: string) =>
      readFileSync(path.join(srcDir, file), "utf-8");

    expect(read("views/podcast-player.ts")).toContain(
      "podcast-tag podcast-tag-more",
    );
    expect(read("components/podcast-episode-list.ts")).toContain(
      "episode-list-row-tag episode-list-row-tag-more",
    );
    expect(read("modals/import-starred-modal.ts")).toMatch(
      /createTagChip\(list, tag\)[\s\S]{0,80}import-new-tags-chip/,
    );
    expect(read("components/article-list/utils/tag-layout-utils.ts")).toContain(
      '"rss-dashboard-tag-badge"',
    );
  });

  it("sets the shared variable fallback to a pill in every chip rule", () => {
    const sharedDecls = collectRadiusDecls().filter((d) =>
      d.value.includes("--rss-dashboard-tag-chip-radius"),
    );

    // The settings sample chip also reads the shared variable, so it is the
    // one rule beyond the chips listed above.
    expect(sharedDecls.length).toBe(
      INCLUDED_CHIPS.length + SHARED_VARIABLE_SAMPLE_RULES,
    );
    for (const decl of sharedDecls) {
      expect(decl.value).toBe(SHARED_RADIUS);
    }
  });

  it("keeps every excluded selector at its existing radius", () => {
    for (const [selector, radius] of EXCLUDED_SHAPES) {
      expect(effectiveRadius(selector), selector).toBe(radius);
    }
  });

  it("does not use !important on any tag chip radius", () => {
    const tagRadiusDecls = collectRadiusDecls().filter((d) =>
      d.value.includes("--rss-dashboard-tag-chip-radius"),
    );

    expect(tagRadiusDecls.some((d) => d.important)).toBe(false);
  });
});

describe("Tag chip stylesheet - feed preview split", () => {
  it("keeps the feed category chip rectangular while the tag chip follows the setting", () => {
    expect(declsStyling("feed-preview-category")).toHaveLength(1);
    expect(effectiveRadius(".feed-preview-category")).toBe("4px");
    expect(effectiveRadius(".feed-preview-tag")).toBe(SHARED_RADIUS);
  });
});
