import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import {
  ArticleSaver,
  sanitizeFilename,
} from "../../../src/services/article-saver";
import * as fetchHelpers from "../../../src/utils/fetch-helpers";
import { RESTRICTED_ARTICLE_REASON } from "../../../src/utils/full-article-fetch";

function createSettings(
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

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test Article",
    link: "https://example.com/article",
    description: "<p>Desc</p>",
    pubDate: "2024-01-01T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sanitizeFilename", () => {
  it("removes invalid characters and caps long titles at 100 characters", () => {
    const title = `  ${"a".repeat(98)} /  zzz`;

    expect(sanitizeFilename(title)).toBe(`${"a".repeat(98)} z`);
  });

  it("falls back to a safe filename when sanitization removes everything", () => {
    expect(sanitizeFilename(' / \\\\ : * ? " < > | ')).toBe("Untitled Article");
    expect(sanitizeFilename("   ")).toBe("Untitled Article");
  });

  it("falls back for Windows reserved device names", () => {
    expect(sanitizeFilename("NUL")).toBe("Untitled Article");
    expect(sanitizeFilename("com1")).toBe("Untitled Article");
    expect(sanitizeFilename("LPT³")).toBe("Untitled Article");
  });
});

describe("ArticleSaver.saveArticle", () => {
  it("previews the first available filename that a save will use", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const item = createItem({ title: "Preview title", feedTitle: "Research" });
    await app.vault.create("Research - Preview title.md", "existing");

    expect(saver.getFilenamePreview(item, "", "{{source}} - {{title}}")).toBe(
      "Research - Preview title 2.md",
    );
  });

  it("preserves dollar replacement sequences in frontmatter and body metadata", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      frontmatterTemplate: `---
title: "{{title}}"
author: "{{author}}"
feedTitle: "{{feedTitle}}"
---`,
      defaultTemplate: "{{title}} | {{author}} | {{source}} | {{content}}",
    });
    const saver = new ArticleSaver(app, settings);
    const item = createItem({
      title: "Price $$100, and $& too",
      author: "Ann $' Lee",
      feedTitle: "Research $` Quarterly",
    });

    const createSpy = vi.spyOn(app.vault, "create");
    await saver.saveArticle(item, undefined, undefined, "BODY");

    const written = createSpy.mock.calls[0][1];
    expect(written).toContain('title: "Price $$100, and $& too"');
    expect(written).toContain('author: "Ann $\' Lee"');
    expect(written).toContain('feedTitle: "Research $` Quarterly"');
    expect(written).toContain(
      "Price $$100, and $& too | Ann $' Lee | Research $` Quarterly | BODY",
    );
  });

  it("fills the summary in frontmatter when the note template has no frontmatter", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      defaultTemplate: "# {{title}}\n\n{{content}}",
      frontmatterTemplate: `---
summary: "{{summary}}"
---`,
    });
    const saver = new ArticleSaver(app, settings);
    const item = createItem({
      summary: 'A "quoted" summary\nwith another line.',
    });

    const createSpy = vi.spyOn(app.vault, "create");
    await saver.saveArticle(item, undefined, undefined, "BODY");

    const written = createSpy.mock.calls[0][1];
    expect(written).toContain(
      'summary: "A \\"quoted\\" summary\\nwith another line."',
    );
    expect(written).not.toContain("{{summary}}");
  });

  it("fills {{description}}, {{excerpt}} and the cleaned {{author}} in the note and frontmatter (#247)", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      defaultTemplate:
        "D={{description}} | E={{excerpt}} | A={{author}} | S={{summary}} | {{content}}",
      frontmatterTemplate: `---
description: "{{description}}"
excerpt: "{{excerpt}}"
---`,
    });
    const saver = new ArticleSaver(app, settings);
    const item = createItem({
      summary: "Kept summary",
      author: "Jane Doe in Paris",
      authors: ["Jane Doe"],
      publisherDescription: 'The "publisher" description of the harbor story',
    });

    const createSpy = vi.spyOn(app.vault, "create");
    await saver.saveArticle(item, undefined, undefined, "BODY");

    const written = createSpy.mock.calls[0][1];
    expect(written).toContain(
      'description: "The \\"publisher\\" description of the harbor story"',
    );
    expect(written).toContain('excerpt: ""');
    expect(written).toContain(
      'D=The "publisher" description of the harbor story | E= | A=Jane Doe | S=Kept summary | BODY',
    );
  });

  it("fills {{language}} in the note and frontmatter, and omits the lines when it is unknown (#246)", async () => {
    const settings = createSettings({
      includeFrontmatter: true,
      defaultTemplate: "# {{title}}\n\nLanguage: {{language}}\n\n{{content}}",
      frontmatterTemplate: `---
title: "{{title}}"
lang: "{{language}}"
---`,
    });

    const knownApp = App.createMock();
    const knownSpy = vi.spyOn(knownApp.vault, "create");
    await new ArticleSaver(knownApp, settings).saveArticle(
      createItem({ language: "de-DE", languageSource: "feed" }),
      undefined,
      undefined,
      "BODY",
    );
    const known = knownSpy.mock.calls[0][1];
    expect(known).toContain('lang: "de-DE"');
    expect(known).toContain("Language: de-DE");

    const unknownApp = App.createMock();
    const unknownSpy = vi.spyOn(unknownApp.vault, "create");
    await new ArticleSaver(unknownApp, settings).saveArticle(
      createItem(),
      undefined,
      undefined,
      "BODY",
    );
    const unknown = unknownSpy.mock.calls[0][1];
    expect(unknown).not.toContain("lang:");
    expect(unknown).not.toContain("Language:");
    expect(unknown).not.toContain("{{language}}");
    expect(unknown).toContain('title: "Test Article"');
    expect(unknown).toContain("BODY");
  });

  it("fills {{language}} from the feed's declared language for an item that was never fetched (#809)", async () => {
    const settings = createSettings({
      includeFrontmatter: false,
      defaultTemplate: 'language: "{{language}}"\n\n{{content}}',
    });
    const app = App.createMock();
    const spy = vi.spyOn(app.vault, "create");
    const feedUrl = "https://example.com/feed.xml";
    await new ArticleSaver(app, settings, undefined, undefined, () => [
      {
        title: "Feed",
        url: feedUrl,
        folder: "",
        items: [],
        lastUpdated: 0,
        language: "en_us",
      },
    ]).saveArticle(createItem({ feedUrl }), undefined, undefined, "BODY");

    expect(spy.mock.calls[0][1]).toContain('language: "en-US"');
  });

  it("prefers item.content over description when raw content is not provided", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "Prefer Content",
      description:
        '<body xmlns="http://www.w3.org/1999/xhtml">Short summary.</body>',
      content:
        "<p>Organizations are accumulating a type of debt that no one has been hired to pay down.</p><p>Second paragraph with more context.</p>",
    });

    const file = await saver.saveArticle(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain(
      "Organizations are accumulating a type of debt that no one has been hired to pay down.",
    );
    expect(written).toContain("Second paragraph with more context.");
    expect(written).not.toContain(
      '<body xmlns="http://www.w3.org/1999/xhtml">',
    );
  });

  it("writes to a normalized folder path and applies template/frontmatter substitutions", async () => {
    const app = App.createMock();
    const settings = createSettings({
      addSavedTag: true,
      includeFrontmatter: true,
      defaultFolder: "/My Articles/",
      defaultTemplate:
        "# {{title}}\niso={{isoDateTime}}\ntags={{tags}}\n\n{{content}}\n\n[Source]({{link}})",
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "Hello / World: An Article",
      tags: [{ name: "tech", color: "#000" }],
    });

    const createFolderSpy = vi.spyOn(app.vault, "createFolder");
    const createSpy = vi.spyOn(app.vault, "create");

    const file = await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(file).toBeInstanceOf(TFile);
    expect(createFolderSpy).toHaveBeenCalledWith("My Articles");

    const expectedPath = "My Articles/Hello World An Article.md";
    expect(createSpy).toHaveBeenCalled();
    expect(createSpy.mock.calls[0][0]).toBe(expectedPath);

    const written = createSpy.mock.calls[0][1];
    expect(written).toContain('title: "Hello / World: An Article"');
    expect(written).toContain('source: "Test Feed"');
    expect(written).toContain('link: "https://example.com/article"');
    expect(written).toContain('guid: "guid-1"');
    expect(written).toContain("tags: [tech, Saved]");
    expect(written).toContain("iso=2024-01-01T00:00:00.000Z");
    expect(written).toContain("tags=tech, Saved");
    expect(written).toContain("BODY");

    expect(item.saved).toBe(true);
    expect(item.savedFilePath).toBe(expectedPath);
    expect(item.tags?.map((tag) => tag.name)).toEqual(["tech", "Saved"]);
  });

  it("substitutes {{firstSeen}} and {{firstSeenISO}} in body and frontmatter templates", async () => {
    const firstSeenDate = new Date(Date.parse("2024-05-01T01:00:00Z"));
    const expectedLongDate = firstSeenDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const expectedIsoDate = [
      firstSeenDate.getFullYear(),
      String(firstSeenDate.getMonth() + 1).padStart(2, "0"),
      String(firstSeenDate.getDate()).padStart(2, "0"),
    ].join("-");

    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      defaultTemplate:
        "First seen: {{firstSeen}} ({{firstSeenISO}})\n\n{{content}}",
      frontmatterTemplate: `---
title: "{{title}}"
firstSeen: "{{firstSeen}}"
firstSeenISO: "{{firstSeenISO}}"
---`,
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      firstSeenMs: firstSeenDate.getTime(),
    });

    const createSpy = vi.spyOn(app.vault, "create");
    await saver.saveArticle(item, undefined, undefined, "BODY");

    const written = createSpy.mock.calls[0][1];
    expect(written).toContain(
      `First seen: ${expectedLongDate} (${expectedIsoDate})`,
    );
    expect(written).toContain(`firstSeen: "${expectedLongDate}"`);
    expect(written).toContain(`firstSeenISO: "${expectedIsoDate}"`);
  });

  it("uses the publish date for both first-seen variables when firstSeenMs is unavailable", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{firstSeen}} | {{firstSeenISO}}",
    });
    const saver = new ArticleSaver(app, settings);
    const item = createItem({
      pubDate: "2024-04-21T12:00:00Z",
      firstSeenMs: undefined,
    });
    const createSpy = vi.spyOn(app.vault, "create");

    await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(createSpy.mock.calls[0][1]).toContain("April 21, 2024 | 2024-04-21");
  });

  it("resolves a pubDate that fails Date.parse cleanly instead of silently using the save time (#303)", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      defaultTemplate: "iso={{isoDateTime}}\n\n{{content}}",
      frontmatterTemplate: `---
date: "{{date}}"
dateShort: "{{dateShort}}"
isoDate: "{{isoDate}}"
---`,
    });
    const saver = new ArticleSaver(app, settings);

    // CST = UTC-6, so 09:00 CST is 15:00 UTC. Some engines fail to parse the
    // obsolete named zone via Date.parse() and produce NaN; getPubDateMs
    // normalizes it to an explicit offset first.
    const item = createItem({
      pubDate: "Fri, 06 May 1983 09:00:00 CST",
    });

    const createSpy = vi.spyOn(app.vault, "create");
    await saver.saveArticle(item, undefined, undefined, "BODY");

    const written = createSpy.mock.calls[0][1];
    expect(written).toContain('date: "May 6, 1983"');
    expect(written).toContain('dateShort: "1983-05-06"');
    expect(written).toContain('isoDate: "1983-05-06T15:00:00.000Z"');
    expect(written).toContain("iso=1983-05-06T15:00:00.000Z");
  });

  it("falls back to firstSeenMs (not the save time) when pubDate is unparseable, a first-seen timestamp exists, and useFirstSeenDateFallback is enabled (#303)", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      frontmatterTemplate: `---
date: "{{date}}"
isoDate: "{{isoDate}}"
---`,
    });
    const saver = new ArticleSaver(app, settings, undefined, () => true);

    const item = createItem({
      pubDate: "not a real date",
      firstSeenMs: Date.parse("2024-05-01T12:00:00Z"),
    });

    const createSpy = vi.spyOn(app.vault, "create");
    await saver.saveArticle(item, undefined, undefined, "BODY");

    const written = createSpy.mock.calls[0][1];
    expect(written).toContain('date: "May 1, 2024"');
    expect(written).toContain('isoDate: "2024-05-01T12:00:00.000Z"');
  });

  it("does not substitute firstSeenMs for the frontmatter date when useFirstSeenDateFallback is disabled (default) (#303)", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      frontmatterTemplate: `---
isoDate: "{{isoDate}}"
---`,
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      pubDate: "not a real date",
      firstSeenMs: Date.parse("2024-05-01T12:00:00Z"),
    });

    const now = Date.parse("2026-09-18T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      const createSpy = vi.spyOn(app.vault, "create");
      await saver.saveArticle(item, undefined, undefined, "BODY");

      const written = createSpy.mock.calls[0][1];
      expect(written).toContain(`isoDate: "${new Date(now).toISOString()}"`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the current time only when there is genuinely no pubDate and no firstSeenMs (#303)", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      frontmatterTemplate: `---
isoDate: "{{isoDate}}"
---`,
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ pubDate: undefined, firstSeenMs: undefined });

    const now = Date.parse("2026-09-18T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      const createSpy = vi.spyOn(app.vault, "create");
      await saver.saveArticle(item, undefined, undefined, "BODY");

      const written = createSpy.mock.calls[0][1];
      expect(written).toContain(`isoDate: "${new Date(now).toISOString()}"`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("escapes quotes, backslashes, and line breaks in frontmatter values", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      frontmatterTemplate: `---
title: "{{title}}"
author: "{{author}}"
source: "{{source}}"
---`,
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: 'He said "hi"',
      author: "A\\B",
      feedTitle: "Line\nBreak Feed",
    });

    const createSpy = vi.spyOn(app.vault, "create");
    await saver.saveArticle(item, undefined, undefined, "BODY");

    const written = createSpy.mock.calls[0][1];
    expect(written).toContain('title: "He said \\"hi\\""');
    expect(written).toContain('author: "A\\\\B"');
    expect(written).toContain('source: "Line\\nBreak Feed"');
  });

  it("keeps a title containing a line break and a fake key inside the quoted scalar", async () => {
    const app = App.createMock();
    const settings = createSettings({
      includeFrontmatter: true,
      frontmatterTemplate: `---
title: "{{title}}"
---`,
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: 'Safe"\ninjected: true\n' });

    const createSpy = vi.spyOn(app.vault, "create");
    await saver.saveArticle(item, undefined, undefined, "BODY");

    const written = createSpy.mock.calls[0][1];
    // The body template interpolates the raw title, so scope the injection
    // assertion to the frontmatter block, before the closing `---`.
    const frontmatter = written.split("\n---")[0];
    expect(frontmatter).toContain('title: "Safe\\"\\ninjected: true\\n"');
    // Before escaping, the embedded quote and line breaks ended the scalar and
    // left `injected: true` as a real frontmatter key.
    expect(frontmatter).not.toMatch(/^injected: true$/m);
  });

  it("updates an identified saved file at its recorded path", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultFolder: "Articles",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: "Repeat Title" });
    await saver.saveArticle(item, undefined, undefined, "FIRST");

    const modifySpy = vi.spyOn(app.vault, "modify");
    const result = await saver.saveArticle(
      item,
      undefined,
      undefined,
      "SECOND",
    );

    expect(result?.path).toBe("Articles/Repeat Title.md");
    expect(modifySpy).toHaveBeenCalledTimes(1);
    expect(modifySpy).toHaveBeenCalledWith(result, "SECOND");
  });

  it("returns null and does not mark the item saved when writing fails", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    vi.spyOn(app.vault, "create").mockRejectedValueOnce(new Error("disk full"));

    const item = createItem({ title: "Will Fail" });
    const result = await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(result).toBeNull();
    expect(item.saved).not.toBe(true);
    expect(item.savedFilePath).toBeUndefined();
  });

  it("recreates a saved note at its legacy title path after its recorded path disappears", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultFolder: "Articles",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: "Race Condition" });
    await saver.saveArticle(item, undefined, undefined, "FIRST");

    const savedFile = app.vault.getAbstractFileByPath(
      "Articles/Race Condition.md",
    );
    if (!(savedFile instanceof TFile)) throw new Error("expected saved file");
    await app.vault.delete(savedFile);

    const result = await saver.saveArticle(
      item,
      undefined,
      undefined,
      "SECOND",
    );

    expect(result).toBeInstanceOf(TFile);
    expect(result?.path).toBe("Articles/Race Condition.md");
  });

  it("saves into an existing folder whose name differs only in case", async () => {
    const app = App.createMock();
    await app.vault.createFolder("RSS Articles");
    const settings = createSettings({
      defaultFolder: "rss articles",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: "Case Variant" });
    const result = await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(result).toBeInstanceOf(TFile);
    expect(result?.path).toBe("RSS Articles/Case Variant.md");
    expect(item.savedFilePath).toBe("RSS Articles/Case Variant.md");
  });

  it("creates a separate folder for a case variant on a case-sensitive file system", async () => {
    const app = App.createMock();
    // Linux file systems treat "rss articles" and "RSS Articles" as different.
    app.vault.caseSensitiveFileSystem = true;
    await app.vault.createFolder("RSS Articles");
    const settings = createSettings({
      defaultFolder: "rss articles",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: "Case Variant" });
    const result = await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(result?.path).toBe("rss articles/Case Variant.md");
  });

  it("creates nested folders one segment at a time", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultFolder: "Parent/Child/Grandchild",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);
    const createFolderSpy = vi.spyOn(app.vault, "createFolder");

    const item = createItem({ title: "Nested Folder Save" });
    const result = await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(result).toBeInstanceOf(TFile);
    expect(createFolderSpy).toHaveBeenCalledWith("Parent");
    expect(createFolderSpy).toHaveBeenCalledWith("Parent/Child");
    expect(createFolderSpy).toHaveBeenCalledWith("Parent/Child/Grandchild");
  });

  it("retries create after restoring missing folder path", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultFolder: "Articles",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    const originalCreate = app.vault.create.bind(app.vault);
    const createSpy = vi.spyOn(app.vault, "create");
    createSpy
      .mockRejectedValueOnce(new Error("ENOENT: no such file or directory"))
      .mockImplementationOnce(async (path: string, content: string) => {
        return await originalCreate(path, content);
      });

    const item = createItem({ title: "Retry Missing Folder" });
    const result = await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(result).toBeInstanceOf(TFile);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it("uses the full sanitized title in the saved file path", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultFolder: "Articles",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title:
        'This is a deliberately long article title with / illegal : characters " removed" and extra words',
    });

    const createSpy = vi.spyOn(app.vault, "create");

    await saver.saveArticle(item, undefined, undefined, "BODY");

    const expectedPath =
      "Articles/This is a deliberately long article title with illegal characters removed and extra words.md";
    expect(createSpy).toHaveBeenCalled();
    expect(createSpy.mock.calls[0][0]).toBe(expectedPath);
    expect(item.savedFilePath).toBe(expectedPath);
  });

  it("uses a fallback filename when the title sanitizes to empty", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultFolder: "Articles",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: ' / \\\\ : * ? " < > | ' });

    const createSpy = vi.spyOn(app.vault, "create");

    await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(createSpy).toHaveBeenCalled();
    expect(createSpy.mock.calls[0][0]).toBe("Articles/Untitled Article.md");
    expect(item.savedFilePath).toBe("Articles/Untitled Article.md");
  });

  it("renders saved-template filename patterns and avoids replacing other notes", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const savedTemplate = {
      id: "pattern",
      name: "Pattern",
      template: "# {{title}}",
      filenamePattern: "{{source}} - {{title}}",
    };
    const first = createItem({ title: "Shared", feedTitle: "Research" });
    const second = createItem({
      title: "Shared",
      feedTitle: "Research",
      guid: "guid-2",
    });

    const firstFile = await saver.saveArticle(
      first,
      undefined,
      undefined,
      undefined,
      savedTemplate,
    );
    const secondFile = await saver.saveArticle(
      second,
      undefined,
      undefined,
      undefined,
      savedTemplate,
    );

    expect(firstFile?.path).toBe("Research - Shared.md");
    expect(secondFile?.path).toBe("Research - Shared 2.md");
    expect(first.savedFilePath).toBe("Research - Shared.md");
  });

  it("preserves an empty body from an explicitly selected saved template", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultTemplate: "# Standalone fallback" }),
    );

    const file = await saver.saveArticle(
      createItem(),
      undefined,
      undefined,
      undefined,
      { id: "empty", name: "Empty", template: "" },
    );

    if (!(file instanceof TFile)) throw new Error("expected saved file");
    await expect(app.vault.read(file)).resolves.toBe("");
  });

  it("writes a saved template without the plugin frontmatter, even when frontmatter is on", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        frontmatterTemplate: "---\ntitle: {{title}}\n---",
      }),
    );

    const file = await saver.saveArticle(
      createItem(),
      undefined,
      undefined,
      "Body text",
      { id: "beta", name: "Beta", template: "BETA: {{title}}\n\n{{content}}" },
    );

    if (!(file instanceof TFile)) throw new Error("expected saved file");
    await expect(app.vault.read(file)).resolves.toBe(
      "BETA: Test Article\n\nBody text",
    );
  });

  it("still adds the plugin frontmatter when no saved template is used", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        frontmatterTemplate: "---\ntitle: {{title}}\n---",
        defaultTemplate: "# {{title}}",
      }),
    );

    const file = await saver.saveArticle(createItem());

    if (!(file instanceof TFile)) throw new Error("expected saved file");
    const written = await app.vault.read(file);
    expect(written.startsWith("---\ntitle: Test Article\n---\n")).toBe(true);
  });

  it("uses unindented frontmatter when no frontmatter template is configured", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        defaultTemplate: "# {{title}}",
      }),
    );

    const file = await saver.saveArticle(createItem());

    if (!(file instanceof TFile)) throw new Error("expected saved file");
    const written = await app.vault.read(file);
    expect(written).toMatch(/^---\ntitle: "Test Article"\ndate: /);
    expect(written).toContain("\n---\n# Test Article");
    expect(written).not.toMatch(
      /^ +(?:title|date|tags|source|link|author|feedTitle|guid):/m,
    );
  });

  it("uses the normalized article image value in filename patterns", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const normalizedImage =
      "https://substack-post-media.s3.amazonaws.com/public/images/photo.png";
    const item = createItem({
      coverImage:
        "https://substackcdn.com/image/fetch/$s_!test/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fphoto.png",
    });

    const file = await saver.saveArticle(
      item,
      undefined,
      undefined,
      undefined,
      {
        id: "image",
        name: "Image",
        template: "{{image}}",
        filenamePattern: "{{image}}",
      },
    );

    expect(file?.path).toBe(`${sanitizeFilename(normalizedImage)}.md`);
  });

  it("updates an identified saved note at its recorded path after pattern changes", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    await app.vault.createFolder("Archive");
    const item = createItem({
      saved: true,
      savedFilePath: "Archive/Original name.md",
    });
    const savedTemplate = {
      id: "pattern",
      name: "Pattern",
      template: "# {{title}}",
      filenamePattern: "New name",
    };
    const existing = await app.vault.create(
      "Archive/Original name.md",
      "old content",
    );
    const modify = vi.spyOn(app.vault, "modify");

    const file = await saver.saveArticle(
      item,
      undefined,
      undefined,
      "updated content",
      savedTemplate,
    );

    expect(file).toBe(existing);
    expect(file?.path).toBe("Archive/Original name.md");
    expect(modify).toHaveBeenCalledWith(existing, "# Test Article");
  });

  it("falls back to the article title for unusable patterns and keeps collision suffixes inside the stem limit", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const unusable = await saver.saveArticle(
      createItem({ title: "Title fallback" }),
      undefined,
      undefined,
      undefined,
      {
        id: "empty",
        name: "Empty",
        template: "{{title}}",
        filenamePattern: "{{content}}",
      },
    );
    const longTemplate = {
      id: "long",
      name: "Long",
      template: "{{title}}",
      filenamePattern: "x".repeat(100),
    };
    const longFirst = await saver.saveArticle(
      createItem({ guid: "long-one" }),
      undefined,
      undefined,
      undefined,
      longTemplate,
    );
    const longSecond = await saver.saveArticle(
      createItem({ guid: "long-two" }),
      undefined,
      undefined,
      undefined,
      longTemplate,
    );

    expect(unusable?.path).toBe("Title fallback.md");
    expect(longFirst?.basename.length).toBe(100);
    expect(longSecond?.basename.length).toBe(100);
    expect(longSecond?.basename.endsWith(" 2")).toBe(true);
  });
});

describe("ArticleSaver date variables", () => {
  it("uses the save time for the dates when neither pubDate nor firstSeenMs gives a real date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    try {
      const app = App.createMock();
      // The first-seen fallback reaches firstSeenMs, which is not a real date.
      const saver = new ArticleSaver(
        app,
        createSettings(),
        undefined,
        () => true,
      );
      const item = createItem({ pubDate: "", firstSeenMs: Number.NaN });

      const file = await saver.saveArticle(
        item,
        undefined,
        "{{date}}|{{firstSeen}}|{{isoDate}}",
        "x",
      );

      if (!(file instanceof TFile)) throw new Error("expected TFile");
      expect(await app.vault.read(file)).toBe(
        "June 15, 2026|June 15, 2026|2026-06-15T12:00:00.000Z",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ArticleSaver.fetchFullArticleContent", () => {
  it("retries sagepub full-text URLs via /doi/abs/ when the full-text fetch returns empty", async () => {
    const app = App.createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    const fetchSpy = vi
      .spyOn(fetchHelpers, "fetchWithProxyFallbackDetailed")
      .mockResolvedValueOnce({ content: "", failureType: "network" })
      .mockResolvedValueOnce({
        content: "<p>abstract</p>",
        failureType: "none",
      });

    const url = "https://journals.sagepub.com/doi/full/10.1177/00000000";
    const result = await saver.fetchFullArticleContent(url);

    expect(result).toBe("<p>abstract</p>");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]).toEqual([
      url,
      "https://proxy/?url=",
      30_000,
    ]);
    expect(fetchSpy.mock.calls[1]).toEqual([
      "https://journals.sagepub.com/doi/abs/10.1177/00000000",
      "https://proxy/?url=",
      30_000,
    ]);
  });
});

describe("ArticleSaver - Math Rendering", () => {
  it("saves WordPress formula images as native LaTeX", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content:
        '<p>Let <img class="latex" src="https://s0.wp.com/latex.php?latex=%7Ba_1%7D&amp;bg=ffffff" alt="{a_1}" /> be fixed.</p>',
      failureType: "none",
    });

    const item = createItem({ title: "WordPress Math Article" });
    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain("Let ${a_1}$ be fixed.");
    expect(written).not.toContain("s0.wp.com/latex.php");
  });

  it("saves a WordPress display formula with Obsidian math delimiters", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content:
        '<p>The displayed result is:</p><p align="center"><img class="latex" src="https://s0.wp.com/latex.php?latex=%5Cdisplaystyle+b_2&amp;bg=ffffff" alt="\\displaystyle b_2" /></p>',
      failureType: "none",
    });

    const item = createItem({ title: "WordPress Display Math Article" });
    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain(String.raw`$$\displaystyle b_2$$`);
    expect(written).not.toContain("s0.wp.com/latex.php");
  });

  it("does not prepend a stale formula-valued hero to saved Markdown", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");
    const formulaUrl = "https://s0.wp.com/latex.php?latex=%7Bx%7D&bg=ffffff";

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "<p>Article body without an image.</p>",
      failureType: "none",
    });

    const item = createItem({
      title: "Stale Formula Hero",
      coverImage: formulaUrl,
      image: formulaUrl,
    });
    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain("Article body without an image.");
    expect(written).not.toContain(formulaUrl);
  });

  it("preserves unescaped mathjax when saving html to markdown if data-math is present", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content:
        '<p>Inline <span class="math" data-math="$a_1$"><span>[RENDERED]</span></span> and display <span class="math" data-math="$$b_2$$"><span>[RENDERED]</span></span></p>',
      failureType: "none",
    });

    const item = createItem({ title: "Math Article" });
    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    // Turndown normally escapes _ to \_ but our data-math rule should prevent it
    expect(written).toContain("Inline $a_1$ and display $$b_2$$");
  });

  it("preserves unescaped raw mathjax when saving html to markdown", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "<p>Inline $a_1$ and display $$b_2$$</p>",
      failureType: "none",
    });

    const item = createItem({ title: "Raw Math Article" });
    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain("Inline $a_1$ and display $$b_2$$");
    expect(written).not.toContain("$a\\_1$");
    expect(written).not.toContain("$b\\_2$");
  });
});

describe("ArticleSaver.saveArticleWithFullContent", () => {
  it("uses the fetched body instead of longer feed content when the setting is enabled", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
      saveFullContent: true,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "<p>Fetched article body.</p>",
      failureType: "none",
    });
    const item = createItem({
      content: `<p>${"Long RSS item content. ".repeat(20)}</p>`,
    });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);
    expect(written).toContain("Fetched article body.");
    expect(written).not.toContain("Long RSS item content.");
  });

  it("marks fallback content at each content placement without changing summary", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{summary}}\n{{content}}\n{{content}}",
      includeFrontmatter: false,
      saveFullContent: true,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({ content: "", failureType: "network" });
    const item = createItem({
      content: "<p>RSS item content.</p>",
      summary: "Unchanged summary value",
    });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);
    const marker =
      "> RSS feed content shown because the full article could not be fetched.";
    expect(
      written.match(
        /RSS feed content shown because the full article could not be fetched\./g,
      ),
    ).toHaveLength(2);
    expect(written).toContain(`${marker}\n\nRSS item content.`);
    expect(written).toContain("Unchanged summary value");
  });

  it("marks RSS content when fetched HTML contains no usable Markdown", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
      saveFullContent: true,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({ content: "<p></p>", failureType: "none" });
    const item = createItem({ content: "<p>RSS fallback body.</p>" });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);
    expect(written).toContain(
      "> RSS feed content shown because the full article could not be fetched.\n\nRSS fallback body.",
    );
  });

  it("does not add a fallback marker when fetched and RSS content are both empty", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
      saveFullContent: true,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({ content: "  \n <p></p> ", failureType: "none" });
    const item = createItem({ content: "", description: "" });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);
    expect(written).not.toContain("RSS feed content shown");
  });

  it("keeps image-only fetched Markdown as usable content", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
      saveFullContent: true,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");
    const imageUrl = "https://example.com/article-image.png";
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: `<p><img src="${imageUrl}" alt="Article image" /></p>`,
      failureType: "none",
    });

    const file = await saver.saveArticleWithFullContent(createItem());

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);
    expect(written).toContain(`![Article image](${imageUrl})`);
    expect(written).not.toContain("RSS feed content shown");
  });

  it("prepends enclosure image when chosen feed HTML has no inline image", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content:
        '<body xmlns="http://www.w3.org/1999/xhtml">Organizations are accumulating a type of debt that no one has been hired to pay down.</body>',
      failureType: "none",
    });

    const enclosureUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/b83cfdcd-1a21-49a0-943f-977022ed4b0a_2160x1131.png";
    const item = createItem({
      title: "Part-time owners, full-time debt",
      link: "https://behzodsirjani.substack.com/p/part-time-owners-full-time-debt",
      content: "",
      description:
        "<p>Organizations are accumulating a type of debt that no one has been hired to pay down.</p>",
      enclosure: {
        url: enclosureUrl,
        length: "0",
        type: "image/jpeg",
      },
      coverImage: "",
      image: "",
    });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain(`![Hero image](${enclosureUrl})`);
    expect(written).toContain(
      "Organizations are accumulating a type of debt that no one has been hired to pay down.",
    );
  });

  it("stores the fetched page's metadata on the item once, leaving description alone (#247)", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");
    const pageMetadata = {
      metaDescription:
        "The publisher's own summary of the harbor budget story, written for search results",
      ogDescription: "",
      twitterDescription: "",
      htmlLang: "en-GB",
      metaAuthor: "",
      jsonLdAuthors: [],
      microdataAuthors: [],
      relAuthors: [],
      canonicalUrl: "https://example.com/canonical",
      readabilityExcerpt: "",
    };
    const fetchMock = vi
      .spyOn(fetchHelpers, "fetchWithProxyFallbackDetailed")
      .mockResolvedValue({
        content:
          "<p>A completely different opening paragraph of the fetched article body.</p>",
        failureType: "none",
        pageMetadata,
      });

    const item = createItem({ description: "<p>Feed blurb</p>" });
    await saver.saveArticleWithFullContent(item);

    expect(item.publisherDescription).toBe(pageMetadata.metaDescription);
    expect(item.language).toBe("en-GB");
    expect(item.languageSource).toBe("page");
    expect(item.canonicalUrl).toBe("https://example.com/canonical");
    expect(item.description).toBe("<p>Feed blurb</p>");
    const stamped = item.metadataFetchedAt;
    expect(stamped).toEqual(expect.any(Number));

    fetchMock.mockResolvedValue({
      content:
        "<p>Another unrelated opening paragraph of the article text.</p>",
      failureType: "none",
      pageMetadata: {
        ...pageMetadata,
        metaDescription: "",
        canonicalUrl: "https://example.com/other",
      },
    });
    await saver.saveArticleWithFullContent(item);
    expect(item.canonicalUrl).toBe("https://example.com/canonical");
    expect(item.metadataFetchedAt).toBe(stamped);
  });

  describe("language from the page and the feed (#246)", () => {
    const emptyPage = {
      metaDescription: "",
      ogDescription: "",
      twitterDescription: "",
      htmlLang: "",
      metaAuthor: "",
      jsonLdAuthors: [],
      microdataAuthors: [],
      relAuthors: [],
      canonicalUrl: "",
      readabilityExcerpt: "",
    };

    function saverFor(feedLanguage: string | undefined) {
      const app = App.createMock();
      const settings = createSettings({
        defaultTemplate: "{{content}}",
        includeFrontmatter: false,
      });
      const feeds = [
        {
          title: "Test Feed",
          url: "https://example.com/rss.xml",
          folder: "",
          items: [],
          lastUpdated: 0,
          language: feedLanguage,
        },
      ];
      return new ArticleSaver(
        app,
        settings,
        "https://proxy/?url=",
        () => false,
        () => feeds,
      );
    }

    function mockFetch(htmlLang: string) {
      vi.spyOn(
        fetchHelpers,
        "fetchWithProxyFallbackDetailed",
      ).mockResolvedValue({
        content:
          "<p>A completely different opening paragraph of the fetched article body.</p>",
        failureType: "none",
        pageMetadata: { ...emptyPage, htmlLang },
      });
    }

    it("stores the page language over the feed's, as a page source", async () => {
      mockFetch("en_gb");
      const item = createItem();
      await saverFor("de-DE").saveArticleWithFullContent(item);
      expect(item.language).toBe("en-GB");
      expect(item.languageSource).toBe("page");
    });

    it("stores the feed language when the page declares none", async () => {
      mockFetch("");
      const item = createItem();
      await saverFor("de-DE").saveArticleWithFullContent(item);
      expect(item.language).toBe("de-DE");
      expect(item.languageSource).toBe("feed");
    });

    it("stores no language when neither the page nor the feed has one", async () => {
      mockFetch("");
      const item = createItem();
      await saverFor(undefined).saveArticleWithFullContent(item);
      expect(item.language).toBeUndefined();
      expect(item.languageSource).toBeUndefined();
    });
  });

  it("uses fetched content instead of Substack feed images after a successful fetch", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content:
        '<body xmlns="http://www.w3.org/1999/xhtml">Organizations are accumulating a type of debt that no one has been hired to pay down.</body>',
      failureType: "none",
    });

    const rawSubstackLink =
      "https://substackcdn.com/image/fetch/$s_!GtED!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F108fc67d-1f88-4d55-bb47-e44613e67b2a_1632x656.png";
    const decodedImageUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/108fc67d-1f88-4d55-bb47-e44613e67b2a_1632x656.png";
    const item = createItem({
      title: "Substack Linked Image",
      link: "https://behzodsirjani.substack.com/p/another-post",
      content: `<figure><a href="${rawSubstackLink}"><img src="${decodedImageUrl}" alt="" /></a></figure><p>Body text.</p>`,
      description: "<p>Summary</p>",
    });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain(
      "Organizations are accumulating a type of debt that no one has been hired to pay down.",
    );
    expect(written).not.toContain(decodedImageUrl);
    expect(written).not.toContain("Body text.");
  });

  it("uses fetched content instead of a longer feed description after a successful fetch", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content:
        '<body xmlns="http://www.w3.org/1999/xhtml">Organizations are accumulating a type of debt that no one has been hired to pay down.</body>',
      failureType: "none",
    });

    const item = createItem({
      title: "Substack Description Fallback",
      link: "https://behzodsirjani.substack.com/p/part-time-owners-full-time-debt",
      content: "",
      description:
        "<p>Organizations are accumulating a type of debt that no one has been hired to pay down.</p><p>At Vercel, I was brought in to handle some of this debt, but not all of it.</p>",
    });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain(
      "Organizations are accumulating a type of debt that no one has been hired to pay down.",
    );
    expect(written).not.toContain(
      "At Vercel, I was brought in to handle some of this debt, but not all of it.",
    );
    expect(written).not.toContain(
      '<body xmlns="http://www.w3.org/1999/xhtml">',
    );
  });

  it("converts fetched HTML to markdown and saves it", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "<article><p>Hello <strong>world</strong>.</p></article>",
      failureType: "none",
    });

    const item = createItem({ title: "Full Content" });
    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);
    expect(written).toContain("Hello");
    expect(written).toContain("world");
  });

  it("falls back to feed content when full content is unavailable", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "",
      failureType: "network",
    });
    const saveSpy = vi.spyOn(saver, "saveArticle");

    const item = createItem({
      title: "Fallback Content",
      content:
        "<div><style>.bh__table { border: 1px solid #C0C0C0; }</style><p>Feed body wins.</p></div>",
    });
    await saver.saveArticleWithFullContent(item);

    expect(saveSpy).toHaveBeenCalledWith(
      item,
      undefined,
      undefined,
      "> RSS feed content shown because the full article could not be fetched.\n\nFeed body wins.",
      undefined,
    );
  });

  it("uses fetched content when it is shorter than RSS item content", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "# {{title}}\n\n{{content}}\n\n[Source]({{link}})",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content:
        '<body xmlns="http://www.w3.org/1999/xhtml">Q+A with one of the Broadview Six.</body>',
      failureType: "none",
    });

    const item = createItem({
      title: "Beehiiv Full Body",
      content:
        '<div class="beehiiv"><style> .bh__table, .bh__table_header, .bh__table_cell { border: 1px solid #C0C0C0; }</style><div class="beehiiv__body"><p>For the last seven months, Kat Abughazaleh was not allowed to go to Alaska.</p><p>The full interview continues from here with much more context.</p></div></div>',
    });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain("Q+A with one of the Broadview Six.");
    expect(written).not.toContain(
      "For the last seven months, Kat Abughazaleh was not allowed to go to Alaska.",
    );
    expect(written).not.toContain(
      "The full interview continues from here with much more context.",
    );
    expect(written).not.toContain(".bh__table");
    expect(written).not.toContain("border: 1px");
    expect(written).not.toContain("<body");
    expect(written).not.toContain('xmlns="http://www.w3.org/1999/xhtml"');
  });

  it("uses fetched content instead of longer embedded feed content", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "<p>Short excerpt.</p>",
      failureType: "none",
    });

    const instagramUrl = "https://www.instagram.com/p/DY3yTRYjtma/?img_index=1";
    const blueskyUrl =
      "https://bsky.app/profile/marisakabas.bsky.social/post/3mmuh2ltnq22b";
    const item = createItem({
      title: "Beehiiv Embeds",
      content: `<div>
        <p>Enough feed text to be selected over the fetched excerpt.</p>
        <blockquote align="center" class="instagram-media">
          <a href="${instagramUrl}"><p dir="ltr" lang="en">Instagram post</p></a>
        </blockquote>
        <blockquote align="center" class="bluesky-embed">
          <p dir="ltr" lang="en"><p>I just spoke with Sister Sharon.</p></p>
          <a href="${blueskyUrl}"><p> &mdash; Marisa Kabas (@marisakabas.bsky.social) <br/> 9:25 PM - May 27, 2026 </p></a>
        </blockquote>
      </div>`,
    });

    const file = await saver.saveArticleWithFullContent(item);

    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) throw new Error("expected TFile");
    const written = await app.vault.read(file);

    expect(written).toContain("Short excerpt.");
    expect(written).not.toContain(instagramUrl);
    expect(written).not.toContain(blueskyUrl);
  });

  it("skips full-content fetch for Bloomberg video routes and saves available content", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    const fetchSpy = vi.spyOn(fetchHelpers, "fetchWithProxyFallbackDetailed");
    const saveSpy = vi.spyOn(saver, "saveArticle");
    fetchSpy.mockClear();
    saveSpy.mockClear();

    const item = createItem({
      title: "Bloomberg Video",
      link: "https://www.bloomberg.com/news/videos/2026-05-12/sample-video",
      mediaType: "article",
      mediaContentType: "image/jpeg",
    });

    await saver.saveArticleWithFullContent(item);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(saveSpy).toHaveBeenCalledWith(
      item,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(item.restrictedReason).toBeUndefined();
  });

  it("shows restricted-content notice once and falls back when content is paywalled", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(
      fetchHelpers,
      "fetchWithProxyFallbackDetailed",
    ).mockResolvedValueOnce({
      content: "",
      failureType: "restricted",
    });

    const item = createItem({ title: "Restricted Content" });
    await saver.saveArticleWithFullContent(item);

    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Full article is restricted. Showing available feed excerpt.",
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      "[Stub Notice]",
      expect.stringContaining("Network error:"),
    );
    expect(item.restrictedReason).toBe(RESTRICTED_ARTICLE_REASON);
  });
});

describe("ArticleSaver saved file lookups", () => {
  it("prefers savedFilePath when the title-based filename no longer matches", async () => {
    const app = App.createMock();
    const settings = createSettings({ defaultFolder: "Articles" });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "Title With / Slash",
      saved: true,
      savedFilePath: "Archive/Already Saved.md",
    });

    await app.vault.createFolder("Archive");
    await app.vault.create("Archive/Already Saved.md", "content");

    const file = await saver.findSavedArticleFile(item);

    expect(file?.path).toBe("Archive/Already Saved.md");
    expect(item.savedFilePath).toBe("Archive/Already Saved.md");
  });

  it("does not recover a missing recorded path from the article title", async () => {
    const app = App.createMock();
    const settings = createSettings({ defaultFolder: "/Articles/" });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "Legacy / Saved Article",
      saved: true,
    });

    await app.vault.createFolder("Articles");
    await app.vault.create("Articles/Legacy Saved Article.md", "content");

    expect(await saver.findSavedArticleFile(item)).toBeNull();
    expect(item.saved).toBe(true);
    expect(item.savedFilePath).toBeUndefined();
  });

  it("does not recover a missing recorded path when a same-title note exists", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultFolder: "Articles" }),
    );
    const item = createItem({
      title: "Legacy Article",
      saved: true,
      savedFilePath: "Missing/Current.md",
    });

    await app.vault.createFolder("Articles");
    await app.vault.create("Articles/Legacy Article.md", "content");

    expect(await saver.findSavedArticleFile(item)).toBeNull();
    expect(item.savedFilePath).toBe("Missing/Current.md");
    expect(item.saved).toBe(true);
  });

  it("treats a recorded folder path as a confirmed missing note", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const item = createItem({ saved: true, savedFilePath: "Saved" });
    await app.vault.createFolder("Saved");

    expect(await saver.findSavedArticleFile(item)).toBeNull();
    expect(item.saved).toBe(true);
    expect(item.savedFilePath).toBe("Saved");
  });

  it("finds a saved file by savedFilePath even when the default folder differs", async () => {
    const app = App.createMock();
    const settings = createSettings({ defaultFolder: "RSS articles" });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "My Article",
      saved: true,
      savedFilePath: "Custom Folder/My Article.md",
    });

    await app.vault.createFolder("Custom Folder");
    await app.vault.create("Custom Folder/My Article.md", "content");

    const file = await saver.findSavedArticleFile(item);

    expect(file).toBeInstanceOf(TFile);
    expect(file?.path).toBe("Custom Folder/My Article.md");
  });

  it("preserves the association when the recorded-path lookup throws", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const item = createItem({
      saved: true,
      savedFilePath: "Saved/article.md",
    });
    vi.spyOn(app.vault, "getAbstractFileByPath").mockImplementation(() => {
      throw new Error("vault unavailable");
    });

    await expect(saver.findSavedArticleFile(item)).rejects.toThrow(
      "vault unavailable",
    );
    expect(item.saved).toBe(true);
    expect(item.savedFilePath).toBe("Saved/article.md");
  });
});

describe("ArticleSaver.{{image}} template variable", () => {
  it("replaces {{image}} in default template with coverImage when present", async () => {
    const app = App.createMock();
    const imageUrl = "https://example.com/cover.jpg";
    const settings = createSettings({
      defaultTemplate: "{{image}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "Image Test",
      coverImage: imageUrl,
    });

    const file = await saver.saveArticle(item);
    expect(file).toBeInstanceOf(TFile);
    if (!file) return;
    const written = await app.vault.read(file);
    expect(written).toBe(imageUrl);
  });

  it("resolves {{image}} from itunes.image href when other images missing", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{image}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings);

    const itunesImageUrl = "https://example.com/itunes.jpg";
    const item = createItem({
      title: "Itunes Image Test",
      itunes: { image: { href: itunesImageUrl } },
    });

    const file = await saver.saveArticle(item);
    expect(file).toBeInstanceOf(TFile);
    if (!file) return;
    const written = await app.vault.read(file);
    expect(written).toBe(itunesImageUrl);
  });

  it("falls back to empty string when no image is present", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "cover: {{image}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "No Image Test",
    });

    const file = await saver.saveArticle(item);
    expect(file).toBeInstanceOf(TFile);
    if (!file) return;
    const written = await app.vault.read(file);
    expect(written).toBe("cover: ");
  });

  it("prioritizes coverImage over image for {{image}} replacement", async () => {
    const app = App.createMock();
    const settings = createSettings({
      defaultTemplate: "{{image}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings);

    const coverImageUrl = "https://example.com/cover.jpg";
    const item = createItem({
      title: "Priority Test",
      coverImage: coverImageUrl,
      image: "https://example.com/other.jpg",
    });

    const file = await saver.saveArticle(item);
    expect(file).toBeInstanceOf(TFile);
    if (!file) return;
    const written = await app.vault.read(file);
    expect(written).toBe(coverImageUrl);
  });
});
