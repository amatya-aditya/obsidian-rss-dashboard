import { afterEach, describe, expect, it, vi } from "vitest";
import { App, Menu, type WorkspaceLeaf } from "obsidian";
import { ArticleSaver } from "../../../src/services/article-saver";
import { DEFAULT_SETTINGS, type FeedItem } from "../../../src/types/types";
import { ReaderView } from "../../../src/views/reader-view";

function createItem(name: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: `Article ${name}`,
    link: `https://example.substack.com/p/article-${name.toLowerCase()}`,
    description: `<p>Article ${name} summary</p>`,
    content: `<p>Article ${name} feed content</p>`,
    pubDate: "2026-10-07",
    guid: `article-${name.toLowerCase()}`,
    feedTitle: "Example feed",
    feedUrl: "https://example.substack.com/feed",
    coverImage: "",
    saved: false,
    ...overrides,
  };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("Reader save completion after navigation", () => {
  let reader: ReaderView | undefined;

  afterEach(async () => {
    await reader?.onClose();
    reader?.unload();
    document.body.empty();
    vi.restoreAllMocks();
  });

  describe.each(["shortcut", "default-save menu"] as const)("%s", (entry) => {
    it.each([
      "another article in the same feed",
      "an equal GUID in another feed",
      "no navigation",
      "navigation away and back",
    ] as const)(
      "saves only the initiating article with %s",
      async (scenario) => {
        const app = App.createMock();
        const a = createItem("A");
        const b = createItem(
          "B",
          scenario === "an equal GUID in another feed"
            ? { guid: a.guid, feedUrl: "https://other.substack.com/feed" }
            : {},
        );
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.useWebViewer = false;
        settings.articleSaving = {
          ...settings.articleSaving,
          defaultFolder: "",
          defaultTemplate: "# {{title}}\n\n{{content}}",
          includeFrontmatter: false,
          addSavedTag: false,
          saveFullContent: false,
        };
        const onArticleSave = vi.fn<(item: FeedItem) => void>();
        const view = new ReaderView(
          { app } as unknown as WorkspaceLeaf,
          settings,
          new ArticleSaver(app, settings.articleSaving),
          onArticleSave,
          vi.fn(),
        );
        reader = view;
        document.body.appendChild(view.containerEl);
        // The ItemView stub leaves contentEl to the test harness.
        view.contentEl = view.containerEl.createDiv();
        await view.onOpen();
        // Substack articles use their feed content, so displaying either article
        // needs no network mock. Only the vault write is held pending.
        await view.displayItem(a);
        const button = view.contentEl.querySelector<HTMLButtonElement>(
          'button[data-rss-action="save"]',
        );
        if (!button) throw new Error("Missing Reader save button");

        const started = deferred();
        const write = deferred();
        const create = app.vault.create.bind(app.vault);
        const createSpy = vi
          .spyOn(app.vault, "create")
          .mockImplementation(async (path, content) => {
            started.resolve();
            await write.promise;
            return create(path, content);
          });
        let saving: Promise<unknown>;
        if (entry === "shortcut") {
          saving = view.actionSaveCurrentArticle();
        } else {
          button.click();
          const saveDefault = Menu.lastItems.find(
            (item) => item.title === "Save with default settings",
          )?.callback;
          if (!saveDefault) throw new Error("Missing default-save menu action");
          saving = Promise.resolve(saveDefault(new MouseEvent("click")));
        }

        await started.promise;
        expect(onArticleSave).not.toHaveBeenCalled();
        if (scenario !== "no navigation") {
          await view.displayItem(b);
        }
        if (scenario === "navigation away and back") {
          // A refreshed article object still represents the same feed + GUID.
          await view.displayItem({ ...a });
        }
        expect(button.classList.contains("saved")).toBe(false);
        expect(b.savedFilePath).toBeUndefined();

        write.resolve();
        await saving;

        expect(createSpy).toHaveBeenCalledOnce();
        const [path, content] = createSpy.mock.calls[0];
        expect(content).toContain("# Article A");
        expect(content).toContain("Article A feed content");
        expect(content).not.toContain("Article B");
        expect(await app.vault.read(path)).toBe(content);
        expect.soft(onArticleSave).toHaveBeenCalledOnce();
        expect.soft(onArticleSave.mock.calls[0]?.[0]).toBe(a);
        expect.soft(a).toMatchObject({ saved: true, savedFilePath: path });
        expect.soft(b.saved).toBe(false);
        expect.soft(b.savedFilePath).toBeUndefined();
        const displayingA =
          scenario === "no navigation" ||
          scenario === "navigation away and back";
        expect.soft(button.classList.contains("saved")).toBe(displayingA);
        expect
          .soft(button.getAttribute("aria-label"))
          .toBe(displayingA ? "Click to open saved article" : "Save article");
      },
    );
  });
});
