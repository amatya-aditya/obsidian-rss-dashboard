/**
 * Pins the saved-note text that the four template chains write after #672 fixes
 * replacement-string expansion and before #673 moves them onto one registry
 * (#247 slice 1). Each test drives a chain through its `saveArticle` and reads
 * the note back from the vault, including where the chains differ today.
 *
 * Locale-formatted dates and local times come from the same calls production
 * makes, so the pins hold in any locale and time zone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile, moment } from "obsidian";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import { ArticleSaver } from "../../../src/services/article-saver";
import { createWebViewerIntegrationHarness } from "./web-viewer-integration-harness";

// The real `obsidian` types `moment` as the moment namespace, which is not
// callable; production code casts it the same way.
type MomentFactory = (input?: Date) => { format: (fmt: string) => string };
const callMoment = moment as unknown as MomentFactory;

// An afternoon in most time zones, so 12- and 24-hour times differ.
const NOW = new Date("2026-03-31T20:30:00Z");
const PUB = new Date("2024-04-21T12:00:00Z");
const FIRST_SEEN = new Date("2024-04-20T12:00:00Z");
const COVER = "https://img.example/cover.png";
const FORMULA_IMAGE = "https://s0.wp.com/latex.php?latex=x%5E2";
const PLAIN_IMAGE = "https://img.example/plain.png";

function longDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmt(date: Date, format: string): string {
  return callMoment(date).format(format);
}

/** An item whose every frontmatter value needs YAML escaping. */
const QUOTED = {
  title: 'T "t"',
  author: 'A "a"',
  feedTitle: 'F "f"',
  link: 'https://example.com/l"l',
  guid: 'g "g"',
  coverImage: 'https://img.example/c"c.png',
};

/**
 * An item with `$&` in every string value. Template substitution must preserve
 * each value literally rather than interpreting JavaScript replacement tokens.
 */
const DOLLAR = {
  title: "T $& t",
  author: "A $& a",
  feedTitle: "F $& f",
  link: "https://example.com/$&",
  guid: "g $& g",
  summary: "S $& s",
  coverImage: "https://img.example/$&.png",
  tags: [{ name: "N $& n", color: "#e74c3c" }],
};

