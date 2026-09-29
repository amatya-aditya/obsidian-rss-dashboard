import { describe, it, expect } from "vitest";
import {
  hasLatexPhpQuery,
  isLatexFormulaImage,
  optimizeImageUrl,
} from "../../../src/utils/image-url-utils.js";

describe("isLatexFormulaImage", () => {
  it("recognizes WordPress LaTeX images by class", () => {
    expect(
      isLatexFormulaImage(
        "https://example.com/rendered-formula.png",
        "alignnone latex size-full",
      ),
    ).toBe(true);
  });

  it("recognizes persisted WordPress LaTeX image URLs without a class", () => {
    expect(
      isLatexFormulaImage(
        "https://s0.wp.com/latex.php?latex=%7Bx%7D&bg=ffffff&fg=000000",
      ),
    ).toBe(true);
  });

  it("does not classify ordinary WordPress images as formulas", () => {
    expect(
      isLatexFormulaImage(
        "https://i0.wp.com/example.com/wp-content/uploads/photo.jpg?w=600",
        "wp-post-image",
      ),
    ).toBe(false);
  });
});

describe("optimizeImageUrl", () => {
  it("rewrites Brightspot crop URLs without offset", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/8552x5292/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot crop URLs with +0+0 offset", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/8552x5292+0+0/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs with ! delimiter", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/8552x5292!/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/600x/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs without ! delimiter", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/8552x5292/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/600x/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot crop URLs on media.npr.org with +0+0 offset", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/crop/8552x5292+0+0/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs on media.npr.org with ! delimiter", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/8552x5292!/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/600x/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs on media.npr.org without ! delimiter", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/8552x5292/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/600x/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("does not mangle non-Brightspot URLs", () => {
    const url = "https://example.com/image.jpg";
    expect(optimizeImageUrl(url)).toBe(url);
  });

  it("leaves empty input as empty", () => {
    expect(optimizeImageUrl("")).toBe("");
  });
});


// Fallback path: a "[" host never parses, so these inputs reach the text check.
const UNPARSEABLE = "http://[";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The original regex, kept as a reference for the differential test.
function originalLatexUrlText(src: string): boolean {
  return /(?:^|\/)latex\.php\?[^#]*\blatex=/i.test(src);
}

const LATEX_FRAGMENTS = [
  "latex.php?",
  "/latex.php?",
  "LaTeX.PHP?",
  "latex=",
  "LATEX=",
  "xlatex=",
  "_latex=",
  "1latex=",
  "latex.php",
  "#",
  "/",
  "?",
  "&",
  "=",
  "a",
  "b",
  "Z",
  "9",
  "_",
  "-",
  ".",
  "%",
];

function randomLatexString(random: () => number): string {
  const count = Math.floor(random() * 10);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += LATEX_FRAGMENTS[Math.floor(random() * LATEX_FRAGMENTS.length)];
  }
  return out;
}

describe("isLatexFormulaImage with unparseable URLs", () => {
  const detect = (rest: string) => isLatexFormulaImage(UNPARSEABLE + rest);

  it("matches latex.php with a latex parameter after a slash", () => {
    expect(detect("/x/latex.php?latex=y")).toBe(true);
    expect(detect("/latex.php?bg=fff&latex=y")).toBe(true);
    expect(detect("/LaTeX.PHP?LATEX=y")).toBe(true);
  });

  it("requires a word boundary before the latex parameter", () => {
    expect(detect("/latex.php?xlatex=y")).toBe(false);
    expect(detect("/latex.php?_latex=y")).toBe(false);
    expect(detect("/latex.php?a&latex=y")).toBe(true);
  });

  it("requires latex.php to start a path segment", () => {
    expect(detect("/xlatex.php?latex=y")).toBe(false);
    expect(detect("/x/latex.php?latex=y")).toBe(true);
  });

  it("stops looking at a fragment marker", () => {
    expect(detect("/latex.php?a#latex=y")).toBe(false);
    expect(detect("/latex.php?a#/latex.php?latex=y")).toBe(true);
  });

  it("finds a later match after an earlier one failed", () => {
    expect(detect("/latex.php?a/latex.php?xlatex=/latex.php?latex=")).toBe(true);
    expect(detect("/latex.php?a#b/latex.php?c")).toBe(false);
  });

  it("matches the previous behavior on generated inputs", () => {
    const random = seededRandom(20260929);
    for (let i = 0; i < 4000; i++) {
      const rest = randomLatexString(random);
      const expected = originalLatexUrlText((UNPARSEABLE + rest).trim());
      expect(detect(rest), JSON.stringify(rest)).toBe(expected);
    }
  });

  it("handles long paths quickly", () => {
    for (const rest of ["/latex.php?".repeat(5000), "/latex.php?a".repeat(4200)]) {
      const started = performance.now();
      expect(detect(rest)).toBe(false);
      expect(performance.now() - started).toBeLessThan(200);
    }
  });
});

describe("hasLatexPhpQuery", () => {
  it("matches the previous behavior on generated inputs", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 5000; i++) {
      const text = randomLatexString(random);
      expect(hasLatexPhpQuery(text), JSON.stringify(text)).toBe(
        originalLatexUrlText(text),
      );
    }
  });

  it("accepts latex.php at the very start of the text", () => {
    expect(hasLatexPhpQuery("latex.php?latex=y")).toBe(true);
    expect(hasLatexPhpQuery("xlatex.php?latex=y")).toBe(false);
  });
});
