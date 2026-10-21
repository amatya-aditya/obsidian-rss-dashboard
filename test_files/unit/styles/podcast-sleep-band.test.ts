import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

// jsdom paints nothing and does not resolve the plugin's custom properties, so
// the sleep timer band's colour contract is pinned as a stylesheet contract.
// One property on the player feeds both the active button and the band, and the
// band stays decorative while reduced motion keeps its width still (#1371).
const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(testDir, "../../../src/styles");
const PLAYER_STYLES = "podcast-player.css";
const REDUCED_MOTION_STYLES = "reduced-motion.css";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const BAND = ".podcast-sleep-band";

interface StyleDecl {
  selector: string;
  prop: string;
  value: string;
}

function parse(file: string): postcss.Root {
  return postcss.parse(readFileSync(path.join(stylesDir, file), "utf-8"));
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

function declsFor(file: string, selector: string, prop: string): StyleDecl[] {
  const decls: StyleDecl[] = [];
  parse(file).walkRules((rule) => {
    rule.each((node) => {
      if (node.type !== "decl" || node.prop !== prop) return;
      for (const ruleSelector of rule.selectors) {
        if (normalize(ruleSelector) !== selector) continue;
        decls.push({
          selector,
          prop: node.prop,
          value: node.value.replace(/\s+/g, " ").trim(),
        });
      }
    });
  });
  return decls;
}

function values(file: string, selector: string, prop: string): string[] {
  return declsFor(file, selector, prop).map((decl) => decl.value);
}

describe("Podcast sleep timer band", () => {
  it("reads one player property for the active button and the band", () => {
    expect(
      values(
        PLAYER_STYLES,
        ".rss-reader-podcast-container",
        "--rss-sleep-timer-color",
      ),
    ).toContain("var(--interactive-accent)");
    expect(
      values(PLAYER_STYLES, ".rss-sleep-timer-btn.is-active", "color"),
    ).toContain("var(--rss-sleep-timer-color)");

    const backgrounds = [
      ...values(PLAYER_STYLES, BAND, "background"),
      ...values(PLAYER_STYLES, BAND, "background-color"),
    ];
    expect(
      backgrounds.some((value) =>
        value.includes("var(--rss-sleep-timer-color)"),
      ),
    ).toBe(true);
  });

  it("draws the band at reduced opacity over the empty track", () => {
    const opacities = values(PLAYER_STYLES, BAND, "opacity").map(Number);
    expect(
      opacities.some((value) => value > 0 && value < 1),
      "the band must be a reduced-opacity preview, not a second played fill",
    ).toBe(true);
  });

  it("positions the band from the playhead to the projected expiry", () => {
    const start = values(PLAYER_STYLES, BAND, "--sleep-band-left").join(" ");
    expect(start).toMatch(/max\(\s*0%/);
    expect(start).toContain("var(--sleep-band-start, 0%)");
    expect(values(PLAYER_STYLES, BAND, "left")).toContain(
      "var(--sleep-band-left)",
    );
    expect(values(PLAYER_STYLES, BAND, "width")).toContain(
      "calc(var(--sleep-band-end, 0%) - var(--sleep-band-left))",
    );
  });

  it("tucks the band behind the played fill so its rounded cap covers the join", () => {
    const bandZ = Number(values(PLAYER_STYLES, BAND, "z-index")[0]);
    const filledZ = Number(
      values(PLAYER_STYLES, ".podcast-progress-bar-filled", "z-index")[0],
    );
    expect(Number.isFinite(bandZ)).toBe(true);
    expect(Number.isFinite(filledZ)).toBe(true);
    expect(filledZ).toBeGreaterThan(bandZ);

    const overlaps = values(PLAYER_STYLES, BAND, "--sleep-band-overlap").map(
      (value) => Number.parseFloat(value),
    );
    // DEC-003 fixes 8px: the 6px cap is covered and 2px of band still shows
    // beside it. Pinning the value keeps the layered join from regressing to a
    // bare seam.
    expect(overlaps).toContain(8);
  });

  it("ignores pointer events so the seek bar keeps receiving seek input", () => {
    expect(values(PLAYER_STYLES, BAND, "pointer-events")).toContain("none");
  });

  it("animates the band width unless reduced motion is requested", () => {
    const transitions = values(PLAYER_STYLES, BAND, "transition");
    expect(transitions.some((value) => value.includes("width"))).toBe(true);

    const reducedRoot = parse(REDUCED_MOTION_STYLES);
    const reducedDecls = new Map<string, Map<string, string>>();
    reducedRoot.walkAtRules("media", (media) => {
      if (media.params.trim() !== REDUCED_MOTION_QUERY) return;
      media.walkRules((rule) => {
        const declarations = new Map<string, string>();
        rule.walkDecls((decl) => {
          declarations.set(decl.prop, decl.value);
        });
        for (const selector of rule.selectors) {
          reducedDecls.set(normalize(selector), declarations);
        }
      });
    });

    expect(reducedDecls.get(BAND)?.get("transition-duration")).toBe("0.01ms");
    expect(reducedDecls.get(BAND)?.get("transition-delay")).toBe("0s");
  });

  it("adds no !important to either stylesheet", () => {
    const important: string[] = [];
    for (const file of [PLAYER_STYLES, REDUCED_MOTION_STYLES]) {
      parse(file).walkDecls((decl) => {
        if (decl.important) important.push(`${file}: ${decl.toString()}`);
      });
    }
    expect(important).toEqual([]);
  });
});
