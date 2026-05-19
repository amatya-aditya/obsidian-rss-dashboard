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

export function recoverFailedSubstackImageElement(
  img: HTMLImageElement,
): boolean {
  if (img.dataset.rssSubstackRecoverAttempted === "true") {
    return false;
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
      return false;
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
    return false;
  }

  img.dataset.rssSubstackRecoverAttempted = "true";
  let didRecover = false;
  const normalizedCurrentSrc = normalizeSubstackImageUrl(currentSrc);

  if (picture) {
    for (const source of Array.from(
      picture.querySelectorAll<HTMLSourceElement>("source[srcset]"),
    )) {
      const srcset = source.getAttribute("srcset") || "";
      const normalizedSrcset = normalizeSubstackImageSrcset(srcset);
      if (normalizedSrcset && normalizedSrcset !== srcset) {
        source.setAttribute("srcset", normalizedSrcset);
        didRecover = true;
      }
    }
  }

  if (rawSrcset) {
    const normalizedSrcset = normalizeSubstackImageSrcset(rawSrcset);
    if (normalizedSrcset && normalizedSrcset !== rawSrcset) {
      img.setAttribute("srcset", normalizedSrcset);
      didRecover = true;
    }
  }

  const normalizedSrc = normalizeSubstackImageUrl(rawSrc || currentSrc);
  if (normalizedSrc && normalizedSrc !== (rawSrc || "")) {
    img.setAttribute("src", normalizedSrc);
    didRecover = true;
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
    didRecover = true;
  }

  return didRecover;
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
