// Article-metadata pipeline (#247 slice 3, ADR 0007): two pure steps.
// `extractPageMetadata` reads every raw signal from the fetched page's Document
// before Readability mutates it. `resolveArticleMetadata` applies precedence and
// the degenerate-value guard against feed-level fallbacks. Neither fetches,
// persists or imports a service.
import { isDuplicateIntro } from "./duplicate-intro-detection";
import { stripFeedBlurbFooter } from "./feed-blurb-footer";
import { htmlToReadableText } from "./html-text";

/**
 * Every page-metadata signal as found on the fetched page, one slot per
 * signal, before any precedence is applied. Empty string / empty array means
 * the signal is absent.
 */
export interface RawArticleMetadata {
  metaDescription: string;
  ogDescription: string;
  twitterDescription: string;
  htmlLang: string;
  metaAuthor: string;
  jsonLdAuthors: string[];
  microdataAuthors: string[];
  relAuthors: string[];
  canonicalUrl: string;
  /**
   * Readability's own excerpt. Unlike the other slots it exists only after
   * `Readability.parse()` has run, so the fetch layer fills it in afterwards;
   * `extractPageMetadata` always leaves it empty.
   */
  readabilityExcerpt: string;
}

/**
 * What the caller knows from its own feed context, plus the article it holds.
 * Every field is optional: a caller without one simply leaves it out.
 */
export interface ArticleMetadataFallbacks {
  /** The item title, for the title-equal guard. */
  title?: string;
  /** The fetched article HTML, for duplicate-intro detection and the derived excerpt. */
  articleHtml?: string;
  /** The feed-supplied item blurb (`FeedItem.description`), as HTML or text. */
  description?: string;
  /** The feed-level language (`<language>`/`xml:lang`). */
  language?: string;
  /** The feed-derived author entries. */
  authors?: string[];
}

export type LanguageSource = "page" | "feed";

/**
 * One value per metadata field after precedence. Transient: held for the
 * current render or save, never persisted wholesale.
 */
export interface ResolvedArticleMetadata {
  /** Publisher-authored description; empty when no candidate passed the guard. */
  description: string;
  /** Derived preview; only filled when the description tier found nothing. */
  excerpt: string;
  /** BCP-47-compatible code, regional subtags kept; unset when unresolved. */
  language?: string;
  languageSource?: LanguageSource;
  authors: string[];
  canonicalUrl?: string;
}

/** A description candidate shorter than this many normalized characters is degenerate. */
export const MIN_DESCRIPTION_LENGTH = 40;

/** The derived excerpt (last excerpt-tier fallback) is cut to about this many characters. */
export const DERIVED_EXCERPT_MAX_LENGTH = 200;

const MAX_AUTHOR_NAME_LENGTH = 200;

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A raw-metadata bag with every signal absent. */
export function emptyRawMetadata(): RawArticleMetadata {
  return {
    metaDescription: "",
    ogDescription: "",
    twitterDescription: "",
    htmlLang: "",
    metaAuthor: "",
    jsonLdAuthors: [],
    microdataAuthors: [],
    relAuthors: [],
    canonicalUrl: "",
    readabilityExcerpt: "",
  };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function metaContent(doc: Document, key: string): string {
  for (const meta of Array.from(doc.querySelectorAll("meta"))) {
    const name = (
      meta.getAttribute("name") ||
      meta.getAttribute("property") ||
      ""
    )
      .trim()
      .toLowerCase();
    if (name !== key) continue;
    const content = normalizeSpace(meta.getAttribute("content") ?? "");
    if (content) return content;
  }
  return "";
}

function canonicalLink(doc: Document): string {
  for (const link of Array.from(doc.querySelectorAll("link[rel]"))) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("canonical")) continue;
    const href = (link.getAttribute("href") ?? "").trim();
    // Only an absolute http(s) URL: the document has no base URL to resolve
    // a relative one against, and other schemes are never a page address.
    if (/^https?:\/\//i.test(href)) return href;
  }
  return "";
}

function cleanAuthorName(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = normalizeSpace(value);
  if (!name || name.length > MAX_AUTHOR_NAME_LENGTH) return "";
  return /^https?:\/\//i.test(name) ? "" : name;
}

function authorNames(value: unknown): string[] {
  if (typeof value === "string") return [cleanAuthorName(value)];
  if (Array.isArray(value)) {
    return value.flatMap((entry: unknown) => authorNames(entry));
  }
  if (value && typeof value === "object") {
    return [cleanAuthorName((value as { name?: unknown }).name)];
  }
  return [];
}

