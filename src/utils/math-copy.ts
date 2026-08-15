export interface MathCopyPayload {
  plainText: string;
  html: string;
}

export type ReaderMathCopyResult = "copied" | "not-applicable" | "failed";

const FORMULA_SELECTOR = "span.math[data-math]";
const SELECTED_FORMULA_CLASS = "rss-math-copy-selected";
const SELECTION_REBIND_EVENTS = [
  "pointerdown",
  "focusin",
  "keydown",
  "selectstart",
] as const;

interface ReaderMathSelection {
  ranges: Range[];
  formulas: HTMLElement[];
}

const BLOCK_TAG_NAMES = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TFOOT",
  "THEAD",
  "TR",
  "UL",
]);

function getContainingFormula(
  node: Node,
  readerRoot: HTMLElement,
): HTMLElement | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  const formula = element?.closest<HTMLElement>("span.math[data-math]");

  return formula && readerRoot.contains(formula) ? formula : null;
}

function isRangeInsideReader(range: Range, readerRoot: HTMLElement): boolean {
  return (
    readerRoot.contains(range.startContainer) &&
    readerRoot.contains(range.endContainer)
  );
}

function resolveReaderMathSelection(
  readerRoot: HTMLElement,
  ranges: readonly Range[],
): ReaderMathSelection | null {
  const selectedRanges = ranges.filter((range) => !range.collapsed);
  if (
    selectedRanges.length === 0 ||
    selectedRanges.some((range) => !isRangeInsideReader(range, readerRoot))
  ) {
    return null;
  }

  const formulas = Array.from(
    readerRoot.querySelectorAll<HTMLElement>(FORMULA_SELECTOR),
  ).filter((formula) =>
    selectedRanges.some((range) => range.intersectsNode(formula)),
  );

  return formulas.length > 0 ? { ranges: selectedRanges, formulas } : null;
}

function expandFormulaBoundaries(range: Range, readerRoot: HTMLElement): Range {
  const expanded = range.cloneRange();
  const startFormula = getContainingFormula(range.startContainer, readerRoot);
  const endFormula = getContainingFormula(range.endContainer, readerRoot);

  if (startFormula) {
    expanded.setStartBefore(startFormula);
  }
  if (endFormula) {
    expanded.setEndAfter(endFormula);
  }

  return expanded;
}

function replaceFormulaMarkup(fragment: DocumentFragment): void {
  fragment.querySelectorAll<HTMLElement>("span.math[data-math]").forEach(
    (formula) => {
      formula.replaceWith(
        formula.ownerDocument.createTextNode(
          formula.getAttribute("data-math") || "",
        ),
      );
    },
  );
}

function appendLineBreak(parts: string[]): void {
  if (parts.length === 0 || !parts[parts.length - 1].endsWith("\n")) {
    parts.push("\n");
  }
}

function appendPlainText(node: Node, parts: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent || "");
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  if (element.matches?.("span.math[data-math]")) {
    const display = element.classList.contains("math-block");
    if (display) appendLineBreak(parts);
    parts.push(element.getAttribute("data-math") || "");
    if (display) appendLineBreak(parts);
    return;
  }

  if (element.tagName === "BR") {
    appendLineBreak(parts);
    return;
  }

  const block = BLOCK_TAG_NAMES.has(element.tagName);
  if (block) appendLineBreak(parts);
  node.childNodes.forEach((child) => appendPlainText(child, parts));
  if (element.tagName === "TD" || element.tagName === "TH") {
    parts.push("\t");
  }
  if (block) appendLineBreak(parts);
}

function serializePlainText(fragment: DocumentFragment): string {
  const parts: string[] = [];
  appendPlainText(fragment, parts);
  return parts.join("").replace(/^\n+/, "").replace(/\n+$/, "");
}

