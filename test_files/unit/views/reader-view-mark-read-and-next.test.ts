import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Scope } from "obsidian";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS, type FeedItem } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

interface PrivateReader {
  currentItem: FeedItem | null;
  getDashboardView: () => unknown;
}

const makeItem = (read: boolean): FeedItem =>
  ({
    guid: "a1",
    title: "A1",
    read,
    starred: false,
    saved: false,
    tags: [],
    link: "https://example.com/a1",
    description: "",
    pubDate: "",
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed",
    coverImage: "",
  }) as FeedItem;

describe("Reader comma shortcut (mark read and open next)", () => {
  beforeEach(() => {
    document.body.empty();
  });

  function createReader(read: boolean) {
    const app = {
      scope: new Scope(),
      workspace: { on: vi.fn() },
    } as unknown as App;
    const leaf = { app, view: { app } };
    const articleUpdate = vi.fn(
      async (item: FeedItem, updates: Partial<FeedItem>) => {
        // Mirrors the dashboard handler, which writes the update onto the item.
        Object.assign(item, updates);
      },
    );
    const view = new ReaderView(
      leaf as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false },
      {} as never,
      vi.fn(),
      articleUpdate,
    );
    const item = makeItem(read);
    const privateReader = view as unknown as PrivateReader;
    privateReader.currentItem = item;
    const actionNavigateNext = vi.fn();
    privateReader.getDashboardView = () => ({ actionNavigateNext });
    return { view, item, articleUpdate, actionNavigateNext };
  }

  const unreadWrites = (articleUpdate: ReturnType<typeof vi.fn>) =>
    articleUpdate.mock.calls.filter(
      (call: unknown[]) => (call[1] as Partial<FeedItem>).read === false,
    );

  it("marks an unread article read and opens the next one", () => {
    const { view, item, articleUpdate, actionNavigateNext } =
      createReader(false);

    view.actionMarkReadAndNext();

    expect(item.read).toBe(true);
    expect(articleUpdate).toHaveBeenCalledTimes(1);
    expect(articleUpdate.mock.calls[0][1]).toEqual({ read: true });
    expect(actionNavigateNext).toHaveBeenCalledWith({ open: true });
  });

  it("keeps an already-read article read and still opens the next one", () => {
    const { view, item, articleUpdate, actionNavigateNext } =
      createReader(true);

    view.actionMarkReadAndNext();

    expect(item.read).toBe(true);
    expect(unreadWrites(articleUpdate)).toEqual([]);
    expect(actionNavigateNext).toHaveBeenCalledWith({ open: true });
  });

  it("marks the article read when there is no dashboard to advance", () => {
    const { view, item } = createReader(false);
    (view as unknown as PrivateReader).getDashboardView = () => null;

    expect(() => view.actionMarkReadAndNext()).not.toThrow();

    expect(item.read).toBe(true);
  });

  it("keeps the article read when there is no dashboard to advance", () => {
    const { view, item } = createReader(true);
    (view as unknown as PrivateReader).getDashboardView = () => null;

    expect(() => view.actionMarkReadAndNext()).not.toThrow();

    expect(item.read).toBe(true);
  });

  it("never marks the article unread across repeated presses", () => {
    const { view, item, articleUpdate } = createReader(false);

    view.actionMarkReadAndNext();
    view.actionMarkReadAndNext();

    expect(item.read).toBe(true);
    expect(unreadWrites(articleUpdate)).toEqual([]);
  });
});
