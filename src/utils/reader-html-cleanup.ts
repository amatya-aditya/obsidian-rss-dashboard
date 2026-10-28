// DOM cleanup helpers for fetched full-article HTML in the reader view (#612,
// part of #436): navigation chrome, skip links, the top headline, duplicated
// lead content, and the image-source comparison behind lead-image removal.
// Moved verbatim from ReaderView; none of them touches view state.
import { isDuplicateIntro } from "./duplicate-intro-detection";
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

export function normalizeComparableText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * The element names the flatten treats as a wrapper around a page's blocks.
 * A lone content block — a single `<p>` with an inline image, a linked image
 * post, a standalone `<figure>` — is not a wrapper: unwrapping it would strip
 * the block itself and, for a `<p>` that is the only substantial block, leave
 * `findFirstSubstantialParagraph` with nothing to find, so the position-guarded
 * scans after it would treat the whole body as "before the boundary".
 */
/** Set by an extractor on a short block the lead cleanup must not treat as a teaser. */
export const KEEP_LEAD_ATTRIBUTE = "data-rss-keep-lead";

const WRAPPER_TAGS = new Set(["div", "section", "main", "article"]);

/**
 * Hoists the children of a body's single root element into the body, so the
 * body-child scans see a fetched page's blocks directly (#1304). Readability
 * wraps every fetched article in one `<div>`, which otherwise hides those
 * blocks from {@link stripDuplicateLeadContentFromDocument} and
 * {@link stripLeadMediaBeforeContent}. Run this once, before those scans, so
 * neither has to know about wrappers.
 *
 * A no-op unless the body has exactly one element child, that child is one of
 * {@link WRAPPER_TAGS}, and it holds an element of its own; nested wrappers
 * flatten repeatedly. Text nodes move with their element so the wrapper's own
 * text is kept, not dropped.
 */
