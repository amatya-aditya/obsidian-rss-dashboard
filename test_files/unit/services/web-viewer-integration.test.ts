import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TFile, moment } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { sanitizeFilename } from "../../../src/services/article-saver";
import type { FeedItem } from "../../../src/types/types";
import {
  buildFeedItem,
  createWebViewerIntegrationHarness,
} from "./web-viewer-integration-harness";

// The real `obsidian` types `moment` as the moment namespace, which is not
// callable; production code casts it the same way.
type MomentFactory = (input?: Date) => { format: (fmt: string) => string };
const callMoment = moment as unknown as MomentFactory;

describe("Phase 8 - WebViewerIntegration", () => {
  beforeAll(() => {
    installObsidianDomPolyfills();
  });

  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("openInWebViewer", () => {
    it("returns false when the Web Viewer plugin is missing", async () => {
      const h = createWebViewerIntegrationHarness({ webViewerPlugin: null });
      await expect(
        h.integration.openInWebViewer("https://example.com", "Title"),
      ).resolves.toBe(false);
      h.cleanup();
    });

    it("returns false when openWebpage is missing", async () => {
      const h = createWebViewerIntegrationHarness({
        webViewerPlugin: {
          currentTitle: "t",
          currentUrl: "u",
          cleanedHtml: "c",
        },
      });

      await expect(
        h.integration.openInWebViewer("https://example.com", "Title"),
      ).resolves.toBe(false);
      h.cleanup();
    });

    it("returns true and schedules addCustomSaveButton after ~1000ms", async () => {
      vi.useFakeTimers();

      const openWebpage = vi.fn(async () => {});
      const h = createWebViewerIntegrationHarness({
        webViewerPlugin: { openWebpage },
      });

      const integration = h.integration as unknown as {
        addCustomSaveButton: () => void;
      };
      const addSpy = vi.spyOn(integration, "addCustomSaveButton").mockImplementation(() => {});

      await expect(
        h.integration.openInWebViewer("https://example.com", "My Title"),
      ).resolves.toBe(true);
      expect(openWebpage).toHaveBeenCalledWith("https://example.com", "My Title");
      expect(addSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(999);
      expect(addSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(addSpy).toHaveBeenCalledTimes(1);

      h.cleanup();
    });

    it("returns false when openWebpage throws and emits a Notice", async () => {
      vi.useFakeTimers();
      const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const h = createWebViewerIntegrationHarness({
        webViewerPlugin: {
          openWebpage: vi.fn(async () => {
            throw new Error("boom");
          }),
        },
      });

      await expect(
        h.integration.openInWebViewer("https://example.com", "Title"),
      ).resolves.toBe(false);

      expect(logSpy).toHaveBeenCalledWith(
        "[Stub Notice]",
        expect.stringContaining("Error opening URL in web viewer: boom"),
      );

      h.cleanup();
    });
  });

  describe("addCustomSaveButton", () => {
    it("creates a .webpage-control-bar inside .webpage-container when missing", () => {
      const h = createWebViewerIntegrationHarness();

      h.integration.addCustomSaveButton();

      const controlBar = h.webpageContainer?.querySelector(".webpage-control-bar");
      expect(controlBar).not.toBeNull();
      expect(h.webpageContainer?.firstElementChild).toBe(controlBar);

      h.cleanup();
    });

    it("adds a single .rss-custom-save-button and is idempotent on repeated calls", () => {
      const h = createWebViewerIntegrationHarness();

      h.integration.addCustomSaveButton();
      h.integration.addCustomSaveButton();

      expect(
        h.webpageContainer?.querySelectorAll(".rss-custom-save-button").length,
      ).toBe(1);

      h.cleanup();
    });

    it("clicking the button calls showSaveDialog()", () => {
      const h = createWebViewerIntegrationHarness();
      const integration = h.integration as unknown as {
        showSaveDialog: () => void;
      };
      const showSpy = vi.spyOn(integration, "showSaveDialog").mockImplementation(() => {});

      h.integration.addCustomSaveButton();

      const btn = h.webpageContainer?.querySelector<HTMLButtonElement>(
        ".rss-custom-save-button",
      );
      expect(btn).not.toBeNull();

      btn?.click();
      expect(showSpy).toHaveBeenCalledTimes(1);

      h.cleanup();
    });
  });

  describe("showSaveDialog", () => {
    it("does nothing when the Web Viewer plugin is missing", () => {
      const h = createWebViewerIntegrationHarness({ webViewerPlugin: null });

      h.integration.showSaveDialog();
      expect(document.querySelector(".rss-dashboard-modal")).toBeNull();

      h.cleanup();
    });

    it("renders a modal with defaults and cancel removes it", () => {
      const rafSpy = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb: FrameRequestCallback) => {
          cb(0);
          return 0;
        });

      const h = createWebViewerIntegrationHarness({
        settings: { defaultFolder: "My Folder/", includeFrontmatter: false },
      });

      h.integration.showSaveDialog();

      const modal = document.querySelector<HTMLElement>(".rss-dashboard-modal");
      expect(modal).not.toBeNull();

      const folderInput = modal?.querySelector<HTMLInputElement>(
        'input[type="text"]',
      );
      const templateInput = modal?.querySelector<HTMLTextAreaElement>("textarea");
      const frontmatterCheckbox = modal?.querySelector<HTMLInputElement>(
        "#include-frontmatter",
      );

      expect(folderInput?.value).toBe("My Folder/");
      expect(templateInput?.value.length).toBeGreaterThan(0);
      expect(frontmatterCheckbox?.checked).toBe(false);

      const cancelButton = Array.from(
        modal?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      ).find((b) => b.textContent === "Cancel");
      expect(cancelButton).not.toBeUndefined();
      cancelButton?.click();

      expect(document.querySelector(".rss-dashboard-modal")).toBeNull();

      rafSpy.mockRestore();
      h.cleanup();
    });

    it("save calls saveArticle() and removes the modal", async () => {
      const rafSpy = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb: FrameRequestCallback) => {
          cb(0);
          return 0;
        });

      const h = createWebViewerIntegrationHarness({
        settings: { defaultFolder: "SaveHere/", includeFrontmatter: true },
      });

      const integration = h.integration as unknown as {
        saveArticle: (
          item: { title: string },
          folder: string,
          template: string,
          includeFrontmatter: boolean,
        ) => Promise<unknown>;
      };
      const saveSpy = vi.spyOn(integration, "saveArticle").mockResolvedValue(null);

      h.integration.showSaveDialog();

      const modal = document.querySelector<HTMLElement>(".rss-dashboard-modal");
      const saveButton = Array.from(
        modal?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      ).find((b) => b.textContent === "Save");
      expect(saveButton).not.toBeUndefined();

      saveButton?.click();

      await Promise.resolve();
      await Promise.resolve();

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(document.querySelector(".rss-dashboard-modal")).toBeNull();

      rafSpy.mockRestore();
      h.cleanup();
    });
  });

  describe("saveArticle", () => {
    it("creates a markdown file and emits a success Notice", async () => {
      const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const h = createWebViewerIntegrationHarness({
        settings: { frontmatterTemplate: "", addSavedTag: true },
      });

      const item = buildFeedItem({
        title: "My File",
        guid: "g",
        link: "https://example.com/x",
        description: "<p>Body</p>",
      });

      const integration = h.integration as unknown as {
        saveArticle: (
          item: FeedItem,
          folder: string,
          template: string,
          includeFrontmatter: boolean,
        ) => Promise<unknown>;
      };
      const saveArticle = integration.saveArticle.bind(h.integration);

      const file = await saveArticle(
        item,
        "Folder",
        'TITLE={{title}}\nCONTENT={{content}}\n',
        true,
      );

      expect(file).not.toBeNull();
      expect(h.app.vault.getAbstractFileByPath("Folder/My File.md")).not.toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        "[Stub Notice]",
        expect.stringContaining("Article saved: My File"),
      );

      h.cleanup();
    });

    it("escapes quotes in frontmatter values when saving a web article", async () => {
      const h = createWebViewerIntegrationHarness({
        settings: {
          frontmatterTemplate: `---
title: "{{title}}"
author: "{{author}}"
---`,
        },
      });

      const item = buildFeedItem({
        title: 'Quoted "Title"',
        author: 'Ada "Lovelace"',
        link: "https://example.com/a",
      });

      const integration = h.integration as unknown as {
        saveArticle: (
          item: FeedItem,
          folder: string,
          template: string,
          includeFrontmatter: boolean,
        ) => Promise<unknown>;
      };
      const saveArticle = integration.saveArticle.bind(h.integration);

      const file = await saveArticle(item, "", "BODY\n", true);
      expect(file).not.toBeNull();
      if (!(file instanceof TFile)) throw new Error("expected TFile");
      const written = await h.app.vault.read(file);

      expect(written).toContain('title: "Quoted \\"Title\\""');
      expect(written).toContain('author: "Ada \\"Lovelace\\""');

      h.cleanup();
    });

    it("returns null and emits a Notice when the file already exists", async () => {
      const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const h = createWebViewerIntegrationHarness();
      const item = buildFeedItem({ title: "Dupe" });

      await h.app.vault.createFolder("Folder");
      await h.app.vault.create("Folder/Dupe.md", "existing");

      const integration = h.integration as unknown as {
        saveArticle: (
          item: FeedItem,
          folder: string,
          template: string,
          includeFrontmatter: boolean,
        ) => Promise<unknown>;
      };
      const saveArticle = integration.saveArticle.bind(h.integration);

      const file = await saveArticle(item, "Folder", "{{title}}", false);
      expect(file).toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        "[Stub Notice]",
        expect.stringContaining("File already exists: Dupe"),
      );

      h.cleanup();
    });
  });

  describe("helpers", () => {
    it("sanitizeFilename replaces illegal chars, collapses whitespace, and caps long titles", () => {
      expect(sanitizeFilename('Hello / World: "Test"')).toBe("Hello World Test");
      expect(
        sanitizeFilename(`  ${"a".repeat(98)} /  zzz`),
      ).toBe(
        `${"a".repeat(98)} z`,
      );
    });

    it("sanitizeFilename falls back to a safe filename when sanitization removes everything", () => {
      expect(sanitizeFilename(' / \\\\ : * ? " < > | ')).toBe("Untitled Article");
    });

    it("applyTemplate replaces common placeholders", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-31T12:00:00Z"));

      const h = createWebViewerIntegrationHarness();
      const integration = h.integration as unknown as {
        applyTemplate: (item: { title: string; link: string; author?: string; feedTitle: string; summary?: string; description?: string; pubDate: string }, template: string) => string;
      };
      const applyTemplate = integration.applyTemplate.bind(h.integration);

      const item = buildFeedItem({
        title: "T",
        link: "https://example.com/a",
        author: "A",
        feedTitle: "F",
        summary: "S",
        description: "<p>C</p>",
        pubDate: new Date("2026-01-02T03:04:05Z").toISOString(),
      });

      const out = applyTemplate(
        item,
        "{{title}}|{{date}}|{{isoDateTime}}|{{saveDate}}|{{saveTime12}}|{{saveTime24}}|{{link}}|{{author}}|{{source}}|{{summary}}|{{content}}",
      );

      const expectedDate = new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const expectedSaveDate = callMoment().format("YYYY-MM-DD");
      const expectedSaveTime12 = callMoment().format("hh:mm A");
      const expectedSaveTime24 = callMoment().format("HH:mm");
      expect(out).toContain(`T|${expectedDate}|`);
      expect(out).toContain(new Date(item.pubDate).toISOString());
      expect(out).toContain(
        `${expectedSaveDate}|${expectedSaveTime12}|${expectedSaveTime24}|`,
      );
      expect(out).toContain("https://example.com/a|A|F|S|<p>C</p>");

      h.cleanup();
    });

    it("generateFrontmatter adds saved tag and uses pubDate fallbacks", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-31T12:00:00Z"));

      const h = createWebViewerIntegrationHarness({
        settings: {
          addSavedTag: true,
          frontmatterTemplate: `---
title: "{{title}}"
date: "{{date}}"
saveDate: "{{saveDate}}"
saveTime12: "{{saveTime12}}"
saveTime24: "{{saveTime24}}"
iso: "{{isoDateTime}}"
tags: [{{tags}}]
guid: "{{guid}}"
---
`,
        },
      });
      const integration = h.integration as unknown as {
        generateFrontmatter: (item: FeedItem) => string;
      };
      const generateFrontmatter = integration.generateFrontmatter.bind(h.integration);

      const item = buildFeedItem({
        title: "My Article",
        guid: "g1",
        link: "https://example.com/g1",
        author: "",
        feedTitle: "",
        tags: [],
        pubDate: "not-a-date",
      });

      const expectedSaveDate = callMoment().format("YYYY-MM-DD");
      const expectedSaveTime12 = callMoment().format("hh:mm A");
      const expectedSaveTime24 = callMoment().format("HH:mm");

      const out = generateFrontmatter(item);
      expect(out).toContain('title: "My Article"');
      expect(out).toContain(`saveDate: "${expectedSaveDate}"`);
      expect(out).toContain(`saveTime12: "${expectedSaveTime12}"`);
      expect(out).toContain(`saveTime24: "${expectedSaveTime24}"`);
      expect(out).toContain("tags: [Saved]");
      expect(out).toContain('guid: "g1"');
      expect(out).toContain(new Date().toISOString());

      h.cleanup();
    });

    it("resolves a pubDate that fails Date.parse cleanly instead of silently using the save time (#303)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-31T12:00:00Z"));

      const h = createWebViewerIntegrationHarness({
        settings: {
          frontmatterTemplate: `---
date: "{{date}}"
isoDate: "{{isoDate}}"
---`,
        },
      });
      const integration = h.integration as unknown as {
        generateFrontmatter: (item: FeedItem) => string;
      };
      const generateFrontmatter = integration.generateFrontmatter.bind(h.integration);

      // CST = UTC-6, so 09:00 CST is 15:00 UTC. Some engines fail to parse
      // the obsolete named zone via Date.parse() and produce NaN;
      // getPubDateMs normalizes it to an explicit offset first.
      const item = buildFeedItem({
        title: "Zoned Date",
        pubDate: "Fri, 06 May 1983 09:00:00 CST",
      });

      const out = generateFrontmatter(item);
      expect(out).toContain('date: "May 6, 1983"');
      expect(out).toContain('isoDate: "1983-05-06T15:00:00.000Z"');

      h.cleanup();
    });

    it("falls back to firstSeenMs (not the save time) when pubDate is unparseable, a first-seen timestamp exists, and useFirstSeenDateFallback is enabled (#303)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-31T12:00:00Z"));

      const h = createWebViewerIntegrationHarness({
        settings: {
          frontmatterTemplate: `---
date: "{{date}}"
isoDate: "{{isoDate}}"
---`,
        },
        useFirstSeenDateFallback: true,
      });
      const integration = h.integration as unknown as {
        generateFrontmatter: (item: FeedItem) => string;
      };
      const generateFrontmatter = integration.generateFrontmatter.bind(h.integration);

      const item = buildFeedItem({
        title: "First Seen Fallback",
        pubDate: "not-a-date",
        firstSeenMs: Date.parse("2024-05-01T12:00:00Z"),
      });

      const out = generateFrontmatter(item);
      expect(out).toContain('date: "May 1, 2024"');
      expect(out).toContain('isoDate: "2024-05-01T12:00:00.000Z"');

      h.cleanup();
    });

    it("does not substitute firstSeenMs for the frontmatter date when useFirstSeenDateFallback is disabled (default) (#303)", () => {
      const now = new Date("2026-03-31T12:00:00Z");
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const h = createWebViewerIntegrationHarness({
        settings: {
          frontmatterTemplate: `---
isoDate: "{{isoDate}}"
---`,
        },
      });
      const integration = h.integration as unknown as {
        generateFrontmatter: (item: FeedItem) => string;
      };
      const generateFrontmatter = integration.generateFrontmatter.bind(h.integration);

      const item = buildFeedItem({
        title: "No Fallback",
        pubDate: "not-a-date",
        firstSeenMs: Date.parse("2024-05-01T12:00:00Z"),
      });

      const out = generateFrontmatter(item);
      expect(out).toContain(`isoDate: "${now.toISOString()}"`);

      h.cleanup();
    });

    it("saves into an existing folder whose name differs only in case", async () => {
      vi.spyOn(console, "debug").mockImplementation(() => {});
      const h = createWebViewerIntegrationHarness();
      await h.app.vault.createFolder("RSS Articles");
      const item = buildFeedItem({ title: "Case Variant" });

      const integration = h.integration as unknown as {
        saveArticle: (
          item: FeedItem,
          folder: string,
          template: string,
          includeFrontmatter: boolean,
        ) => Promise<{ path: string } | null>;
      };
      const file = await integration.saveArticle.bind(h.integration)(
        item,
        "rss articles",
        "{{title}}",
        false,
      );

      expect(file?.path).toBe("RSS Articles/Case Variant.md");

      h.cleanup();
    });

    it("ensureFolderExists creates folder only when missing", async () => {
      const h = createWebViewerIntegrationHarness();
      const integration = h.integration as unknown as {
        ensureFolderExists: (path: string) => Promise<void>;
      };
      const ensureFolderExists = integration.ensureFolderExists.bind(h.integration);

      const createFolderSpy = vi.spyOn(h.app.vault, "createFolder");
      await ensureFolderExists("");
      expect(createFolderSpy).not.toHaveBeenCalled();

      await h.app.vault.createFolder("exists");
      createFolderSpy.mockClear();
      await ensureFolderExists("exists");
      expect(createFolderSpy).not.toHaveBeenCalled();

      await ensureFolderExists("missing");
      expect(createFolderSpy).toHaveBeenCalledWith("missing");

      h.cleanup();
    });
  });
});