function jsonLdNodeAuthors(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry: unknown) => jsonLdNodeAuthors(entry));
  }
  if (!node || typeof node !== "object") return [];
  const record = node as { author?: unknown; "@graph"?: unknown };
  return [
    ...authorNames(record.author),
    ...(Array.isArray(record["@graph"])
      ? record["@graph"].flatMap((entry: unknown) =>
          authorNames((entry as { author?: unknown } | null)?.author),
        )
      : []),
  ];
}

function dedupe(names: string[]): string[] {
  return Array.from(new Set(names.filter(Boolean)));
}

function jsonLdAuthors(doc: Document): string[] {
  const names: string[] = [];
  for (const script of Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]'),
  )) {
    try {
      names.push(...jsonLdNodeAuthors(JSON.parse(script.textContent ?? "")));
    } catch {
      // A malformed JSON-LD block is one lost signal, not a failed extraction.
    }
  }
  return dedupe(names);
}

function microdataAuthorName(el: Element): string {
  if (el.hasAttribute("itemscope")) {
    const nested = el.querySelector('[itemprop~="name"]');
    return cleanAuthorName(
      nested?.getAttribute("content") ?? nested?.textContent,
    );
  }
  return cleanAuthorName(el.getAttribute("content") ?? el.textContent);
}

function microdataAuthors(doc: Document): string[] {
  return dedupe(
    Array.from(doc.querySelectorAll('[itemprop~="author"]')).map(
      microdataAuthorName,
    ),
  );
}

function relAuthors(doc: Document): string[] {
  return dedupe(
    Array.from(doc.querySelectorAll('a[rel~="author"]')).map((a) =>
      cleanAuthorName(a.textContent),
    ),
  );
}

/**
 * Reads every raw page-metadata signal from `doc`. Must run before
 * `Readability.parse()`, which mutates the document (it removes scripts, so
 * JSON-LD is gone afterwards). Swallows internal errors and returns an
 * all-empty result, so a metadata bug never fails the whole fetch.
 */
export function extractPageMetadata(doc: Document): RawArticleMetadata {
  try {
    return {
      metaDescription: metaContent(doc, "description"),
      ogDescription: metaContent(doc, "og:description"),
      twitterDescription: metaContent(doc, "twitter:description"),
      htmlLang: (doc.documentElement?.getAttribute("lang") ?? "").trim(),
      metaAuthor: cleanAuthorName(metaContent(doc, "author")),
      jsonLdAuthors: jsonLdAuthors(doc),
      microdataAuthors: microdataAuthors(doc),
      relAuthors: relAuthors(doc),
      canonicalUrl: canonicalLink(doc),
      readabilityExcerpt: "",
    };
  } catch {
    return emptyRawMetadata();
  }
}

