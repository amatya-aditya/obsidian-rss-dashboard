import { HighlightSettings, HighlightWord } from "../types/types";

interface HighlightMatch {
  start: number;
  end: number;
  text: string;
  word: HighlightWord;
}

/**
 * Service for applying word highlights to article content.
 * Uses DOM traversal to safely highlight text without breaking HTML structure.
 */
export class HighlightService {
  private settings: HighlightSettings;

  constructor(settings: HighlightSettings) {
    this.settings = settings;
  }

  /**
   * Apply highlights to a container element's text content.
   * Traverses the DOM and wraps matching words in <mark> tags.
   */
  public highlightElement(container: HTMLElement): void {
    if (!this.settings.enabled || this.settings.words.length === 0) {
      return;
    }

    const enabledWords = this.settings.words.filter((w) => w.enabled);
    if (enabledWords.length === 0) {
      return;
    }

    // Use TreeWalker to find all text nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip certain elements
        if (this.shouldSkipElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip empty text nodes
        if (!node.textContent?.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    // Collect text nodes first (we'll modify DOM during iteration)
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    // Process each text node
    for (const textNode of textNodes) {
      this.highlightTextNode(textNode, enabledWords);
    }
  }

  /**
   * Highlight text in a plain string (for titles/summaries).
   * Returns HTML string with <mark> tags wrapped around matches.
   */
  public highlightText(text: string): string {
    if (!this.settings.enabled || this.settings.words.length === 0) {
      return text;
    }

    const enabledWords = this.settings.words.filter((w) => w.enabled);
    if (enabledWords.length === 0) {
      return text;
    }

    const matches = this.collectMatches(text, enabledWords);
    if (matches.length === 0) {
      return text;
    }

    let lastIndex = 0;
    let result = "";
    for (const match of matches) {
      if (match.start > lastIndex) {
        result += text.slice(lastIndex, match.start);
      }
      const color = match.word.color || this.settings.defaultColor;
      result += `<mark class="rss-highlight" style="--highlight-color: ${color}">${match.text}</mark>`;
      lastIndex = match.end;
    }
    if (lastIndex < text.length) {
      result += text.slice(lastIndex);
    }

    return result;
  }

  /**
   * Safely set highlighted text on an element using DOM manipulation.
   * This avoids innerHTML security concerns.
   */
  public setHighlightedText(element: HTMLElement, text: string): void {
    if (!this.settings.enabled || this.settings.words.length === 0) {
      element.textContent = text;
      return;
    }

    const enabledWords = this.settings.words.filter((w) => w.enabled);
    if (enabledWords.length === 0) {
      element.textContent = text;
      return;
    }

    const matches = this.collectMatches(text, enabledWords);
    if (matches.length === 0) {
      element.textContent = text;
      return;
    }

    // Clear the element
    element.empty();

    // Build fragments and create DOM nodes
    const fragments = this.buildFragments(text, matches);
    for (const fragment of fragments) {
      if (fragment.isMatch) {
        const mark = document.createElement("mark");
        mark.className = "rss-highlight";
        mark.style.setProperty(
          "--highlight-color",
          fragment.word?.color || this.settings.defaultColor,
        );
        mark.textContent = fragment.text;
        element.appendChild(mark);
      } else {
        element.appendChild(document.createTextNode(fragment.text));
      }
    }
  }

  /**
   * Build a list of text fragments from the input text.
   */
  private buildFragments(
    text: string,
    matches: HighlightMatch[],
  ): Array<{ text: string; isMatch: boolean; word?: HighlightWord }> {
    const fragments: Array<{
      text: string;
      isMatch: boolean;
      word?: HighlightWord;
    }> = [];

    if (matches.length === 0) {
      fragments.push({ text, isMatch: false });
      return fragments;
    }

    let lastIndex = 0;
    for (const match of matches) {
      // Add text before the match
      if (match.start > lastIndex) {
        fragments.push({
          text: text.slice(lastIndex, match.start),
          isMatch: false,
        });
      }

      // Add the match
      fragments.push({
        text: match.text,
        isMatch: true,
        word: match.word,
      });

      lastIndex = match.end;
    }

    // Add remaining text after last match
    if (lastIndex < text.length) {
      fragments.push({
        text: text.slice(lastIndex),
        isMatch: false,
      });
    }

    return fragments;
  }

  /**
   * Process a single text node and wrap matches in <mark> tags.
   */
  private highlightTextNode(textNode: Text, words: HighlightWord[]): void {
    const text = textNode.textContent;
    if (!text) return;

    const matches = this.collectMatches(text, words);
    if (matches.length === 0) return;

    const parent = textNode.parentNode;
    if (!parent) return;

    const fragments = this.buildFragments(text, matches);

    // Create new DOM nodes
    const newNodes: Node[] = [];
    for (const fragment of fragments) {
      if (fragment.isMatch) {
        const mark = document.createElement("mark");
        mark.className = "rss-highlight";
        mark.style.setProperty(
          "--highlight-color",
          fragment.word?.color || this.settings.defaultColor,
        );
        mark.textContent = fragment.text;
        newNodes.push(mark);
      } else {
        newNodes.push(document.createTextNode(fragment.text));
      }
    }

    // Replace the original text node with new nodes
    for (const newNode of newNodes) {
      parent.insertBefore(newNode, textNode);
    }
    parent.removeChild(textNode);
  }

  /**
   * Collect non-overlapping matches for all enabled words.
   * Matches are ordered left-to-right; if multiple words start at the same
   * position, the longest match wins.
   */
  private collectMatches(text: string, words: HighlightWord[]): HighlightMatch[] {
    if (!text || words.length === 0) return [];

    const rawMatches: Array<HighlightMatch & { priority: number }> = [];
    words.forEach((word, priority) => {
      const regex = this.getWordRegex(word);
      if (!regex) return;

      for (const match of text.matchAll(regex)) {
        const matchText = match[0];
        if (!matchText) continue;
        const start = match.index ?? -1;
        if (start < 0) continue;
        rawMatches.push({
          start,
          end: start + matchText.length,
          text: matchText,
          word,
          priority,
        });
      }
    });

    rawMatches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      const lenDiff = b.text.length - a.text.length;
      if (lenDiff !== 0) return lenDiff;
      return a.priority - b.priority;
    });

    const resolved: HighlightMatch[] = [];
    let lastEnd = -1;
    for (const candidate of rawMatches) {
      if (candidate.start < lastEnd) continue;
      resolved.push({
        start: candidate.start,
        end: candidate.end,
        text: candidate.text,
        word: candidate.word,
      });
      lastEnd = candidate.end;
    }

    return resolved;
  }

  /**
   * Build the regex for one word using per-word whole-word and case sensitivity.
   */
  private getWordRegex(word: HighlightWord): RegExp | null {
    const rawText = word.text?.trim();
    if (!rawText) return null;

    const escaped = this.escapeRegex(rawText);
    const pattern = word.wholeWord
      ? `(?<=^|\\W)(${escaped})(?=$|\\W)`
      : `(${escaped})`;
    const flags = word.caseSensitive ? "g" : "gi";
    return new RegExp(pattern, flags);
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Check if an element should be skipped during highlighting.
   */
  private shouldSkipElement(element: HTMLElement): boolean {
    const skipTags = [
      "CODE",
      "PRE",
      "SCRIPT",
      "STYLE",
      "MARK",
      "TEXTAREA",
      "INPUT",
    ];
    const tagName = element.tagName.toUpperCase();

    if (skipTags.includes(tagName)) {
      return true;
    }

    // Skip elements with specific classes
    const skipClasses = ["rss-highlight", "code-block", "highlight-code"];
    if (skipClasses.some((cls) => element.classList.contains(cls))) {
      return true;
    }

    return false;
  }
}
