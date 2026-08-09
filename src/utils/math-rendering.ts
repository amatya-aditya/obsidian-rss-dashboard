import {
  type App,
  type Component,
  MarkdownRenderer,
} from "obsidian";
import { isLatexFormulaImageElement } from "./image-url-utils";

interface MathTurndownService {
  addRule(
    name: string,
    rule: {
      filter: (node: Node) => boolean;
      replacement: (content: string, node: Node) => string;
    },
  ): void;
}

/**
 * Detects and strips LaTeX delimiters from a math span's text content,
 * returning { latex, display } for an isolated Markdown math fragment.
 *
 * StackExchange wraps display math in $$...$$ and inline in $...$, both
 * inside <span class="math-container">. Other sources may use \[...\]
 * or \(...\). If no recognized delimiter is found, the text is passed
 * through as-is (inline).
 */
export function extractLatex(
  text: string,
): { latex: string; display: boolean } {
  const t = text.trim();

  // Display: $$...$$
  if (t.startsWith("$$") && t.endsWith("$$") && t.length > 4) {
    return { latex: t.slice(2, -2).trim(), display: true };
  }
  // Display: \[...\]
  if (t.startsWith("\\[") && t.endsWith("\\]") && t.length > 4) {
    return { latex: t.slice(2, -2).trim(), display: true };
  }
  // Inline: $...$
  if (t.startsWith("$") && t.endsWith("$") && t.length > 2) {
    return { latex: t.slice(1, -1).trim(), display: false };
  }
  // Inline: \(...\)
  if (t.startsWith("\\(") && t.endsWith("\\)") && t.length > 4) {
    return { latex: t.slice(2, -2).trim(), display: false };
  }

  // No recognized delimiter — treat as inline LaTeX as-is
  return { latex: t, display: false };
}

const MAX_WORDPRESS_LATEX_LENGTH = 16_384;

export interface WordPressLatexFormula {
  latex: string;
  rawMath: string;
  display: boolean;
}

function hasRecognizedMathDelimiters(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("$$") && trimmed.endsWith("$$")) ||
    (trimmed.startsWith("\\[") && trimmed.endsWith("\\]")) ||
    (trimmed.startsWith("$") && trimmed.endsWith("$")) ||
    (trimmed.startsWith("\\(") && trimmed.endsWith("\\)"))
  );
}

function isFormulaOnlyBlock(image: Element): boolean {
  const block = image.closest("p, div, figure");
  if (!block) return false;
  if ((block.textContent || "").trim()) return false;

  const visualElements = Array.from(
    block.querySelectorAll("img, video, svg, canvas, iframe"),
  );
  return visualElements.length === 1 && visualElements[0] === image;
}

function decodeHtmlQuerySeparators(value: string): string {
  return value.replace(/&(?:amp|#0*38);/gi, "&");
}

function extractLatexQuerySource(src: string): string {
  if (!src) return "";
  try {
    const parsed = new URL(
      decodeHtmlQuerySeparators(src),
      "https://rss-dashboard.invalid",
    );
    return parsed.searchParams.get("latex")?.trim() || "";
  } catch {
    return "";
  }
}

/** Decodes the TeX source embedded in a WordPress formula image. */
export function extractWordPressLatexFormula(
  image: Element,
): WordPressLatexFormula | null {
  if (!isLatexFormulaImageElement(image)) return null;

  const querySource = extractLatexQuerySource(
    image.getAttribute("src")?.trim() || "",
  );
  const source = querySource || image.getAttribute("alt")?.trim() || "";
  if (!source || source.length > MAX_WORDPRESS_LATEX_LENGTH) return null;

  const hasDelimiters = hasRecognizedMathDelimiters(source);
  const extracted = extractLatex(source);
  const display = hasDelimiters
    ? extracted.display
    : isFormulaOnlyBlock(image);
  const rawMath = display
    ? `\\[${extracted.latex}\\]`
    : `\\(${extracted.latex}\\)`;

  return { latex: extracted.latex, rawMath, display };
}

/**
 * Matches display math `$$...$$` / `\[...\]` or inline math `$...$` / `\(...\)`.
 * We use a regex that helps avoid matching currency by ensuring:
 * 1. Inside `$...$`, there is no leading or trailing whitespace
 * 2. It isn't empty
 */
const MATH_REGEX =
  /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)[^$]+?(?<!\s)\$)/g;

const DEFAULT_ATTACH_ATTEMPTS = 5;
const MAX_CACHED_MATH_FRAGMENTS = 500;

let mathRenderCache = new WeakMap<Document, Map<string, HTMLElement>>();

