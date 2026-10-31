interface SubstackImageRecoveryHelpers {
  normalizeSubstackImageUrl(url: string | null | undefined): string;
  normalizeSubstackImageSrcset(srcset: string | null | undefined): string;
  hasRecoverableSubstackImageUrl(url: string | null | undefined): boolean;
}

function getPictureSourceSrcsets(picture: HTMLPictureElement | null): string[] {
  return picture
    ? Array.from(
        picture.querySelectorAll<HTMLSourceElement>("source[srcset]"),
      ).map((source) => source.getAttribute("srcset") || "")
    : [];
}

function hasRecoverableCandidate(
  rawSrc: string | null,
  rawSrcset: string | null,
  currentSrc: string,
  pictureSourceSrcsets: string[],
  helpers: SubstackImageRecoveryHelpers,
): boolean {
  return [rawSrc, rawSrcset, currentSrc, ...pictureSourceSrcsets].some(
    (value) => helpers.hasRecoverableSubstackImageUrl(value),
  );
}

function shouldStartRecovery(
  hasRecoverableUrl: boolean,
  currentSrc: string,
  normalizedRawSrc: string,
): boolean {
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

  return true;
}

function normalizePictureSources(
  picture: HTMLPictureElement | null,
  helpers: SubstackImageRecoveryHelpers,
): void {
  if (!picture) return;

  for (const source of Array.from(
    picture.querySelectorAll<HTMLSourceElement>("source[srcset]"),
  )) {
    const srcset = source.getAttribute("srcset") || "";
    const normalizedSrcset = helpers.normalizeSubstackImageSrcset(srcset);
    if (normalizedSrcset && normalizedSrcset !== srcset) {
      source.setAttribute("srcset", normalizedSrcset);
    }
  }
}

function normalizeImageSources(
  img: HTMLImageElement,
  rawSrcset: string | null,
  rawSrc: string | null,
  currentSrc: string,
  helpers: SubstackImageRecoveryHelpers,
): void {
  if (rawSrcset) {
    const normalizedSrcset = helpers.normalizeSubstackImageSrcset(rawSrcset);
    if (normalizedSrcset && normalizedSrcset !== rawSrcset) {
      img.setAttribute("srcset", normalizedSrcset);
    }
  }

  const normalizedSrc = helpers.normalizeSubstackImageUrl(rawSrc || currentSrc);
  if (normalizedSrc && normalizedSrc !== (rawSrc || "")) {
    img.setAttribute("src", normalizedSrc);
  }
}

function shouldReplaceImage(
  currentSrc: string,
  normalizedCurrentSrc: string,
  normalizedRawSrc: string,
): boolean {
  return Boolean(
    currentSrc.trim() !== "" &&
    ((normalizedCurrentSrc && normalizedCurrentSrc !== currentSrc) ||
      (normalizedRawSrc && normalizedRawSrc !== currentSrc)),
  );
}

function replaceImageWithRecoverySource(
  img: HTMLImageElement,
  picture: HTMLPictureElement | null,
  currentSrc: string,
  normalizedCurrentSrc: string,
  normalizedRawSrc: string,
): HTMLImageElement {
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
  return replacement;
}

export function recoverFailedSubstackImageElementImpl(
  img: HTMLImageElement,
  helpers: SubstackImageRecoveryHelpers,
): HTMLImageElement | null {
  if (img.dataset.rssSubstackRecoverAttempted === "true") {
    return null;
  }

  const rawSrc = img.getAttribute("src");
  const rawSrcset = img.getAttribute("srcset");
  const currentSrc = img.currentSrc || "";
  const normalizedRawSrc = helpers.normalizeSubstackImageUrl(rawSrc || "");
  const picture = img.closest("picture");
  const pictureSourceSrcsets = getPictureSourceSrcsets(picture);
  const hasRecoverableUrl = hasRecoverableCandidate(
    rawSrc,
    rawSrcset,
    currentSrc,
    pictureSourceSrcsets,
    helpers,
  );

  if (!shouldStartRecovery(hasRecoverableUrl, currentSrc, normalizedRawSrc)) {
    return null;
  }

  img.dataset.rssSubstackRecoverAttempted = "true";
  const normalizedCurrentSrc = helpers.normalizeSubstackImageUrl(currentSrc);

  normalizePictureSources(picture, helpers);
  normalizeImageSources(img, rawSrcset, rawSrc, currentSrc, helpers);

  if (shouldReplaceImage(currentSrc, normalizedCurrentSrc, normalizedRawSrc)) {
    return replaceImageWithRecoverySource(
      img,
      picture,
      currentSrc,
      normalizedCurrentSrc,
      normalizedRawSrc,
    );
  }

  return null;
}
