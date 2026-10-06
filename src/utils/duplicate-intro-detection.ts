// The one test for "this description just restates the article's opening"
// (#247, ADR 0007 "Duplicate-intro suppression"). Shared by every caller that
// needs it, so none keeps a private copy.
import { htmlToReadableText } from "./html-text";

/** A prefix match needs at least this many normalized characters. */
export const DUPLICATE_INTRO_MIN_PREFIX_LENGTH = 30;

/**
 * Removes one trailing ellipsis in any form feeds use for a truncated blurb:
 * "...", "…", or WordPress's bracketed "[…]". Scans from the end rather than
 * using a regex, so a long run of dots cannot cause quadratic backtracking.
 */
function stripTrailingEllipsis(text: string): string {
  let end = text.trimEnd().length;
  const skipWhitespace = (): void => {
    while (end > 0 && /\s/.test(text.charAt(end - 1))) end--;
  };

  const bracketed = text.charAt(end - 1) === "]";
  if (bracketed) {
    end--;
    skipWhitespace();
  }

  const runEnd = end;
  while (end > 0 && /[.…]/.test(text.charAt(end - 1))) end--;
  const run = text.slice(end, runEnd);
  if (!run.includes("…") && run.length < 3) return text;

  if (bracketed) {
    skipWhitespace();
    if (text.charAt(end - 1) !== "[") return text;
    end--;
  }
  return text.slice(0, end);
}

function normalizeIntro(html: string): string {
  const text = htmlToReadableText(html)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase();
  return stripTrailingEllipsis(text).trim();
}

/**
 * True when `candidateHtml` restates the start of `bodyHtml`: an exact match,
 * or one side a prefix of the other at {@link DUPLICATE_INTRO_MIN_PREFIX_LENGTH}
 * characters or more, after markup, case, curly quotes, whitespace and a
 * trailing ellipsis are normalized away. Either argument may be the longer one.
 *
 * It does not flag a lightly reworded near-duplicate: when unsure, the text
 * stays visible, because hiding real publisher prose costs more than showing
 * the same words twice.
 */
export function isDuplicateIntro(
  candidateHtml: string,
  bodyHtml: string,
): boolean {
  const candidate = normalizeIntro(candidateHtml);
  const body = normalizeIntro(bodyHtml);
  if (!candidate || !body) return false;
  if (candidate === body) return true;

  const [shorter, longer] =
    candidate.length <= body.length ? [candidate, body] : [body, candidate];
  return (
    shorter.length >= DUPLICATE_INTRO_MIN_PREFIX_LENGTH &&
    longer.startsWith(shorter)
  );
}
