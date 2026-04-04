import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS, RssDashboardSettings } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: any;
  view: any;

  constructor(app: any) {
    this.app = app;
  }

  detach = vi.fn();
}

describe("ReaderView font scaling", () => {
  let readerView: ReaderView;
  let mockSettings: RssDashboardSettings;

  beforeEach(async () => {
    const mockApp = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn(),
      },
    };

    mockSettings = {
      ...DEFAULT_SETTINGS,
      useWebViewer: false,
      readerFormat: {
        ...DEFAULT_SETTINGS.readerFormat,
        fontScalePct: 125,
      },
    };

    readerView = new ReaderView(
      new MockLeaf(mockApp) as any,
      mockSettings,
      { saveArticle: vi.fn() } as any,
      vi.fn(),
      vi.fn(),
    );

    (readerView as any).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("exposes one shared body font-size variable derived from fontScalePct", () => {
    const contentEl = (readerView as any).contentEl as HTMLElement;

    expect(contentEl.style.getPropertyValue("--rss-reader-body-font-size")).toBe(
      "1.25em",
    );
    expect(contentEl.style.getPropertyValue("--rss-reader-font-scale")).toBe(
      "1.25",
    );
  });
});
