/**
 * Regression test: palette commands act on the focused Reader.
 *
 * Several Readers can be open at once (opening an article while a podcast
 * plays keeps the podcast Reader and opens a separate article Reader), so the
 * commands must not route to whichever Reader leaf happens to be listed first.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";

vi.mock("../../../src/services/feed-parser", () => ({
  FeedParser: class FeedParser {
    parseFeed = vi.fn();
    refreshAllFeeds = vi.fn();
  },
  applyFeedRetentionLimits: vi.fn((feed: unknown) => feed),
  formatFeedParseNoticeMessage: vi.fn((e: Error) => e.message),
  getFeedErrorMessage: vi.fn((e: Error) => e.message),
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaver {
    fixSavedFilePaths = vi.fn().mockResolvedValue(undefined);
  },
}));

import RssDashboardPlugin from "../../../main";
import { ReaderView } from "../../../src/views/reader-view";
import { registerPaletteCommands } from "../../../src/commands/palette-commands";

const MANIFEST: PluginManifest = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "1.0.0",
  minAppVersion: "1.8.7",
  author: "Test",
  description: "Test",
  dir: ".",
};

type ReaderActions = "actionToggleStarStatus" | "actionToggleArticleOpen";

/** A real ReaderView prototype (so `instanceof` holds) with spied actions. */
function makeReader() {
  const reader = Object.create(ReaderView.prototype) as ReaderView;
  const actions = {
    actionToggleStarStatus: vi.fn(),
    actionToggleArticleOpen: vi.fn(),
  } satisfies Record<ReaderActions, ReturnType<typeof vi.fn>>;
  Object.assign(reader, actions);
  return { reader, actions, leaf: { view: reader } };
}

async function setup(activeIsArticle: boolean | null) {
  const podcast = makeReader();
  const article = makeReader();
  const app = App.createMock();
  const leaves = [podcast.leaf, article.leaf];
  Object.assign(app.workspace, {
    getLeavesOfType: vi.fn((type: string) =>
      type === "rss-reader-view" ? leaves : [],
    ),
    getActiveViewOfType: vi.fn(() =>
      activeIsArticle === null
        ? null
        : activeIsArticle
          ? article.reader
          : podcast.reader,
    ),
  });
  const plugin = new RssDashboardPlugin(app, MANIFEST);
  const commands = new Map<
    string,
    { checkCallback?: (checking: boolean) => boolean }
  >();
  plugin.addCommand = vi.fn((command) => {
    commands.set(
      command.id,
      command as { checkCallback?: (checking: boolean) => boolean },
    );
    return command as never;
  });
  registerPaletteCommands(plugin);
  const run = async (id: string) => {
    commands.get(id)?.checkCallback?.(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { podcast, article, run, commands };
}

describe("palette commands with two Readers open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toggle star acts on the focused article Reader, not the first (podcast) Reader", async () => {
    const { podcast, article, run } = await setup(true);

    await run("reader-toggle-star");

    expect(article.actions.actionToggleStarStatus).toHaveBeenCalledTimes(1);
    expect(podcast.actions.actionToggleStarStatus).not.toHaveBeenCalled();
  });

  it("close acts on the focused article Reader, not the first (podcast) Reader", async () => {
    const { podcast, article, run } = await setup(true);

    await run("reader-close");

    expect(article.actions.actionToggleArticleOpen).toHaveBeenCalledTimes(1);
    expect(podcast.actions.actionToggleArticleOpen).not.toHaveBeenCalled();
  });

  it("acts on the focused Reader when that Reader is the first one", async () => {
    const { podcast, article, run } = await setup(false);

    await run("reader-toggle-star");

    expect(podcast.actions.actionToggleStarStatus).toHaveBeenCalledTimes(1);
    expect(article.actions.actionToggleStarStatus).not.toHaveBeenCalled();
  });

  it("falls back to the first Reader when no Reader is focused", async () => {
    const { podcast, article, run } = await setup(null);

    await run("reader-toggle-star");

    expect(podcast.actions.actionToggleStarStatus).toHaveBeenCalledTimes(1);
    expect(article.actions.actionToggleStarStatus).not.toHaveBeenCalled();
  });

  it("lists the reader commands while any Reader is open (availability check)", async () => {
    const { commands } = await setup(null);

    expect(commands.get("reader-toggle-star")?.checkCallback?.(true)).toBe(
      true,
    );
  });
});
