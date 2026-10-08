import {
  Feed,
  FeedItem,
  FeedKeywordRulesSettings,
  GlobalKeywordRulesSettings,
  KeywordFilterRule,
} from "../types/types";
import { getArticlePreviewSummaryText } from "../utils/article-preview-utils";

export type RuleMatchSource = "global" | "feed" | "none";

export interface KeywordFilterDecision {
  included: boolean;
  excludedBy: RuleMatchSource;
}

const WORD_BOUNDARY_CLASS = "A-Za-z0-9_";

interface PreviewTextCacheEntry {
  title: string;
  summary: string;
  description: string;
  content: string;
  text: string;
}

// Preview text parses HTML, and every summary-scope rule reads it for every
// article on each filter pass. The entry records its inputs, so an item
// rewritten on refresh recomputes.
const previewTextCache = new WeakMap<FeedItem, PreviewTextCacheEntry>();

function getCachedPreviewText(item: FeedItem): string {
  const title = item.title || "";
  const summary = item.summary || "";
  const description = item.description || "";
  const content = item.content || "";
  const cached = previewTextCache.get(item);
  if (
    cached &&
    cached.title === title &&
    cached.summary === summary &&
    cached.description === description &&
    cached.content === content
  ) {
    return cached.text;
  }

  const text = getArticlePreviewSummaryText(item);
  previewTextCache.set(item, { title, summary, description, content, text });
  return text;
}

export class KeywordFilterService {
  static hasActiveRules(rules: KeywordFilterRule[]): boolean {
    return this.getActiveRules(rules).length > 0;
  }

  static getActiveRules(rules: KeywordFilterRule[]): KeywordFilterRule[] {
    return rules.filter((rule) => {
      if (!rule.enabled) {
        return false;
      }

      if (!rule.keyword || !rule.keyword.trim()) {
        return false;
      }

      return !!(
        rule.applyToTitle ||
        rule.applyToSummary ||
        rule.applyToContent ||
        rule.applyToURL
      );
    });
  }

  static shouldApplyGlobalFilters(
    feedRules: FeedKeywordRulesSettings | undefined,
  ): boolean {
    return !feedRules?.overrideGlobalRules;
  }

  static evaluateForArticle(
    item: FeedItem,
    feed: Feed | undefined,
    globalRules: GlobalKeywordRulesSettings,
  ): KeywordFilterDecision {
    if (globalRules.bypassAll) {
      return { included: true, excludedBy: "none" };
    }

    const feedRules = feed?.keywordRules;
    const applyGlobal = this.shouldApplyGlobalFilters(feedRules);

    if (applyGlobal) {
      const globalPassed = this.evaluateRules(
        item,
        globalRules.rules,
        globalRules.includeLogic,
      );
      if (!globalPassed) {
        return { included: false, excludedBy: "global" };
      }
    }

    if (feedRules) {
      const feedPassed = this.evaluateRules(
        item,
        feedRules.rules,
        feedRules.includeLogic,
      );
      if (!feedPassed) {
        return { included: false, excludedBy: "feed" };
      }
    }

    return { included: true, excludedBy: "none" };
  }

  static evaluateRules(
    item: FeedItem,
    rules: KeywordFilterRule[],
    includeLogic: "AND" | "OR",
  ): boolean {
    const activeRules = this.getActiveRules(rules);
    if (activeRules.length === 0) {
      return true;
    }

    const includeRules = activeRules.filter((rule) => rule.type === "include");
    const excludeRules = activeRules.filter((rule) => rule.type === "exclude");

    if (includeRules.length > 0) {
      const includeMatches = includeRules.map((rule) =>
        this.ruleMatchesArticle(rule, item),
      );
      const includePassed =
        includeLogic === "AND"
          ? includeMatches.every(Boolean)
          : includeMatches.some(Boolean);
      if (!includePassed) {
        return false;
      }
    }

    for (const rule of excludeRules) {
      if (this.ruleMatchesArticle(rule, item)) {
        return false;
      }
    }

    return true;
  }

  private static ruleMatchesArticle(
    rule: KeywordFilterRule,
    item: FeedItem,
  ): boolean {
    const sources: string[] = [];
    if (rule.applyToTitle) {
      sources.push(item.title || "");
    }
    if (rule.applyToSummary) {
      // The summary scope matches the preview text the user sees (#888).
      sources.push(getCachedPreviewText(item));
    }
    if (rule.applyToContent) {
      sources.push(item.content || item.description || "");
    }
    if (rule.applyToURL) {
      sources.push(item.link || "");
    }

    const keyword = rule.keyword.trim();
    if (!keyword) {
      return false;
    }

    return sources.some((text) =>
      this.matchesText(text, keyword, rule.matchMode),
    );
  }

  private static matchesText(
    text: string,
    keyword: string,
    matchMode: "exact" | "partial",
  ): boolean {
    if (!text) {
      return false;
    }

    if (matchMode === "partial") {
      return text.toLowerCase().includes(keyword.toLowerCase());
    }

    const escapedKeyword = this.escapeRegex(keyword);
    const pattern = new RegExp(
      `(^|[^${WORD_BOUNDARY_CLASS}])${escapedKeyword}(?=$|[^${WORD_BOUNDARY_CLASS}])`,
      "i",
    );
    return pattern.test(text);
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
