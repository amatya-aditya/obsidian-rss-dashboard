// DOM cleanup helpers for fetched full-article HTML in the reader view (#612,
// part of #436): navigation chrome, skip links, the top headline, duplicated
// lead content, and the image-source comparison behind lead-image removal.
// Moved verbatim from ReaderView; none of them touches view state.
import { containsLatexFormulaImage } from "./image-url-utils";
import { normalizeSubstackImageUrl } from "./substack-image-url";

export function stripTopHeadlineFromHtml(html: string): string {
  if (!html) return html;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    stripTopHeadlineFromDocument(doc);
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

export function stripNavigationChromeFromHtml(html: string): string {
  if (!html) return html;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    stripNavigationChromeFromDocument(doc);
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

export function stripTopHeadlineFromDocument(doc: Document): void {
  const h1 = doc.body?.querySelector("h1");
  if (!h1) return;

  const elements = Array.from(doc.body.querySelectorAll("*"));
  const idx = elements.indexOf(h1);
  if (idx === -1 || idx > 9) return;

  h1.remove();
}

export function stripNavigationChromeFromDocument(doc: Document): void {
  const body = doc.body;
  if (!body) return;

  const elements = Array.from(body.querySelectorAll<HTMLElement>("*"));
  if (elements.length === 0) return;

  const indexByEl = new Map<HTMLElement, number>();
  elements.forEach((el, idx) => indexByEl.set(el, idx));

  const substantialParagraphIndex = elements.findIndex((el) => {
    if (el.tagName.toLowerCase() !== "p") return false;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return text.length >= 120;
  });

  const cutoffIndex = Math.max(
    29,
    substantialParagraphIndex >= 0 ? substantialParagraphIndex - 1 : 29,
  );

  const hasBreadcrumbSignal = (el: HTMLElement): boolean => {
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const testId = (el.getAttribute("data-testid") || "").toLowerCase();
    const cls = (el.getAttribute("class") || "").toLowerCase();
    const id = (el.getAttribute("id") || "").toLowerCase();
    return (
      aria.includes("breadcrumb") ||
      testId.includes("breadcrumb") ||
      cls.includes("breadcrumb") ||
      cls.includes("breadcrumbs") ||
      id.includes("breadcrumb") ||
      id.includes("breadcrumbs")
    );
  };

  const looksLikeBreadcrumbList = (el: HTMLElement): boolean => {
    const tag = el.tagName.toLowerCase();
    if (tag !== "ol" && tag !== "ul") return false;

    const liEls = Array.from(el.children).filter(
      (c) => (c as HTMLElement).tagName?.toLowerCase() === "li",
    ) as HTMLElement[];
    if (liEls.length < 2 || liEls.length > 10) return false;

    const totalText = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (totalText.length > 140) return false;

    let linkish = 0;
    for (const li of liEls) {
      const kids = Array.from(li.children) as HTMLElement[];
      if (kids.length !== 1) continue;
      const only = kids[0];
      if (!only) continue;
      if (only.tagName.toLowerCase() !== "a") continue;
      const t = (only.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 1 || t.length > 40) continue;
      linkish++;
    }

    return linkish / liEls.length >= 0.7;
  };

  const looksLikeChromeContainer = (el: HTMLElement): boolean => {
    if (hasBreadcrumbSignal(el)) return true;

    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role === "navigation") return true;

    if (
      el.querySelector(
        "nav, [role='navigation'], [aria-label*='breadcrumb' i], [data-testid*='breadcrumb' i]",
      )
    ) {
      return true;
    }

    const linkCount = el.querySelectorAll("a").length;
    const paragraphCount = el.querySelectorAll("p").length;
    const textLen = (el.textContent || "").replace(/\s+/g, " ").trim().length;
    return linkCount >= 3 && paragraphCount === 0 && textLen < 200;
  };

  const shouldRemove = (el: HTMLElement): boolean => {
    const tag = el.tagName.toLowerCase();

    if (tag === "nav") return true;

    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role === "navigation") return true;

    if (hasBreadcrumbSignal(el)) return true;

    if (tag === "header" || tag === "footer" || tag === "aside") {
      return looksLikeChromeContainer(el);
    }

    if (looksLikeBreadcrumbList(el)) return true;

    return false;
  };

  const candidates = elements.filter((el) => {
    const idx = indexByEl.get(el);
    if (idx === undefined || idx > cutoffIndex) return false;
    return shouldRemove(el);
  });

  if (candidates.length === 0) return;

  const removeSet = new Set(candidates);
  const topLevel = candidates.filter((el) => {
    let p = el.parentElement;
    while (p) {
      if (removeSet.has(p)) return false;
      p = p.parentElement;
    }
    return true;
  });

  topLevel.forEach((el) => el.remove());
}