export interface MathRenderContext {
  app: App;
  component: Component;
  sourcePath?: string;
}

export interface MathProcessingResult {
  mathContainerCount: number;
  textNodeMatchCount: number;
  renderedCount: number;
  failedCount: number;
}

export interface ScheduleMathOptions {
  /**
   * Some reader routes build content while detached, then attach it on the next
   * layout turn. Retry briefly before falling back to detached processing.
   */
  maxAttachAttempts?: number;
}

interface PendingMathRender {
  host: HTMLElement;
  fallback: Node;
  rawMath: string;
}

function getMathRenderCache(ownerDocument: Document): Map<string, HTMLElement> {
  let documentCache = mathRenderCache.get(ownerDocument);
  if (!documentCache) {
    documentCache = new Map<string, HTMLElement>();
    mathRenderCache.set(ownerDocument, documentCache);
  }

  return documentCache;
}

function getCachedMath(
  ownerDocument: Document,
  cacheKey: string,
  rawMath: string,
): HTMLElement | null {
  const documentCache = mathRenderCache.get(ownerDocument);
  const cached = documentCache?.get(cacheKey);
  if (!cached || !documentCache) return null;

  // Refresh insertion order so frequently used formulas stay cached.
  documentCache.delete(cacheKey);
  documentCache.set(cacheKey, cached);

  const clone = cached.cloneNode(true) as HTMLElement;
  clone.setAttribute("data-math", rawMath);
  return clone;
}

function cacheRenderedMath(
  ownerDocument: Document,
  cacheKey: string,
  wrapper: HTMLElement,
): void {
  const documentCache = getMathRenderCache(ownerDocument);
  documentCache.set(cacheKey, wrapper.cloneNode(true) as HTMLElement);

  if (documentCache.size > MAX_CACHED_MATH_FRAGMENTS) {
    const oldestKey = documentCache.keys().next().value;
    if (oldestKey !== undefined) documentCache.delete(oldestKey);
  }
}

/** Clears cached MathJax fragments, primarily for lifecycle resets and tests. */
export function clearMathRenderCache(ownerDocument?: Document): void {
  if (ownerDocument) {
    mathRenderCache.delete(ownerDocument);
    return;
  }

  mathRenderCache = new WeakMap<Document, Map<string, HTMLElement>>();
}

function hasMathDelimiter(text: string): boolean {
  return text.includes("$") || text.includes("\\(") || text.includes("\\[");
}

