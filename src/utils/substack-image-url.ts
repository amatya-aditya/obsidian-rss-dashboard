import { recoverFailedSubstackImageElementImpl } from "./substack-image-recovery";

function decodeSubstackImageFetchUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!/^https:\/\/substackcdn\.com\/image\/fetch\//i.test(trimmed)) {
    return null;
  }

  const lastSlashIndex = trimmed.lastIndexOf("/");
  if (lastSlashIndex === -1 || lastSlashIndex === trimmed.length - 1) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(trimmed.slice(lastSlashIndex + 1));
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function decodeEncodedTrailingUrl(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(/https?%3A%2F%2F[^\s"')<>]+/i);
  if (!match) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(match[0]);
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function hasRecoverableSubstackImageUrl(
  url: string | null | undefined,
): boolean {
  const trimmed = (url || "").trim();
  if (!trimmed) {
    return false;
  }

  return normalizeSubstackImageUrl(trimmed) !== trimmed;
}

export function normalizeSubstackImageUrl(
  url: string | null | undefined,
): string {
  const trimmed = (url || "").trim();
  if (!trimmed) {
    return "";
  }

  return (
    decodeSubstackImageFetchUrl(trimmed) ||
    decodeEncodedTrailingUrl(trimmed) ||
    trimmed
  );
}

export function normalizeSubstackImageSrcset(
  srcset: string | null | undefined,
): string {
  const trimmed = (srcset || "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .split(/,\s+(?=(?:https?:\/\/|data:image\/))/i)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const firstSpace = entry.search(/\s/);
      const url = firstSpace === -1 ? entry : entry.slice(0, firstSpace);
      const descriptor =
        firstSpace === -1 ? "" : entry.slice(firstSpace).trim();
      const normalizedUrl = normalizeSubstackImageUrl(url);
      return descriptor ? `${normalizedUrl} ${descriptor}` : normalizedUrl;
    })
    .join(", ");
}

export function normalizeSubstackImageUrlsInDocument(doc: Document): void {
  normalizeSubstackImageUrlsInRoot(doc);
}

export function normalizeSubstackImageUrlsInElement(root: ParentNode): void {
  normalizeSubstackImageUrlsInRoot(root);
}

/**
 * Recovers a failed Substack image by normalizing its URL or, when the chosen
 * source cannot be decoded, by replacing the image with a clone pointed at the
 * original. Returns the replacement element when one was created, so the caller
 * can re-apply its event listeners; a clone does not inherit them. Returns null
 * when the image was fixed in place (listeners survive) or left alone.
 */
export function recoverFailedSubstackImageElement(
  img: HTMLImageElement,
): HTMLImageElement | null {
  return recoverFailedSubstackImageElementImpl(img, {
    normalizeSubstackImageUrl,
    normalizeSubstackImageSrcset,
    hasRecoverableSubstackImageUrl,
  });
}

function normalizeSubstackImageUrlsInRoot(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>("img[src]").forEach((el) => {
    const normalized = normalizeSubstackImageUrl(el.getAttribute("src"));
    if (normalized) {
      el.setAttribute("src", normalized);
    }
  });

  root
    .querySelectorAll<HTMLElement>("img[srcset], source[srcset]")
    .forEach((el) => {
      const normalized = normalizeSubstackImageSrcset(
        el.getAttribute("srcset"),
      );
      if (normalized) {
        el.setAttribute("srcset", normalized);
      }
    });

  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((el) => {
    const normalized = normalizeSubstackImageUrl(el.getAttribute("href"));
    if (normalized) {
      el.setAttribute("href", normalized);
    }
  });
}
