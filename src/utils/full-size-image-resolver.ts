import { isLatexFormulaImageElement } from "./image-url-utils";

export { resolveFullResolutionImageSource } from "./full-resolution-image-source";
export type { ResolvedImageSource } from "./full-resolution-image-source";
export { stripCdnResizeParameters } from "./image-url-normalization";

/**
 * Checks whether an image element in reader content should trigger the full-resolution lightbox.
 * Filters out LaTeX formulas, 1x1 tracking pixels, and UI elements.
 */
export function isLightboxEligibleImage(
  img: HTMLImageElement | null | undefined,
): boolean {
  if (
    !img ||
    typeof img.tagName !== "string" ||
    img.tagName.toLowerCase() !== "img"
  ) {
    return false;
  }

  if (isLatexFormulaImageElement(img)) {
    return false;
  }

  // Filter 1x1 transparent tracking pixels or spacer GIFs
  const src = (img.getAttribute("src") || "").trim();
  if (
    src.startsWith("data:image/gif;base64,R0lGODlhAQABA") ||
    src.startsWith("data:image/svg+xml")
  ) {
    return false;
  }

  // Dimension attributes when explicitly declared tiny (< 5px)
  const widthAttr = parseInt(img.getAttribute("width") || "", 10);
  const heightAttr = parseInt(img.getAttribute("height") || "", 10);
  if (
    (!Number.isNaN(widthAttr) && widthAttr > 0 && widthAttr < 5) ||
    (!Number.isNaN(heightAttr) && heightAttr > 0 && heightAttr < 5)
  ) {
    return false;
  }

  // Filter known non-article images
  const classList = img.classList;
  if (
    classList.contains("rss-feed-icon") ||
    classList.contains("rss-author-avatar") ||
    classList.contains("rss-reader-ui-icon")
  ) {
    return false;
  }

  return true;
}
