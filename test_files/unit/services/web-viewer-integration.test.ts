import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  buildFeedItem,
  createWebViewerIntegrationHarness,
} from "./web-viewer-integration-harness";

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

      const addSpy = vi
        .spyOn(h.integration as any, "addCustomSaveButton")
        .mockImplementation(() => {});

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
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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

      (h.integration as any).addCustomSaveButton();

      const controlBar = h.webpageContainer?.querySelector(".webpage-control-bar");
      expect(controlBar).not.toBeNull();
      expect(h.webpageContainer?.firstElementChild).toBe(controlBar);

      h.cleanup();
    });

    it("adds a single .rss-custom-save-button and is idempotent on repeated calls", () => {
      const h = createWebViewerIntegrationHarness();

      (h.integration as any).addCustomSaveButton();
      (h.integration as any).addCustomSaveButton();

      expect(
        h.webpageContainer?.querySelectorAll(".rss-custom-save-button").length,
      ).toBe(1);

      h.cleanup();
    });

    it("clicking the button calls showSaveDialog()", () => {
      const h = createWebViewerIntegrationHarness();

      const showSpy = vi
        .spyOn(h.integration as any, "showSaveDialog")
        .mockImplementation(() => {});

      (h.integration as any).addCustomSaveButton();

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

      (h.integration as any).showSaveDialog();
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

      (h.integration as any).showSaveDialog();

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

      const saveSpy = vi
        .spyOn(h.integration as any, "saveArticle")
        .mockResolvedValue(null);

      (h.integration as any).showSaveDialog();

      const modal = document.querySelector<HTMLElement>(".rss-dashboard-modal");
      const saveButton = Array.from(
        modal?.querySelectorAll<HTMLButtonElement>("button") ?? [],
      ).find((b) => b.textContent === "Save");
      expect(saveButton).not.toBeUndefined();

      saveButton?.click();

      // showSaveDialog fires-and-forgets an async IIFE; flush a couple microtasks.
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
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const h = createWebViewerIntegrationHarness({
        settings: { frontmatterTemplate: "", addSavedTag: true },
      });

      const item = buildFeedItem({
        title: "My File",
        guid: "g",
        link: "https://example.com/x",
        description: "<p>Body</p>",
      });

      const saveArticle = (h.integration as any).saveArticle.bind(h.integration) as (
        item: any,
        folder: string,
        template: string,
        includeFrontmatter: boolean,
      ) => Promise<any>;

      const file = await saveArticle(
        item,
        "Folder",
        'TITLE={{title}}\nCONTENT={{content}}\n',
        true,
      );

      expect(file).not.toBeNull();
      expect(h.app.vault.getAbstractFileByPath("Folder/My_File.md")).not.toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        "[Stub Notice]",
        expect.stringContaining("Article saved: My_File"),
      );

      h.cleanup();
    });

    it("returns null and emits a Notice when the file already exists", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const h = createWebViewerIntegrationHarness();
      const item = buildFeedItem({ title: "Dupe" });

      await h.app.vault.create("Folder/Dupe.md", "existing");

      const saveArticle = (h.integration as any).saveArticle.bind(h.integration) as (
        item: any,
        folder: string,
        template: string,
        includeFrontmatter: boolean,
      ) => Promise<any>;

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
    it("sanitizeFilename replaces illegal chars, collapses whitespace, and caps length", () => {
      const h = createWebViewerIntegrationHarness();
      const sanitize = (h.integration as any).sanitizeFilename.bind(h.integration);

      expect(sanitize('Hello / World: "Test"')).toBe("Hello_World_Test_");
      expect(sanitize("a".repeat(200))).toHaveLength(100);

      h.cleanup();
    });

    it("applyTemplate replaces common placeholders", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-31T12:00:00Z"));

      const h = createWebViewerIntegrationHarness();
      const applyTemplate = (h.integration as any).applyTemplate.bind(h.integration);

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
        "{{title}}|{{date}}|{{isoDateTime}}|{{link}}|{{author}}|{{source}}|{{summary}}|{{content}}",
      );

      const expectedDate = new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      expect(out).toContain(`T|${expectedDate}|`);
      expect(out).toContain(new Date(item.pubDate).toISOString());
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
iso: "{{isoDateTime}}"
tags: [{{tags}}]
guid: "{{guid}}"
---
`,
        },
      });
      const generateFrontmatter = (h.integration as any).generateFrontmatter.bind(
        h.integration,
      );

      const item = buildFeedItem({
        title: "My Article",
        guid: "g1",
        link: "https://example.com/g1",
        author: "",
        feedTitle: "",
        tags: [],
        pubDate: "not-a-date",
      });

      const out = generateFrontmatter(item);
      expect(out).toContain('title: "My Article"');
      expect(out).toContain("tags: [Saved]");
      expect(out).toContain('guid: "g1"');
      expect(out).toContain(new Date().toISOString());

      h.cleanup();
    });

    it("ensureFolderExists creates folder only when missing", async () => {
      const h = createWebViewerIntegrationHarness();
      const ensureFolderExists = (h.integration as any).ensureFolderExists.bind(
        h.integration,
      ) as (path: string) => Promise<void>;

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
