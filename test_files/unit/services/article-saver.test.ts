import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile, moment } from "obsidian";
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
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sanitizeFilename", () => {
  it("preserves the full sanitized title without truncating words or length", () => {
    const title =
      'This is a deliberately long article title with / illegal : characters " removed" and extra words';

    expect(sanitizeFilename(title)).toBe(
      "This is a deliberately long article title with illegal characters removed and extra words",
    );
  });

  it("falls back to a safe filename when sanitization removes everything", () => {
    expect(sanitizeFilename(' / \\\\ : * ? " < > | ')).toBe("Untitled Article");
    expect(sanitizeFilename("   ")).toBe("Untitled Article");
  });
});

describe("ArticleSaver.saveArticle", () => {
  it("writes to a normalized folder path and applies template/frontmatter substitutions", async () => {
    const app = (App as any).createMock();
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
    expect(item.tags.map((t) => t.name)).toEqual(["tech", "Saved"]);
  });

  it("trashes an existing file at the same path before creating a new one", async () => {
    const app = (App as any).createMock();
    const settings = createSettings({
      defaultFolder: "Articles",
      defaultTemplate: "{{content}}",
    });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: "Repeat Title" });
    await saver.saveArticle(item, undefined, undefined, "FIRST");

    const trashSpy = vi.spyOn(app.fileManager, "trashFile");
    await saver.saveArticle(item, undefined, undefined, "SECOND");

    expect(trashSpy).toHaveBeenCalledTimes(1);
    const trashed = trashSpy.mock.calls[0][0];
    expect(trashed).toBeInstanceOf(TFile);
  });

  it("returns null and does not mark the item saved when writing fails", async () => {
    const app = (App as any).createMock();
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

  it("uses the full sanitized title in the saved file path", async () => {
    const app = (App as any).createMock();
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
    const app = (App as any).createMock();
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
});

describe("ArticleSaver.replaceDatePlaceholders", () => {
  it("replaces {{date}} with long format", () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);
    const date = new Date("2024-04-21T12:00:00Z");

    const input = "Date: {{date}}";
    const result = (saver as any).replaceDatePlaceholders(input, date);

    // toLocaleDateString depends on environment, but we expect the long format
    expect(result).toContain("April 21, 2024");
  });

  it("replaces {{dateShort}} with YYYY-MM-DD", () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);
    const date = new Date("2024-04-21T12:00:00Z");

    const input = "Short: {{dateShort}}";
    const result = (saver as any).replaceDatePlaceholders(input, date);

    expect(result).toBe("Short: 2024-04-21");
  });

  it("replaces {{isoDate}} with ISO string", () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);
    const date = new Date("2024-04-21T12:00:00Z");

    const input = "ISO: {{isoDate}}";
    const result = (saver as any).replaceDatePlaceholders(input, date);

    expect(result).toBe("ISO: 2024-04-21T12:00:00.000Z");
  });

  it("replaces parameterized {{date:FORMAT}} using moment", () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);
    const date = new Date("2024-04-21T12:00:00Z");

    const input = "Custom: {{date:YYYY/MM/DD}} Time: {{date:HH:mm}}";
    const result = (saver as any).replaceDatePlaceholders(input, date);

    const expectedDate = moment(date).format("YYYY/MM/DD");
    const expectedTime = moment(date).format("HH:mm");
    expect(result).toBe(`Custom: ${expectedDate} Time: ${expectedTime}`);
  });

  it("handles complex moment formats", () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);
    const date = new Date("2024-04-21T12:00:00Z");

    const input = "{{date:dddd, MMMM Do YYYY}}";
    const result = (saver as any).replaceDatePlaceholders(input, date);

    const expected = moment(date).format("dddd, MMMM Do YYYY");
    expect(result).toBe(expected);
  });
});

describe("ArticleSaver.fetchFullArticleContent", () => {
  it("retries sagepub full-text URLs via /doi/abs/ when the full-text fetch returns empty", async () => {
    const app = (App as any).createMock();
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
    expect(fetchSpy.mock.calls[0]).toEqual([url, "https://proxy/?url="]);
    expect(fetchSpy.mock.calls[1]).toEqual([
      "https://journals.sagepub.com/doi/abs/10.1177/00000000",
      "https://proxy/?url=",
    ]);
  });
});

