import type {
  FeedItem,
  HighlightSettings,
  HighlightWord,
} from "../types/types";
import { getArticlePreviewSummaryText } from "./article-preview-utils";

export interface HighlightMatchCount {
  word: HighlightWord;
  count: number;
}

interface MatchCacheEntry {
  title: string;
  content: string;
  preview: string;
  scopeKey: string;
  // Verdict per word signature; reset whenever the article text or scope moves.
  matches: Map<string, boolean>;
}

// Whether a word matches an article depends only on the article's text, the
// word and the scope flags, never on read, saved or starred state. Caching it
// per item keeps a read/unread toggle from rescanning every article's HTML.
// The entry records its inputs, so an item rewritten on refresh recomputes.
const matchCache = new WeakMap<FeedItem, MatchCacheEntry>();

// Edited words leave their old signatures behind; start over past this size.
const MAX_WORDS_PER_ENTRY = 64;

/**
 * Per enabled highlight word, how many of `articles` contain it at least once.
 *
 * Field selection mirrors HighlightService:
 *   highlightInTitles    -> article.title
 *   highlightInSummaries -> the preview text the cards show, and nothing while
 *                           `showSummary` is off
 *   highlightInContent   -> article.content
 * Regex building mirrors HighlightService per word: escaped text, optional
 * whole-word boundaries, the "i" flag unless the word is case sensitive.
 */
export function computeHighlightMatchCounts(
  articles: readonly FeedItem[],
  hs: HighlightSettings | undefined,
  showSummary: boolean,
): HighlightMatchCount[] {
  if (!hs?.enabled || !hs.words?.length) return [];

  const matchers: WordMatcher[] = hs.words
    .filter((w) => w.enabled)
    .map((word) => ({
      word,
      key: `${word.caseSensitive ? "s" : "i"}${word.wholeWord ? "w" : "p"}${word.text}`,
      regex: buildWordRegex(word),
      count: 0,
    }));
  if (matchers.length === 0) return [];

  const scope: Scope = {
    titles: hs.highlightInTitles !== false,
    summaries: hs.highlightInSummaries !== false,
    content: hs.highlightInContent !== false,
  };

  for (const article of articles) {
    const entry = getEntry(article, scope, showSummary);
    for (const matcher of matchers) {
      let matched = entry.matches.get(matcher.key);
      if (matched === undefined) {
        matched = testFields(entry, scope, matcher.regex);
        entry.matches.set(matcher.key, matched);
      }
      if (matched) matcher.count++;
    }
  }

  return matchers.map(({ word, count }) => ({ word, count }));
}

interface Scope {
  titles: boolean;
  summaries: boolean;
  content: boolean;
}

interface WordMatcher {
  word: HighlightWord;
  key: string;
  regex: RegExp;
  count: number;
}

function getEntry(
  article: FeedItem,
  scope: Scope,
  showSummary: boolean,
): MatchCacheEntry {
  const title = article.title ?? "";
  const content = article.content ?? "";
  const preview =
    scope.summaries && showSummary ? getArticlePreviewSummaryText(article) : "";
  const scopeKey = `${scope.titles}|${scope.summaries}|${scope.content}`;

  const cached = matchCache.get(article);
  if (
    cached &&
    cached.title === title &&
    cached.content === content &&
    cached.preview === preview &&
    cached.scopeKey === scopeKey &&
    cached.matches.size <= MAX_WORDS_PER_ENTRY
  ) {
    return cached;
  }

  const entry: MatchCacheEntry = {
    title,
    content,
    preview,
    scopeKey,
    matches: new Map(),
  };
  matchCache.set(article, entry);
  return entry;
}

function testFields(
  entry: MatchCacheEntry,
  scope: Scope,
  regex: RegExp,
): boolean {
  const fields: string[] = [];
  if (scope.titles) fields.push(entry.title);
  if (scope.summaries) fields.push(entry.preview);
  if (scope.content) fields.push(entry.content);
  // Fallback: always test the title when no scopes are enabled
  if (fields.length === 0) fields.push(entry.title);
  return fields.some((f) => regex.test(f));
}

function buildWordRegex(word: HighlightWord): RegExp {
  // Escape special regex characters (same as HighlightService.escapeRegex)
  const escaped = word.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Optional whole-word boundaries (same logic as HighlightService.buildPattern)
  const pattern = word.wholeWord ? `(?:^|\\W)(${escaped})(?:$|\\W)` : escaped;
  return new RegExp(pattern, word.caseSensitive ? "" : "i");
}
