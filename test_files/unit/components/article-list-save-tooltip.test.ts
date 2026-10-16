/**
 * The dashboard card's save tooltip names the version its save will write
 * (#1184). It follows the Default save version setting, and the article's
 * resolved saved template is what lets #1185's per-template override change
 * the answer without more label code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";
import type {
  RssDashboardSettings,
  SavedTemplate,
} from "../../../src/types/types";

const FEED_URL = "https://example.com/feed";

function settingsWith(
  saveVersion: "rss" | "fetched",
  savedTemplates: SavedTemplate[] = [],
  feedTemplateId?: string,
): Partial<RssDashboardSettings> {
  return {
    viewStyle: "card",
    articleGroupBy: "none",
    articleSort: "newest",
    articleSaving: {
      saveVersion,
      savedTemplates,
      globalDefaultTemplateId: undefined,
    },
    feeds: [
      {
        url: FEED_URL,
        title: "Feed",
        items: [],
        ...(feedTemplateId ? { customTemplate: feedTemplateId } : {}),
      },
    ],
  } as unknown as Partial<RssDashboardSettings>;
}

function saveTooltip(container: HTMLElement, guid: string): string | null {
  return (
    container
      .querySelector<HTMLElement>(`#article-${guid}`)
      ?.querySelector<HTMLElement>(".rss-dashboard-save-toggle")
      ?.getAttribute("aria-label") ?? null
  );
}

describe("card save tooltip names the version a save will write (#1184)", () => {
  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("names RSS content when the Default save version is RSS content", () => {
    const h = createArticleListHarness({
      settings: settingsWith("rss"),
      articles: [buildArticle({ guid: "1", feedUrl: FEED_URL })],
    });

    h.list.render();

    expect(saveTooltip(h.container, "1")).toBe("Save RSS content to notes");
  });

  it("names fetched content when the Default save version is Fetched content", () => {
    const h = createArticleListHarness({
      settings: settingsWith("fetched"),
      articles: [buildArticle({ guid: "1", feedUrl: FEED_URL })],
    });

    h.list.render();

    expect(saveTooltip(h.container, "1")).toBe("Save fetched content to notes");
  });

  it("follows the setting when it changes", () => {
    const h = createArticleListHarness({
      settings: settingsWith("rss"),
      articles: [buildArticle({ guid: "1", feedUrl: FEED_URL })],
    });
    h.list.render();
    expect(saveTooltip(h.container, "1")).toBe("Save RSS content to notes");

    h.settings.articleSaving.saveVersion = "fetched";
    h.list.updateArticleInPlace(h.articles[0]);

    expect(saveTooltip(h.container, "1")).toBe("Save fetched content to notes");
  });

  it("names the version a feed-assigned template sets, over the setting (#1185)", () => {
    const template: SavedTemplate = {
      id: "github-releases",
      name: "GitHub releases",
      template: "{{content}}",
      saveVersion: "fetched",
    };
    const h = createArticleListHarness({
      settings: settingsWith("rss", [template], template.id),
      articles: [buildArticle({ guid: "1", feedUrl: FEED_URL })],
    });

    h.list.render();

    expect(saveTooltip(h.container, "1")).toBe("Save fetched content to notes");
  });

  it("names the version the global default template sets (#1185)", () => {
    const template: SavedTemplate = {
      id: "global-template",
      name: "Global template",
      template: "{{content}}",
      saveVersion: "rss",
    };
    const h = createArticleListHarness({
      settings: settingsWith("fetched", [template]),
      articles: [buildArticle({ guid: "1", feedUrl: FEED_URL })],
    });
    h.settings.articleSaving.globalDefaultTemplateId = template.id;

    h.list.render();

    expect(saveTooltip(h.container, "1")).toBe("Save RSS content to notes");
  });

  it("keeps the setting's version while a saved template sets none", () => {
    const template: SavedTemplate = {
      id: "github-releases",
      name: "GitHub releases",
      template: "{{content}}",
    };
    const h = createArticleListHarness({
      settings: settingsWith("rss", [template], template.id),
      articles: [buildArticle({ guid: "1", feedUrl: FEED_URL })],
    });

    h.list.render();

    expect(saveTooltip(h.container, "1")).toBe("Save RSS content to notes");
  });

  it("keeps the open-saved-article tooltip once the article is saved", () => {
    const h = createArticleListHarness({
      settings: settingsWith("rss"),
      articles: [buildArticle({ guid: "1", feedUrl: FEED_URL })],
    });
    h.list.render();

    h.list.updateArticleInPlace({ ...h.articles[0], saved: true });

    expect(saveTooltip(h.container, "1")).toBe("Click to open saved article");
  });
});
