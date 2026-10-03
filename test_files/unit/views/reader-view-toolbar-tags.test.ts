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
const articlesCss = readFileSync(
  path.resolve(testDir, "../../../src/styles/articles.css"),
  "utf-8",
);
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

class MockLeaf {
  app: unknown;
  view: unknown;

  constructor(app: unknown) {
    this.app = app;
  }

  detach = vi.fn();
}

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

  it("matches the other reader action icons without a dashboard-style circle", () => {
    const actions = contentEl.querySelector(".rss-reader-actions");
    const peerButton = actions?.querySelector<HTMLElement>(
      ".rss-reader-action-button",
    );
    const tagsButton = actions?.querySelector<HTMLElement>(
      ".rss-dashboard-tags-toggle",
    );

    expect(peerButton).not.toBeNull();
    expect(tagsButton).not.toBeNull();
    expect(tagsButton!.classList.contains("rss-reader-action-button")).toBe(
      true,
    );

    // The dashboard toggle base rule is overridden in the reader stylesheet.
    const tagsStyles = declarationsFor(
      articlesCss,
      ".rss-dashboard-tags-toggle",
    );
    for (const [property, value] of declarationsFor(
      readerCss,
      ".rss-reader-actions .rss-dashboard-tags-toggle",
    )) {
      tagsStyles.set(property, value);
    }
    const peerStyles = declarationsFor(
      readerCss,
      ".rss-reader-action-button",
    );

    expect(tagsStyles.get("border-radius")).toBe(
      peerStyles.get("border-radius"),
    );
    expect(tagsStyles.get("background-color")).toBe("transparent");
    expect(tagsStyles.get("--icon-size")).toBe("18px");
  });

  it("keeps each reader action icon centered in an equal-height control box", () => {
    const peerStyles = declarationsFor(
      readerCss,
      ".rss-reader-action-button",
    );

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