describe("WebViewerIntegration.{{image}} template variable parity", () => {
  it("replaces {{image}} in template with empty string when no image present", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00Z"));

    const h = createWebViewerIntegrationHarness();
    const integration = h.integration as unknown as {
      applyTemplate: (item: { title: string; link: string; author?: string; feedTitle: string; summary?: string; description?: string; pubDate: string }, template: string) => string;
    };
    const applyTemplate = integration.applyTemplate.bind(h.integration);

    const item = buildFeedItem({
      title: "No Image",
      link: "https://example.com",
      description: "<p>content</p>",
      pubDate: new Date("2026-01-02T03:04:05Z").toISOString(),
    });

    const out = applyTemplate(item, "cover: {{image}}");
    expect(out).toBe("cover: ");

    h.cleanup();
  });

  it("replaces {{image}} in frontmatter with item.image when present", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00Z"));

    const imageUrl = "https://example.com/image.jpg";
    const h = createWebViewerIntegrationHarness({
      settings: {
        frontmatterTemplate: `---
title: "{{title}}"
cover: "{{image}}"
---`,
      },
    });
    const integration = h.integration as unknown as {
      generateFrontmatter: (item: FeedItem) => string;
    };
    const generateFrontmatter = integration.generateFrontmatter.bind(h.integration);

    const item = buildFeedItem({
      title: "With Image",
      link: "https://example.com",
      pubDate: new Date("2026-01-02T03:04:05Z").toISOString(),
      image: imageUrl,
    });

    const out = generateFrontmatter(item);
    expect(out).toContain(`cover: "${imageUrl}"`);

    h.cleanup();
  });
});