/** Every variable any chain knows, one per line, plus one no chain knows. */
const ALL_VARIABLES = [
  "T={{title}}",
  "D={{date}}",
  "DS={{dateShort}}",
  "ISO={{isoDate}}",
  "ISOT={{isoDateTime}}",
  "FS={{firstSeen}}",
  "SD={{saveDate}}",
  "S12={{saveTime12}}",
  "S24={{saveTime24}}",
  "DF={{date:YYYY/MM/DD}}",
  "L={{link}}",
  "A={{author}}",
  "SRC={{source}}",
  "FT={{feedTitle}}",
  "SUM={{summary}}",
  "TAGS={{tags}}",
  "G={{guid}}",
  "IMG={{image}}",
  "C={{content}}",
  "X={{unknown}}",
].join("\n");

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: 'Say "hi"',
    link: "https://example.com/a",
    description: "<p>Feed blurb</p>",
    pubDate: PUB.toISOString(),
    guid: "g-1",
    read: false,
    starred: false,
    tags: [{ name: "News", color: "#e74c3c" }],
    feedTitle: "Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: COVER,
    author: "Ann",
    summary: "Sum",
    firstSeenMs: FIRST_SEEN.getTime(),
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
  template?: string,
  rawContent?: string,
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
  it("fills every variable it knows and leaves the rest", async () => {
    const note = await saveWithArticleSaver(
      createItem(),
      {},
      ALL_VARIABLES,
      "<p>Body</p>",
    );

    expect(note).toBe(
      [
        'T=Say "hi"',
        `D=${longDate(PUB)}`,
        `DS=${fmt(PUB, "YYYY-MM-DD")}`,
        "ISO=2024-04-21T12:00:00.000Z",
        "ISOT=2024-04-21T12:00:00.000Z",
        `FS=${longDate(FIRST_SEEN)}`,
        `SD=${fmt(NOW, "YYYY-MM-DD")}`,
        `S12=${fmt(NOW, "hh:mm A")}`,
        `S24=${fmt(NOW, "HH:mm")}`,
        `DF=${fmt(PUB, "YYYY/MM/DD")}`,
        "L=https://example.com/a",
        "A=Ann",
        "SRC=Feed",
        "FT=Feed",
        "SUM=Sum",
        "TAGS=News",
        "G=g-1",
        `IMG=${COVER}`,
        "C=<p>Body</p>",
        "X={{unknown}}",
      ].join("\n"),
    );
  });

  it("uses the built-in note template when none is set", async () => {
    const note = await saveWithArticleSaver(
      createItem(),
      {},
      undefined,
      "<p>Body</p>",
    );

    expect(note).toBe(
      '# Say "hi"\n\n<p>Body</p>\n\n[Source](https://example.com/a)',
    );
  });

  it("writes an empty author when the item has none", async () => {
    const note = await saveWithArticleSaver(
      createItem({ author: undefined }),
      {},
      "[{{author}}]",
      "x",
    );

    expect(note).toBe("[]");
  });

  it("writes an empty summary when the item has none", async () => {
    const note = await saveWithArticleSaver(
      createItem({ summary: undefined }),
      {},
      "[{{summary}}]",
      "x",
    );

    expect(note).toBe("[]");
  });

  it("falls back to the article date for {{firstSeen}}", async () => {
    const note = await saveWithArticleSaver(
      createItem({ firstSeenMs: undefined }),
      {},
      "{{firstSeen}}",
      "x",
    );

    expect(note).toBe(longDate(PUB));
  });

  it("joins several tags with a comma and a space", async () => {
    const note = await saveWithArticleSaver(
      createItem({
        tags: [
          { name: "News", color: "#e74c3c" },
          { name: "Tech", color: "#3498db" },
        ],
      }),
      {},
      "{{tags}}",
      "x",
    );

    expect(note).toBe("News, Tech");
  });

  it("keeps $ sequences in {{content}} as they are", async () => {
    const note = await saveWithArticleSaver(
      createItem(),
      {},
      "{{content}}",
      "$$x^2$$ and $& and $'",
    );

    expect(note).toBe("$$x^2$$ and $& and $'");
  });

  it("preserves $ sequences in a title literally", async () => {
    const note = await saveWithArticleSaver(
      createItem({ title: "Price $$100, and $& too" }),
      {},
      "[{{title}}]",
      "x",
    );

    expect(note).toBe("[Price $$100, and $& too]");
  });

  it("preserves $ sequences in every string value", async () => {
    const note = await saveWithArticleSaver(
      createItem(DOLLAR),
      {},
      "{{title}}|{{link}}|{{author}}|{{source}}|{{feedTitle}}|{{summary}}|{{tags}}|{{guid}}|{{image}}",
      "x",
    );

    expect(note).toBe(
      "T $& t|https://example.com/$&|A $& a|F $& f|F $& f|S $& s|N $& n|g $& g|https://img.example/$&.png",
    );
  });

  it("fills a placeholder inside a value when a later step substitutes it", async () => {
    // Dates go first and {{link}} after {{title}}, so a title holding
    // "{{link}}" gets the link while one holding "{{date}}" keeps it.
    const note = await saveWithArticleSaver(
      createItem({ title: "A {{link}} B {{date}} C" }),
      {},
      "{{title}}",
      "x",
    );

    expect(note).toBe("A https://example.com/a B {{date}} C");
  });

  it("adds the saved tag, renaming a lowercase one in place", async () => {
    const note = await saveWithArticleSaver(
      createItem({
        tags: [
          { name: " news ", color: "#e74c3c" },
          { name: "saved", color: "#3498db" },
          { name: "  ", color: "#000000" },
        ],
      }),
      { addSavedTag: true },
      "{{tags}}",
      "x",
    );

    expect(note).toBe("news, Saved");
  });

  it("skips a rendered formula image for {{image}}", async () => {
    const note = await saveWithArticleSaver(
      createItem({ coverImage: FORMULA_IMAGE, image: PLAIN_IMAGE }),
      {},
      "{{image}}",
      "x",
    );

    expect(note).toBe(PLAIN_IMAGE);
  });
});

