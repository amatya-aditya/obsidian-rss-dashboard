/**
 * The web viewer fills every saved-note template variable, so no `{{name}}`
 * placeholder from the registry, and no `{{date:FORMAT}}`, reaches the note
 * as literal text (#932). Templates that use only the placeholders it already
 * filled keep their exact output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moment } from "obsidian";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import { createWebViewerIntegrationHarness } from "./web-viewer-integration-harness";

type MomentFactory = (input?: Date) => { format: (fmt: string) => string };
const callMoment = moment as unknown as MomentFactory;

const NOW = new Date("2026-03-31T20:30:00Z");
const PUB = new Date("2024-04-21T12:00:00Z");
const FIRST_SEEN = new Date("2024-04-20T12:00:00Z");

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
    coverImage: "https://img.example/cover.png",
    author: "Ann",
    summary: 'Sum "s"',
    language: "en-GB",
    firstSeenMs: FIRST_SEEN.getTime(),
    ...overrides,
  };
}

async function save(
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

describe("web viewer saves with the templates it already filled", () => {
  it("writes the default frontmatter unchanged", async () => {
    const note = await save(createItem(), "BODY", true, {
      addSavedTag: false,
      frontmatterTemplate: "",
    });

    expect(note).toBe(
      `---\ntitle: "Say \\"hi\\""\ndate: "${longDate(PUB)}"\ntags: [News]\nsource: "Feed"\nlink: "https://example.com/a"\nauthor: "Ann"\nfeedTitle: "Feed"\nguid: "g-1"\n---\nBODY`,
    );
  });

  it("writes a custom frontmatter that uses only the filled placeholders unchanged", async () => {
    const note = await save(createItem(), "BODY", true, {
      addSavedTag: false,
      frontmatterTemplate:
        '---\ntitle: "{{title}}"\niso: {{isoDate}}\nsaved: {{saveDate}} {{saveTime24}}\nimage: "{{image}}"\n---',
    });

    expect(note).toBe(
      `---\ntitle: "Say \\"hi\\""\niso: 2024-04-21T12:00:00.000Z\nsaved: ${fmt(NOW, "YYYY-MM-DD")} ${fmt(NOW, "HH:mm")}\nimage: "https://img.example/cover.png"\n---\nBODY`,
    );
  });

  it("writes the default note template unchanged", async () => {
    const note = await save(
      createItem(),
      "---\ntitle: {{title}}\n---\n\n{{content}}",
      false,
    );

    expect(note).toBe('---\ntitle: Say "hi"\n---\n\n<p>Feed blurb</p>');
  });

  it("writes a note template that uses only the filled placeholders unchanged", async () => {
    const note = await save(
      createItem(),
      "{{date}}|{{dateShort}}|{{firstSeen}}|{{summary}}|{{tags}}|{{guid}}|{{feedTitle}}|{{date:YYYY/MM/DD}}",
      false,
      { addSavedTag: false },
    );

    expect(note).toBe(
      `${longDate(NOW)}|${fmt(PUB, "YYYY-MM-DD")}|${longDate(FIRST_SEEN)}|Sum "s"|News|g-1|Feed|${fmt(PUB, "YYYY/MM/DD")}`,
    );
  });
});

describe("web viewer note template placeholders (#932)", () => {
  it("fills {{description}}, {{excerpt}} and {{language}}", async () => {
    const note = await save(
      createItem(),
      "D={{description}}\nE={{excerpt}}\nL={{language}}",
      false,
    );

    expect(note).toBe("D=\nE=Feed blurb\nL=en-GB");
  });

  it("leaves no {{description}}, {{excerpt}} or {{language}} behind when the item has no value", async () => {
    const note = await save(
      createItem({ description: "", language: undefined }),
      "D={{description}}\nE={{excerpt}}\nL={{language}}\nEND",
      false,
    );

    expect(note).not.toContain("{{");
    expect(note).toBe("D=\nE=\nEND");
  });
});

describe("web viewer frontmatter template placeholders (#932)", () => {
  const template =
    '---\nshort: {{dateShort}}\nseen: {{firstSeen}}\nseenISO: {{firstSeenISO}}\nformatted: {{date:YYYY/MM/DD}}\nsummary: "{{summary}}"\ndescription: "{{description}}"\nexcerpt: "{{excerpt}}"\nlanguage: {{language}}\n---';

  it("fills the dates, summary, description, excerpt and language", async () => {
    const note = await save(createItem(), "BODY", true, {
      addSavedTag: false,
      frontmatterTemplate: template,
    });

    expect(note).toBe(
      `---\nshort: ${fmt(PUB, "YYYY-MM-DD")}\nseen: ${longDate(FIRST_SEEN)}\nseenISO: ${fmt(FIRST_SEEN, "YYYY-MM-DD")}\nformatted: ${fmt(PUB, "YYYY/MM/DD")}\nsummary: "Sum \\"s\\""\ndescription: ""\nexcerpt: "Feed blurb"\nlanguage: en-GB\n---\nBODY`,
    );
  });

  it("leaves no placeholder behind when the item has no values", async () => {
    const note = await save(
      createItem({ summary: undefined, description: "", language: undefined }),
      "BODY",
      true,
      { addSavedTag: false, frontmatterTemplate: template },
    );

    expect(note).not.toContain("{{");
    expect(note).toContain('summary: ""');
    expect(note).not.toContain("language:");
  });
});