function isInsideSkippedNode(node: Node): boolean {
  let current = node.parentElement;

  while (current) {
    const tag = current.tagName.toLowerCase();
    if (
      tag === "code" ||
      tag === "pre" ||
      tag === "script" ||
      tag === "style" ||
      current.classList.contains("math") ||
      current.classList.contains("math-container") ||
      current.classList.contains("rss-math-render-pending")
    ) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function isMathContainer(element: Element): boolean {
  return element.classList.contains("math-container");
}

function createMathRenderHost(doc: Document): HTMLElement {
  const host = doc.createElement("span");
  host.className = "rss-math-render-pending";
  return host;
}

function getMarkdownMath(rawMath: string): {
  display: boolean;
  markdown: string;
} {
  const { latex, display } = extractLatex(rawMath);
  return {
    display,
    markdown: display ? `$$\n${latex}\n$$` : `$${latex}$`,
  };
}

async function renderPendingMath(
  pending: PendingMathRender,
  context: MathRenderContext,
): Promise<boolean> {
  const { host, fallback, rawMath } = pending;
  const { display, markdown } = getMarkdownMath(rawMath);
  const cacheKey = `${display ? "display" : "inline"}\u0000${markdown}`;
  const cached = getCachedMath(host.ownerDocument, cacheKey, rawMath);
  if (cached) {
    host.replaceWith(cached);
    return true;
  }

  try {
    await MarkdownRenderer.render(
      context.app,
      markdown,
      host,
      context.sourcePath ?? "",
      context.component,
    );

    const renderedMath = host.querySelector<HTMLElement>(".math");
    const mathJax = host.querySelector<HTMLElement>("mjx-container");
    if (!mathJax) {
      throw new Error("Markdown renderer returned no MathJax element");
    }

    const wrapper = host.ownerDocument.createElement("span");
    wrapper.className = renderedMath?.className || "math";
    wrapper.classList.add("math");
    wrapper.classList.add(display ? "math-block" : "math-inline");
    wrapper.setAttribute("data-math", rawMath);

    if (renderedMath) {
      while (renderedMath.firstChild) {
        wrapper.appendChild(renderedMath.firstChild);
      }
    } else {
      wrapper.appendChild(mathJax);
    }

    cacheRenderedMath(host.ownerDocument, cacheKey, wrapper);
    host.replaceWith(wrapper);
    return true;
  } catch (error) {
    host.replaceWith(fallback);
    console.warn("[RSS Dashboard] Failed to render math formula", error);
    return false;
  }
}

function createProtectedMathSpan(doc: Document, rawMath: string): HTMLElement {
  const span = doc.createElement("span");
  span.className = "math";
  span.setAttribute("data-math", rawMath);
  span.textContent = rawMath;
  return span;
}

function normalizeExistingMathSpans(container: HTMLElement): void {
  const mathSpans = container.querySelectorAll<HTMLElement>(
    "span.math, span.math-container",
  );

  mathSpans.forEach((span) => {
    const rawMath = span.getAttribute("data-math") || span.textContent || "";
    const trimmed = rawMath.trim();
    if (!trimmed) return;

    span.replaceWith(createProtectedMathSpan(span.ownerDocument, trimmed));
  });
}

function getWordPressFormulaImages(
  container: HTMLElement,
): Array<{ image: HTMLImageElement; formula: WordPressLatexFormula }> {
  const images: HTMLImageElement[] = [];
  if (container.tagName.toLowerCase() === "img") {
    images.push(container as HTMLImageElement);
  }
  images.push(
    ...Array.from(container.querySelectorAll<HTMLImageElement>("img")),
  );

  const formulas: Array<{
    image: HTMLImageElement;
    formula: WordPressLatexFormula;
  }> = [];
  for (const image of images) {
    if (image.closest("code, pre, script, style")) continue;
    const formula = extractWordPressLatexFormula(image);
    if (formula) formulas.push({ image, formula });
  }
  return formulas;
}

function normalizeWordPressFormulaImages(container: HTMLElement): void {
  for (const { image, formula } of getWordPressFormulaImages(container)) {
    image.replaceWith(
      createProtectedMathSpan(image.ownerDocument, formula.rawMath),
    );
  }
}

function protectRawMathTextNodes(container: HTMLElement): void {
  const doc = container.ownerDocument || activeDocument;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isInsideSkippedNode(node)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });

  const textNodes: Text[] = [];
  let currentNode: Node | null = null;
  while ((currentNode = walker.nextNode())) {
    textNodes.push(currentNode as Text);
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || "";
    if (!hasMathDelimiter(text)) continue;

    MATH_REGEX.lastIndex = 0;
    if (!MATH_REGEX.test(text)) continue;
    MATH_REGEX.lastIndex = 0;

    const fragment = doc.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = MATH_REGEX.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
      }

      const mathStr = match[0];
      fragment.appendChild(createProtectedMathSpan(doc, mathStr));
      lastIndex = MATH_REGEX.lastIndex;
    }

    if (lastIndex > 0) {
      if (lastIndex < text.length) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
      }
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }
}

export function addMathTurndownRule(turndownService: MathTurndownService): void {
  turndownService.addRule("math", {
    filter: (node: Node) =>
      node.nodeName === "SPAN" &&
      ((node as Element).classList.contains("math") ||
        (node as Element).classList.contains("math-container")),
    replacement: (_content: string, node: Node) => {
      const el = node as Element;
      const rawMath = el.getAttribute("data-math") || el.textContent || "";
      if (!rawMath.trim()) return "";

      const { latex, display } = extractLatex(rawMath);
      return display ? `$$${latex}$$` : `$${latex}$`;
    },
  });
}

export function protectMathForMarkdown(html: string): string {
  const trimmedHtml = (html || "").trim();
  if (!trimmedHtml) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmedHtml, "text/html");

  normalizeWordPressFormulaImages(doc.body);
  normalizeExistingMathSpans(doc.body);
  protectRawMathTextNodes(doc.body);

  return doc.body.innerHTML;
}

/**
 * Renders all MathJax math elements within a container element through
 * Obsidian's Markdown renderer. Rendering isolated fragments lets Obsidian
 * initialize and own MathJax through its supported Markdown lifecycle without
 * passing the surrounding sanitized article HTML through a second renderer.
 *
 * It traverses all text nodes, searching for $...$ and $$...$$ patterns,
 * and replaces them with a `<span class="math" data-math="RAW">` element.
 * It also handles existing <span class="math-container"> from RSS feeds.
 */