describe("ArticleSaver frontmatter template", () => {
  it("fills the variables it knows, escaped, and leaves {{content}}", async () => {
    const note = await saveWithArticleSaver(
      createItem(),
      {
        includeFrontmatter: true,
        frontmatterTemplate: `---\n${ALL_VARIABLES}\n---`,
      },
      "BODY",
      "x",
    );

    expect(note).toBe(
      [
        "---",
        'T=Say \\"hi\\"',
        `D=${longDate(PUB)}`,
        `DS=${fmt(PUB, "YYYY-MM-DD")}`,
        "ISO=2024-04-21T12:00:00.000Z",
        "ISOT=2024-04-21T12:00:00.000Z",
        `FS=${longDate(FIRST_SEEN)}`,
        `SD=${fmt(NOW, "YYYY-MM-DD")}`,
        `S12=${fmt(NOW, "hh:mm A")}`,
        `S24=${fmt(NOW, "HH:mm")}`,
        `DF=${fmt(PUB, "YYYY/MM/DD")}`,
        "L=https://example.com/a",
        "A=Ann",
        "SRC=Feed",
        "FT=Feed",
        "SUM=Sum",
        "TAGS=News",
        "G=g-1",
        `IMG=${COVER}`,
        "C={{content}}",
        "X={{unknown}}",
        "---",
        "BODY",
      ].join("\n"),
    );
  });

  it("escapes every value it fills, and writes an empty author when there is none", async () => {
    const note = await saveWithArticleSaver(
      createItem(QUOTED),
      {
        includeFrontmatter: true,
        frontmatterTemplate:
          '---\nt: "{{title}}"\ns: "{{source}}"\nl: "{{link}}"\na: "{{author}}"\nf: "{{feedTitle}}"\ng: "{{guid}}"\ni: "{{image}}"\n---',
      },
      "BODY",
      "x",
    );
    const noAuthor = await saveWithArticleSaver(
      createItem({ author: undefined }),
      {
        includeFrontmatter: true,
        frontmatterTemplate: '---\na: "{{author}}"\n---',
      },
      "BODY",
      "x",
    );

    expect(note).toBe(
      [
        "---",
        't: "T \\"t\\""',
        's: "F \\"f\\""',
        'l: "https://example.com/l\\"l"',
        'a: "A \\"a\\""',
        'f: "F \\"f\\""',
        'g: "g \\"g\\""',
        'i: "https://img.example/c\\"c.png"',
        "---",
        "BODY",
      ].join("\n"),
    );
    expect(noAuthor).toBe('---\na: ""\n---\nBODY');
  });

  it("uses the built-in frontmatter template without indentation when none is set", async () => {
    const note = await saveWithArticleSaver(
      createItem(),
      { includeFrontmatter: true },
      "BODY",
      "x",
    );

    expect(note).toBe(
      [
        "---",
        'title: "Say \\"hi\\""',
        `date: "${longDate(PUB)}"`,
        "tags: [News]",
        'source: "Feed"',
        'link: "https://example.com/a"',
        'author: "Ann"',
        'feedTitle: "Feed"',
        'guid: "g-1"',
        "---",
        "BODY",
      ].join("\n"),
    );
  });

  it("isn't added when the note template has its own frontmatter", async () => {
    const note = await saveWithArticleSaver(
      createItem(),
      { includeFrontmatter: true, frontmatterTemplate: "---\nx: 1\n---" },
      "---\ntitle: {{title}}\n---\nBODY",
      "x",
    );

    expect(note).toBe('---\ntitle: Say "hi"\n---\nBODY');
  });

  it("injects the video fields after the opening line", async () => {
    const note = await saveWithArticleSaver(
      createItem({ mediaType: "video", videoId: 'ab"c' }),
      {
        includeFrontmatter: true,
        frontmatterTemplate: '---\ntitle: "{{title}}"\n---',
      },
      "BODY",
      "x",
    );

    expect(note).toBe(
      '---\nmediaType: video\nvideoId: "ab\\"c"\ntitle: "Say \\"hi\\""\n---\nBODY',
    );
  });

  it("injects the podcast fields after the opening line", async () => {
    const note = await saveWithArticleSaver(
      createItem({
        mediaType: "podcast",
        audioUrl: 'https://a.example/e"p.mp3',
      }),
      { includeFrontmatter: true, frontmatterTemplate: "---\nt: x\n---\n" },
      "BODY",
      "x",
    );

    expect(note).toBe(
      '---\nmediaType: podcast\naudioUrl: "https://a.example/e\\"p.mp3"\nt: x\n---\nBODY',
    );
  });

  it("adds the saved tag with the same rule as the note template", async () => {
    const note = await saveWithArticleSaver(
      createItem({
        tags: [
          { name: " news ", color: "#e74c3c" },
          { name: "saved", color: "#3498db" },
        ],
      }),
      {
        addSavedTag: true,
        includeFrontmatter: true,
        frontmatterTemplate: "---\ntags: [{{tags}}]\n---",
      },
      "BODY",
      "x",
    );

    expect(note).toBe("---\ntags: [news, Saved]\n---\nBODY");
  });

  it("preserves $ sequences in a title literally", async () => {
    const note = await saveWithArticleSaver(
      createItem({ title: "Price $$100, and $& too" }),
      {
        includeFrontmatter: true,
        frontmatterTemplate: '---\ntitle: "{{title}}"\n---',
      },
      "BODY",
      "x",
    );

    expect(note).toBe('---\ntitle: "Price $$100, and $& too"\n---\nBODY');
  });

  it("preserves $ sequences in every string value", async () => {
    const note = await saveWithArticleSaver(
      createItem(DOLLAR),
      {
        includeFrontmatter: true,
        frontmatterTemplate:
          "---\n{{title}}|{{tags}}|{{source}}|{{link}}|{{author}}|{{feedTitle}}|{{guid}}|{{image}}\n---",
      },
      "BODY",
      "x",
    );

    expect(note).toBe(
      "---\nT $& t|N $& n|F $& f|https://example.com/$&|A $& a|F $& f|g $& g|https://img.example/$&.png\n---\nBODY",
    );
  });
});

