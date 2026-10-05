/**
 * Pins two more things the four saved-note template chains do today, before
 * #673 moves them onto one template-variable registry (#247 slice 1): which
 * values each chain escapes for YAML, and the exact order of its
 * substitutions. `saved-note-templates.characterization.test.ts` pins the
 * rest.
 *
 * The order shows in a note only when a value holds a placeholder: a later
 * step fills it, an earlier one doesn't. So in the order tests each value
 * holds the placeholder of the next text variable in that chain, and the
 * template holds only the first one. The whole chain is filled only when every
 * step runs after the one before it; a value whose step ran too early is left
 * as its placeholder. Date placeholders sit in the first value that follows
 * the dates, where they must stay unfilled, so no locale-formatted date ends up
 * in the expected text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import { ArticleSaver } from "../../../src/services/article-saver";
import { createWebViewerIntegrationHarness } from "./web-viewer-integration-harness";

const NOW = new Date("2026-03-31T20:30:00Z");

/** Every date placeholder; a value filled after the dates keeps them as they are. */
const DATE_PLACEHOLDERS =
  "{{date}}{{dateShort}}{{isoDate}}{{isoDateTime}}{{firstSeen}}{{saveDate}}{{saveTime12}}{{saveTime24}}{{date:YYYY}}";

/** Values holding a quote and a backslash, which YAML escaping changes. */
const QUOTED = {
  title: 'T "t" \\',
  author: 'A "a" \\',
  feedTitle: 'F "f" \\',
  link: 'https://example.com/l"l\\',
  guid: 'g "g" \\',
  summary: 'S "s" \\',
  coverImage: 'https://img.example/c"c\\.png',
  tags: [{ name: 'N "n" \\', color: "#e74c3c" }],
};

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Title",
    link: "https://example.com/a",
    description: "<p>Feed blurb</p>",
    pubDate: "2024-04-21T12:00:00.000Z",
    guid: "g-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    author: "Ann",
    summary: "Sum",
    ...overrides,
  };
}

function saverSettings(
  overrides: Partial<ArticleSavingSettings> = {},
): ArticleSavingSettings {
  return {
    addSavedTag: false,
    defaultFolder: "",
    defaultTemplate: "",
    includeFrontmatter: false,
    frontmatterTemplate: "",
    saveFullContent: false,
    fetchTimeout: 30_000,
    savedTemplates: [],
    ...overrides,
  };
}

/** Saves through `ArticleSaver.saveArticle` and returns the note's text. */
async function saveWithArticleSaver(
  item: FeedItem,
  settings: Partial<ArticleSavingSettings>,
  template: string,
  rawContent: string,
): Promise<string> {
  const app = App.createMock();
  const saver = new ArticleSaver(app, saverSettings(settings));
  const file = await saver.saveArticle(item, undefined, template, rawContent);
  if (!(file instanceof TFile))
    throw new Error("expected the note to be saved");
  return app.vault.read(file);
}

/** Saves through the web viewer's `saveArticle` and returns the note's text. */
async function saveWithWebViewer(
  item: FeedItem,
  template: string,
  includeFrontmatter: boolean,
  settings: Partial<ArticleSavingSettings> = {},
): Promise<string> {
  const h = createWebViewerIntegrationHarness({ settings });
  try {
    const file = await h.integration.saveArticle(
      item,
      "",
      template,
      includeFrontmatter,
    );
    if (!file) throw new Error("expected the note to be saved");
    return await h.app.vault.read(file);
  } finally {
    h.cleanup();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ArticleSaver note template", () => {
  it("writes every value as it is, without YAML escaping", async () => {
    const note = await saveWithArticleSaver(
      createItem(QUOTED),
      {},
      "{{title}}|{{link}}|{{author}}|{{source}}|{{feedTitle}}|{{summary}}|{{tags}}|{{guid}}|{{image}}",
      "x",
    );

    expect(note).toBe(
      'T "t" \\|https://example.com/l"l\\|A "a" \\|F "f" \\|F "f" \\|S "s" \\|N "n" \\|g "g" \\|https://img.example/c"c\\.png',
    );
  });

  it("substitutes in its own order: dates, then title, link, author, source, feedTitle, summary, content, tags, guid, image", async () => {
    const note = await saveWithArticleSaver(
      createItem({
        title: `T(${DATE_PLACEHOLDERS}{{link}})`,
        link: "L({{author}})",
        author: "A({{source}})",
        // {{source}} and {{feedTitle}} share the feed title, so it holds both
        // the next variable after {{source}} and the one after {{feedTitle}}.
        feedTitle: "F({{feedTitle}}{{summary}})",
        summary: "S({{content}})",
        tags: [{ name: "N({{guid}})", color: "#e74c3c" }],
        guid: "G({{image}})",
        coverImage: "https://img.example/I",
      }),
      {},
      "{{title}}",
      "C({{tags}})",
    );

    expect(note).toBe(
      `T(${DATE_PLACEHOLDERS}L(A(F(F({{feedTitle}}S(C(N(G(https://img.example/I)))))S(C(N(G(https://img.example/I))))))))`,
    );
  });
});

