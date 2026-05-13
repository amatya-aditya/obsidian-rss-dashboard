import { describe, expect, it } from "vitest";
import { KeywordFilterService } from "../../../src/services/keyword-filter-service";
import type {
  Feed,
  FeedItem,
  GlobalKeywordRulesSettings,
  KeywordFilterRule,
  FeedKeywordRulesSettings,
} from "../../../src/types/types";

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Hello World",
    link: "https://example.com/article",
    description: "<p>desc</p>",
    pubDate: "2024-01-01T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function createRule(overrides: Partial<KeywordFilterRule> = {}): KeywordFilterRule {
  return {
    id: "r1",
    enabled: true,
    type: "include",
    keyword: "hello",
    matchMode: "partial",
    applyToTitle: true,
    applyToSummary: false,
    applyToContent: false,
    ...overrides,
  };
}

function createGlobalRules(
  overrides: Partial<GlobalKeywordRulesSettings> = {},
): GlobalKeywordRulesSettings {
  return {
    includeLogic: "AND",
    bypassAll: false,
    rules: [],
    ...overrides,
  };
}

function createFeedKeywordRules(
  overrides: Partial<FeedKeywordRulesSettings> = {},
): FeedKeywordRulesSettings {
  return {
    includeLogic: "AND",
    overrideGlobalRules: false,
    rules: [],
    ...overrides,
  };
}

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed",
    url: "https://example.com/feed.xml",
    folder: "Uncategorized",
    items: [],
    lastUpdated: 1,
    ...overrides,
  };
}

describe("KeywordFilterService.getActiveRules / hasActiveRules", () => {
  it("filters out disabled rules, blank keywords, and rules with no applyTo flags", () => {
    const rules: KeywordFilterRule[] = [
      createRule({ id: "enabled" }),
      createRule({ id: "disabled", enabled: false }),
      createRule({ id: "blank", keyword: "   " }),
      createRule({
        id: "noFlags",
        applyToTitle: false,
        applyToSummary: false,
        applyToContent: false,
      }),
    ];

    const active = KeywordFilterService.getActiveRules(rules);
    expect(active.map((r) => r.id)).toEqual(["enabled"]);
    expect(KeywordFilterService.hasActiveRules(rules)).toBe(true);
    expect(KeywordFilterService.hasActiveRules([rules[1], rules[2], rules[3]])).toBe(false);
  });
});

describe("KeywordFilterService.shouldApplyGlobalFilters", () => {
  it("applies global rules unless feed overrides them", () => {
    expect(KeywordFilterService.shouldApplyGlobalFilters(undefined)).toBe(true);
    expect(
      KeywordFilterService.shouldApplyGlobalFilters(
        createFeedKeywordRules({ overrideGlobalRules: false }),
      ),
    ).toBe(true);
    expect(
      KeywordFilterService.shouldApplyGlobalFilters(
        createFeedKeywordRules({ overrideGlobalRules: true }),
      ),
    ).toBe(false);
  });
});