describe("WebViewerIntegration note template", () => {
  it("fills saved-template variables and keeps {{date}} as the save date", async () => {
    const note = await saveWithWebViewer(
      createItem({ feedTitle: "" }),
      ALL_VARIABLES,
      false,
    );

    expect(note).toBe(
      [
        'T=Say "hi"',
        `D=${longDate(NOW)}`,
        `DS=${fmt(PUB, "YYYY-MM-DD")}`,
        "ISO=2024-04-21T12:00:00.000Z",
        "ISOT=2024-04-21T12:00:00.000Z",
        `FS=${longDate(FIRST_SEEN)}`,
        `SD=${fmt(NOW, "YYYY-MM-DD")}`,
        `S12=${fmt(NOW, "hh:mm A")}`,
        `S24=${fmt(NOW, "HH:mm")}`,
        `DF=${fmt(PUB, "YYYY/MM/DD")}`,
        "L=https://example.com/a",
        "A=Ann",
        "SRC=Web viewer",
        "FT=Web viewer",
        "SUM=Sum",
        "TAGS=News, Saved",
        "G=g-1",
        `IMG=${COVER}`,
        "C=<p>Feed blurb</p>",
        "X={{unknown}}",
      ].join("\n"),
    );
  });

  it("writes an empty author and summary when the item has none", async () => {
    const note = await saveWithWebViewer(
      createItem({ author: undefined, summary: undefined }),
      "[{{author}}][{{summary}}]",
      false,
    );

    expect(note).toBe("[][]");
  });

  it("keeps a feed title for {{source}}", async () => {
    const note = await saveWithWebViewer(createItem(), "{{source}}", false);

    expect(note).toBe("Feed");
  });

  it("keeps a rendered formula image for {{image}}", async () => {
    const note = await saveWithWebViewer(
      createItem({ coverImage: FORMULA_IMAGE, image: PLAIN_IMAGE }),
      "{{image}}",
      false,
    );

    expect(note).toBe(FORMULA_IMAGE);
  });

  it("keeps $ sequences in {{content}} as they are", async () => {
    const note = await saveWithWebViewer(
      createItem({ description: "$$x^2$$ and $& and $'" }),
      "{{content}}",
      false,
    );

    expect(note).toBe("$$x^2$$ and $& and $'");
  });

  it("preserves $ sequences in a title literally", async () => {
    const note = await saveWithWebViewer(
      createItem({ title: "Price $$100, and $& too" }),
      "[{{title}}]",
      false,
    );

    expect(note).toBe("[Price $$100, and $& too]");
  });

  it("preserves $ sequences in every string value", async () => {
    const note = await saveWithWebViewer(
      createItem(DOLLAR),
      "{{title}}|{{link}}|{{author}}|{{source}}|{{summary}}|{{image}}",
      false,
    );

    expect(note).toBe(
      "T $& t|https://example.com/$&|A $& a|F $& f|S $& s|https://img.example/$&.png",
    );
  });

  it("fills a placeholder inside a value when a later step substitutes it", async () => {
    // {{title}} goes first here, so a title holding "{{date}}" or "{{link}}"
    // gets both filled.
    const note = await saveWithWebViewer(
      createItem({ title: "A {{link}} B {{date}} C" }),
      "{{title}}",
      false,
    );

    expect(note).toBe(`A https://example.com/a B ${longDate(NOW)} C`);
  });
});

