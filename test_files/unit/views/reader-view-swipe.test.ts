import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "obsidian";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type { RssDashboardSettings } from "../../../src/types/types";
import { setCssProps } from "../../../src/utils/platform-utils";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { swipeOn } from "../test-swipe-helpers";

const flush = () => new Promise((resolve) => window.setTimeout(resolve, 0));

describe("ReaderView swipe back to the dashboard", () => {
  const dashboardLeaf = { view: { containerEl: createDiv() } };
  const otherDashboardLeaf = { view: { containerEl: createDiv() } };
  const leftSplit = {};
  const rightSplit = {};
  let root: object | null;
  let settings: RssDashboardSettings;
  let workspace: {
    getLeavesOfType: ReturnType<typeof vi.fn>;
    setActiveLeaf: ReturnType<typeof vi.fn>;
    revealLeaf: ReturnType<typeof vi.fn>;
    leftSplit: object;
    rightSplit: object;
  };
  let leaf: { app: unknown; detach: ReturnType<typeof vi.fn> };
  let view: ReaderView;

  async function openView(enabled = true): Promise<void> {
    settings = structuredClone(DEFAULT_SETTINGS);
    settings.display.swipeBetweenPanels = enabled;
    view = new ReaderView(
      leaf as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );
    // The stub ItemView has no contentEl; the real one provides it.
    (view as unknown as { contentEl: HTMLElement }).contentEl = createDiv();
    document.body.appendChild(view.containerEl);
    await view.onOpen();
  }

  beforeEach(async () => {
    installObsidianDomPolyfills();
    Platform.isMobile = true;
    vi.stubGlobal("innerWidth", 600);
    root = {};
    workspace = {
      getLeavesOfType: vi.fn((type: string) =>
        type === "rss-dashboard-view"
          ? [otherDashboardLeaf, dashboardLeaf]
          : [],
      ),
      setActiveLeaf: vi.fn(),
      revealLeaf: vi.fn(async () => {}),
      leftSplit,
      rightSplit,
    };
    leaf = {
      app: { workspace, vault: {} },
      detach: vi.fn(),
      // Read lazily so a test can move the leaf into a sidebar.
      getRoot: () => root,
    } as never;
    await openView();
  });

  afterEach(() => {
    Platform.isMobile = false;
    document.body.empty();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("focuses the dashboard leaf on a swipe right and leaves the reader tab open", async () => {
    view.setReturnLeaf(dashboardLeaf as never);

    swipeOn(view.containerEl, 120);
    await flush();

    expect(workspace.revealLeaf).toHaveBeenCalledWith(dashboardLeaf);
    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(dashboardLeaf, {
      focus: true,
    });
    expect(leaf.detach).not.toHaveBeenCalled();
  });

  it("falls back to the first dashboard when the return leaf is gone", async () => {
    swipeOn(view.containerEl, 120);
    await flush();

    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(otherDashboardLeaf, {
      focus: true,
    });
  });

  it("does nothing on a swipe left, but still keeps Obsidian from seeing it", async () => {
    const above = vi.fn();
    document.body.addEventListener("touchend", above);

    swipeOn(view.containerEl, -120);
    await flush();

    expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
    expect(above).not.toHaveBeenCalled();
  });

  it.each([
    ["left", leftSplit],
    ["right", rightSplit],
  ])(
    "does nothing in the %s sidebar, yet swallows the swipe",
    async (_n, split) => {
      root = split;
      const above = vi.fn();
      document.body.addEventListener("touchend", above);

      swipeOn(view.containerEl, 120);
      await flush();

      expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
      expect(above).not.toHaveBeenCalled();
    },
  );

  it("ignores a swipe that starts on a horizontally scrolling code block", async () => {
    const pre = view.containerEl.createEl("pre");
    setCssProps(pre, { "overflow-x": "auto" });
    Object.defineProperty(pre, "scrollWidth", { value: 900 });
    Object.defineProperty(pre, "clientWidth", { value: 300 });

    swipeOn(pre.createSpan(), 120);
    await flush();

    expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
  });

  it("adds no listeners when the setting is off", async () => {
    document.body.empty();
    await openView(false);
    const above = vi.fn();
    document.body.addEventListener("touchend", above);

    swipeOn(view.containerEl, 120);
    await flush();

    expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
    expect(above).toHaveBeenCalledTimes(1);
  });
});
