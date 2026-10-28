import { extractHighestResolutionFromSrcset } from "./image-url-utils";
import {
  isSubstackImageFetchUrl,
  stripCdnResizeParameters,
} from "./image-url-normalization";

const COMMON_IMAGE_EXTENSIONS =
  /\.(?:jpe?g|png|webp|gif|avif|svg|bmp)(?:[?#]|$)/i;

export interface ResolvedImageSource {
  previewUrl: string;
  fullUrl: string;
  altText: string;
  externalHref?: string;
}

function getAnchorImageSource(img: HTMLImageElement): {
  candidateUrl: string;
  externalHref: string | undefined;
} {
  const anchor = img.closest("a");
  if (!anchor || !anchor.hasAttribute("href")) {
    return { candidateUrl: "", externalHref: undefined };
  }

  const href = (anchor.getAttribute("href") || "").trim();
  if (
    COMMON_IMAGE_EXTENSIONS.test(href) ||
    isSubstackImageFetchUrl(href) ||
    /^data:image\//i.test(href)
  ) {
    return { candidateUrl: href, externalHref: undefined };
  }

  if (/^https?:\/\//i.test(href)) {
    return { candidateUrl: "", externalHref: href };
  }

  return { candidateUrl: "", externalHref: undefined };
}

function getSrcsetCandidate(img: HTMLImageElement): string {
  return extractHighestResolutionFromSrcset(img.getAttribute("srcset")) || "";
}

function getLazyLoadingCandidate(img: HTMLImageElement): string {
  const dataSrc =
    img.dataset.original ||
    img.dataset.fullUrl ||
    img.dataset.origFile ||
    img.dataset.largeFile ||
    img.dataset.src;
  return dataSrc ? dataSrc.trim() : "";
}

function getFallbackCandidate(img: HTMLImageElement): string {
  return img.getAttribute("src") || img.currentSrc || "";
}

/**
 * Resolves the full-resolution image source and any enclosing external link for a reader image element.
 */
export function resolveFullResolutionImageSource(
  img: HTMLImageElement,
): ResolvedImageSource {
  const previewUrl = img.currentSrc || img.getAttribute("src") || "";
  const altText = img.getAttribute("alt") || "";
  const anchorSource = getAnchorImageSource(img);

  let candidateUrl = anchorSource.candidateUrl;
  if (!candidateUrl) {
    candidateUrl = getSrcsetCandidate(img);
  }
  if (!candidateUrl) {
    candidateUrl = getLazyLoadingCandidate(img);
  }
  if (!candidateUrl) {
    candidateUrl = getFallbackCandidate(img);
  }

  const fullUrl = stripCdnResizeParameters(candidateUrl) || candidateUrl;

  return {
    previewUrl,
    fullUrl,
    altText,
    externalHref: anchorSource.externalHref,
  };
}