describe("WebViewerIntegration frontmatter template", () => {
  it("fills the variables it knows, escaped, with its own defaults, and leaves the rest", async () => {
    const note = await saveWithWebViewer(
      createItem({ feedTitle: "" }),
      "BODY",
      true,
      { addSavedTag: true, frontmatterTemplate: `---\n${ALL_VARIABLES}\n---` },
    );

    expect(note).toBe(
      [
        "---",
        'T=Say \\"hi\\"',
        `D=${longDate(PUB)}`,
        "DS={{dateShort}}",
        "ISO=2024-04-21T12:00:00.000Z",
        "ISOT=2024-04-21T12:00:00.000Z",
        "FS={{firstSeen}}",
        `SD=${fmt(NOW, "YYYY-MM-DD")}`,
        `S12=${fmt(NOW, "hh:mm A")}`,
        `S24=${fmt(NOW, "HH:mm")}`,
        "DF={{date:YYYY/MM/DD}}",
        "L=https://example.com/a",
        "A=Ann",
        "SRC=Web viewer",
        "FT=Web viewer",
        "SUM={{summary}}",
        "TAGS=News, Saved",
        "G=g-1",
        `IMG=${COVER}`,
        "C={{content}}",
        "X={{unknown}}",
        "---",
        "BODY",
      ].join("\n"),
    );
  });

  it("uses its own built-in frontmatter template when none is set", async () => {
    const note = await saveWithWebViewer(createItem(), "BODY", true, {
      addSavedTag: false,
      frontmatterTemplate: "",
    });

    expect(note).toBe(
      [
        "---",
        'title: "Say \\"hi\\""',
        `date: "${longDate(PUB)}"`,
        "tags: [News]",
        'source: "Feed"',
        'link: "https://example.com/a"',
        'author: "Ann"',
        'feedTitle: "Feed"',
        'guid: "g-1"',
        "---",
        "BODY",
      ].join("\n"),
    );
  });

  it("escapes every value it fills, and writes an empty author when there is none", async () => {
    const note = await saveWithWebViewer(createItem(QUOTED), "BODY", true, {
      frontmatterTemplate:
        '---\nt: "{{title}}"\ns: "{{source}}"\nl: "{{link}}"\na: "{{author}}"\nf: "{{feedTitle}}"\ng: "{{guid}}"\ni: "{{image}}"\n---',
    });
    const noAuthor = await saveWithWebViewer(
      createItem({ author: undefined }),
      "BODY",
      true,
      { frontmatterTemplate: '---\na: "{{author}}"\n---' },
    );

    expect(note).toBe(
      [
        "---",
        't: "T \\"t\\""',
        's: "F \\"f\\""',
        'l: "https://example.com/l\\"l"',
        'a: "A \\"a\\""',
        'f: "F \\"f\\""',
        'g: "g \\"g\\""',
        'i: "https://img.example/c\\"c.png"',
        "---",
        "BODY",
      ].join("\n"),
    );
    expect(noAuthor).toBe('---\na: ""\n---\nBODY');
  });

  it("doesn't add the saved tag when one matches 'saved' in another case", async () => {
    const note = await saveWithWebViewer(
      createItem({ tags: [{ name: "SAVED", color: "#3498db" }] }),
      "BODY",
      true,
      { addSavedTag: true, frontmatterTemplate: "---\ntags: [{{tags}}]\n---" },
    );

    expect(note).toBe("---\ntags: [SAVED]\n---\nBODY");
  });

  it("adds the saved tag only when no tag is exactly 'saved' in any case", async () => {
    const note = await saveWithWebViewer(
      createItem({
        tags: [
          { name: " news ", color: "#e74c3c" },
          { name: " saved ", color: "#3498db" },
        ],
      }),
      "BODY",
      true,
      { addSavedTag: true, frontmatterTemplate: "---\ntags: [{{tags}}]\n---" },
    );

    expect(note).toBe("---\ntags: [ news ,  saved , Saved]\n---\nBODY");
  });

  it("fills {{date}} inside a title, since {{title}} goes first", async () => {
    const note = await saveWithWebViewer(
      createItem({ title: "A {{date}} B" }),
      "BODY",
      true,
      { frontmatterTemplate: '---\ntitle: "{{title}}"\n---' },
    );

    expect(note).toBe(`---\ntitle: "A ${longDate(PUB)} B"\n---\nBODY`);
  });

  it("preserves $ sequences in a title literally", async () => {
    const note = await saveWithWebViewer(
      createItem({ title: "Price $$100, and $& too" }),
      "BODY",
      true,
      { frontmatterTemplate: '---\ntitle: "{{title}}"\n---' },
    );

    expect(note).toBe('---\ntitle: "Price $$100, and $& too"\n---\nBODY');
  });

  it("preserves $ sequences in every string value", async () => {
    const note = await saveWithWebViewer(createItem(DOLLAR), "BODY", true, {
      addSavedTag: false,
      frontmatterTemplate:
        "---\n{{title}}|{{tags}}|{{source}}|{{link}}|{{author}}|{{feedTitle}}|{{guid}}|{{image}}\n---",
    });

    expect(note).toBe(
      "---\nT $& t|N $& n|F $& f|https://example.com/$&|A $& a|F $& f|g $& g|https://img.example/$&.png\n---\nBODY",
    );
  });
});
