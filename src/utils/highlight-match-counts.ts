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
  // The inputs of the preview text and of the match, compared to spot a rewrite.
  inputs: [
    title: string,
    content: string,
    summary: string,
    description: string,
    publisherDescription: string,
  ];
  scopeKey: string;
  // Built on the first word that needs it: resolving it converts HTML to text.
  preview?: string;
  // Verdict per word signature; reset whenever the article text or scope moves.
  matches: Map<string, boolean>;
}

// Whether a word matches an article depends only on the article's text, the
// word and the scope flags, never on read, saved or starred state. Caching it
// keeps a read/unread toggle from rescanning every article's HTML. The scope
// layer hands out fresh copies of each item on every call, so the key is the
// item's identity (feed and guid), not the object. The entry records its
// inputs, so an item rewritten on refresh recomputes. Entries for articles
// outside the latest call are dropped, which bounds the cache.
const matchCache = new Map<string, MatchCacheEntry>();

// Edited words leave their old signatures behind; start over past this size
// (never below what the current words need).
const MIN_WORDS_PER_ENTRY = 64;

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
    showSummary,
  };

  const maxWords = Math.max(MIN_WORDS_PER_ENTRY, matchers.length * 2);
  const seen = new Set<string>();
  for (const article of articles) {
    const entry = getEntry(article, scope, maxWords, seen);
    for (const matcher of matchers) {
      let matched = entry.matches.get(matcher.key);
      if (matched === undefined) {
        matched = testFields(entry, article, scope, matcher.regex);
        entry.matches.set(matcher.key, matched);
      }
      if (matched) matcher.count++;
    }
  }

  for (const key of matchCache.keys()) {
    if (!seen.has(key)) matchCache.delete(key);
  }
  return matchers.map(({ word, count }) => ({ word, count }));
}

function articleKey(article: FeedItem): string {
  return `${article.feedUrl}
${article.guid || article.link}`;
}

interface Scope {
  titles: boolean;
  summaries: boolean;
  content: boolean;
  showSummary: boolean;
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
  maxWords: number,
  seen: Set<string>,
): MatchCacheEntry {
  const key = articleKey(article);
  seen.add(key);
  const inputs: MatchCacheEntry["inputs"] = [
    article.title ?? "",
    article.content ?? "",
    article.summary ?? "",
    article.description ?? "",
    article.publisherDescription ?? "",
  ];
  const scopeKey = `${scope.titles}|${scope.summaries}|${scope.content}|${scope.showSummary}`;

  const cached = matchCache.get(key);
  if (
    cached &&
    cached.scopeKey === scopeKey &&
    cached.matches.size <= maxWords &&
    cached.inputs.every((value, i) => value === inputs[i])
  ) {
    return cached;
  }

  const entry: MatchCacheEntry = { inputs, scopeKey, matches: new Map() };
  matchCache.set(key, entry);
  return entry;
}

function testFields(
  entry: MatchCacheEntry,
  article: FeedItem,
  scope: Scope,
  regex: RegExp,
): boolean {
  const title = entry.inputs[0];
  const fields: string[] = [];
  if (scope.titles) fields.push(title);
  if (scope.summaries) {
    // Nothing is highlighted in summaries while the cards show none.
    entry.preview ??= scope.showSummary
      ? getArticlePreviewSummaryText(article)
      : "";
    fields.push(entry.preview);
  }
  if (scope.content) fields.push(entry.inputs[1]);
  // Fallback: always test the title when no scopes are enabled
  if (fields.length === 0) fields.push(title);
  return fields.some((f) => regex.test(f));
}

function buildWordRegex(word: HighlightWord): RegExp {
  // Escape special regex characters (same as HighlightService.escapeRegex)
  const escaped = word.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Optional whole-word boundaries (same logic as HighlightService.buildPattern)
  const pattern = word.wholeWord ? `(?:^|\\W)(${escaped})(?:$|\\W)` : escaped;
  return new RegExp(pattern, word.caseSensitive ? "" : "i");
}
