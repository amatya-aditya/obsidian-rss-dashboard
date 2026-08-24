export function optimizeImageUrl(url: string, maxWidth = 600): string {
  if (!url) return url;

  // NPR / Brightspot CDN
  if (url.includes("brightspotcdn.com") || url.includes("media.npr.org")) {
    return url
      .replace(/\/resize\/\d+x\d+!?\//g, `/resize/${maxWidth}x/`)
      .replace(
        /\/(?:crop\/)?\d+x\d+(?:[+]\d+[+]\d*)?\//g,
        "/",
      );
  }

  // WordPress Photon / Jetpack CDN
  if (
    url.includes("i0.wp.com") ||
    url.includes("i1.wp.com") ||
    url.includes("i2.wp.com")
  ) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("w", String(maxWidth));
      parsed.searchParams.delete("h");
      return parsed.toString();
    } catch {
      return url;
    }
  }

  // Cloudinary
  if (url.includes("cloudinary.com")) {
    return url.replace(/\/upload\//, `/upload/w_${maxWidth},c_scale/`);
  }

  // Generic: return unchanged (unknown CDN, no safe transform)
  return url;
}

/** Returns whether an image is a WordPress-rendered LaTeX formula. */
export function isLatexFormulaImage(
  src: string | null | undefined,
  className?: string | null,
): boolean {
  const hasLatexClass = (className ?? "")
    .split(/\s+/)
    .some((token) => token.toLowerCase() === "latex");
  if (hasLatexClass) return true;

  const trimmedSrc = src?.trim();
  if (!trimmedSrc) return false;

  try {
    const parsed = new URL(trimmedSrc, "https://rss-dashboard.invalid");
    return (
      parsed.pathname.toLowerCase().endsWith("/latex.php") &&
      parsed.searchParams.has("latex")
    );
  } catch {
    return /(?:^|\/)latex\.php\?[^#]*\blatex=/i.test(trimmedSrc);
  }
}

/** DOM convenience wrapper for {@link isLatexFormulaImage}. */
export function isLatexFormulaImageElement(image: Element): boolean {
  return isLatexFormulaImage(
    image.getAttribute("src"),
    image.getAttribute("class"),
  );
}

/** Returns the first non-empty URL that is not a rendered formula image. */
export function firstNonFormulaImageUrl(
  candidates: readonly (string | null | undefined)[],
): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && !isLatexFormulaImage(trimmed)) return trimmed;
  }
  return undefined;
}

/** Returns the first image element that is eligible for an article-media role. */
export function findFirstNonFormulaImage(
  root: ParentNode,
): HTMLImageElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLImageElement>("img")).find(
      (image) => !isLatexFormulaImageElement(image),
    ) ?? null
  );
}

/** Returns whether an element is or contains a rendered formula image. */
export function containsLatexFormulaImage(root: Element): boolean {
  if (
    root.tagName.toLowerCase() === "img" &&
    isLatexFormulaImageElement(root)
  ) {
    return true;
  }

  return Array.from(root.querySelectorAll("img")).some((image) =>
    isLatexFormulaImageElement(image),
  );
}

export function optimizeImageUrlsInContent(content: string, maxWidth = 600): string {
  if (!content) return content;

  return content.replace(
    /<img([^>]+)src=["']([^"']+)["']/gi,
    (match: string, attributes: string, src: string) => {
      const optimizedSrc = optimizeImageUrl(src, maxWidth);
      return `<img${attributes}src="${optimizedSrc}"`;
    }
  );
}

export function sanitizeImageUrl(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return "";
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://"))
    return "";
  return trimmed;
}
