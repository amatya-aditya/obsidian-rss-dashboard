/**
 * Shared contract for the tag chip shape preference (#663): the persisted
 * default, the preset table, the CSS custom property and workspace event
 * names, and a pure grammar validator. This module imports nothing so the
 * settings types, loader, bundle import, UI and style service can all share it.
 */

/** Pill, the default radius for new installs and unrecognized stored values. */
export const DEFAULT_TAG_CHIP_RADIUS = "999px";

/** Custom property the stylesheet reads for every in-scope tag chip. */
export const TAG_CHIP_RADIUS_CSS_VAR = "--rss-dashboard-tag-chip-radius";

/** Workspace event triggered after the preference changes. */
export const TAG_CHIP_RADIUS_EVENT = "rss-dashboard:tag-chip-radius-changed";

export interface TagChipRadiusPreset {
  id: "rectangle" | "squircle" | "pill";
  label: string;
  value: string;
}

export const TAG_CHIP_RADIUS_PRESETS: readonly TagChipRadiusPreset[] = [
  { id: "rectangle", label: "Rectangle", value: "0px" },
  { id: "squircle", label: "Squircle", value: "6px" },
  { id: "pill", label: "Pill", value: DEFAULT_TAG_CHIP_RADIUS },
];

const MAX_RADIUS_LENGTH = 120;
const MAX_CORNER_TOKENS = 4;

const LENGTH_UNITS =
  "px|em|rem|ex|rex|ch|rch|cap|rcap|ic|ric|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cqw|cqh|cqi|cqb|cqmin|cqmax|cm|mm|q|in|pt|pc|%";

// A non-negative number followed by a length unit, or a bare zero.
const RADIUS_TOKEN = new RegExp(
  String.raw`^(?:0+(?:\.0+)?|\+?(?:\d+\.?\d*|\.\d+)(?:${LENGTH_UNITS}))$`,
);

function isValidTokenList(tokens: string[]): boolean {
  return (
    tokens.length >= 1 &&
    tokens.length <= MAX_CORNER_TOKENS &&
    tokens.every((token) => RADIUS_TOKEN.test(token))
  );
}

/**
 * Canonicalize a candidate radius when it matches the supported grammar:
 * one to four non-negative length or percentage values, optionally followed by
 * a `/` and one to four more. Returns the lower-cased value with single spaces
 * around `/`, or null when the text is not supported. `calc()`, `var()`, CSS-wide
 * keywords, negative values, and anything that could carry extra declarations
 * are rejected.
 * @param {unknown} value Candidate text, such as the custom field's content
 * @returns {string | null} Canonical radius text, or null when invalid
 */
export function parseTagChipRadius(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (!text || text.length > MAX_RADIUS_LENGTH) return null;

  const halves = text.split("/");
  if (halves.length > 2) return null;

  const tokenLists = halves.map((half) =>
    half.trim() === "" ? [] : half.trim().split(/\s+/),
  );
  if (!tokenLists.every(isValidTokenList)) return null;

  return tokenLists.map((tokens) => tokens.join(" ")).join(" / ");
}

/**
 * @param {unknown} value Candidate radius text
 * @returns {boolean} true when the value is a supported border-radius
 */
export function isValidTagChipRadius(value: unknown): boolean {
  return parseTagChipRadius(value) !== null;
}

/**
 * Return the canonical radius for a stored or typed value, falling back to
 * Pill when it is missing, not a string, or not supported.
 * @param {unknown} value Stored or typed radius
 * @returns {string} A valid radius, never an empty string
 */
export function normalizeTagChipRadius(value: unknown): string {
  return parseTagChipRadius(value) ?? DEFAULT_TAG_CHIP_RADIUS;
}

/**
 * Find the preset whose value equals the given radius after canonicalization.
 * @param {unknown} value Stored or typed radius
 * @returns {TagChipRadiusPreset | undefined} The matching preset, if any
 */
export function findTagChipRadiusPreset(
  value: unknown,
): TagChipRadiusPreset | undefined {
  const canonical = parseTagChipRadius(value);
  if (canonical === null) return undefined;
  return TAG_CHIP_RADIUS_PRESETS.find(
    (preset) => parseTagChipRadius(preset.value) === canonical,
  );
}

/**
 * Rewrite `display.tagChipRadius` in place to its normalized value.
 * @param {{ tagChipRadius?: unknown }} display Display settings group to repair
 * @returns {boolean} true when the stored value changed
 */
export function repairTagChipRadius(display: {
  tagChipRadius?: unknown;
}): boolean {
  const normalized = normalizeTagChipRadius(display.tagChipRadius);
  if (display.tagChipRadius === normalized) return false;
  display.tagChipRadius = normalized;
  return true;
}