export async function processMathElements(
  container: HTMLElement,
  context: MathRenderContext,
): Promise<MathProcessingResult> {
  const ownerDoc = container.ownerDocument || activeDocument;
  const result: MathProcessingResult = {
    mathContainerCount: 0,
    textNodeMatchCount: 0,
    renderedCount: 0,
    failedCount: 0,
  };
  const pendingRenders: PendingMathRender[] = [];

  // 1. Convert WordPress formula images while retaining each image as the
  // failure fallback. Rendering succeeds without fetching the remote bitmap.
  const formulaImages = getWordPressFormulaImages(container);
  for (const { image, formula } of formulaImages) {
    const host = createMathRenderHost(ownerDoc);
    image.replaceWith(host);
    pendingRenders.push({ host, fallback: image, rawMath: formula.rawMath });
  }

  // 2. Process existing <span class="math-container"> (legacy RSS feeds)
  const mathContainers: HTMLElement[] = [];
  if (isMathContainer(container)) {
    mathContainers.push(container);
  }
  mathContainers.push(
    ...Array.from(
      container.querySelectorAll<HTMLElement>(".math-container"),
    ),
  );
  result.mathContainerCount = mathContainers.length;
  mathContainers.forEach((span) => {
    const rawText = span.textContent?.trim() || "";
    if (!rawText) return;

    const host = createMathRenderHost(ownerDoc);
    span.replaceWith(host);
    pendingRenders.push({ host, fallback: span, rawMath: rawText });
  });

  // 3. Walk all text nodes to find raw MathJax
  const walker = ownerDoc.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) =>
        isInsideSkippedNode(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    },
  );

  const textNodes: Text[] = [];
  let currentNode: Node | null = null;
  while ((currentNode = walker.nextNode())) {
    textNodes.push(currentNode as Text);
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || "";
    if (!hasMathDelimiter(text)) continue;

    // Reset regex state
    MATH_REGEX.lastIndex = 0;

    // Quick test to avoid processing if no match is possible
    if (!MATH_REGEX.test(text)) continue;
    MATH_REGEX.lastIndex = 0;

    const fragment = ownerDoc.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = MATH_REGEX.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(
          ownerDoc.createTextNode(text.slice(lastIndex, match.index)),
        );
      }

      const mathStr = match[0];
      result.textNodeMatchCount += 1;
      const host = createMathRenderHost(ownerDoc);
      fragment.appendChild(host);
      pendingRenders.push({
        host,
        fallback: ownerDoc.createTextNode(mathStr),
        rawMath: mathStr,
      });

      lastIndex = MATH_REGEX.lastIndex;
    }

    if (lastIndex > 0) {
      if (lastIndex < text.length) {
        fragment.appendChild(
          ownerDoc.createTextNode(text.slice(lastIndex)),
        );
      }
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }

  for (const pending of pendingRenders) {
    const rendered = await renderPendingMath(pending, context);
    if (rendered) {
      result.renderedCount += 1;
    } else {
      result.failedCount += 1;
    }
  }

  return result;
}

function hasMathCandidate(container: HTMLElement): boolean {
  if (getWordPressFormulaImages(container).length > 0) return true;

  if (
    isMathContainer(container) ||
    container.querySelector(".math-container")
  ) {
    return true;
  }

  const text = container.textContent || "";
  MATH_REGEX.lastIndex = 0;
  const hasMatch = MATH_REGEX.test(text);
  MATH_REGEX.lastIndex = 0;
  return hasMatch;
}

export function scheduleProcessMathElements(
  container: HTMLElement,
  context: MathRenderContext,
  options: ScheduleMathOptions = {},
): Promise<void> {
  const ownerWindow = (container.ownerDocument || activeDocument).defaultView;

  const schedule = (callback: FrameRequestCallback): void => {
    if (ownerWindow?.requestAnimationFrame) {
      ownerWindow.requestAnimationFrame(callback);
      return;
    }

    const fallbackWindow = ownerWindow || activeWindow;
    fallbackWindow.setTimeout(() => callback(0), 0);
  };

  const maxAttachAttempts =
    options.maxAttachAttempts ?? DEFAULT_ATTACH_ATTEMPTS;

  return new Promise((resolve) => {
    const processWhenAttached = (attachAttempt: number): void => {
      schedule(() => {
        if (!container.isConnected && attachAttempt < maxAttachAttempts) {
          processWhenAttached(attachAttempt + 1);
          return;
        }

        if (!hasMathCandidate(container)) {
          resolve();
          return;
        }

        processMathElements(container, context)
          .catch((error) => {
            console.warn("[RSS Dashboard] Failed to process math elements", error);
          })
          .finally(resolve);
      });
    };

    processWhenAttached(0);
  });
}
