/**
 * Whether a value is an absolute `http(s)` URL. The one place that check lives,
 * so a control that can only work on a real page address and the code that
 * performs the request cannot drift apart.
 */
export function isHttpUrl(url: string | null | undefined): boolean {
  // The cover-image feature's own gate and request share this; two older
  // copies of the same predicate live in the feed parser and the starred-import
  // mapper, which this change deliberately leaves alone.
  return /^https?:\/\//i.test(url ?? "");
}
