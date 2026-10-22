// Article-metadata pipeline (#247 slice 3, ADR 0007): two pure steps.
// `extractPageMetadata` reads every raw signal from the fetched page's Document
// before Readability mutates it. `resolveArticleMetadata` applies precedence and
// the degenerate-value guard against feed-level fallbacks. Neither fetches,
// persists or imports a service.
import { isDuplicateIntro } from "./duplicate-intro-detection";
import { stripFeedBlurbFooter } from "./feed-blurb-footer";
import { htmlToReadableText } from "./html-text";
import { firstNonFormulaImageUrl, sanitizeImageUrl } from "./image-url-utils";

/**
 * Every page-metadata signal as found on the fetched page, one slot per
 * signal, before any precedence is applied. Empty string / empty array means
 * the signal is absent.
 */
export interface RawArticleMetadata {
  metaDescription: string;
  ogDescription: string;
  twitterDescription: string;
  /** The page's declared social image (`og:image`), unset when absent. */
  ogImage: string;
  /** The page's declared Twitter card image, unset when absent. */
  twitterImage: string;
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

const RESIDUAL_ENTITY = /&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i;

/**
 * Decodes an entity a meta tag's `content` still holds after the parser's own
 * decode: a publisher that double-encodes (`We&amp;#39;re`) leaves `We&#39;re`
 * (#1505). Text with no entity is returned as is. `<` is escaped first so
 * decoded markup stays inert text.
 */
function decodeResidualEntities(text: string): string {
  if (!RESIDUAL_ENTITY.test(text)) return text;
  try {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><body>${text.replace(/</g, "&lt;")}`,
      "text/html",
    );
    return doc.body.textContent ?? text;
  } catch {
    return text;
  }
}

/** A description candidate as plain text with whitespace normalized. */
function descriptionText(text: string): string {
  return normalizeSpace(decodeResidualEntities(text));
}

/** A raw-metadata bag with every signal absent. */
export function emptyRawMetadata(): RawArticleMetadata {
  return {
    metaDescription: "",
    ogDescription: "",
    twitterDescription: "",
    ogImage: "",
    twitterImage: "",
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

/**
 * The first image URL a JSON-LD `image` value carries: the string itself, the
 * first usable array entry, or an `ImageObject`'s `url`/`contentUrl`. Empty
 * when the value declares none.
 */
function jsonLdImageValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = jsonLdImageValue(entry);
      if (found) return found;
    }
    return "";
  }
  if (value && typeof value === "object") {
    const record = value as { url?: unknown; contentUrl?: unknown };
    return jsonLdImageValue(record.url) || jsonLdImageValue(record.contentUrl);
  }
  return "";
}

/**
 * JSON-LD `@type` values whose `image` is never the article's own picture. A
 * page usually ships several nodes — the article, the site, the publisher and
 * a byline — and the `image` on the last three is a logo or a portrait. The
 * list is deliberately narrow: an unknown or article type is still read (#1342).
 */
const NON_ARTICLE_JSON_LD_TYPES = [
  "person",
  "organization",
  "website",
  "brand",
];

function jsonLdTypeNames(value: unknown): string[] {
  if (typeof value === "string") return [value.trim().toLowerCase()];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => jsonLdTypeNames(entry));
  }
  return [];
}

/** True for a node whose `image` describes the entity, not the article. */
function isNonArticleJsonLdNode(record: { "@type"?: unknown }): boolean {
  return jsonLdTypeNames(record["@type"]).some((type) =>
    NON_ARTICLE_JSON_LD_TYPES.includes(type),
  );
}

/** The first `image` on a JSON-LD node, its array entries, or its `@graph`. */
function jsonLdNodeImage(node: unknown): string {
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = jsonLdNodeImage(entry);
      if (found) return found;
    }
    return "";
  }
  if (!node || typeof node !== "object") return "";
  const record = node as {
    "@type"?: unknown;
    image?: unknown;
    "@graph"?: unknown;
  };
  const own = isNonArticleJsonLdNode(record)
    ? ""
    : jsonLdImageValue(record.image);
  return own || jsonLdNodeImage(record["@graph"]);
}

/**
 * The page's declared image from its JSON-LD blocks (#1342), the third source
 * after `og:image` and `twitter:image` (Obsidian Web Clipper's order). Only
 * `image` and `@graph` are followed: a `WebPage` wrapper's `mainEntity` is not,
 * because the meta tags cover that shape. The value is raw — `extractPageImage`
 * resolves and validates it like a meta tag.
 */
function jsonLdImage(doc: Document): string {
  for (const script of Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]'),
  )) {
    try {
      const found = jsonLdNodeImage(JSON.parse(script.textContent ?? ""));
      if (found) return found;
    } catch {
      // A malformed JSON-LD block is one lost signal, not a failed extraction.
    }
  }
  return "";
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
      ogImage: metaContent(doc, "og:image"),
      twitterImage: metaContent(doc, "twitter:image"),
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

/**
 * The page's own picture (`og:image`, else `twitter:image`, else a JSON-LD
 * `image`) as an absolute http(s) URL, or "" when it declares none. Each
 * declaration is validated before the next is tried, so a present-but-unusable
 * `og:image` (a `data:` placeholder, say) does not shadow a usable
 * `twitter:image` or JSON-LD value (#1342). Like `extractPageMetadata`, it must
 * run before `Readability.parse()`. A relative value resolves against `pageUrl`.
 */
export function extractPageImage(doc: Document, pageUrl: string): string {
  for (const declared of [
    metaContent(doc, "og:image"),
    metaContent(doc, "twitter:image"),
  ]) {
    const resolved = absoluteHttpUrl(declared, pageUrl);
    if (resolved) return resolved;
  }
  // Parsed only when neither meta tag supplied a usable URL.
  return absoluteHttpUrl(jsonLdImage(doc), pageUrl);
}

/** `declared` resolved against `pageUrl`, or "" when it is not absolute http(s). */
function absoluteHttpUrl(declared: string, pageUrl: string): string {
  if (!declared) return "";
  try {
    const resolved = new URL(declared, pageUrl || undefined);
    return /^https?:$/.test(resolved.protocol) ? resolved.href : "";
  } catch {
    return "";
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

/**
 * The feed blurb when it passes the same guard the description tier applies
 * (#829): footer stripped, then long enough, not the title, not punctuation
 * only, and not a duplicate intro of `fallbacks.articleHtml`. Empty otherwise.
 */
export function guardFeedBlurb(fallbacks: ArticleMetadataFallbacks): string {
  const candidate = normalizeSpace(feedBlurbText(fallbacks));
  return judgeDescription(candidate, fallbacks) === "accept" ? candidate : "";
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
  ].map(descriptionText);

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
  ].map((tag) => descriptionText(tag).toLowerCase());
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
 * The page image the card action fetches (#1314). Deliberately narrow: only the
 * page's own declaration, never a scan of the body, because the first body image
 * on a typical article page is a byline avatar or a site logo (#812).
 *
 * `pageUrl` resolves a relative or protocol-relative declaration; a value that
 * still is not an absolute http(s) URL is refused.
 */
export function resolvePageCoverImage(
  pageRaw: RawArticleMetadata,
  pageUrl: string,
): string {
  return (
    firstNonFormulaImageUrl([
      absoluteImageUrl(pageRaw.ogImage, pageUrl),
      absoluteImageUrl(pageRaw.twitterImage, pageUrl),
    ]) ?? ""
  );
}

function absoluteImageUrl(value: string, pageUrl: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    // `new URL` resolves a protocol-relative "//host/path" against the page's
    // own protocol and a root-relative path against its origin, so an http
    // article does not silently become an https request.
    return sanitizeImageUrl(new URL(trimmed, pageUrl).href);
  } catch {
    return sanitizeImageUrl(trimmed);
  }
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
