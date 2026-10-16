/**
 * Pins `ArticleSaver.saveArticle`'s observable save orchestration before #824
 * splits the method into private helpers. Each test drives the public
 * `saveArticle` and reads the result back from the vault (content, path, item
 * state) or observes `Notice` output, so the pins survive the extraction.
 *
 * The cases cover the blocks the split moves: folder resolution, template
 * selection, frontmatter decision, existing-file lookup, and create/rewrite,
 * including the edge cases named in the ticket.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { App, TFile } from "obsidian";
import type { ArticleSavingSettings, FeedItem } from "../../../src/types/types";
import { ArticleSaver } from "../../../src/services/article-saver";
import { ONE_SAVE_OVERRIDE_TEMPLATE_ID } from "../../../src/utils/saved-template-utils";

// `saveArticle` is called directly here, so its default notice names RSS content (#1184).
const SUCCESS_NOTICE =
  "Article saved with RSS content. Click/tap the icon again to open the article in your vault.";

function createSettings(
  overrides: Partial<ArticleSavingSettings> = {},
): ArticleSavingSettings {
  return {
    addSavedTag: false,
    defaultFolder: "",
    defaultTemplate: "",
    includeFrontmatter: false,
    frontmatterTemplate: "",
    saveVersion: "rss",
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

function requireFile(file: TFile | null): TFile {
  if (!(file instanceof TFile)) throw new Error("expected a saved note");
  return file;
}

let noticeLog: MockInstance;

beforeEach(() => {
  noticeLog = vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ArticleSaver.saveArticle folder resolution", () => {
  it("prefers a custom folder over the saved template and settings folders", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultFolder: "Settings Folder" }),
    );
    const savedTemplate = {
      id: "t",
      name: "Template",
      template: "{{content}}",
      defaultFolder: "Template Folder",
    };

    const file = await saver.saveArticle(
      createItem(),
      "Custom Folder",
      undefined,
      "BODY",
      savedTemplate,
    );

    expect(file?.path).toBe("Custom Folder/Test Article.md");
  });

  it("uses the saved template's folder when no custom folder is given", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultFolder: "Settings Folder" }),
    );

    const file = await saver.saveArticle(
      createItem(),
      undefined,
      undefined,
      "BODY",
      {
        id: "t",
        name: "Template",
        template: "{{content}}",
        defaultFolder: "Template Folder",
      },
    );

    expect(file?.path).toBe("Template Folder/Test Article.md");
  });

  it("normalizes the settings folder and creates it", async () => {
    const app = App.createMock();
    const createFolder = vi.spyOn(app.vault, "createFolder");
    const saver = new ArticleSaver(
      app,
      createSettings({
        defaultFolder: "/My Articles/",
        defaultTemplate: "{{content}}",
      }),
    );

    const file = await saver.saveArticle(
      createItem(),
      undefined,
      undefined,
      "BODY",
    );

    expect(file?.path).toBe("My Articles/Test Article.md");
    expect(createFolder).toHaveBeenCalledWith("My Articles");
  });

  it("creates nested folders one segment at a time", async () => {
    const app = App.createMock();
    const createFolder = vi.spyOn(app.vault, "createFolder");
    const saver = new ArticleSaver(
      app,
      createSettings({
        defaultFolder: "Parent/Child/Grandchild",
        defaultTemplate: "{{content}}",
      }),
    );

    await saver.saveArticle(createItem(), undefined, undefined, "BODY");

    expect(createFolder).toHaveBeenCalledWith("Parent");
    expect(createFolder).toHaveBeenCalledWith("Parent/Child");
    expect(createFolder).toHaveBeenCalledWith("Parent/Child/Grandchild");
  });

  it("retries create after restoring a folder that vanished before the write", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        defaultFolder: "Articles",
        defaultTemplate: "{{content}}",
      }),
    );
    const originalCreate = app.vault.create.bind(app.vault);
    const create = vi.spyOn(app.vault, "create");
    create
      .mockRejectedValueOnce(new Error("ENOENT: no such file or directory"))
      .mockImplementationOnce((path: string, content: string) =>
        originalCreate(path, content),
      );

    const file = await saver.saveArticle(
      createItem({ title: "Recovered" }),
      undefined,
      undefined,
      "BODY",
    );

    expect(requireFile(file).path).toBe("Articles/Recovered.md");
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("ArticleSaver.saveArticle template selection", () => {
  it("prefers a custom template over the saved template body", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const file = requireFile(
      await saver.saveArticle(
        createItem(),
        undefined,
        "CUSTOM: {{content}}",
        "x",
        {
          id: "t",
          name: "Template",
          template: "SAVED: {{content}}",
        },
      ),
    );

    await expect(app.vault.read(file)).resolves.toBe("CUSTOM: x");
  });

  it("uses the saved template body when no custom template is given", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, "x", {
        id: "t",
        name: "Template",
        template: "SAVED: {{content}}",
      }),
    );

    await expect(app.vault.read(file)).resolves.toBe("SAVED: x");
  });

  it("uses a custom template when there is no saved template", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const file = requireFile(
      await saver.saveArticle(
        createItem(),
        undefined,
        "CUSTOM: {{content}}",
        "x",
      ),
    );

    await expect(app.vault.read(file)).resolves.toBe("CUSTOM: x");
  });

  it("uses the settings default template when nothing else is set", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultTemplate: "SETTINGS: {{content}}" }),
    );
    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, "x"),
    );

    await expect(app.vault.read(file)).resolves.toBe("SETTINGS: x");
  });

  it("uses the built-in note template when no template is configured", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(app, createSettings());
    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, "BODY"),
    );

    await expect(app.vault.read(file)).resolves.toBe(
      "# Test Article\n\nBODY\n\n[Source](https://example.com/article)",
    );
  });
});

describe("ArticleSaver.saveArticle frontmatter decision", () => {
  it("prepends the plugin frontmatter ahead of the body", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        frontmatterTemplate: "---\ntitle: {{title}}\n---",
        defaultTemplate: "# {{title}}\n{{content}}",
      }),
    );
    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, "BODY"),
    );

    await expect(app.vault.read(file)).resolves.toBe(
      "---\ntitle: Test Article\n---\n# Test Article\nBODY",
    );
  });

  it("adds the plugin frontmatter when the default template is cleared to {{content}} (#1037)", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        frontmatterTemplate: "---\ntitle: {{title}}\n---",
        defaultTemplate: "{{content}}",
      }),
    );
    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, "BODY"),
    );

    await expect(app.vault.read(file)).resolves.toBe(
      "---\ntitle: Test Article\n---\nBODY",
    );
  });

  it("adds no frontmatter when the note template starts with its own", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        frontmatterTemplate: "---\nplugin: yes\n---",
        defaultTemplate: "---\nmine: yes\n---\n{{content}}",
      }),
    );
    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, "BODY"),
    );

    await expect(app.vault.read(file)).resolves.toBe(
      "---\nmine: yes\n---\nBODY",
    );
  });

  it("adds no plugin frontmatter when a saved template owns the file", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        frontmatterTemplate: "---\nplugin: yes\n---",
      }),
    );
    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, undefined, {
        id: "beta",
        name: "Beta",
        template: "# {{title}}",
      }),
    );

    await expect(app.vault.read(file)).resolves.toBe("# Test Article");
  });

  it("still adds the plugin frontmatter for the one-save override template", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        frontmatterTemplate: "---\nplugin: yes\n---",
      }),
    );
    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, "BODY", {
        id: ONE_SAVE_OVERRIDE_TEMPLATE_ID,
        name: "One save",
        template: "# {{title}}\n{{content}}",
      }),
    );

    await expect(app.vault.read(file)).resolves.toBe(
      "---\nplugin: yes\n---\n# Test Article\nBODY",
    );
  });

  it("renders the raw content instead of the feed HTML when both are present", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultTemplate: "{{content}}" }),
    );
    const file = requireFile(
      await saver.saveArticle(
        createItem({ content: "<p>Feed body</p>" }),
        undefined,
        undefined,
        "RAW",
      ),
    );

    await expect(app.vault.read(file)).resolves.toBe("RAW");
  });
});

describe("ArticleSaver.saveArticle existing-file lookup", () => {
  it("modifies a note at its recorded path instead of creating another", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultTemplate: "{{content}}" }),
    );
    const item = createItem({
      title: "Repeat",
      saved: true,
      savedFilePath: "Archive/Original.md",
    });
    await app.vault.createFolder("Archive");
    const existing = await app.vault.create("Archive/Original.md", "old");
    const process = vi.spyOn(app.vault, "process");
    const create = vi.spyOn(app.vault, "create");

    const file = requireFile(
      await saver.saveArticle(item, undefined, undefined, "NEW"),
    );

    expect(file.path).toBe("Archive/Original.md");
    expect(process).toHaveBeenCalledTimes(1);
    const [processFile, writeContent] = process.mock.calls[0] ?? [];
    expect(processFile).toBe(existing);
    expect(writeContent?.("old")).toBe("NEW");
    expect(create).not.toHaveBeenCalled();
    expect(item.savedFilePath).toBe("Archive/Original.md");
  });

  it("falls back to the legacy title path when the recorded path is a folder", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        defaultFolder: "Articles",
        defaultTemplate: "{{content}}",
      }),
    );
    const item = createItem({
      title: "Legacy",
      saved: true,
      savedFilePath: "Some Folder",
    });
    await app.vault.createFolder("Some Folder");
    await app.vault.createFolder("Articles");
    const legacy = await app.vault.create("Articles/Legacy.md", "old");
    const process = vi.spyOn(app.vault, "process");
    const create = vi.spyOn(app.vault, "create");

    const file = requireFile(
      await saver.saveArticle(item, undefined, undefined, "NEW"),
    );

    expect(file.path).toBe("Articles/Legacy.md");
    expect(process).toHaveBeenCalledTimes(1);
    const [processFile, writeContent] = process.mock.calls[0] ?? [];
    expect(processFile).toBe(legacy);
    expect(writeContent?.("old")).toBe("NEW");
    expect(create).not.toHaveBeenCalled();
  });

  it("re-creates the note at its legacy title path after the recorded note disappears", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        defaultFolder: "Articles",
        defaultTemplate: "{{content}}",
      }),
    );
    const item = createItem({ title: "Race Condition" });
    await saver.saveArticle(item, undefined, undefined, "FIRST");

    const savedFile = app.vault.getAbstractFileByPath(
      "Articles/Race Condition.md",
    );
    if (!(savedFile instanceof TFile)) throw new Error("expected a saved note");
    await app.vault.delete(savedFile);
    const create = vi.spyOn(app.vault, "create");

    const file = requireFile(
      await saver.saveArticle(item, undefined, undefined, "SECOND"),
    );

    expect(create).toHaveBeenCalledWith("Articles/Race Condition.md", "SECOND");
    expect(file.path).toBe("Articles/Race Condition.md");
    expect(item.savedFilePath).toBe("Articles/Race Condition.md");
  });

  it("appends a collision suffix when the target name is taken", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        defaultFolder: "Articles",
        defaultTemplate: "{{content}}",
      }),
    );
    await app.vault.createFolder("Articles");
    await app.vault.create("Articles/Test Article.md", "existing");

    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, "BODY"),
    );

    expect(file.path).toBe("Articles/Test Article 2.md");
  });

  it("ignores a recorded path when the item is not marked saved", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        defaultFolder: "Articles",
        defaultTemplate: "{{content}}",
      }),
    );
    const item = createItem({
      saved: false,
      savedFilePath: "Archive/Original.md",
    });
    await app.vault.createFolder("Archive");
    await app.vault.create("Archive/Original.md", "old");
    const process = vi.spyOn(app.vault, "process");

    const file = requireFile(
      await saver.saveArticle(item, undefined, undefined, "NEW"),
    );

    expect(file.path).toBe("Articles/Test Article.md");
    expect(process).not.toHaveBeenCalled();
  });

  it("modifies a legacy title note for a saved item without a recorded path", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        defaultFolder: "Articles",
        defaultTemplate: "{{content}}",
      }),
    );
    const item = createItem({ saved: true });
    await app.vault.createFolder("Articles");
    const legacy = await app.vault.create("Articles/Test Article.md", "old");
    const process = vi.spyOn(app.vault, "process");

    const file = requireFile(
      await saver.saveArticle(item, undefined, undefined, "NEW"),
    );

    expect(file.path).toBe("Articles/Test Article.md");
    expect(process).toHaveBeenCalledTimes(1);
    const [processFile, writeContent] = process.mock.calls[0] ?? [];
    expect(processFile).toBe(legacy);
    expect(writeContent?.("old")).toBe("NEW");
  });
});

describe("ArticleSaver.saveArticle item state and notices", () => {
  it("marks the item saved, records the path, and shows the success notice", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultTemplate: "{{content}}" }),
    );
    const item = createItem();

    const file = requireFile(
      await saver.saveArticle(item, undefined, undefined, "BODY"),
    );

    expect(item.saved).toBe(true);
    expect(item.savedFilePath).toBe("Test Article.md");
    expect(noticeLog).toHaveBeenCalledWith("[Stub Notice]", SUCCESS_NOTICE);
    expect(file.path).toBe("Test Article.md");
  });

  it("returns null, leaves the item unsaved, and reports a create failure", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultTemplate: "{{content}}" }),
    );
    vi.spyOn(app.vault, "create").mockRejectedValueOnce(new Error("disk full"));
    const item = createItem({ title: "Will Fail" });

    const result = await saver.saveArticle(item, undefined, undefined, "BODY");

    expect(result).toBeNull();
    expect(item.saved).not.toBe(true);
    expect(item.savedFilePath).toBeUndefined();
    expect(noticeLog).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Error saving article: disk full",
    );
  });

  it("does not re-create a note when modifying its recorded path fails", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({ defaultTemplate: "{{content}}" }),
    );
    const item = createItem({
      saved: true,
      savedFilePath: "Articles/Repeat.md",
    });
    await app.vault.createFolder("Articles");
    await app.vault.create("Articles/Repeat.md", "old");
    vi.spyOn(app.vault, "process").mockRejectedValueOnce(new Error("locked"));
    const create = vi.spyOn(app.vault, "create");

    const result = await saver.saveArticle(item, undefined, undefined, "NEW");

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(noticeLog).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Error saving article: locked",
    );
  });
});

describe("ArticleSaver.saveArticle empty saved-template body", () => {
  it("writes an empty note and no frontmatter for a saved template with no body", async () => {
    const app = App.createMock();
    const saver = new ArticleSaver(
      app,
      createSettings({
        includeFrontmatter: true,
        frontmatterTemplate: "---\nplugin: yes\n---",
        defaultTemplate: "# Fallback",
      }),
    );

    const file = requireFile(
      await saver.saveArticle(createItem(), undefined, undefined, undefined, {
        id: "empty",
        name: "Empty",
        template: "",
      }),
    );

    await expect(app.vault.read(file)).resolves.toBe("");
  });
});
