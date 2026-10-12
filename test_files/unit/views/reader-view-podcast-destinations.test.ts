import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Menu, Scope } from "obsidian";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { resolvePodcastOpenDestinations } from "../../../src/utils/podcast-open-destinations";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

vi.mock("../../../src/utils/podcast-open-destinations", () => ({
  resolvePodcastOpenDestinations: vi.fn(),
}));

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

describe("ReaderView.actionOpenOriginal podcast destinations", () => {
  beforeEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a destination that has a URL and disables one that does not", () => {
    const view = createReaderView();
    (view as unknown as { currentItem: unknown }).currentItem = {
      title: "Episode",
      link: "https://example.com/episode",
      guid: "episode-1",
      feedUrl: "https://example.com/feed.xml",
      mediaType: "podcast",
    };
    // A destination without a URL reaches the `setDisabled(true)` branch; the
    // real resolver only emits those, so it is mocked to reach the branch.
    vi.mocked(resolvePodcastOpenDestinations).mockReturnValue([
      { id: "episode", title: "Episode page", url: "https://example.com/page" },
      { id: "rss", title: "RSS feed" },
    ]);

    view.actionOpenOriginal();

    const openable = Menu.lastItems.find(
      (item) => item.title === "Episode page",
    );
    const disabled = Menu.lastItems.find((item) => item.title === "RSS feed");
    expect(openable?.disabled).toBe(false);
    expect(disabled?.disabled).toBe(true);
  });
});
