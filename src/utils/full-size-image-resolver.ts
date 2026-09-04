import { isLatexFormulaImageElement } from "./image-url-utils";
import { normalizeSubstackImageUrl } from "./substack-image-url";

export interface ResolvedImageSource {
  previewUrl: string;
  fullUrl: string;
  altText: string;
  externalHref?: string;
}

const COMMON_IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|gif|avif|svg|bmp)(?:[?#]|$)/i;

/**
 * Checks whether an image element in reader content should trigger the full-resolution lightbox.
 * Filters out LaTeX formulas, 1x1 tracking pixels, and UI elements.
 */
export function isLightboxEligibleImage(img: HTMLImageElement | null | undefined): boolean {
  if (!img || typeof img.tagName !== "string" || img.tagName.toLowerCase() !== "img") {
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

/**
 * Parses a srcset attribute and returns the URL corresponding to the highest width or density.
 */
export function extractHighestResolutionFromSrcset(srcset: string | null | undefined): string | null {
  const trimmed = (srcset || "").trim();
  if (!trimmed) return null;

  const entries = trimmed
    .split(/,\s+(?=(?:https?:\/\/|data:image\/|\/))/i)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) return null;

  let bestUrl: string | null = null;
  let bestScore = -1;

  for (const entry of entries) {
    const parts = entry.split(/\s+/);
    const url = parts[0];
    const descriptor = parts[1] || "";

    let score = 1;
    if (descriptor.endsWith("w")) {
      const width = parseInt(descriptor.slice(0, -1), 10);
      if (!Number.isNaN(width)) {
        score = width;
      }
    } else if (descriptor.endsWith("x")) {
      const density = parseFloat(descriptor.slice(0, -1));
      if (!Number.isNaN(density)) {
        score = density * 1000;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }

  return bestUrl;
}

/**
 * Strips common CDN image downscaling and resizing query/path parameters to restore the original full size.
 */
export function stripCdnResizeParameters(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  // Substack CDN fetch URLs
  if (trimmed.includes("substackcdn.com/image/fetch/")) {
    const normalizedSubstack = normalizeSubstackImageUrl(trimmed);
    if (normalizedSubstack) {
      return stripCdnResizeParameters(normalizedSubstack);
    }
  }

  try {
    const url = new URL(trimmed);

    // WordPress Photon (i0.wp.com, i1.wp.com, etc.)
    if (/^i[0-3]\.wp\.com$/i.test(url.hostname)) {
      url.searchParams.delete("w");
      url.searchParams.delete("h");
      url.searchParams.delete("resize");
      url.searchParams.delete("fit");
      url.searchParams.delete("crop");
      return url.toString();
    }

    // Cloudinary /upload/w_...,c_scale/
    if (url.hostname.includes("cloudinary.com") && url.pathname.includes("/upload/")) {
      url.pathname = url.pathname.replace(/\/upload\/(?:[a-z]_[^/]+,?)+\//i, "/upload/");
      return url.toString();
    }

    // Brightspot / NPR CDN resize
    if (url.hostname.includes("brightspotcdn.com") || url.hostname.includes("media.npr.org")) {
      url.pathname = url.pathname.replace(/\/resize\/\d+x\d*!?\//g, "/");
      return url.toString();
    }

    // Generic resize params like ?width=, ?maxwidth=, ?w=, ?resize=
    if (
      url.searchParams.has("w") ||
      url.searchParams.has("width") ||
      url.searchParams.has("maxwidth") ||
      url.searchParams.has("resize")
    ) {
      url.searchParams.delete("w");
      url.searchParams.delete("width");
      url.searchParams.delete("maxwidth");
      url.searchParams.delete("resize");
      url.searchParams.delete("h");
      url.searchParams.delete("height");
      return url.toString();
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Resolves the full-resolution image source and any enclosing external link for a reader image element.
 */
export function resolveFullResolutionImageSource(img: HTMLImageElement): ResolvedImageSource {
  const previewUrl = img.currentSrc || img.getAttribute("src") || "";
  const altText = img.getAttribute("alt") || "";

  let candidateUrl = "";
  let externalHref: string | undefined;

  // 1. Inspect enclosing anchor link
  const anchor = img.closest("a");
  if (anchor && anchor.hasAttribute("href")) {
    const href = (anchor.getAttribute("href") || "").trim();
    if (
      COMMON_IMAGE_EXTENSIONS.test(href) ||
      href.includes("substackcdn.com/image/fetch/") ||
      /^data:image\//i.test(href)
    ) {
      candidateUrl = href;
    } else if (/^https?:\/\//i.test(href)) {
      externalHref = href;
    }
  }

  // 2. Inspect srcset for highest resolution candidate if no direct image anchor link found
  if (!candidateUrl) {
    const srcsetCandidate = extractHighestResolutionFromSrcset(img.getAttribute("srcset"));
    if (srcsetCandidate) {
      candidateUrl = srcsetCandidate;
    }
  }

  // 3. Inspect common lazy-loading data attributes
  if (!candidateUrl) {
    const dataSrc =
      img.dataset.original ||
      img.dataset.fullUrl ||
      img.dataset.origFile ||
      img.dataset.largeFile ||
      img.dataset.src;
    if (dataSrc) {
      candidateUrl = dataSrc.trim();
    }
  }

  // 4. Fallback to image src or currentSrc
  if (!candidateUrl) {
    candidateUrl = img.getAttribute("src") || img.currentSrc || "";
  }

  // 5. Strip CDN resizing transformations to yield original full size
  const fullUrl = stripCdnResizeParameters(candidateUrl) || candidateUrl;

  return {
    previewUrl,
    fullUrl,
    altText,
    externalHref,
  };
}
