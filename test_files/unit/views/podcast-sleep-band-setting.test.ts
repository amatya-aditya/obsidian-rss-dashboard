import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// The Settings → Media toggle reaches an open player through four hops
// (main.ts → host view → inline renderer → player). These pin each hop so a
// view that stops forwarding fails here rather than silently ignoring the
// setting (#1447).
installObsidianDomPolyfills();

const cloneSettings = (): RssDashboardSettings =>
  structuredClone(DEFAULT_SETTINGS);

class MockLeaf {
  app: unknown;
  detach = vi.fn();
  constructor(app: unknown) {
    this.app = app;
  }
}

function makeReaderView(settings: RssDashboardSettings): ReaderView {
  const app = {
    workspace: {
      getLeavesOfType: vi.fn().mockReturnValue([]),
      setActiveLeaf: vi.fn(),
      revealLeaf: vi.fn(),
    },
    vault: { getAbstractFileByPath: vi.fn() },
  };
  return new ReaderView(
    new MockLeaf(app) as never,
    settings,
    {
      saveArticle: vi.fn(),
      checkSavedFileExists: vi.fn().mockReturnValue(true),
    } as never,
    vi.fn(),
    vi.fn(),
  );
}

function makeDashboardView(settings: RssDashboardSettings): RssDashboardView {
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
  };
  const leaf = {
    app,
    updateHeader: vi.fn(),
  } as unknown as import("obsidian").WorkspaceLeaf;
  return new RssDashboardView(leaf, plugin as never);
}

function makeArticleRenderer(): ArticleRenderer {
  return new ArticleRenderer({
    app: {
      workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
      vault: { getAbstractFileByPath: vi.fn() },
    } as never,
    component: new Component(),
    settings: cloneSettings(),
    onArticleSave: vi.fn(),
    onArticleUpdate: vi.fn(),
  });
}

type PlayerSettingSink = { setSleepTimerBandEnabled: (value: boolean) => void };

describe("sleep timer band setting delegation", () => {
  beforeEach(() => {
    document.body.empty();
  });

  it("forwards the Reader setting to its podcast player", () => {
    const view = makeReaderView(cloneSettings());
    const setSleepTimerBandEnabled = vi.fn();
    (view as unknown as { podcastPlayer: PlayerSettingSink }).podcastPlayer = {
      setSleepTimerBandEnabled,
    };

    view.setPodcastSleepTimerBand(false);

    expect(setSleepTimerBandEnabled).toHaveBeenCalledWith(false);
  });

  it("does nothing when the Reader has no player open", () => {
    const view = makeReaderView(cloneSettings());

    expect(() => view.setPodcastSleepTimerBand(true)).not.toThrow();
  });

  it("forwards the dashboard setting to the inline renderer", () => {
    const view = makeDashboardView(cloneSettings());
    const setPodcastSleepTimerBand = vi.fn();
    (view as unknown as { articleRenderer: unknown }).articleRenderer = {
      setPodcastSleepTimerBand,
    };

    view.setPodcastSleepTimerBand(true);

    expect(setPodcastSleepTimerBand).toHaveBeenCalledWith(true);
  });

  it("forwards the inline renderer's setting to its podcast player", () => {
    const renderer = makeArticleRenderer();
    const setSleepTimerBandEnabled = vi.fn();
    (
      renderer as unknown as { podcastPlayer: PlayerSettingSink }
    ).podcastPlayer = { setSleepTimerBandEnabled };

    renderer.setPodcastSleepTimerBand(false);

    expect(setSleepTimerBandEnabled).toHaveBeenCalledWith(false);
  });
});
