import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type HighlightSettings,
  type HighlightWord,
} from "../../../src/types/types";
import { computeHighlightMatchCounts } from "../../../src/utils/highlight-match-counts";

let nextId = 0;

function word(
  text: string,
  overrides: Partial<HighlightWord> = {},
): HighlightWord {
  return {
    id: String(nextId++),
    text,
    enabled: true,
    wholeWord: false,
    caseSensitive: false,
    createdAt: 0,
    ...overrides,
  };
}

function highlights(
  words: HighlightWord[],
  overrides: Partial<HighlightSettings> = {},
): HighlightSettings {
  return {
    ...DEFAULT_SETTINGS.highlights,
    enabled: true,
    highlightInTitles: true,
    highlightInSummaries: true,
    highlightInContent: true,
    words,
    ...overrides,
  };
}

function article(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Headline",
    link: "",
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid: String(nextId++),
    read: false,
    starred: false,
    tags: [],
    feedTitle: "",
    feedUrl: "",
    coverImage: "",
    ...overrides,
  };
}

function counts(
  articles: FeedItem[],
  hs: HighlightSettings,
  showSummary = true,
): number[] {
  return computeHighlightMatchCounts(articles, hs, showSummary).map(
    (c) => c.count,
  );
}

describe("computeHighlightMatchCounts", () => {
  afterEach(() => vi.restoreAllMocks());

  describe("parity with the uncached scan", () => {
    it("counts each article once per word across title, summary and content", () => {
      const hs = highlights([
        word("zebra"),
        word("Q&A", { caseSensitive: true }),
      ]);
      const articles = [
        article({ title: "A Zebra", content: "<p>zebra zebra</p>" }),
        article({ summary: "A zebra in the summary" }),
        article({ content: "<p>Q&amp;A</p>" }),
        article({ title: "Q&A" }),
        article({ title: "nothing" }),
      ];
      // The decoded preview of `Q&amp;A` content contains "Q&A" (#887).
      expect(counts(articles, hs)).toEqual([2, 2]);
    });

    it("honours whole-word and case-sensitive flags", () => {
      const hs = highlights([
        word("cat", { wholeWord: true }),
        word("Cat", { caseSensitive: true }),
      ]);
      const articles = [
        article({ title: "concatenate" }),
        article({ title: "the cat sat" }),
        article({ title: "Cat" }),
      ];
      expect(counts(articles, hs)).toEqual([2, 1]);
    });

    it("returns nothing when highlights are off, empty, or every word is disabled", () => {
      const a = [article({ title: "zebra" })];
      const off = highlights([word("zebra")], { enabled: false });
      const disabled = highlights([word("zebra", { enabled: false })]);
      expect(computeHighlightMatchCounts(a, off, true)).toEqual([]);
      expect(computeHighlightMatchCounts(a, highlights([]), true)).toEqual([]);
      expect(computeHighlightMatchCounts(a, disabled, true)).toEqual([]);
      expect(computeHighlightMatchCounts(a, undefined, true)).toEqual([]);
    });

    it("tests the title when every scope is off", () => {
      const hs = highlights([word("zebra")], {
        highlightInTitles: false,
        highlightInSummaries: false,
        highlightInContent: false,
      });
      expect(counts([article({ title: "zebra" })], hs)).toEqual([1]);
    });
  });

  describe("caching", () => {
    it("does not rescan unchanged articles when only read state changes", () => {
      const hs = highlights([word("zebra"), word("quokka")]);
      const articles = [
        article({ title: "zebra", content: "<p>body</p>" }),
        article({ content: "<p>quokka</p>" }),
      ];
      const first = counts(articles, hs);

      const test = vi.spyOn(RegExp.prototype, "test");
      articles[0].read = true;
      articles[1].starred = true;
      const second = counts(articles, hs);

      expect(second).toEqual(first);
      expect(test).not.toHaveBeenCalled();
    });

    it("drops an article from the count when it leaves the set and restores it on return", () => {
      const hs = highlights([word("zebra")]);
      const a = article({ title: "zebra" });
      const b = article({ title: "zebra" });
      expect(counts([a, b], hs)).toEqual([2]);
      expect(counts([a], hs)).toEqual([1]);
      expect(counts([a, b], hs)).toEqual([2]);
    });

    it("recounts when an article's title, content or preview changes", () => {
      const hs = highlights([word("zebra")]);
      const a = article({ title: "plain", content: "<p>plain</p>" });
      expect(counts([a], hs)).toEqual([0]);

      Object.assign(a, { title: "zebra" });
      expect(counts([a], hs)).toEqual([1]);

      Object.assign(a, { title: "plain" });
      expect(counts([a], hs)).toEqual([0]);
      a.content = "<p>zebra</p>";
      expect(counts([a], hs)).toEqual([1]);

      a.content = "<p>plain</p>";
      expect(counts([a], hs)).toEqual([0]);
      a.summary = "zebra in the summary";
      expect(counts([a], hs)).toEqual([1]);
    });

    it("recounts when a word is added, edited or toggled", () => {
      const a = article({ title: "zebra and quokka" });
      const zebra = word("zebra");
      expect(counts([a], highlights([zebra]))).toEqual([1]);

      expect(counts([a], highlights([zebra, word("quokka")]))).toEqual([1, 1]);
      expect(counts([a], highlights([word("walrus")]))).toEqual([0]);

      zebra.enabled = false;
      expect(counts([a], highlights([zebra, word("quokka")]))).toEqual([1]);

      zebra.enabled = true;
      zebra.wholeWord = true;
      zebra.text = "zebr";
      expect(counts([a], highlights([zebra]))).toEqual([0]);
      zebra.wholeWord = false;
      expect(counts([a], highlights([zebra]))).toEqual([1]);
    });

    it("recounts when a scope flag changes", () => {
      const a = article({
        title: "plain",
        summary: "plain",
        content: "<p>zebra</p>",
      });
      const w = word("zebra");
      expect(counts([a], highlights([w]))).toEqual([1]);
      expect(
        counts([a], highlights([w], { highlightInContent: false })),
      ).toEqual([0]);
      expect(
        counts([a], highlights([w], { highlightInContent: true })),
      ).toEqual([1]);

      const t = article({ title: "zebra", content: "<p>plain</p>" });
      expect(
        counts([t], highlights([w], { highlightInTitles: false })),
      ).toEqual([0]);
      expect(counts([t], highlights([w]))).toEqual([1]);
    });

    it("recounts when display.showSummary changes", () => {
      const a = article({ title: "plain", summary: "A zebra crossed." });
      const hs = highlights([word("zebra")], {
        highlightInTitles: false,
        highlightInContent: false,
      });
      expect(counts([a], hs, true)).toEqual([1]);
      expect(counts([a], hs, false)).toEqual([0]);
      expect(counts([a], hs, true)).toEqual([1]);
    });
  });
});
