import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";

// jsdom does not run the cascade or lay out a flex row, so the shortcut-help
// dialog's geometry is pinned as a stylesheet contract: parse modals.css and
// read the declarations that reach each selector. The bug is that a wrapped
// description re-centred the right-aligned key (#1013).
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = postcss.parse(
  readFileSync(
    path.resolve(testDir, "../../../src/styles/modals.css"),
    "utf-8",
  ),
);

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

// The mobile tier breakpoint: `PHONE_MAX_WIDTH` in
// `src/utils/platform-utils.ts`, and the mobile tier in
// `docs/development/design-spec.md`.
const MOBILE_MEDIA = "(max-width: 768px)";

interface MatchedRule {
  media: string | null;
  declarations: Map<string, string>;
}

function rulesFor(selector: string): MatchedRule[] {
  const matches: MatchedRule[] = [];
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.map(normalize).includes(selector)) return;
    const declarations = new Map<string, string>();
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value.replace(/\s+/g, " ").trim());
    });
    const parent = rule.parent;
    const media =
      parent?.type === "atrule" && parent.name === "media"
        ? (parent as postcss.AtRule).params.trim()
        : null;
    matches.push({ media, declarations });
  });
  return matches;
}

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const { declarations: ruleDeclarations } of rulesFor(selector)) {
    for (const [prop, value] of ruleDeclarations) {
      declarations.set(prop, value);
    }
  }
  return declarations;
}

function mobileDeclarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const { media, declarations: ruleDeclarations } of rulesFor(selector)) {
    if (media !== MOBILE_MEDIA) continue;
    for (const [prop, value] of ruleDeclarations) {
      declarations.set(prop, value);
    }
  }
  return declarations;
}

const ROW = ".rss-shortcut-row";
const KEY_CONTAINER = ".rss-shortcut-key-container";
const DESC = ".rss-shortcut-desc";

describe("Shortcut help dialog stylesheet - row alignment", () => {
  it("anchors the row's items on their text baseline, not the row centre", () => {
    const row = declarationsFor(ROW);

    expect(row.get("display")).toBe("flex");
    expect(row.get("justify-content")).toBe("space-between");
    expect(row.get("align-items")).toBe("baseline");
  });

  it("pins the key container to the right edge and stops it shrinking", () => {
    const key = declarationsFor(KEY_CONTAINER);

    expect(key.get("flex-shrink")).toBe("0");
    expect(key.get("margin-left")).toBe("auto");
  });

  it("lets a long description shrink and wrap beside the key", () => {
    expect(declarationsFor(DESC).get("min-width")).toBe("0");
  });
});

describe("Shortcut help dialog stylesheet - mobile header", () => {
  const HEADER = ".rss-shortcut-help-modal .rss-dashboard-header";

  it("stacks the header into two rows on mobile", () => {
    const header = mobileDeclarationsFor(HEADER);

    expect(header.get("display")).toBe("grid");
    // Two columns: the title flexes, the close button keeps its size.
    expect(header.get("grid-template-columns")).toBe("1fr auto");
    const areas = header.get("grid-template-areas") ?? "";
    expect(areas).toContain('"title close"');
    expect(areas).toContain('"save save"');
  });

  it("places the title, save link and close button in the grid", () => {
    expect(
      mobileDeclarationsFor(
        ".rss-shortcut-help-modal .rss-dashboard-header-title",
      ).get("grid-area"),
    ).toBe("title");
    expect(
      mobileDeclarationsFor(
        ".rss-shortcut-help-modal .rss-dashboard-save-shortcuts-link",
      ).get("grid-area"),
    ).toBe("save");
    expect(
      mobileDeclarationsFor(
        ".rss-shortcut-help-modal .rss-dashboard-header-close-button",
      ).get("grid-area"),
    ).toBe("close");
  });

  it("leaves the desktop header as a single flex row", () => {
    const header = rulesFor(HEADER).find((rule) => rule.media === null);

    expect(header?.declarations.get("display")).toBe("flex");
    expect(header?.declarations.get("justify-content")).toBe("space-between");
  });
});
