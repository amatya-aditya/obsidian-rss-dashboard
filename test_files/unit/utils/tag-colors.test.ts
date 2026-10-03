import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAG_COLOR,
  randomTagColors,
} from "../../../src/utils/tag-colors";

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

describe("tag-colors", () => {
  it("uses #8a5cf5 as the default tag color", () => {
    expect(DEFAULT_TAG_COLOR).toBe("#8a5cf5");
  });

  it("returns one hex color per requested tag", () => {
    const colors = randomTagColors(5, seededRandom(1));
    expect(colors).toHaveLength(5);
    colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
  });

  it("never produces white-, black-, or gray-adjacent colors, across many rolls", () => {
    const random = seededRandom(42);
    for (let roll = 0; roll < 200; roll += 1) {
      for (const color of randomTagColors(8, random)) {
        const { s, l } = hexToHsl(color);
        expect(l).toBeGreaterThanOrEqual(34.5);
        expect(l).toBeLessThanOrEqual(55.5);
        expect(s).toBeGreaterThanOrEqual(49);
        expect(s).toBeLessThanOrEqual(86);
      }
    }
  });

  it("spreads hues apart so tags rolled together look distinct", () => {
    const colors = randomTagColors(3, seededRandom(7));
    const hues = colors.map((color) => hexToHsl(color).h);
    for (let i = 0; i < hues.length; i += 1) {
      for (let j = i + 1; j < hues.length; j += 1) {
        expect(hueDistance(hues[i], hues[j])).toBeGreaterThan(80);
      }
    }
  });

  it("produces a different set of colors on each roll", () => {
    const random = seededRandom(3);
    expect(randomTagColors(3, random)).not.toEqual(randomTagColors(3, random));
  });
});