describe("ArticleSaver frontmatter template", () => {
  it("escapes every value but {{tags}}", async () => {
    const note = await saveWithArticleSaver(
      createItem(QUOTED),
      {
        includeFrontmatter: true,
        frontmatterTemplate:
          "---\n{{title}}|{{tags}}|{{source}}|{{link}}|{{author}}|{{feedTitle}}|{{guid}}|{{image}}\n---",
      },
      "BODY",
      "x",
    );

    expect(note).toBe(
      '---\nT \\"t\\" \\\\|N "n" \\|F \\"f\\" \\\\|https://example.com/l\\"l\\\\|A \\"a\\" \\\\|F \\"f\\" \\\\|g \\"g\\" \\\\|https://img.example/c\\"c\\\\.png\n---\nBODY',
    );
  });

  it("substitutes in its own order: dates, then title, tags, source, link, author, feedTitle, guid, image", async () => {
    const note = await saveWithArticleSaver(
      createItem({
        title: `T(${DATE_PLACEHOLDERS}{{tags}})`,
        tags: [{ name: "N({{source}})", color: "#e74c3c" }],
        feedTitle: "F({{link}}{{guid}})",
        link: "L({{author}})",
        author: "A({{feedTitle}})",
        guid: "G({{image}})",
        coverImage: "https://img.example/I",
      }),
      { includeFrontmatter: true, frontmatterTemplate: "---\n{{title}}\n---" },
      "BODY",
      "x",
    );

    expect(note).toBe(
      `---\nT(${DATE_PLACEHOLDERS}N(F(L(A(F({{link}}G(https://img.example/I))))G(https://img.example/I))))\n---\nBODY`,
    );
  });
});

describe("WebViewerIntegration note template", () => {
  it("writes every value as it is, without YAML escaping", async () => {
    const note = await saveWithWebViewer(
      createItem(QUOTED),
      "{{title}}|{{link}}|{{author}}|{{source}}|{{summary}}|{{image}}",
      false,
    );

    expect(note).toBe(
      'T "t" \\|https://example.com/l"l\\|A "a" \\|F "f" \\|S "s" \\|https://img.example/c"c\\.png',
    );
  });

  it("substitutes in its own order: title, dates, link, author, source, summary, content, image", async () => {
    const note = await saveWithWebViewer(
      createItem({
        title: "T({{link}})",
        link: `L(${DATE_PLACEHOLDERS}{{author}})`,
        author: "A({{source}})",
        feedTitle: "F({{summary}})",
        summary: "S({{content}})",
        description: "C({{image}})",
        coverImage: "https://img.example/I",
      }),
      "{{title}}",
      false,
    );

    expect(note).toBe(
      `T(L(${DATE_PLACEHOLDERS}A(F(S(C(https://img.example/I))))))`,
    );
  });
});

describe("WebViewerIntegration frontmatter template", () => {
  it("escapes every value but {{tags}}", async () => {
    const note = await saveWithWebViewer(createItem(QUOTED), "BODY", true, {
      addSavedTag: false,
      frontmatterTemplate:
        "---\n{{title}}|{{tags}}|{{source}}|{{link}}|{{author}}|{{feedTitle}}|{{guid}}|{{image}}\n---",
    });

    expect(note).toBe(
      '---\nT \\"t\\" \\\\|N "n" \\|F \\"f\\" \\\\|https://example.com/l\\"l\\\\|A \\"a\\" \\\\|F \\"f\\" \\\\|g \\"g\\" \\\\|https://img.example/c\\"c\\\\.png\n---\nBODY',
    );
  });

  it("substitutes in its own order: title, dates, tags, source, link, author, feedTitle, guid, image", async () => {
    const note = await saveWithWebViewer(
      createItem({
        title: "T({{tags}})",
        tags: [{ name: `N(${DATE_PLACEHOLDERS}{{source}})`, color: "#e74c3c" }],
        feedTitle: "F({{link}}{{guid}})",
        link: "L({{author}})",
        author: "A({{feedTitle}})",
        guid: "G({{image}})",
        coverImage: "https://img.example/I",
      }),
      "BODY",
      true,
      { addSavedTag: false, frontmatterTemplate: "---\n{{title}}\n---" },
    );

    expect(note).toBe(
      `---\nT(N(${DATE_PLACEHOLDERS}F(L(A(F({{link}}G(https://img.example/I))))G(https://img.example/I))))\n---\nBODY`,
    );
  });
});
