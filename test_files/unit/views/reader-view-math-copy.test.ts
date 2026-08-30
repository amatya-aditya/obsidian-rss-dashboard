// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
}

type ReaderViewInternals = {
  contentEl: HTMLElement;
  readingContainer: HTMLElement;
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

describe("ReaderView math copy", () => {
  let readerView: ReaderView;

  beforeEach(async () => {
    const app = {
      workspace: { getLeavesOfType: vi.fn() },
      vault: { getAbstractFileByPath: vi.fn() },
    };
    readerView = new ReaderView(
      new MockLeaf(app) as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false },
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );
    getInternals(readerView).contentEl = createDiv();
    await readerView.onOpen();
  });

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.body.empty();
  });

  it("copies rendered Reader formulas as retained source", () => {
    const readerRoot = getInternals(readerView).readingContainer;
    document.body.appendChild(readerRoot);
    const paragraph = createEl("p");
    const formula = createSpan();
    formula.className = "math math-inline";
    formula.setAttribute("data-math", "$x$");
    formula.appendChild(createEl("mjx-container"));
    paragraph.append("Copy ", formula, ".");
    readerRoot.appendChild(paragraph);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const clipboardData = { setData: vi.fn() };
    const event = new Event("copy", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: clipboardData });

    readerView.containerEl.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(clipboardData.setData).toHaveBeenCalledWith(
      "text/plain",
      "Copy $x$.",
    );
  });

  it("visually marks a formula while it is selected", () => {
    const readerRoot = getInternals(readerView).readingContainer;
    document.body.appendChild(readerRoot);
    const formula = createSpan();
    formula.className = "math math-inline";
    formula.setAttribute("data-math", "$x$");
    formula.appendChild(createEl("mjx-container"));
    readerRoot.appendChild(formula);

    const range = document.createRange();
    range.selectNode(formula);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));

    expect(formula.classList).toContain("rss-math-copy-selected");
  });
});
