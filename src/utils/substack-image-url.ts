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
  if (img.dataset.rssSubstackRecoverAttempted === "true") {
    return null;
  }

  const rawSrc = img.getAttribute("src");
  const rawSrcset = img.getAttribute("srcset");
  const currentSrc = img.currentSrc || "";
  const normalizedRawSrc = normalizeSubstackImageUrl(rawSrc || "");
  const picture = img.closest("picture");
  const pictureSourceSrcsets = picture
    ? Array.from(
        picture.querySelectorAll<HTMLSourceElement>("source[srcset]"),
      ).map((source) => source.getAttribute("srcset") || "")
    : [];

  const hasRecoverableUrl = [
    rawSrc,
    rawSrcset,
    currentSrc,
    ...pictureSourceSrcsets,
  ].some((value) => hasRecoverableSubstackImageUrl(value));
  if (!hasRecoverableUrl) {
    if (!currentSrc || !normalizedRawSrc || normalizedRawSrc === currentSrc) {
      return null;
    }
  }

  if (
    !hasRecoverableUrl &&
    currentSrc &&
    normalizedRawSrc &&
    normalizedRawSrc !== currentSrc
  ) {
    // Continue into fallback recovery below using the already-normalized img src.
  } else if (!hasRecoverableUrl) {
    return null;
  }

  img.dataset.rssSubstackRecoverAttempted = "true";
  let replacementElement: HTMLImageElement | null = null;
  const normalizedCurrentSrc = normalizeSubstackImageUrl(currentSrc);

  if (picture) {
    for (const source of Array.from(
      picture.querySelectorAll<HTMLSourceElement>("source[srcset]"),
    )) {
      const srcset = source.getAttribute("srcset") || "";
      const normalizedSrcset = normalizeSubstackImageSrcset(srcset);
      if (normalizedSrcset && normalizedSrcset !== srcset) {
        source.setAttribute("srcset", normalizedSrcset);
      }
    }
  }

  if (rawSrcset) {
    const normalizedSrcset = normalizeSubstackImageSrcset(rawSrcset);
    if (normalizedSrcset && normalizedSrcset !== rawSrcset) {
      img.setAttribute("srcset", normalizedSrcset);
    }
  }

  const normalizedSrc = normalizeSubstackImageUrl(rawSrc || currentSrc);
  if (normalizedSrc && normalizedSrc !== (rawSrc || "")) {
    img.setAttribute("src", normalizedSrc);
  }

  if (
    currentSrc.trim() !== "" &&
    ((normalizedCurrentSrc && normalizedCurrentSrc !== currentSrc) ||
      (normalizedRawSrc && normalizedRawSrc !== currentSrc))
  ) {
    if (picture) {
      picture.querySelectorAll("source").forEach((source) => source.remove());
    }

    const replacement = img.cloneNode(true) as HTMLImageElement;
    replacement.dataset.rssSubstackRecoverAttempted = "true";
    replacement.removeAttribute("srcset");
    replacement.removeAttribute("sizes");
    const recoverySrc =
      normalizedCurrentSrc && normalizedCurrentSrc !== currentSrc
        ? normalizedCurrentSrc
        : normalizedRawSrc;
    replacement.setAttribute("src", recoverySrc);
    img.replaceWith(replacement);
    replacementElement = replacement;
  }

  return replacementElement;
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
