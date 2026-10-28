import { describe, expect, it } from "vitest";
import {
  createTagWithAppearanceChanges,
  DEFAULT_TAG_COLOR,
  DEFAULT_TAG_TEXT_COLOR,
  randomHexColor,
  randomTagColors,
  resolveTagAppearance,
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
  it("stores only the appearance values explicitly changed by the user", () => {
    expect(
      createTagWithAppearanceChanges(
        "Topic",
        { background: "#123456", text: "#abcdef" },
        { background: false, text: true },
      ),
    ).toEqual({ name: "Topic", textColor: "#abcdef" });
  });

  it("uses #8a5cf5 as the default tag color", () => {
    expect(DEFAULT_TAG_COLOR).toBe("#8a5cf5");
    expect(DEFAULT_TAG_TEXT_COLOR).toBe("#ffffff");
  });

  it("resolves a registry entry before stale article copies, then uses global defaults", () => {
    const settings = {
      availableTags: [{ name: "Topic" }],
      defaultTagColor: "#123456",
      defaultTagTextColor: "#654321",
    };

    expect(
      resolveTagAppearance(
        { name: "topic", color: "#abcdef", textColor: "#fedcba" },
        settings,
      ),
    ).toEqual({ background: "#123456", text: "#654321" });
  });

  it("resolves explicit registry appearance independently for each value", () => {
    const settings = {
      availableTags: [
        { name: "Topic", color: "#123456", textColor: "#654321" },
      ],
      defaultTagColor: "#000000",
      defaultTagTextColor: "#ffffff",
    };

    expect(resolveTagAppearance({ name: "Topic" }, settings)).toEqual({
      background: "#123456",
      text: "#654321",
    });
  });

  it("uses nullish fallback semantics for empty stored appearance values", () => {
    const settings = {
      availableTags: [{ name: "Topic", color: "", textColor: "" }],
      defaultTagColor: "#123456",
      defaultTagTextColor: "#654321",
    };

    expect(resolveTagAppearance({ name: "Topic" }, settings)).toEqual({
      background: "",
      text: "",
    });
  });

  it("uses orphan overrides and the standard defaults when no registry entry exists", () => {
    const settings = { availableTags: [] };

    expect(
      resolveTagAppearance(
        { name: "Orphan", color: "#123456", textColor: "#654321" },
        settings,
      ),
    ).toEqual({ background: "#123456", text: "#654321" });
    expect(resolveTagAppearance({ name: "New" }, settings)).toEqual({
      background: DEFAULT_TAG_COLOR,
      text: DEFAULT_TAG_TEXT_COLOR,
    });
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

describe("randomHexColor", () => {
  it("always returns a #rrggbb color", () => {
    const random = seededRandom(11);
    for (let roll = 0; roll < 300; roll += 1) {
      expect(randomHexColor(random)).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(randomHexColor()).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("maps the ends of the random range to black and white", () => {
    expect(randomHexColor(() => 0)).toBe("#000000");
    expect(randomHexColor(() => 0.999999)).toBe("#ffffff");
    expect(randomHexColor(() => 0.5)).toBe("#808080");
  });

  it("uses an independent byte per channel, in red, green, blue order", () => {
    const rolls = [0.1, 0.5, 0.9];

    expect(randomHexColor(() => rolls.shift() ?? 0)).toBe("#1980e6");
  });

  it("is not restricted: over many rolls every channel reaches both extremes", () => {
    const random = seededRandom(3);
    const channels = [0, 1, 2].map(() => ({ low: false, high: false }));
    for (let roll = 0; roll < 300; roll += 1) {
      const hex = randomHexColor(random);
      channels.forEach((seen, channel) => {
        const value = parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16);
        if (value < 40) seen.low = true;
        if (value > 215) seen.high = true;
      });
    }
    for (const seen of channels) {
      expect(seen).toEqual({ low: true, high: true });
    }
  });

  it("gives a different color for different rolls", () => {
    const random = seededRandom(9);
    expect(randomHexColor(random)).not.toBe(randomHexColor(random));
  });
});
