import {
  Feed,
  FeedItem,
  FeedFilterSettings,
  GlobalFilterSettings,
  KeywordFilterRule,
} from "../types/types";

export type RuleMatchSource = "global" | "feed" | "none";

export interface KeywordFilterDecision {
  included: boolean;
  excludedBy: RuleMatchSource;
}

const WORD_BOUNDARY_CLASS = "A-Za-z0-9_";

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

      return !!(rule.applyToTitle || rule.applyToSummary || rule.applyToContent);
    });
  }

  static shouldApplyGlobalFilters(
    feedFilters: FeedFilterSettings | undefined,
  ): boolean {
    return !feedFilters?.overrideGlobalFilters;
  }

  static evaluateForArticle(
    item: FeedItem,
    feed: Feed | undefined,
    globalFilters: GlobalFilterSettings,
  ): KeywordFilterDecision {
    if (globalFilters.bypassAll) {
      return { included: true, excludedBy: "none" };
    }

    const feedFilters = feed?.filters;
    const applyGlobal = this.shouldApplyGlobalFilters(feedFilters);

    if (applyGlobal) {
      const globalPassed = this.evaluateRules(
        item,
        globalFilters.rules,
        globalFilters.includeLogic,
      );
      if (!globalPassed) {
        return { included: false, excludedBy: "global" };
      }
    }

    if (feedFilters) {
      const feedPassed = this.evaluateRules(
        item,
        feedFilters.rules,
        feedFilters.includeLogic,
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

  private static ruleMatchesArticle(rule: KeywordFilterRule, item: FeedItem): boolean {
    const sources: string[] = [];
    if (rule.applyToTitle) {
      sources.push(item.title || "");
    }
    if (rule.applyToSummary) {
      sources.push(item.summary || item.description || "");
    }
    if (rule.applyToContent) {
      sources.push(item.content || item.description || "");
    }

    const keyword = rule.keyword.trim();
    if (!keyword) {
      return false;
    }

    return sources.some((text) => this.matchesText(text, keyword, rule.matchMode));
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
      return text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
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
