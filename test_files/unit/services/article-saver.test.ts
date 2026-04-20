import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile, moment } from "obsidian";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import { ArticleSaver, sanitizeFilename } from "../../../src/services/article-saver";
import * as fetchHelpers from "../../../src/utils/fetch-helpers";

function createSettings(
  overrides: Partial<ArticleSavingSettings> = {},
): ArticleSavingSettings {
  return {
    addSavedTag: false,
    defaultFolder: "RSS articles",
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
      .spyOn(fetchHelpers, "fetchWithProxyFallback")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("<p>abstract</p>");

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

    vi.spyOn(fetchHelpers, "fetchWithProxyFallback").mockResolvedValueOnce(
      "<article><p>Hello <strong>world</strong>.</p></article>",
    );

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

    vi.spyOn(fetchHelpers, "fetchWithProxyFallback").mockResolvedValueOnce("");
    const saveSpy = vi.spyOn(saver, "saveArticle");

    const item = createItem({ title: "Fallback Content" });
    await saver.saveArticleWithFullContent(item);

    expect(saveSpy).toHaveBeenCalledWith(item, undefined, undefined);
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
describe("sanitizeFilename", () => {
  it("removes special characters that are illegal in file systems", () => {
    expect(sanitizeFilename("Hello / \\ : * ? \" < > | World")).toBe("Hello World");
  });

  it("preserves single spaces between words but trims leading/trailing spaces", () => {
    expect(sanitizeFilename("  Hello   World  ")).toBe("Hello World");
  });

  it("truncates to maximum of 5 words", () => {
    expect(sanitizeFilename("One Two Three Four Five Six Seven")).toBe("One Two Three Four Five");
  });

  it("enforces a character limit of 50 characters", () => {
    const longWord = "A".repeat(60);
    expect(sanitizeFilename(longWord).length).toBe(50);
  });

  it("handles long titles correctly", () => {
    const longTitle = "Word1 Word2 Word3 Word4 Word5-very-long-suffix-that-should-be-cut-off";
    const sanitized = sanitizeFilename(longTitle);
    expect(sanitized.length).toBe(50);
    expect(sanitized).toBe("Word1 Word2 Word3 Word4 Word5-very-long-suffix-tha");
  });

  it("handles edge inputs: empty string", () => {
    expect(sanitizeFilename("")).toBe("");
  });

  it("handles edge inputs: only special characters", () => {
    expect(sanitizeFilename("/\\:*?\"<>|")).toBe("");
  });

  it("handles edge inputs: only spaces", () => {
    expect(sanitizeFilename("   ")).toBe("");
  });

  it("handles mixed alphanumeric and special characters", () => {
    expect(sanitizeFilename("Article! @# Name$%")).toBe("Article Name");
  });

  it("preserves non-ASCII characters (Cyrillic)", () => {
    expect(sanitizeFilename("Пример Статьи")).toBe("Пример Статьи");
  });

  it("preserves emojis", () => {
    expect(sanitizeFilename("🚀 Space Article")).toBe("🚀 Space Article");
  });

  it("truncates even if the first word is longer than 50 characters", () => {
    const hugeWord = "B".repeat(100);
    expect(sanitizeFilename(hugeWord)).toBe("B".repeat(50));
  });

  it("collapses multiple spaces between words", () => {
    expect(sanitizeFilename("Word1    Word2")).toBe("Word1 Word2");
  });
});

describe("ArticleSaver.checkSavedFileExists", () => {
  let app: any;
  let settings: ArticleSavingSettings;
  let saver: ArticleSaver;

  beforeEach(() => {
    app = (App as any).createMock();
    settings = createSettings();
    saver = new ArticleSaver(app, settings);
  });

  it("handles folder normalization with leading/trailing slashes", () => {
    settings.defaultFolder = "/Articles/";
    const item = createItem({ title: "Test" });
    const expectedPath = "Articles/Test.md";
    vi.spyOn(app.vault, "getAbstractFileByPath").mockImplementation((path) => 
        path === expectedPath ? new TFile(path) : null
    );
    expect(saver.checkSavedFileExists(item)).toBe(true);
  });

  it("works correctly when defaultFolder is empty", () => {
    settings.defaultFolder = "";
    const item = createItem({ title: "Test" });
    const expectedPath = "Test.md";
    vi.spyOn(app.vault, "getAbstractFileByPath").mockImplementation((path) => 
        path === expectedPath ? new TFile(path) : null
    );
    expect(saver.checkSavedFileExists(item)).toBe(true);
  });

  it("returns false when vault errors occur", () => {
    const item = createItem({ title: "Test" });
    vi.spyOn(app.vault, "getAbstractFileByPath").mockImplementation(() => {
        throw new Error("Vault error");
    });
    expect(saver.checkSavedFileExists(item)).toBe(false);
  });

  it("returns false if item has no title", () => {
    const item = createItem({ title: "" });
    expect(saver.checkSavedFileExists(item)).toBe(false);
  });

  it("returns true if file exists in a subfolder", async () => {
    settings.defaultFolder = "Sub/Folder";
    const item = createItem({ title: "Deep" });
    await app.vault.create("Sub/Folder/Deep.md", "content");
    expect(saver.checkSavedFileExists(item)).toBe(true);
  });

  it("returns false if file exists but with different extension", async () => {
    settings.defaultFolder = "Articles";
    const item = createItem({ title: "Test" });
    await app.vault.create("Articles/Test.txt", "content");
    expect(saver.checkSavedFileExists(item)).toBe(false);
  });

  it("is case-sensitive", async () => {
    settings.defaultFolder = "Articles";
    const item = createItem({ title: "test" });
    await app.vault.create("Articles/Test.md", "content");
    expect(saver.checkSavedFileExists(item)).toBe(false);
  });

  it("handles folders with many spaces correctly", async () => {
    settings.defaultFolder = "  Many   Spaces  ";
    const item = createItem({ title: "Spaced" });
    await app.vault.create("Many Spaces/Spaced.md", "content");
    expect(saver.checkSavedFileExists(item)).toBe(true);
  });
});

describe("ArticleSaver.findSavedArticleFile", () => {
  let app: any;
  let settings: ArticleSavingSettings;
  let saver: ArticleSaver;

  beforeEach(() => {
    app = (App as any).createMock();
    settings = createSettings();
    saver = new ArticleSaver(app, settings);
  });

  it("returns a TFile instance via savedFilePath", async () => {
    const item = createItem({ title: "Found", saved: true, savedFilePath: "Folder/Found.md" });
    const mockFile = new TFile("Folder/Found.md");
    vi.spyOn(app.vault, "getAbstractFileByPath").mockReturnValue(mockFile);
    const result = await saver.findSavedArticleFile(item);
    expect(result).toBe(mockFile);
  });

  it("normalizes path when searching by title", async () => {
    const item = createItem({ title: "Searching", saved: true });
    settings.defaultFolder = "/Unnormalized/Path/";
    const expectedPath = "Unnormalized/Path/Searching.md";
    await app.vault.create(expectedPath, "content");
    const result = await saver.findSavedArticleFile(item);
    expect(result!.path).toBe(expectedPath);
  });

  it("searches in vault root if folder is empty", async () => {
    settings.defaultFolder = "";
    const item = createItem({ title: "Root", saved: true });
    await app.vault.create("Root.md", "content");
    const result = await saver.findSavedArticleFile(item);
    expect(result!.path).toBe("Root.md");
  });

  it("clears saved state if savedFilePath file is missing", async () => {
    const item = createItem({ title: "Missing", saved: true, savedFilePath: "Old/Path.md" });
    const result = await saver.findSavedArticleFile(item);
    expect(result).toBeNull();
    expect(item.saved).toBe(false);
  });

  it("updates savedFilePath if found by title", async () => {
    const item = createItem({ title: "TitleSearch", saved: true });
    await app.vault.create("RSS articles/TitleSearch.md", "content");
    await saver.findSavedArticleFile(item);
    expect(item.savedFilePath).toBe("RSS articles/TitleSearch.md");
  });

  it("returns null if item not marked saved", async () => {
    const item = createItem({ title: "Unsaved", saved: false });
    await app.vault.create("RSS articles/Unsaved.md", "content");
    expect(await saver.findSavedArticleFile(item)).toBeNull();
  });

  it("returns null if title is empty", async () => {
    const item = createItem({ title: "", saved: true });
    expect(await saver.findSavedArticleFile(item)).toBeNull();
  });
});

describe("ArticleSaver Round-trip and Collisions", () => {
  let app: any;
  let settings: ArticleSavingSettings;
  let saver: ArticleSaver;

  beforeEach(() => {
    app = (App as any).createMock();
    settings = createSettings();
    saver = new ArticleSaver(app, settings);
  });

  it("round-trip: special characters in title", async () => {
    const item = createItem({ title: "A / B: C?" });
    const saved = await saver.saveArticle(item);
    const found = await saver.findSavedArticleFile(item);
    expect(found!.path).toBe(saved!.path);
  });

  it("round-trip: 5-word truncation", async () => {
    const item = createItem({ title: "One Two Three Four Five Six" });
    const saved = await saver.saveArticle(item);
    expect(saved!.path).toContain("One Two Three Four Five.md");
    const found = await saver.findSavedArticleFile(item);
    expect(found!.path).toBe(saved!.path);
  });

  it("round-trip: empty folder", async () => {
    settings.defaultFolder = "";
    const item = createItem({ title: "NoFolder" });
    const saved = await saver.saveArticle(item);
    expect(saved!.path).toBe("NoFolder.md");
    const found = await saver.findSavedArticleFile(item);
    expect(found!.path).toBe("NoFolder.md");
  });

  it("false negative: custom folder limitation", async () => {
    const item = createItem({ title: "Custom" });
    await saver.saveArticle(item, "CustomFolder");
    item.savedFilePath = undefined; // Lose reference
    expect(await saver.findSavedArticleFile(item)).toBeNull();
  });

  it("false positive: title collision", async () => {
    const item1 = createItem({ title: "A: B", guid: "1" });
    const item2 = createItem({ title: "A? B", guid: "2", saved: true });
    await saver.saveArticle(item1);
    const found = await saver.findSavedArticleFile(item2);
    expect(found!.path).toBe("RSS articles/A B.md"); // Points to item1's file
  });

  it("only looks in defaultFolder if no savedFilePath", async () => {
    settings.defaultFolder = "RSS";
    const item = createItem({ title: "Root", saved: true });
    await app.vault.create("Root.md", "content");
    expect(await saver.findSavedArticleFile(item)).toBeNull();
  });
});