describe("ArticleSaver.saveArticleWithFullContent", () => {
  it("converts fetched HTML to markdown and saves it", async () => {
    const app = (App as any).createMock();
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
    const written = await app.vault.read(file as TFile);
    expect(written).toContain("Hello");
    expect(written).toContain("world");
  });

  it("falls back to saveArticle when full content is unavailable", async () => {
    const app = (App as any).createMock();
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

    const item = createItem({ title: "Fallback Content" });
    await saver.saveArticleWithFullContent(item);

    expect(saveSpy).toHaveBeenCalledWith(item, undefined, undefined);
  });

  it("skips full-content fetch for Bloomberg video routes and saves available content", async () => {
    const app = (App as any).createMock();
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
    expect(saveSpy).toHaveBeenCalledWith(item, undefined, undefined);
    expect(item.restrictedReason).toBeUndefined();
  });

  it("shows restricted-content notice once and falls back when content is paywalled", async () => {
    const app = (App as any).createMock();
    const settings = createSettings({
      defaultTemplate: "{{content}}",
      includeFrontmatter: false,
    });
    const saver = new ArticleSaver(app, settings, "https://proxy/?url=");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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

describe("ArticleSaver.verifySavedArticle", () => {
  it("returns true when the saved file exists in the vault", async () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: "Exists" });
    const filePath = "Articles/Exists.md";
    await app.vault.create(filePath, "x");

    item.saved = true;
    item.savedFilePath = filePath;
    item.tags = [{ name: "saved", color: "#3498db" }];

    expect(saver.verifySavedArticle(item)).toBe(true);
    expect(item.saved).toBe(true);
  });

  it("clears saved state and removes the saved tag when the file is missing", () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: "Missing" });
    item.saved = true;
    item.savedFilePath = "Articles/Missing.md";
    item.tags = [
      { name: "saved", color: "#3498db" },
      { name: "other", color: "#000" },
    ];

    expect(saver.verifySavedArticle(item)).toBe(false);
    expect(item.saved).toBe(false);
    expect(item.savedFilePath).toBeUndefined();
    expect(item.tags.map((t) => t.name)).toEqual(["other"]);
  });
});

describe("ArticleSaver.fixSavedFilePaths", () => {
  it("normalizes paths when the normalized path exists", async () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);

    await app.vault.create("Folder/Item.md", "x");

    const item = createItem({ title: "Item" });
    item.saved = true;
    item.savedFilePath = "/Folder/Item.md";

    const renameSpy = vi.spyOn(app.fileManager, "renameFile");
    await saver.fixSavedFilePaths([item]);

    expect(item.savedFilePath).toBe("Folder/Item.md");
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it("renames files when the old path exists but the normalized path does not", async () => {
    const app = (App as any).createMock();
    const settings = createSettings({ defaultFolder: "/Normalized/" });
    const saver = new ArticleSaver(app, settings);

    const oldPath = "/Old Folder/Weird.md";
    const file = await app.vault.create(oldPath, "x");

    const item = createItem({
      title: "My / Weird : Title",
      tags: [{ name: "saved", color: "#3498db" }],
    });
    item.saved = true;
    item.savedFilePath = oldPath;

    const renameSpy = vi.spyOn(app.fileManager, "renameFile");
    await saver.fixSavedFilePaths([item]);

    expect(renameSpy).toHaveBeenCalledTimes(1);
    expect(file.path).toBe("Normalized/My Weird Title.md");
    expect(item.savedFilePath).toBe("Normalized/My Weird Title.md");
    expect(item.saved).toBe(true);
  });

  it("clears saved state when the savedFilePath is missing or not a file", async () => {
    const app = (App as any).createMock();
    const settings = createSettings();
    const saver = new ArticleSaver(app, settings);

    const item = createItem({ title: "Not A File" });
    item.saved = true;
    item.savedFilePath = "/Missing/NotAFile.md";
    item.tags = [
      { name: "saved", color: "#3498db" },
      { name: "keep", color: "#000" },
    ];

    await saver.fixSavedFilePaths([item]);

    expect(item.saved).toBe(false);
    expect(item.savedFilePath).toBeUndefined();
    expect(item.tags.map((t) => t.name)).toEqual(["keep"]);
  });
});

describe("ArticleSaver saved file lookups", () => {
  it("prefers savedFilePath when the title-based filename no longer matches", async () => {
    const app = (App as any).createMock();
    const settings = createSettings({ defaultFolder: "Articles" });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "Title With / Slash",
      saved: true,
      savedFilePath: "Archive/Already Saved.md",
    });

    await app.vault.create("Archive/Already Saved.md", "content");

    expect(saver.checkSavedFileExists(item)).toBe(true);
    expect(item.savedFilePath).toBe("Archive/Already Saved.md");
  });

  it("falls back to the normalized default-folder path for legacy items", async () => {
    const app = (App as any).createMock();
    const settings = createSettings({ defaultFolder: "/Articles/" });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "Legacy / Saved Article",
      saved: true,
    });

    await app.vault.create("Articles/Legacy Saved Article.md", "content");

    expect(saver.checkSavedFileExists(item)).toBe(true);
    expect(item.savedFilePath).toBe("Articles/Legacy Saved Article.md");
  });

  it("finds a saved file by savedFilePath even when the default folder differs", async () => {
    const app = (App as any).createMock();
    const settings = createSettings({ defaultFolder: "RSS articles" });
    const saver = new ArticleSaver(app, settings);

    const item = createItem({
      title: "My Article",
      saved: true,
      savedFilePath: "Custom Folder/My Article.md",
    });

    await app.vault.create("Custom Folder/My Article.md", "content");

    const file = await saver.findSavedArticleFile(item);

    expect(file).toBeInstanceOf(TFile);
    expect(file?.path).toBe("Custom Folder/My Article.md");
  });
});