export function flattenSingleRootWrapper(doc: Document): void {
  const body = doc.body;
  if (!body) return;

  let wrapper = getSingleRootElement(body);
  while (
    wrapper &&
    isWrapperElement(wrapper) &&
    wrapper.childElementCount > 0
  ) {
    // Move each child in turn rather than spreading them into replaceWith: a
    // page with a very large number of blocks would overflow the argument list.
    while (wrapper.firstChild) {
      body.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
    wrapper = getSingleRootElement(body);
  }
}

function isWrapperElement(el: Element): boolean {
  return WRAPPER_TAGS.has(el.tagName.toLowerCase());
}

function getSingleRootElement(body: HTMLElement): Element | null {
  if (body.children.length !== 1) return null;
  return body.children[0] ?? null;
}

export function stripDuplicateLeadContentFromDocument(
  doc: Document,
  feedDescriptionHtml?: string,
): void {
  if (!feedDescriptionHtml || !doc.body) return;

  const blocks = Array.from(doc.body.children) as HTMLElement[];
  const firstSubstantialIndex = blocks.findIndex(
    (block) => getNormalizedBlockText(block).length >= 120,
  );

  if (firstSubstantialIndex > 0) {
    // Fast path: description appears as a direct child before the first substantial block.
    const duplicateIndex = blocks.findIndex((block, index) => {
      if (index >= firstSubstantialIndex) return false;
      return isDuplicateIntro(block.innerHTML, feedDescriptionHtml);
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
      if (isDuplicateIntro(el.innerHTML, feedDescriptionHtml)) {
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
  // An extractor marks a short block that is content, not a teaser (the GitHub
  // issue meta line, #1500).
  if (block.hasAttribute(KEEP_LEAD_ATTRIBUTE)) return false;
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

/** The media an image-expand control wraps; a wrapper without one is not a control. */
const IMAGE_CONTROL_MEDIA_SELECTOR = "img, picture";

/**
 * Semantic text elements that are never the expand control's text-only label.
 * Kept even when they sit inside a focusable wrapper around a picture.
 */
const IMAGE_CONTROL_TEXT_BLOCK_TAGS = new Set([
  "blockquote",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "pre",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/**
 * A publisher image control is a focusable wrapper around a picture or image.
 * Medium uses `div[role="button"][tabindex="0"]`; its label is the only text in
 * that wrapper. A native `<button>` has the same role without attributes. An
 * anchor — a native link or a `role="link"` wrapper — and a figure are content,
 * not controls, so neither is unwrapped even when it is focusable and holds an
 * image. `tabindex="-1"` is not a keyboard control, so it is left alone.
 */
function isImageExpandControl(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "a" || tag === "figure") return false;

  const role = (el.getAttribute("role") || "").trim().toLowerCase();
  // A link is an anchor, even when it is a div with a role; it stays.
  if (role === "link") return false;

  if (!el.querySelector(IMAGE_CONTROL_MEDIA_SELECTOR)) return false;

  const tabIndex = (el.getAttribute("tabindex") || "").trim();
  const isKeyboardFocusable = tabIndex !== "" && tabIndex !== "-1";
  return tag === "button" || isKeyboardFocusable || role === "button";
}

/**
 * The wrapper's own text label, which the publisher's CSS normally hides. Only
 * text that is not part of a semantic block, a link, or the media is dropped,
 * so a caption, a heading, or navigation inside the control survives with the
 * picture.
 */
function isImageControlLabel(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (IMAGE_CONTROL_TEXT_BLOCK_TAGS.has(tag) || tag === "a") {
    return false;
  }
  if (el.querySelector(IMAGE_CONTROL_MEDIA_SELECTOR)) return false;
  return (el.textContent || "").trim().length > 0;
}

function containsImageControlLabel(el: Element): boolean {
  return Array.from(el.querySelectorAll("*")).some(isImageControlLabel);
}

/**
 * Readability drops the focusable attributes and rewrites some controls as a
 * `<p>` when the wrapper holds only phrasing content (the localized Medium
 * shape in #1362). A direct child of a figure that wraps media and still
 * carries a text-only label element is therefore a control too. A figure's
 * anchor, picture, image, and caption are content, never wrappers.
 */
function isFigureImageControl(el: Element): boolean {
  if (el.parentElement?.tagName.toLowerCase() !== "figure") return false;
  const tag = el.tagName.toLowerCase();
  if (["a", "figcaption", "figure", "img", "picture"].includes(tag)) {
    return false;
  }
  if ((el.getAttribute("role") || "").trim().toLowerCase() === "link") {
    return false;
  }
  if ((el.getAttribute("tabindex") || "").trim() === "-1") return false;
  if (!el.querySelector(IMAGE_CONTROL_MEDIA_SELECTOR)) return false;
  return containsImageControlLabel(el);
}

function removeImageControlLabels(control: Element): void {
  // A label can sit directly in the control as a bare text node.
  Array.from(control.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent || "").trim()) {
      node.remove();
    }
  });

  // Remove the outermost label in each non-media branch, so a nested
  // `<div><span>label</span></div>` goes in one step and leaves no shell.
  const labels = Array.from(control.querySelectorAll("*")).filter(
    isImageControlLabel,
  );
  const labelSet = new Set(labels);
  labels.forEach((label) => {
    for (
      let parent = label.parentElement;
      parent && parent !== control;
      parent = parent.parentElement
    ) {
      if (labelSet.has(parent)) return;
    }
    label.remove();
  });
}

function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  el.remove();
}

/**
 * Removes a publisher's image-expand control from a fetched article (#1362).
 * The publisher styles the control's text label out of sight, but no publisher
 * CSS is loaded in the reader, so the label would render as body copy above the
 * picture. A focusable wrapper around media is unwrapped and its text-only
 * label is dropped, keeping the picture and any `figcaption` where they were.
 * The same happens to a figure child that still wraps media and a label after
 * Readability has stripped the control's attributes.
 *
 * A wrapper with no media is left alone, and so is an anchor around an image:
 * neither is a publisher image control. The label match is structural, not
 * textual, so a localized label is removed too.
 */
export function stripImageExpandControlsFromDocument(doc: Document): void {
  const body = doc.body;
  if (!body) return;

  const focusable = Array.from(
    body.querySelectorAll<HTMLElement>("button, [tabindex], [role]"),
  ).filter(isImageExpandControl);
  const figureWrappers = Array.from(
    body.querySelectorAll<HTMLElement>("figure > *"),
  ).filter(isFigureImageControl);

  new Set([...focusable, ...figureWrappers]).forEach((control) => {
    removeImageControlLabels(control);
    unwrapElement(control);
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

const LEAD_CAPTION_SELECTOR = "figcaption, [id^='caption-'], [id*='caption-']";
const LEAD_CREDIT_MARKER = /(credit|photo|image|source)/i;

/**
 * The normalized text of a credit caption that sits before the body, or null
 * when the element is not a credit caption the cleanup should pair with a
 * paragraph. Shared by the collect and remove phases so both agree on what
 * counts as a credit caption (#1305).
 */
function getLeadCreditCaptionText(
  el: HTMLElement,
  firstSubstantial: HTMLElement | null,
): string | null {
  if (!isBeforeBoundary(el, firstSubstantial)) return null;

  const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
  const normalized = normalizeComparableText(raw);
  if (!normalized) return null;

  if (!LEAD_CREDIT_MARKER.test(raw) || normalized.length > 300) return null;

  return normalized;
}

/**
 * Records the text of every credit caption ahead of the body without touching
 * the DOM. Call this before lead media is removed: a caption-only <figure> is
 * itself lead media, so it disappears before
 * {@link stripDuplicateLeadCaptionBlocks} could see it, and its matching
 * paragraph would be left behind (#1305).
 *
 * The boundary is computed before the strip, while
 * {@link stripDuplicateLeadCaptionBlocks} computes it after. Removing lead
 * media cannot move the first substantial paragraph earlier (a >=120-character
 * <p> is never lead media), so a caption collected here is still ahead of the
 * boundary when the remove phase runs.
 */
export function collectLeadCaptionTexts(doc: Document): Set<string> {
  const texts = new Set<string>();
  if (!doc.body) return texts;

  const firstSubstantial = findFirstSubstantialParagraph(doc);
  doc.body
    .querySelectorAll<HTMLElement>(LEAD_CAPTION_SELECTOR)
    .forEach((el) => {
      const normalized = getLeadCreditCaptionText(el, firstSubstantial);
      if (normalized) texts.add(normalized);
    });

  return texts;
}

export function stripDuplicateLeadCaptionBlocks(
  doc: Document,
  leadCaptionTexts: ReadonlySet<string> = new Set(),
): void {
  if (!doc.body) return;

  const firstSubstantial = findFirstSubstantialParagraph(doc);
  const captionTexts = new Set(leadCaptionTexts);

  doc.body
    .querySelectorAll<HTMLElement>(LEAD_CAPTION_SELECTOR)
    .forEach((el) => {
      const normalized = getLeadCreditCaptionText(el, firstSubstantial);
      if (!normalized) return;

      captionTexts.add(normalized);
      el.remove();
    });

  if (captionTexts.size === 0) return;

  doc.body.querySelectorAll<HTMLElement>("p").forEach((p) => {
    if (!isBeforeBoundary(p, firstSubstantial)) return;
    const raw = (p.textContent || "").replace(/\s+/g, " ").trim();
    if (!raw) return;

    const normalized = normalizeComparableText(raw);
    if (!captionTexts.has(normalized)) return;
    if (!LEAD_CREDIT_MARKER.test(raw)) return;

    p.remove();
  });
}

export interface FetchedArticleCleanupOptions {
  /**
   * The feed or publisher description to take out of the body's lead when the
   * page repeats it. Omit when there is none; the readers pass
   * `descriptionToStripFromBody`'s result here (#1238).
   */
  feedDescriptionHtml?: string;
  /**
   * The item's hero image. Lead media is removed only when one is set — the
   * same gate the readers use (#1304, #1305).
   */
  fallbackHeroUrl?: string;
}

/**
 * The fetched-page cleanup both readers run before they render the body (#612,
 * #1238, #1304, #1305), as one orchestration the save path shares, so a note
 * holds the body the reader shows (#1323).
 *
 * Order matters. Navigation chrome and the top headline go first, then the
 * single root element Readability wraps a fetched page in is flattened so the
 * body-child scans below see its blocks. Publisher image-expand controls are
 * unwrapped next, before the duplicate lead and skip-link scans. Lead media and
 * its captions run last, and only when a hero is set: the credit captions are
 * collected before the lead media is removed, so a caption-only `<figure>` is
 * paired with the paragraph that repeats it.
 */
export function cleanFetchedArticleDocument(
  doc: Document,
  options: FetchedArticleCleanupOptions = {},
): void {
  stripNavigationChromeFromDocument(doc);
  stripTopHeadlineFromDocument(doc);
  flattenSingleRootWrapper(doc);
  stripImageExpandControlsFromDocument(doc);
  stripDuplicateLeadContentFromDocument(doc, options.feedDescriptionHtml);
  stripSkipLinksFromDocument(doc);
  // Inline SVGs are publisher UI decorations (section icons, share buttons)
  // never present in RSS payloads.
  doc.body?.querySelectorAll("svg").forEach((el) => el.remove());

  if (!options.fallbackHeroUrl) return;

  const leadCaptionTexts = collectLeadCaptionTexts(doc);
  stripLeadMediaBeforeContent(doc);
  stripDuplicateLeadMediaMatchingHero(doc, options.fallbackHeroUrl);
  stripDuplicateLeadCaptionBlocks(doc, leadCaptionTexts);
}

/**
 * {@link cleanFetchedArticleDocument} for a caller that holds HTML rather than
 * a parsed document. Returns the input unchanged if it cannot be parsed.
 */
export function cleanFetchedArticleHtml(
  html: string,
  options: FetchedArticleCleanupOptions = {},
): string {
  if (!html) return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    cleanFetchedArticleDocument(doc, options);
    return doc.body.innerHTML;
  } catch {
    return html;
  }
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
