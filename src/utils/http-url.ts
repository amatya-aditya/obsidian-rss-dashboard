/**
 * Whether a value is an absolute `http(s)` URL. The cover-image action's gate
 * and its request both use this, so a control is offered exactly when the
 * request can run. Similar checks exist in the feed parser, the validation
 * helpers and the image-url helpers; this one is the feature's own.
 */
export function isHttpUrl(url: string | null | undefined): boolean {
  return /^https?:\/\//i.test((url ?? "").trim());
}
