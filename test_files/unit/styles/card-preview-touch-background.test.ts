import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(
  path.resolve(testDir, "../../../src/styles/card-view.css"),
  "utf-8",
);

const OVERLAY_SELECTOR =
  ".rss-dashboard-card-view .rss-dashboard-card-preview-region .rss-dashboard-summary-overlay";

function overlayBackgrounds(): { background: string; mediaParams?: string }[] {
  const found: { background: string; mediaParams?: string }[] = [];
  postcss.parse(stylesheet).walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, " ").trim() !== OVERLAY_SELECTOR) return;
    rule.walkDecls("background", (decl) => {
      const parent = rule.parent;
      found.push({
        background: decl.value,
        mediaParams:
          parent?.type === "atrule"
            ? (parent as postcss.AtRule).params
            : undefined,
      });
    });
  });
  return found;
}

describe("card summary overlay background on touch screens", () => {
  it("matches the card background when tapping the cover reveals the summary", () => {
    const touch = overlayBackgrounds().filter(
      (entry) => entry.mediaParams === "(hover: none)",
    );

    expect(touch.map((entry) => entry.background)).toEqual([
      "var(--background-secondary)",
    ]);
  });

  it("keeps the contrasting background where hover reveals the summary", () => {
    const base = overlayBackgrounds().filter((entry) => !entry.mediaParams);

    expect(base.map((entry) => entry.background)).toContain(
      "var(--background-primary)",
    );
  });
});