export function createMathCopyPayload(
  readerRoot: HTMLElement,
  ranges: readonly Range[],
): MathCopyPayload | null {
  const selection = resolveReaderMathSelection(readerRoot, ranges);
  if (!selection) return null;

  const holder = readerRoot.ownerDocument.win.createDiv();
  const plainTextParts: string[] = [];
  for (const [index, range] of selection.ranges.entries()) {
    if (index > 0) {
      holder.appendChild(holder.ownerDocument.win.createEl("br"));
    }
    const fragment = expandFormulaBoundaries(range, readerRoot).cloneContents();
    plainTextParts.push(serializePlainText(fragment));
    replaceFormulaMarkup(fragment);
    holder.appendChild(fragment);
  }

  return {
    plainText: plainTextParts.join("\n"),
    html: holder.innerHTML,
  };
}

export function updateReaderMathSelectionHighlight(
  readerRoot: HTMLElement,
  ranges: readonly Range[],
): void {
  const selectedFormulas = new Set(
    resolveReaderMathSelection(readerRoot, ranges)?.formulas || [],
  );

  readerRoot.querySelectorAll<HTMLElement>(FORMULA_SELECTOR).forEach(
    (formula) => {
      formula.classList.toggle(
        SELECTED_FORMULA_CLASS,
        selectedFormulas.has(formula),
      );
    },
  );
}

function getDocumentSelectionRanges(ownerDocument: Document): Range[] {
  const selection = ownerDocument.getSelection();
  if (!selection) return [];

  return Array.from({ length: selection.rangeCount }, (_, index) =>
    selection.getRangeAt(index),
  );
}

export function trackReaderMathSelection(
  eventRoot: HTMLElement,
  getReaderRoot: () => HTMLElement | null,
): () => void {
  let trackedDocument: Document | null = null;
  let lastReaderRoot: HTMLElement | null = null;

  const syncHighlight = () => {
    const readerRoot = getReaderRoot();
    if (lastReaderRoot && lastReaderRoot !== readerRoot) {
      updateReaderMathSelectionHighlight(lastReaderRoot, []);
    }
    lastReaderRoot = readerRoot;
    if (!readerRoot) return;

    updateReaderMathSelectionHighlight(
      readerRoot,
      getDocumentSelectionRanges(readerRoot.ownerDocument),
    );
  };

  const handleSelectionChange = () => syncHighlight();
  const bindOwnerDocument = () => {
    const ownerDocument =
      getReaderRoot()?.ownerDocument || eventRoot.ownerDocument;
    if (trackedDocument === ownerDocument) {
      syncHighlight();
      return;
    }

    trackedDocument?.removeEventListener(
      "selectionchange",
      handleSelectionChange,
    );
    trackedDocument = ownerDocument;
    trackedDocument.addEventListener("selectionchange", handleSelectionChange);
    syncHighlight();
  };

  SELECTION_REBIND_EVENTS.forEach((eventName) => {
    eventRoot.addEventListener(eventName, bindOwnerDocument);
  });
  bindOwnerDocument();

  return () => {
    SELECTION_REBIND_EVENTS.forEach((eventName) => {
      eventRoot.removeEventListener(eventName, bindOwnerDocument);
    });
    trackedDocument?.removeEventListener(
      "selectionchange",
      handleSelectionChange,
    );
    trackedDocument = null;
    if (lastReaderRoot) {
      updateReaderMathSelectionHighlight(lastReaderRoot, []);
      lastReaderRoot = null;
    }
  };
}

export function handleReaderMathCopy(
  event: ClipboardEvent,
  readerRoot: HTMLElement,
): ReaderMathCopyResult {
  if (event.defaultPrevented) return "not-applicable";

  const ranges = getDocumentSelectionRanges(readerRoot.ownerDocument);
  const payload = createMathCopyPayload(readerRoot, ranges);
  if (!payload) return "not-applicable";

  const clipboardData = event.clipboardData;
  if (!clipboardData) return "failed";

  try {
    clipboardData.setData("text/plain", payload.plainText);
    clipboardData.setData("text/html", payload.html);
  } catch {
    return "failed";
  }

  event.preventDefault();
  return "copied";
}
