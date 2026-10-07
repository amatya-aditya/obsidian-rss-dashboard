import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "obsidian";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function createReaderView(): ReaderView {
  const app = {
    scope: new Scope(),
    workspace: { getLeavesOfType: vi.fn().mockReturnValue([]), on: vi.fn() },
    vault: { getAbstractFileByPath: vi.fn() },
  };
  const leaf = { app, view: { app }, detach: vi.fn() };
  return new ReaderView(
    leaf as never,
    { ...DEFAULT_SETTINGS },
    { saveArticle: vi.fn() } as never,
    vi.fn(),
    vi.fn(),
  );
}

describe("ReaderView.actionOpenOriginal", () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.empty();
    openSpy = vi.spyOn(activeWindow, "open").mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the article link in the browser", () => {
    const view = createReaderView();
    (view as unknown as { currentItem: unknown }).currentItem = {
      title: "Story",
      link: "https://example.com/story",
      guid: "story-1",
      feedUrl: "https://example.com/feed.xml",
    };

    view.actionOpenOriginal();

    expect(openSpy).toHaveBeenCalledWith("https://example.com/story", "_blank");
  });

  it("does nothing when no article is open", () => {
    const view = createReaderView();

    view.actionOpenOriginal();

    expect(openSpy).not.toHaveBeenCalled();
  });
});
