import { isLatexFormulaImageElement } from "./image-url-utils";

const LAZY_CLASS = "rss-reader-lazy-img";
const LOADING_CLASS = "is-loading";
const REVEALED_CLASS = "is-revealed";
const RATIO_PROPERTY = "--rss-img-ratio";
const WIDTH_PROPERTY = "--rss-img-width";

/** Positive integer pixel attribute, or null for absent, zero, or `50%`. */
function pixelAttribute(img: HTMLImageElement, name: string): number | null {
  const raw = img.getAttribute(name)?.trim() ?? "";
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 ? value : null;
}

/**
 * Lazy-load a reader image and fade it in once it arrives.
 *
 * While a load is pending the image shows a skeleton (`is-loading`); on both
 * `load` and `error` that class is swapped for `is-revealed`, which fades the
 * image in, so a broken or cached image is never left blank. When the author gave pixel dimensions, the aspect ratio
 * is reserved while loading so text does not jump. Formula images and the hero
 * image are left alone.
 */
export function applyReaderImageLoading(img: HTMLImageElement): void {
  if (isLatexFormulaImageElement(img)) return;
  if (img.closest(".rss-reader-cover-image")) return;
  if (img.classList.contains(LAZY_CLASS)) return;

  img.classList.add(LAZY_CLASS);
  if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
  img.setAttribute("decoding", "async");

  if (img.complete) return;

  img.classList.add(LOADING_CLASS);
  const width = pixelAttribute(img, "width");
  const height = pixelAttribute(img, "height");
  if (width && height) {
    img.setCssProps({
      [RATIO_PROPERTY]: `${width} / ${height}`,
      [WIDTH_PROPERTY]: `${width}px`,
    });
  }

  const reveal = (): void => {
    img.classList.remove(LOADING_CLASS);
    img.classList.add(REVEALED_CLASS);
    img.style.removeProperty(RATIO_PROPERTY);
    img.style.removeProperty(WIDTH_PROPERTY);
  };
  img.addEventListener("load", reveal, { once: true });
  img.addEventListener("error", reveal, { once: true });
}

export function applyReaderImageLoadingToAll(root: ParentNode): void {
  root.querySelectorAll("img").forEach((img) => {
    applyReaderImageLoading(img);
  });
}