/** True when extraction found no signal at all. */
export function isEmptyRawMetadata(raw: RawArticleMetadata): boolean {
  return (Object.values(raw) as Array<string | string[]>).every((value) =>
    Array.isArray(value) ? value.length === 0 : value === "",
  );
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

type GuardVerdict = "accept" | "duplicate-intro" | "degenerate";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hasLetterOrDigit(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/**
 * The degenerate-value guard (#275). `candidate` is already plain text with
 * whitespace normalized.
 */
function judgeDescription(
  candidate: string,
  fallbacks: ArticleMetadataFallbacks,
): GuardVerdict {
  if (candidate.length < MIN_DESCRIPTION_LENGTH) return "degenerate";
  if (!hasLetterOrDigit(candidate)) return "degenerate";
  const title = normalizeSpace(fallbacks.title ?? "").toLowerCase();
  if (title && candidate.toLowerCase() === title) return "degenerate";
  if (isDuplicateIntro(escapeHtml(candidate), fallbacks.articleHtml ?? "")) {
    return "duplicate-intro";
  }
  return "accept";
}

interface DescriptionOutcome {
  description: string;
  /** The first duplicate-intro rejection: real prose, so it seeds the excerpt. */
  seed: string;
}

/** The feed blurb as text, minus a trailing "appeared first on" footer (#677). */
function feedBlurbText(fallbacks: ArticleMetadataFallbacks): string {
  return htmlToReadableText(
    stripFeedBlurbFooter(fallbacks.description ?? "", fallbacks.title ?? ""),
  );
}

function resolveDescription(
  pageRaw: RawArticleMetadata,
  fallbacks: ArticleMetadataFallbacks,
): DescriptionOutcome {
  const candidates = [
    pageRaw.metaDescription,
    pageRaw.ogDescription,
    pageRaw.twitterDescription,
    feedBlurbText(fallbacks),
  ].map(normalizeSpace);

  let seed = "";
  for (const candidate of candidates) {
    const verdict = judgeDescription(candidate, fallbacks);
    if (verdict === "accept") return { description: candidate, seed };
    if (verdict === "duplicate-intro" && !seed) seed = candidate;
  }
  return { description: "", seed };
}

function truncateDerivedExcerpt(articleHtml: string): string {
  const text = htmlToReadableText(articleHtml);
  if (text.length <= DERIVED_EXCERPT_MAX_LENGTH) return text;
  const cut = text.slice(0, DERIVED_EXCERPT_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  const base =
    lastSpace > DERIVED_EXCERPT_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/**
 * The excerpt tier, reached only once the description tier found nothing: a
 * duplicate-intro description, then Readability's excerpt (unless it is just a
 * meta tag already tried), then the feed blurb, then truncated article text.
 */
function resolveExcerpt(
  pageRaw: RawArticleMetadata,
  fallbacks: ArticleMetadataFallbacks,
  seed: string,
): string {
  const metaTags = [
    pageRaw.metaDescription,
    pageRaw.ogDescription,
    pageRaw.twitterDescription,
  ].map((tag) => normalizeSpace(tag).toLowerCase());
  const readability = normalizeSpace(pageRaw.readabilityExcerpt);
  const candidates = [
    seed,
    metaTags.includes(readability.toLowerCase()) ? "" : readability,
    normalizeSpace(feedBlurbText(fallbacks)),
  ];
  const found = candidates.find((candidate) => hasLetterOrDigit(candidate));
  return found ?? truncateDerivedExcerpt(fallbacks.articleHtml ?? "");
}

/**
 * Normalizes a language tag to BCP-47 casing (`en-US`, `zh-Hant-TW`), keeping
 * regional subtags. Returns "" for anything that is not a language tag.
 */
export function normalizeLanguageTag(value: string): string {
  const subtags = value.trim().split(/[-_]/);
  const [primary, ...rest] = subtags;
  if (!primary || !/^[a-z]{2,3}$/i.test(primary)) return "";
  const out = [primary.toLowerCase()];
  for (const subtag of rest) {
    if (!/^[a-z0-9]{1,8}$/i.test(subtag)) return "";
    if (/^[a-z]{4}$/i.test(subtag)) {
      out.push(subtag.charAt(0).toUpperCase() + subtag.slice(1).toLowerCase());
    } else if (/^[a-z]{2}$/i.test(subtag)) {
      out.push(subtag.toUpperCase());
    } else {
      out.push(subtag.toLowerCase());
    }
  }
  return out.join("-");
}

function resolveLanguage(
  pageRaw: RawArticleMetadata,
  fallbacks: ArticleMetadataFallbacks,
): Pick<ResolvedArticleMetadata, "language" | "languageSource"> {
  const page = normalizeLanguageTag(pageRaw.htmlLang);
  if (page) return { language: page, languageSource: "page" };
  const feed = normalizeLanguageTag(fallbacks.language ?? "");
  if (feed) return { language: feed, languageSource: "feed" };
  return {};
}

function resolveAuthors(
  pageRaw: RawArticleMetadata,
  fallbacks: ArticleMetadataFallbacks,
): string[] {
  const feed = dedupe((fallbacks.authors ?? []).map(cleanAuthorName));
  // A multi-entry feed result is trusted as-is: a page byline typically
  // exposes only the primary author.
  if (feed.length >= 2) return feed;

  const page = [
    [pageRaw.metaAuthor],
    pageRaw.jsonLdAuthors,
    pageRaw.microdataAuthors,
    pageRaw.relAuthors,
  ]
    .map(dedupe)
    .find((names) => names.length > 0);
  return page ?? feed;
}

/**
 * Applies precedence across the page's raw signals and the caller's feed-level
 * fallbacks. Pure: no fetching, no persistence.
 */
export function resolveArticleMetadata(
  pageRaw: RawArticleMetadata,
  feedFallbacks: ArticleMetadataFallbacks,
): ResolvedArticleMetadata {
  const { description, seed } = resolveDescription(pageRaw, feedFallbacks);
  const resolved: ResolvedArticleMetadata = {
    description,
    excerpt: description ? "" : resolveExcerpt(pageRaw, feedFallbacks, seed),
    ...resolveLanguage(pageRaw, feedFallbacks),
    authors: resolveAuthors(pageRaw, feedFallbacks),
  };
  if (pageRaw.canonicalUrl) resolved.canonicalUrl = pageRaw.canonicalUrl;
  return resolved;
}
