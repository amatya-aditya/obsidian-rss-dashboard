// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMathCopyPayload,
  handleReaderMathCopy,
  trackReaderMathSelection,
  updateReaderMathSelectionHighlight,
} from "../../../src/utils/math-copy";

describe("Reader math copy", () => {
  afterEach(() => {
    document.body.empty();
  });

  it("copies the complete raw source when a selection starts inside rendered math", () => {
    const reader = createDiv();
    const formula = createSpan();
    formula.className = "math math-inline";
    formula.setAttribute("data-math", String.raw`$x_1$`);
    const mathJax = createEl("mjx-container");
    mathJax.textContent = "12";
    formula.appendChild(mathJax);
    reader.append("Before ", formula, " after.");
    document.body.appendChild(reader);

    const range = document.createRange();
    range.setStart(mathJax.firstChild as Text, 1);
    range.setEnd(reader.lastChild as Text, 7);

    expect(createMathCopyPayload(reader, [range])).toEqual({
      plainText: "$x_1$ after.",
      html: "$x_1$ after.",
    });
  });

  it("keeps selected prose structured while substituting inline and display formulas", () => {
    const reader = createDiv();
    const firstParagraph = createEl("p");
    const inlineFormula = createSpan();
    inlineFormula.className = "math math-inline";
    inlineFormula.setAttribute("data-math", "$x$");
    inlineFormula.appendChild(createEl("mjx-container"));
    const emphasis = createEl("em");
    emphasis.textContent = "After";
    firstParagraph.append("Before ", inlineFormula, " ", emphasis, ".");
    const displayParagraph = createEl("p");
    const displayFormula = createSpan();
    displayFormula.className = "math math-block";
    displayFormula.setAttribute("data-math", String.raw`\[y < z\]`);
    displayFormula.appendChild(createEl("mjx-container"));
    displayParagraph.appendChild(displayFormula);
    const lastParagraph = createEl("p");
    lastParagraph.textContent = "Next.";
    reader.append(firstParagraph, displayParagraph, lastParagraph);
    document.body.appendChild(reader);

    const range = document.createRange();
    range.selectNodeContents(reader);

    expect(createMathCopyPayload(reader, [range])).toEqual({
      plainText: String.raw`Before $x$ After.
\[y < z\]
Next.`,
      html: '<p>Before $x$ <em>After</em>.</p><p>\\[y &lt; z\\]</p><p>Next.</p>',
    });
  });

  it("writes formula-aware plain and rich text during native copy", () => {
    const reader = createDiv();
    const paragraph = createEl("p");
    const formula = createSpan();
    formula.className = "math math-inline";
    formula.setAttribute("data-math", "$x$");
    formula.appendChild(createEl("mjx-container"));
    paragraph.append("Copy ", formula, ".");
    reader.appendChild(paragraph);
    document.body.appendChild(reader);

    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const clipboardData = { setData: vi.fn() };
    const event = new Event("copy", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: clipboardData });

    expect(handleReaderMathCopy(event, reader)).toBe("copied");
    expect(event.defaultPrevented).toBe(true);
    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      1,
      "text/plain",
      "Copy $x$.",
    );
    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      2,
      "text/html",
      "Copy $x$.",
    );
  });

  it("keeps multiple selected ranges distinct after substituting formulas", () => {
    const reader = createDiv();
    const formula = createSpan();
    formula.className = "math math-inline";
    formula.setAttribute("data-math", String.raw`\(x\)`);
    formula.appendChild(createEl("mjx-container"));
    const first = createEl("p");
    first.append("First ", formula, ".");
    const second = createEl("p");
    second.textContent = "Second.";
    reader.append(first, second);
    document.body.appendChild(reader);

    const firstRange = document.createRange();
    firstRange.selectNodeContents(first);
    const secondRange = document.createRange();
    secondRange.selectNodeContents(second);

    expect(createMathCopyPayload(reader, [firstRange, secondRange])).toEqual({
      plainText: String.raw`First \(x\).
Second.`,
      html: "First \\(x\\).<br>Second.",
    });
  });

  it("does not prevent native copy when a clipboard format cannot be written", () => {
    const reader = createDiv();
    const formula = createSpan();
    formula.className = "math math-inline";
    formula.setAttribute("data-math", "$x$");
    formula.appendChild(createEl("mjx-container"));
    reader.appendChild(formula);
    document.body.appendChild(reader);

    const range = document.createRange();
    range.selectNodeContents(reader);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const clipboardData = {
      setData: vi
        .fn()
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw new Error("rich clipboard unavailable");
        }),
    };
    const event = new Event("copy", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: clipboardData });

    expect(handleReaderMathCopy(event, reader)).toBe("failed");
    expect(event.defaultPrevented).toBe(false);
  });

  it("visually marks every formula intersected by the Reader selection", () => {
    const reader = createDiv();
    const firstFormula = createSpan();
    firstFormula.className = "math math-inline";
    firstFormula.setAttribute("data-math", "$x$");
    firstFormula.appendChild(createEl("mjx-container"));
    const secondFormula = createSpan();
    secondFormula.className = "math math-inline";
    secondFormula.setAttribute("data-math", "$y$");
    secondFormula.appendChild(createEl("mjx-container"));
    const paragraph = createEl("p");
    paragraph.append("Before ", firstFormula, " between ", secondFormula, " after.");
    reader.appendChild(paragraph);
    document.body.appendChild(reader);

    const range = document.createRange();
    range.setStart(paragraph.firstChild as Text, 3);
    range.setEnd(paragraph.childNodes[2] as Text, 4);

    updateReaderMathSelectionHighlight(reader, [range]);

    expect(firstFormula.classList).toContain("rss-math-copy-selected");
    expect(secondFormula.classList).not.toContain("rss-math-copy-selected");
  });

  it("updates formula highlighting live and clears it when tracking stops", () => {
    const eventRoot = createDiv();
    const reader = createDiv();
    const formula = createSpan();
    formula.className = "math math-inline";
    formula.setAttribute("data-math", "$x$");
    formula.appendChild(createEl("mjx-container"));
    const paragraph = createEl("p");
    paragraph.append("Before ", formula, " after.");
    reader.appendChild(paragraph);
    eventRoot.appendChild(reader);
    document.body.appendChild(eventRoot);
    const stopTracking = trackReaderMathSelection(eventRoot, () => reader);

    const selection = document.getSelection();
    const formulaRange = document.createRange();
    formulaRange.selectNode(formula);
    selection?.removeAllRanges();
    selection?.addRange(formulaRange);
    document.dispatchEvent(new Event("selectionchange"));

    expect(formula.classList).toContain("rss-math-copy-selected");

    const proseRange = document.createRange();
    proseRange.selectNodeContents(paragraph.firstChild as Text);
    selection?.removeAllRanges();
    selection?.addRange(proseRange);
    document.dispatchEvent(new Event("selectionchange"));

    expect(formula.classList).not.toContain("rss-math-copy-selected");

    selection?.removeAllRanges();
    selection?.addRange(formulaRange);
    stopTracking();
    document.dispatchEvent(new Event("selectionchange"));

    expect(formula.classList).not.toContain("rss-math-copy-selected");
  });
});
