import type { Tag } from "../types/types";

/**
 * Tag color defaults and generation. Free of any Obsidian API dependency so
 * pure modules such as the starred-import mapper can use it too.
 */

/** Starting color for every newly created tag. */
export const DEFAULT_TAG_COLOR = "#8a5cf5";
export const DEFAULT_TAG_TEXT_COLOR = "#ffffff";

export interface TagAppearance {
  background: string;
  text: string;
}

export interface TagAppearanceSettings {
  availableTags: readonly Tag[];
  defaultTagColor?: string;
  defaultTagTextColor?: string;
}

export interface TagAppearanceChangeState {
  background: boolean;
  text: boolean;
}

/** Creates a tag with overrides only for values the user changed. */
export function createTagWithAppearanceChanges(
  name: string,
  appearance: TagAppearance,
  changed: TagAppearanceChangeState,
): Tag {
  return {
    name,
    ...(changed.background ? { color: appearance.background } : {}),
    ...(changed.text ? { textColor: appearance.text } : {}),
  };
}

export const DEFAULT_TAG_APPEARANCE_SETTINGS: TagAppearanceSettings = {
  availableTags: [],
  defaultTagColor: DEFAULT_TAG_COLOR,
  defaultTagTextColor: DEFAULT_TAG_TEXT_COLOR,
};

/**
 * Resolves a tag's appearance using the canonical registry when it has an
 * entry, then its own stored appearance only when it is an orphan.
 */
export function resolveTagAppearance(
  tag: Tag,
  settings: TagAppearanceSettings,
): TagAppearance {
  const registryTag = settings.availableTags?.find(
    (candidate) => candidate.name.toLowerCase() === tag.name.toLowerCase(),
  );
  const source = registryTag ?? tag;
  return {
    background: source.color ?? settings.defaultTagColor ?? DEFAULT_TAG_COLOR,
    text:
      source.textColor ??
      settings.defaultTagTextColor ??
      DEFAULT_TAG_TEXT_COLOR,
  };
}

/** Applies a resolved tag pair for filled chips and a background for swatches. */
export function applyTagAppearance(
  element: HTMLElement,
  tag: Tag,
  settings: TagAppearanceSettings,
): void {
  const appearance = resolveTagAppearance(tag, settings);
  element.style.setProperty("--tag-color", appearance.background);
  element.style.setProperty("--tag-text-color", appearance.text);
}

/**
 * Bounds for generated tag colors. Chip text is white, so lightness stays in
 * a band that keeps it readable and never lands near white or black, and a
 * saturation floor keeps colors away from grays.
 */
const RANDOM_LIGHTNESS = { min: 35, max: 55 };
const RANDOM_SATURATION = { min: 50, max: 85 };
const GOLDEN_ANGLE_DEGREES = 137.508;

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [r, g, b] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = l - chroma / 2;
  return `#${[r, g, b]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function between(random: () => number, bounds: { min: number; max: number }) {
  return bounds.min + random() * (bounds.max - bounds.min);
}

/**
 * Returns `count` random tag colors. Hues start at a random angle and step by
 * the golden angle, so colors generated together stay visually distinct.
 */
export function randomTagColors(
  count: number,
  random: () => number = Math.random,
): string[] {
  const startHue = random() * 360;
  return Array.from({ length: count }, (_, index) =>
    hslToHex(
      (startHue + index * GOLDEN_ANGLE_DEGREES) % 360,
      between(random, RANDOM_SATURATION),
      between(random, RANDOM_LIGHTNESS),
    ),
  );
}

/**
 * Any color at all: each channel is an independent random byte. Unlike
 * `randomTagColors`, nothing keeps the result readable against another color.
 */
export function randomHexColor(random: () => number = Math.random): string {
  return `#${[0, 1, 2]
    .map(() =>
      Math.min(255, Math.floor(random() * 256))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
