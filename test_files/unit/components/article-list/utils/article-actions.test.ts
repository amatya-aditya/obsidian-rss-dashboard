import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FeedItem } from "../../../../../src/types/types";
import { Menu } from "obsidian";
import {
  createSaveButton,
  createReadToggle,
  createStarToggle,
  createTagsToggle,
  createActionButtons,
  type CreateActionButtonArgs,
} from "../../../../../src/components/article-list/utils/article-actions";

describe("article-actions utils", () => {
  let actionToolbar: HTMLElement;
  let article: FeedItem;

  beforeEach(() => {
    actionToolbar = createDiv();
    document.body.appendChild(actionToolbar);

    article = {
      title: "Test Article",
      link: "https://example.com/article",
      description: "Description",
      pubDate: "2024-01-01",
      guid: "test-article-guid",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Test Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  const baseArgs = (
    overrides: Partial<CreateActionButtonArgs> = {},
  ): CreateActionButtonArgs => ({
    article,
    actionToolbar,
    mode: "full" as const,
    settings: {},
    callbacks: {},
    deps: { showTagsDropdown: () => {} },
    ...overrides,
  });

  describe("createReadToggle", () => {
    it("creates read toggle element with correct initial state", () => {
      createReadToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-read-toggle");
      expect(toggle).toBeTruthy();
      expect(toggle?.classList.contains("unread")).toBe(true);
    });

    it("renders as read when article is already read", () => {
      article.read = true;
      createReadToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-read-toggle");
      expect(toggle?.classList.contains("read")).toBe(true);
    });
  });

  describe("createStarToggle", () => {
    it("creates star toggle element with correct initial state", () => {
      createStarToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-star-toggle");
      expect(toggle).toBeTruthy();
      expect(toggle?.classList.contains("unstarred")).toBe(true);
    });

    it("renders as starred when article is starred", () => {
      article.starred = true;
      createStarToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-star-toggle");
      expect(toggle?.classList.contains("starred")).toBe(true);
    });
  });

  describe("createTagsToggle", () => {
    it("creates tag dropdown toggle element", () => {
      createTagsToggle(baseArgs());

      const toggle = actionToolbar.querySelector(".rss-dashboard-tags-toggle");
      expect(toggle).toBeTruthy();
    });

    it("delegates to showTagsDropdown on click", () => {
      const showTagsDropdown = vi.fn();
      createTagsToggle(baseArgs({ deps: { showTagsDropdown } }));

      const toggle = actionToolbar.querySelector(
        ".rss-dashboard-tags-toggle",
      ) as HTMLElement;
      toggle.click();

      expect(showTagsDropdown).toHaveBeenCalledWith(toggle, article);
    });

    it("delegates to showTagsDropdown on keyboard space", () => {
      const showTagsDropdown = vi.fn();
      createTagsToggle(baseArgs({ deps: { showTagsDropdown } }));

      const toggle = actionToolbar.querySelector(
        ".rss-dashboard-tags-toggle",
      ) as HTMLElement;
      toggle.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );

      expect(showTagsDropdown).toHaveBeenCalled();
    });
  });

  describe("createSaveButton", () => {
    const clickSave = (): HTMLElement => {
      const button = actionToolbar.querySelector<HTMLElement>(
        ".rss-dashboard-save-toggle",
      );
      if (!button) throw new Error("Save button was not rendered");
      button.click();
      return button;
    };
    const menuItem = (title: string) => {
      const item = Menu.lastItems.find((entry) => entry.title === title);
      if (!item) throw new Error(`Menu item missing: ${title}`);
      return item;
    };

    it("offers Default save and Custom save instead of saving on click", () => {
      const onArticleSave = vi.fn();
      createSaveButton(
        baseArgs({
          callbacks: { onArticleSave, onArticleCustomSave: vi.fn() },
        }),
      );

      const button = clickSave();

      expect(Menu.lastItems.map((entry) => entry.title)).toEqual([
        "Save with default settings",
        "Save to custom folder...",
      ]);
      expect(onArticleSave).not.toHaveBeenCalled();
      expect(button.classList.contains("saving")).toBe(false);
      expect(button.classList.contains("saved")).toBe(false);
    });

    it("does not show the saved state when the save wrote nothing", async () => {
      const onArticleSave = vi.fn().mockResolvedValue(undefined);
      createSaveButton(
        baseArgs({
          callbacks: { onArticleSave, onArticleCustomSave: vi.fn() },
        }),
      );
      const button = clickSave();

      menuItem("Save with default settings").trigger();

      await vi.waitFor(() => expect(onArticleSave).toHaveBeenCalled());
      await vi.waitFor(() =>
        expect(button.classList.contains("saving")).toBe(false),
      );
      expect(button.classList.contains("saved")).toBe(false);
    });

    it("saves with default settings and shows the saved state", async () => {
      const onArticleSave = vi.fn().mockImplementation(() => {
        article.saved = true;
        return Promise.resolve();
      });
      createSaveButton(
        baseArgs({
          callbacks: { onArticleSave, onArticleCustomSave: vi.fn() },
        }),
      );
      const button = clickSave();

      menuItem("Save with default settings").trigger();

      expect(onArticleSave).toHaveBeenCalledWith(article);
      await vi.waitFor(() =>
        expect(button.classList.contains("saved")).toBe(true),
      );
      expect(button.classList.contains("saving")).toBe(false);
    });

    it("hands Custom save to the dialog without a saving or saved state", () => {
      const onArticleSave = vi.fn();
      const onArticleCustomSave = vi.fn();
      createSaveButton(
        baseArgs({ callbacks: { onArticleSave, onArticleCustomSave } }),
      );
      const button = clickSave();

      menuItem("Save to custom folder...").trigger();

      expect(onArticleCustomSave).toHaveBeenCalledWith(article, {
        onSavingChange: expect.any(Function),
      });
      expect(onArticleSave).not.toHaveBeenCalled();
      expect(button.classList.contains("saving")).toBe(false);
      expect(button.classList.contains("saved")).toBe(false);
      expect(article.saved).toBeUndefined();
    });

    it("lets the dialog drive the saving state", () => {
      let hooks: { onSavingChange: (saving: boolean) => void } | undefined;
      createSaveButton(
        baseArgs({
          callbacks: {
            onArticleSave: vi.fn(),
            onArticleCustomSave: (_article, received) => {
              hooks = received;
            },
          },
        }),
      );
      const button = clickSave();
      menuItem("Save to custom folder...").trigger();

      hooks?.onSavingChange(true);
      expect(button.classList.contains("saving")).toBe(true);
      hooks?.onSavingChange(false);
      expect(button.classList.contains("saving")).toBe(false);
    });

    it("opens the same menu from the keyboard", () => {
      createSaveButton(
        baseArgs({
          callbacks: { onArticleSave: vi.fn(), onArticleCustomSave: vi.fn() },
        }),
      );
      actionToolbar
        .querySelector<HTMLElement>(".rss-dashboard-save-toggle")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );

      expect(Menu.lastItems).toHaveLength(2);
    });

    it("opens the saved article instead of offering a menu", () => {
      const onOpenSavedArticle = vi.fn();
      article.saved = true;
      Menu.lastItems = [];
      createSaveButton(
        baseArgs({
          callbacks: {
            onArticleSave: vi.fn(),
            onArticleCustomSave: vi.fn(),
            onOpenSavedArticle,
          },
        }),
      );
      clickSave();

      expect(onOpenSavedArticle).toHaveBeenCalledWith(article);
      expect(Menu.lastItems).toHaveLength(0);
    });

    it("still saves directly when no Custom save handler is wired", async () => {
      const onArticleSave = vi.fn().mockResolvedValue(undefined);
      createSaveButton(baseArgs({ callbacks: { onArticleSave } }));
      clickSave();

      await vi.waitFor(() =>
        expect(onArticleSave).toHaveBeenCalledWith(article),
      );
    });
  });

  describe("createActionButtons", () => {
    it("includes read, save, and star toggles in full mode", () => {
      createActionButtons(baseArgs());

      expect(
        actionToolbar.querySelector(".rss-dashboard-read-toggle"),
      ).toBeTruthy();
      expect(
        actionToolbar.querySelector(".rss-dashboard-save-toggle"),
      ).toBeTruthy();
      expect(
        actionToolbar.querySelector(".rss-dashboard-star-toggle"),
      ).toBeTruthy();
    });

    it("includes tags toggle in full mode", () => {
      createActionButtons(baseArgs());

      expect(
        actionToolbar.querySelector(".rss-dashboard-tags-toggle"),
      ).toBeTruthy();
    });

    it("includes only read toggle in minimal-read mode", () => {
      createActionButtons(baseArgs({ mode: "minimal-read" }));

      expect(
        actionToolbar.querySelector(".rss-dashboard-read-toggle"),
      ).toBeTruthy();
      expect(
        actionToolbar.querySelector(".rss-dashboard-save-toggle"),
      ).toBeFalsy();
      expect(
        actionToolbar.querySelector(".rss-dashboard-star-toggle"),
      ).toBeFalsy();
      expect(
        actionToolbar.querySelector(".rss-dashboard-tags-toggle"),
      ).toBeFalsy();
    });
  });
});
