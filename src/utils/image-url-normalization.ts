import { normalizeSubstackImageUrl } from "./substack-image-url";
import { hostMatches, hostPathMatches } from "./url-host";

export function isSubstackImageFetchUrl(url: string): boolean {
  const absolute = url.startsWith("//") ? `https:${url}` : url;
  return hostPathMatches(absolute, "substackcdn.com", "/image/fetch/");
}

/**
 * Strips common CDN image downscaling and resizing query/path parameters to restore the original full size.
 */
export function stripCdnResizeParameters(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  // Substack CDN fetch URLs
  if (isSubstackImageFetchUrl(trimmed)) {
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
    if (
      hostMatches(trimmed, "cloudinary.com") &&
      url.pathname.includes("/upload/")
    ) {
      url.pathname = url.pathname.replace(
        /\/upload\/[a-z]_[^/]+\//i,
        "/upload/",
      );
      return url.toString();
    }

    // Brightspot / NPR CDN resize
    if (
      hostMatches(trimmed, "brightspotcdn.com") ||
      hostMatches(trimmed, "media.npr.org")
    ) {
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