export function extractDisplayTitleFromHtml(html: string): string | null {
  if (!html) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const h1 = doc.body?.querySelector("h1");
    if (!h1) return null;

    const elements = Array.from(doc.body.querySelectorAll("*"));
    const idx = elements.indexOf(h1);
    if (idx === -1 || idx > 9) return null;

    const raw = (h1.textContent || "").replace(/\s+/g, " ").trim();
    if (!isAcceptableDisplayTitle(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function isAcceptableDisplayTitle(text: string): boolean {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (t.length < 10 || t.length > 200) return false;

  const words = t.split(" ").filter(Boolean);
  if (words.length < 3) return false;

  const lower = t.toLowerCase();
  const boilerplate = [
    "sign in",
    "log in",
    "login",
    "subscribe",
    "advertisement",
    "sponsored",
  ];
  if (boilerplate.some((b) => lower.includes(b))) return false;

  return true;
}

export function isEquivalentHtml(html1: string, html2: string): boolean {
  return normalizeComparableText(html1) === normalizeComparableText(html2);
}

export function normalizeComparableText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

export function stripDuplicateLeadContentFromDocument(
  doc: Document,
  feedDescriptionHtml?: string,
): void {
  const normalizedDescription = normalizeComparableText(
    feedDescriptionHtml || "",
  );
  if (!normalizedDescription || !doc.body) return;

  const blocks = Array.from(doc.body.children) as HTMLElement[];
  const firstSubstantialIndex = blocks.findIndex(
    (block) => getNormalizedBlockText(block).length >= 120,
  );

  if (firstSubstantialIndex > 0) {
    // Fast path: description appears as a direct child before the first substantial block.
    const duplicateIndex = blocks.findIndex((block, index) => {
      if (index >= firstSubstantialIndex) return false;
      return getNormalizedBlockText(block) === normalizedDescription;
    });
    if (duplicateIndex !== -1) {
      const duplicateBlock = blocks[duplicateIndex];
      if (!duplicateBlock) return;
      duplicateBlock.remove();
      for (let index = duplicateIndex - 1; index >= 0; index--) {
        const block = blocks[index];
        if (!block) continue;
        if (isShortLeadInBlock(block) || isLeadMediaBlock(block)) {
          block.remove();
          continue;
        }
        break;
      }
      return;
    }
  }

  // Slow path: Readability wraps content in a single root div, so the
  // description may be nested inside a <header> element inside the article.
  // Scope the search to <header> descendants to avoid false positives in the
  // article body.
  doc.body
    .querySelectorAll<HTMLElement>("header p, header div")
    .forEach((el) => {
      if (
        normalizeComparableText(el.textContent || "") === normalizedDescription
      ) {
        el.remove();
      }
    });
}

export function stripLeadMediaBeforeContent(doc: Document): void {
  if (!doc.body) return;
  const blocks = Array.from(doc.body.children) as HTMLElement[];
  const firstSubstantialIndex = blocks.findIndex(
    (block) => getNormalizedBlockText(block).length >= 120,
  );
  if (firstSubstantialIndex <= 0) return;

  for (let index = 0; index < firstSubstantialIndex; index++) {
    const block = blocks[index];
    if (!block) continue;
    if (isLeadMediaBlock(block)) {
      block.remove();
    }
  }
}

export function getNormalizedBlockText(block: HTMLElement): string {
  return normalizeComparableText(block.innerHTML || block.textContent || "");
}

export function isShortLeadInBlock(block: HTMLElement): boolean {
  if (containsLatexFormulaImage(block)) return false;
  if (isLeadMediaBlock(block)) return false;
  const text = getNormalizedBlockText(block);
  if (!text) return false;
  return text.length < 80 && text.split(" ").filter(Boolean).length <= 12;
}

export function isLeadMediaBlock(block: HTMLElement): boolean {
  if (containsLatexFormulaImage(block)) return false;
  const tag = block.tagName.toLowerCase();
  if (["img", "figure", "picture"].includes(tag)) return true;
  return (
    !!block.querySelector("img, figure, picture") &&
    getNormalizedBlockText(block).length < 40
  );
}

export function removeLeadImageElement(imageEl: Element): void {
  const wrapper = imageEl.closest("figure, picture, a");
  const hasOtherText = !!wrapper?.textContent?.trim();
  const hasOtherMedia =
    !!wrapper &&
    Array.from(
      wrapper.querySelectorAll(
        "img, video, audio, iframe, object, embed, canvas, svg",
      ),
    ).some((media) => media !== imageEl);

  if (wrapper && !hasOtherText && !hasOtherMedia) {
    wrapper.remove();
    return;
  }

  imageEl.remove();
}

export function stripSkipLinksFromDocument(doc: Document): void {
  if (!doc.body) return;

  doc.body.querySelectorAll<HTMLAnchorElement>("a").forEach((anchor) => {
    const href = (anchor.getAttribute("href") || "").trim().toLowerCase();
    const text = (anchor.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const aria = (anchor.getAttribute("aria-label") || "").toLowerCase();
    const cls = (anchor.getAttribute("class") || "").toLowerCase();
    const id = (anchor.getAttribute("id") || "").toLowerCase();

    const looksLikeSkipLink =
      text.includes("skip to content") ||
      text.includes("skip to main content") ||
      ((href.startsWith("#") || aria.includes("content")) &&
        (text.startsWith("skip to") ||
          aria.includes("skip") ||
          cls.includes("skip") ||
          id.includes("skip")));

    if (looksLikeSkipLink) {
      anchor.remove();
    }
  });
}

export function stripDuplicateLeadMediaMatchingHero(
  doc: Document,
  heroUrl: string,
): void {
  if (!doc.body || !heroUrl) return;

  const firstSubstantial = findFirstSubstantialParagraph(doc);
  doc.body.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    if (!isBeforeBoundary(img, firstSubstantial)) return;
    const src = (img.getAttribute("src") || "").trim();
    if (!src) return;

    if (isLikelySameImageSource(src, heroUrl)) {
      removeLeadImageElement(img);
    }
  });
}

export function stripDuplicateLeadCaptionBlocks(doc: Document): void {
  if (!doc.body) return;

  const firstSubstantial = findFirstSubstantialParagraph(doc);
  const removedCaptionTexts = new Set<string>();

  doc.body
    .querySelectorAll<HTMLElement>(
      "figcaption, [id^='caption-'], [id*='caption-']",
    )
    .forEach((el) => {
      if (!isBeforeBoundary(el, firstSubstantial)) return;
      const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
      const normalized = normalizeComparableText(raw);
      if (!normalized) return;

      const looksLikeCredit = /(credit|photo|image|source)/i.test(raw);
      if (!looksLikeCredit || normalized.length > 300) return;

      removedCaptionTexts.add(normalized);
      el.remove();
    });

  if (removedCaptionTexts.size === 0) return;

  doc.body.querySelectorAll<HTMLElement>("p").forEach((p) => {
    if (!isBeforeBoundary(p, firstSubstantial)) return;
    const raw = (p.textContent || "").replace(/\s+/g, " ").trim();
    if (!raw) return;

    const normalized = normalizeComparableText(raw);
    if (!removedCaptionTexts.has(normalized)) return;
    if (!/(credit|photo|image|source)/i.test(raw)) return;

    p.remove();
  });
}

export function findFirstSubstantialParagraph(
  doc: Document,
): HTMLElement | null {
  return (
    Array.from(doc.body.querySelectorAll<HTMLElement>("p")).find(
      (p) => (p.textContent || "").replace(/\s+/g, " ").trim().length >= 120,
    ) || null
  );
}

export function isBeforeBoundary(
  el: Element,
  boundary: HTMLElement | null,
): boolean {
  if (!boundary) return true;
  return !!(
    el.compareDocumentPosition(boundary) & Node.DOCUMENT_POSITION_FOLLOWING
  );
}

export function isLikelySameImageSource(urlA: string, urlB: string): boolean {
  const keyA = normalizeImageSourceKey(urlA);
  const keyB = normalizeImageSourceKey(urlB);
  if (!keyA || !keyB) return false;
  return keyA === keyB;
}

export function normalizeImageSourceKey(rawUrl: string): string {
  const normalizedUrl = normalizeSubstackImageUrl(rawUrl);
  const fallback = normalizedUrl.trim().toLowerCase();
  if (!fallback) return "";

  try {
    const url = new URL(normalizedUrl, "https://example.invalid");
    const normalizedPath = url.pathname
      .toLowerCase()
      .replace(/-\d+x\d+(?=\.[a-z0-9]+$)/, "");
    return `${url.hostname.toLowerCase()}${normalizedPath}`;
  } catch {
    return fallback.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/, "");
  }
}

export function hasMeaningfulArticleContent(html: string | null): boolean {
  if (!html) return false;
  const text =
    new DOMParser().parseFromString(html, "text/html").body.textContent || "";
  return text.trim().length > 200;
}
