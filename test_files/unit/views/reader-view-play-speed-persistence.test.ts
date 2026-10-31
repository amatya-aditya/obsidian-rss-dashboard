// A speed chosen in the reader's podcast player is written back to the settings
// object and saved, and the next reader player starts at the chosen speed
// (#1269).
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Replace the player so the reader's wiring is observable without media elements.
const players = vi.hoisted(() => ({
  podcasts: [] as Array<{ args: unknown[] }>,
}));

vi.mock("../../../src/views/podcast-player", () => ({
  PodcastPlayer: class {
    setTagAppearanceSettings = vi.fn();
    loadEpisode = vi.fn();
    destroy = vi.fn();
    updateTheme = vi.fn();
    constructor(...args: unknown[]) {
      players.podcasts.push({ args });
    }
  },
}));

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type Internals = {
  contentEl: HTMLElement;
};

function internals(view: ReaderView): Internals {
  return view as unknown as Internals;
}

function makePodcastEpisode(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Episode",
    link: "https://example.com/episode",
    description: "",
    pubDate: "2026-03-01T12:34:56.000Z",
    guid: "ep-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "podcast",
    audioUrl: "https://example.com/ep-1.mp3",
    ...overrides,
  };
}

describe("ReaderView podcast play speed persistence", () => {
  let view: ReaderView;
  let settings: RssDashboardSettings;
  let saveSettings: Mock<() => Promise<void>>;

  beforeEach(async () => {
    players.podcasts.length = 0;
    activeDocument.body.empty();

    const app = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: { getAbstractFileByPath: vi.fn() },
    };

    settings = structuredClone(DEFAULT_SETTINGS);
    settings.feeds = [];
    saveSettings = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    view = new ReaderView(
      new MockLeaf(app) as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
      { saveSettings },
    );
    internals(view).contentEl = createDiv();
    await view.onOpen();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    activeDocument.body.empty();
  });

  function lastPlayerArgs(): unknown[] {
    const last = players.podcasts[players.podcasts.length - 1];
    expect(last).toBeDefined();
    return last.args;
  }

  // The player reports a speed change through its tenth constructor argument.
  function speedChangeCallback(): (speed: number) => void {
    return lastPlayerArgs()[9] as (speed: number) => void;
  }

  it("persists the speed chosen in the reader player", async () => {
    await view.displayItem(makePodcastEpisode());

    const onPlaySpeedChange = speedChangeCallback();
    expect(typeof onPlaySpeedChange).toBe("function");

    onPlaySpeedChange(1.5);

    expect(settings.media.defaultPlaySpeed).toBe(1.5);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("does not save settings when an episode opens without a speed change", async () => {
    await view.displayItem(makePodcastEpisode());

    expect(settings.media.defaultPlaySpeed).toBe(1);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("starts the next reader player at the last chosen speed", async () => {
    await view.displayItem(makePodcastEpisode());
    speedChangeCallback()(1.5);

    await view.displayItem(makePodcastEpisode({ guid: "ep-2" }));

    // The eighth constructor argument is the player's initial default speed.
    expect(lastPlayerArgs()[7]).toBe(1.5);
  });
});
