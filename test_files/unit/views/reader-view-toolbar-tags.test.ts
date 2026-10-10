import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const testDir = path.dirname(fileURLToPath(import.meta.url));
const readerCss = readFileSync(
  path.resolve(testDir, "../../../src/styles/reader.css"),
  "utf-8",
);

function declarationsFor(css: string, selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent?.type === "atrule" || !rule.selectors.includes(selector)) {
      return;
    }
    rule.walkDecls((decl) => {
      declarations.set(decl.prop, decl.value);
    });
  });
  return declarations;
}

function selectorsIn(css: string): string[] {
  const selectors: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    selectors.push(...rule.selectors);
  });
  return selectors;
}

class MockLeaf {
  app: unknown;
  view: unknown;

  constructor(app: unknown) {
    this.app = app;
  }

  detach = vi.fn();
}

// The Reader toolbar's tags button used to carry the dashboard-card class and
// the host `clickable-icon` chrome, so one toolbar had two styling paths
// (GH Issue #979). It now shares the single scoped-reset path its five
// siblings use.
describe("ReaderView toolbar tags button", () => {
  let readerView: ReaderView;
  let contentEl: HTMLElement;

  beforeEach(async () => {
    contentEl = createDiv();

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
    const leaf = new MockLeaf(mockApp);
    readerView = new ReaderView(
      leaf as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false },
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );
    (readerView as unknown as { contentEl: HTMLElement }).contentEl = contentEl;
    await readerView.onOpen();
  });

  afterEach(() => {
    contentEl.remove();
    vi.clearAllMocks();
  });

  it("is a direct toolbar button like its siblings, without dashboard or host chrome", () => {
    const actions = contentEl.querySelector<HTMLElement>(
      ".rss-reader-actions",
    )!;
    const buttons = [...actions.querySelectorAll<HTMLElement>("button")];

    expect(buttons).toHaveLength(6);
    // Every control is a direct child button: the tags button no longer sits
    // inside the dashboard card's dropdown wrapper.
    expect([...actions.children]).toEqual(buttons);

    const tagsButton = buttons.find(
      (button) => button.getAttribute("data-rss-action") === "tags",
    )!;
    expect(tagsButton.classList.contains("rss-reader-action-button")).toBe(
      true,
    );
    expect(tagsButton.classList.contains("clickable-icon")).toBe(false);
    expect(tagsButton.classList.contains("rss-dashboard-tags-toggle")).toBe(
      false,
    );

    for (const button of buttons) {
      expect(button.classList.contains("rss-reader-action-button")).toBe(true);
    }
  });

  it("leaves no tags-only override in the reader stylesheet", () => {
    expect(
      selectorsIn(readerCss).some((selector) =>
        selector.includes("rss-dashboard-tags"),
      ),
    ).toBe(false);
  });

  it("keeps each reader action icon centered in an equal-height control box", () => {
    const peerStyles = declarationsFor(readerCss, ".rss-reader-action-button");

    expect(peerStyles.get("display")).toBe("flex");
    expect(peerStyles.get("align-items")).toBe("center");
    expect(peerStyles.get("justify-content")).toBe("center");
  });

  it("shows keyboard focus on the Reader star action", () => {
    const focusStyles = declarationsFor(
      readerCss,
      ".rss-reader-actions .rss-reader-star-toggle:focus-visible",
    );

    expect(focusStyles.get("outline")).toBe(
      "2px solid var(--interactive-accent)",
    );
    expect(focusStyles.get("outline-offset")).toBe("2px");
  });
});