describe("KeywordFilterService.evaluateRules", () => {
  it("returns true when there are no active rules", () => {
    const item = createItem();
    const rules = [
      createRule({ enabled: false }),
      createRule({ keyword: "   " }),
      createRule({
        applyToTitle: false,
        applyToSummary: false,
        applyToContent: false,
      }),
    ];

    expect(KeywordFilterService.evaluateRules(item, rules, "AND")).toBe(true);
  });

  it("enforces include rules with AND logic", () => {
    const item = createItem({ title: "alpha beta" });
    const rules = [
      createRule({ id: "a", type: "include", keyword: "alpha" }),
      createRule({ id: "b", type: "include", keyword: "beta" }),
    ];

    expect(KeywordFilterService.evaluateRules(item, rules, "AND")).toBe(true);
    expect(
      KeywordFilterService.evaluateRules(item, [rules[0], createRule({ keyword: "gamma" })], "AND"),
    ).toBe(false);
  });

  it("enforces include rules with OR logic", () => {
    const item = createItem({ title: "alpha" });
    const rules = [
      createRule({ id: "a", type: "include", keyword: "alpha" }),
      createRule({ id: "b", type: "include", keyword: "beta" }),
    ];

    expect(KeywordFilterService.evaluateRules(item, rules, "OR")).toBe(true);
  });

  it("exclude rules override includes when they match", () => {
    const item = createItem({ title: "alpha beta" });
    const rules = [
      createRule({ id: "inc", type: "include", keyword: "alpha" }),
      createRule({ id: "exc", type: "exclude", keyword: "beta" }),
    ];
    expect(KeywordFilterService.evaluateRules(item, rules, "AND")).toBe(false);
  });

  it("supports exact (word-boundary) matching and escapes regex characters", () => {
    const item = createItem({ title: "Concatenate cat C++ end." });
    const exactCat = createRule({ matchMode: "exact", keyword: "cat" });
    const exactCPlusPlus = createRule({ matchMode: "exact", keyword: "C++" });

    // exact "cat" should match standalone "cat" but not "Concatenate"
    expect(KeywordFilterService.evaluateRules(item, [exactCat], "AND")).toBe(true);

    const item2 = createItem({ title: "concatenate only" });
    expect(KeywordFilterService.evaluateRules(item2, [exactCat], "AND")).toBe(false);

    // "C++" should not blow up regex and should match
    expect(KeywordFilterService.evaluateRules(item, [exactCPlusPlus], "AND")).toBe(true);
  });

  it("uses summary/content fallbacks (summary/content → description) based on applyTo flags", () => {
    const item = createItem({
      title: "nope",
      description: "description has KEYWORD",
      summary: "",
      content: "",
    });

    const ruleSummary = createRule({
      keyword: "keyword",
      applyToTitle: false,
      applyToSummary: true,
      applyToContent: false,
      matchMode: "partial",
    });
    const ruleContent = createRule({
      keyword: "keyword",
      applyToTitle: false,
      applyToSummary: false,
      applyToContent: true,
      matchMode: "partial",
    });
    const ruleTitle = createRule({
      keyword: "keyword",
      applyToTitle: true,
      applyToSummary: false,
      applyToContent: false,
      matchMode: "partial",
    });

    expect(KeywordFilterService.evaluateRules(item, [ruleSummary], "AND")).toBe(true);
    expect(KeywordFilterService.evaluateRules(item, [ruleContent], "AND")).toBe(true);
    expect(KeywordFilterService.evaluateRules(item, [ruleTitle], "AND")).toBe(false);
  });

  it("can match against article links for URL-based feed filtering", () => {
    const shortItem = createItem({
      title: "Regular-looking title",
      link: "https://www.youtube.com/shorts/6PkQMo39mbI",
      description: "no marker here",
    });
    const watchItem = createItem({
      title: "Regular-looking title",
      link: "https://www.youtube.com/watch?v=rVepNd1TUew",
      description: "no marker here",
    });
    const rule = createRule({
      type: "exclude",
      keyword: "/shorts/",
      applyToTitle: false,
      applyToSummary: false,
      applyToContent: false,
      applyToLink: true,
    });

    expect(KeywordFilterService.evaluateRules(shortItem, [rule], "AND")).toBe(false);
    expect(KeywordFilterService.evaluateRules(watchItem, [rule], "AND")).toBe(true);
  });
});

describe("KeywordFilterService.evaluateForArticle", () => {
  it("bypasses all filters when global bypassAll is set", () => {
    const decision = KeywordFilterService.evaluateForArticle(
      createItem({ title: "anything" }),
      createFeed(),
      createGlobalRules({ bypassAll: true }),
    );
    expect(decision).toEqual({ included: true, excludedBy: "none" });
  });

  it("excludes by global when global rules fail", () => {
    const item = createItem({ title: "alpha" });
    const globalRules = createGlobalRules({
      rules: [createRule({ type: "include", keyword: "beta" })],
      includeLogic: "AND",
    });

    const decision = KeywordFilterService.evaluateForArticle(item, undefined, globalRules);
    expect(decision).toEqual({ included: false, excludedBy: "global" });
  });

  it("does not apply global rules when feed overrides them", () => {
    const item = createItem({ title: "alpha" });
    const feed = createFeed({
      keywordRules: createFeedKeywordRules({
        overrideGlobalRules: true,
        rules: [createRule({ type: "include", keyword: "alpha" })],
      }) as any,
    });
    const globalRules = createGlobalRules({
      rules: [createRule({ type: "include", keyword: "beta" })],
    });

    const decision = KeywordFilterService.evaluateForArticle(item, feed, globalRules);
    expect(decision).toEqual({ included: true, excludedBy: "none" });
  });

  it("excludes by feed when feed rules fail (after global passes)", () => {
    const item = createItem({ title: "alpha" });
    const feed = createFeed({
      keywordRules: createFeedKeywordRules({
        rules: [createRule({ type: "include", keyword: "beta" })],
      }),
    });
    const globalRules = createGlobalRules({
      rules: [createRule({ type: "include", keyword: "alpha" })],
    });

    const decision = KeywordFilterService.evaluateForArticle(item, feed, globalRules);
    expect(decision).toEqual({ included: false, excludedBy: "feed" });
  });
});

