/**
 * Ad and promo containers that must not reach a saved note. The article saver
 * and the Reader's own save builder both drop them, so the selector lives here
 * rather than in either caller (#1195).
 */
export const AD_CONTAINER_SELECTOR =
  ".ad, .ads, .advertisement, div[class*='ad-'], div[id*='ad-'], div[class*='ads-'], div[id*='ads-']";

/** Removes ad containers from a parsed page. */
export function stripAdContainers(doc: Document): void {
  doc.querySelectorAll(AD_CONTAINER_SELECTOR).forEach((el) => el.remove());
}

/** Removes ad containers from an HTML string, leaving the rest untouched. */
export function stripAdContainersFromHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    stripAdContainers(doc);
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}
