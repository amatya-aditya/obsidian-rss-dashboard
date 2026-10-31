import {
  normalizeSubstackImageUrl,
  normalizeSubstackImageUrlsInDocument,
} from "./substack-image-url";
import {
  cleanFetchedArticleDocument,
  isLikelySameImageSource,
  removeLeadImageElement,
} from "./reader-html-cleanup";
import {
  findFirstNonFormulaImage,
  promoteLazyImageSources,
} from "./image-url-utils";

export interface PrepareArticleHtmlOptions {
  baseUrl: string;
  fallbackHeroUrl?: string;
  title?: string;
  heroSlot?: HTMLElement;
  stripTopHeadline?: boolean;
  feedDescriptionHtml?: string;
}

/** Rewrites relative `a[href]` and `img[src]` against `baseUrl`. */
export function resolveDocumentUrls(doc: Document, baseUrl: string): void {
  if (baseUrl) {
    const base = new URL(baseUrl);
    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (!href) return;
      try {
        el.setAttribute("href", new URL(href, base).toString());
      } catch {
        /* intentionally empty */
      }
    });
    doc.querySelectorAll("img").forEach((el) => {
      const src = el.getAttribute("src");
      if (!src) return;
      try {
        el.setAttribute("src", new URL(src, base).toString());
      } catch {
        /* intentionally empty */
      }
    });
  }
}

/** Seeds an empty hero slot and drops the body's lead image when it repeats it. */
export function insertFallbackHero(
  doc: Document,
  heroSlot: HTMLElement | undefined,
  fallbackHeroUrl: string | undefined,
  title: string | undefined,
): void {
  if (heroSlot) {
    const firstImg = findFirstNonFormulaImage(doc.body);
    if (heroSlot.childElementCount === 0) {
      let heroUrl = normalizeSubstackImageUrl(fallbackHeroUrl);
      const firstImgSrc = normalizeSubstackImageUrl(
        firstImg?.getAttribute("src")?.trim() || "",
      );
      if (!heroUrl && firstImgSrc) heroUrl = firstImgSrc;
      if (heroUrl) {
        heroSlot.createEl("img", {
          cls: "rss-reader-fallback-hero",
          attr: { src: heroUrl, alt: title || "Hero image" },
        });
        if (
          firstImg &&
          firstImgSrc &&
          isLikelySameImageSource(firstImgSrc, heroUrl)
        ) {
          removeLeadImageElement(firstImg);
        }
      }
    }
  }
}

/**
 * Parses `rawHtml`, makes its URLs absolute, strips reader chrome and seeds
 * the hero slot. Returns `rawHtml` unchanged if any step throws.
 */
export function prepareArticleHtml(
  rawHtml: string,
  options: PrepareArticleHtmlOptions,
): string {
  const {
    baseUrl,
    fallbackHeroUrl,
    title,
    heroSlot,
    stripTopHeadline,
    feedDescriptionHtml,
  } = options;
  let html = rawHtml;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    promoteLazyImageSources(doc);

    resolveDocumentUrls(doc, baseUrl);

    normalizeSubstackImageUrlsInDocument(doc);

    doc.body
      .querySelectorAll(
        ".image-link-expand, button.restack-image, button.view-image",
      )
      .forEach((el) => el.remove());

    if (stripTopHeadline) {
      // The same cleanup the dedicated Reader and the save path run (#1362).
      cleanFetchedArticleDocument(doc, {
        feedDescriptionHtml,
        fallbackHeroUrl,
      });
    }

    insertFallbackHero(doc, heroSlot, fallbackHeroUrl, title);

    doc.body
      .querySelectorAll<HTMLElement>(
        "[aria-label], [data-tooltip], [data-tooltip-position], [data-tooltip-delay]",
      )
      .forEach((el) => {
        el.removeAttribute("aria-label");
        el.removeAttribute("data-tooltip");
        el.removeAttribute("data-tooltip-position");
        el.removeAttribute("data-tooltip-delay");
      });

    html = doc.body.innerHTML;
  } catch {
    /* intentionally empty */
  }

  return html;
}
