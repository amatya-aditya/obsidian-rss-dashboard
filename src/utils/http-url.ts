/**
 * Whether a value is an absolute `http(s)` URL. The one place that check lives,
 * so a control that can only work on a real page address and the code that
 * performs the request cannot drift apart.
 */
export function isHttpUrl(url: string | null | undefined): boolean {
  return /^https?:\/\//i.test(url ?? "");
}
