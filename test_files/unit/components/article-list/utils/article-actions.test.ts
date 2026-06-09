import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Feed, FeedItem } from "../../../../src/types/types";
import {
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
    actionToolbar = document.createElement("div");
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

  const baseArgs = (overrides: Partial<CreateActionButtonArgs> = {}): CreateActionButtonArgs => ({
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

      const toggle = actionToolbar.querySelector(".rss-dashboard-tags-toggle") as HTMLElement;
      toggle.click();

      expect(showTagsDropdown).toHaveBeenCalledWith(toggle, article);
    });

    it("delegates to showTagsDropdown on keyboard space", () => {
      const showTagsDropdown = vi.fn();
      createTagsToggle(baseArgs({ deps: { showTagsDropdown } }));

      const toggle = actionToolbar.querySelector(".rss-dashboard-tags-toggle") as HTMLElement;
      toggle.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

      expect(showTagsDropdown).toHaveBeenCalled();
    });
  });

  describe("createActionButtons", () => {
    it("includes read, save, and star toggles in full mode", () => {
      createActionButtons(baseArgs());

      expect(actionToolbar.querySelector(".rss-dashboard-read-toggle")).toBeTruthy();
      expect(actionToolbar.querySelector(".rss-dashboard-save-toggle")).toBeTruthy();
      expect(actionToolbar.querySelector(".rss-dashboard-star-toggle")).toBeTruthy();
    });

    it("includes tags toggle in full mode", () => {
      createActionButtons(baseArgs());

      expect(actionToolbar.querySelector(".rss-dashboard-tags-toggle")).toBeTruthy();
    });

    it("includes only read toggle in minimal-read mode", () => {
      createActionButtons(baseArgs({ mode: "minimal-read" }));

      expect(actionToolbar.querySelector(".rss-dashboard-read-toggle")).toBeTruthy();
      expect(actionToolbar.querySelector(".rss-dashboard-save-toggle")).toBeFalsy();
      expect(actionToolbar.querySelector(".rss-dashboard-star-toggle")).toBeFalsy();
      expect(actionToolbar.querySelector(".rss-dashboard-tags-toggle")).toBeFalsy();
    });
  });
});
