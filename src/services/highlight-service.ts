import { HighlightSettings, HighlightWord } from "../types/types";

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

    const pattern = this.buildPattern(enabledWords);
    if (!pattern) {
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
      this.highlightTextNode(textNode, pattern, enabledWords);
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

    const pattern = this.buildPattern(enabledWords);
    if (!pattern) {
      return text;
    }

    return text.replace(pattern, (match) => {
      const word = this.findWordForMatch(match, enabledWords);
      const color = word?.color || this.settings.defaultColor;
      return `<mark class="rss-highlight" style="--highlight-color: ${color}">${match}</mark>`;
    });
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

    const pattern = this.buildPattern(enabledWords);
    if (!pattern) {
      element.textContent = text;
      return;
    }

    // Clear the element
    element.empty();

    // Build fragments and create DOM nodes
    const fragments = this.buildFragments(text, pattern, enabledWords);
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
    pattern: RegExp,
    words: HighlightWord[],
  ): Array<{ text: string; isMatch: boolean; word?: HighlightWord }> {
    const fragments: Array<{
      text: string;
      isMatch: boolean;
      word?: HighlightWord;
    }> = [];

    const matches = [...text.matchAll(pattern)];
    if (matches.length === 0) {
      fragments.push({ text, isMatch: false });
      return fragments;
    }

    let lastIndex = 0;
    for (const match of matches) {
      const matchIndex = match.index ?? 0;
      const matchText = match[0];

      // Add text before the match
      if (matchIndex > lastIndex) {
        fragments.push({
          text: text.slice(lastIndex, matchIndex),
          isMatch: false,
        });
      }

      // Add the match
      fragments.push({
        text: matchText,
        isMatch: true,
        word: this.findWordForMatch(matchText, words),
      });

      lastIndex = matchIndex + matchText.length;
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
  private highlightTextNode(
    textNode: Text,
    pattern: RegExp,
    words: HighlightWord[],
  ): void {
    const text = textNode.textContent;
    if (!text) return;

    const matches = [...text.matchAll(pattern)];
    if (matches.length === 0) return;

    const parent = textNode.parentNode;
    if (!parent) return;

    // Build a list of fragments to insert
    const fragments: Array<{
      text: string;
      isMatch: boolean;
      word?: HighlightWord;
    }> = [];
    let lastIndex = 0;

    for (const match of matches) {
      const matchIndex = match.index ?? 0;
      const matchText = match[0];

      // Add text before the match
      if (matchIndex > lastIndex) {
        fragments.push({
          text: text.slice(lastIndex, matchIndex),
          isMatch: false,
        });
      }

      // Add the match
      fragments.push({
        text: matchText,
        isMatch: true,
        word: this.findWordForMatch(matchText, words),
      });

      lastIndex = matchIndex + matchText.length;
    }

    // Add remaining text after last match
    if (lastIndex < text.length) {
      fragments.push({
        text: text.slice(lastIndex),
        isMatch: false,
      });
    }

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
   * Build a regex pattern from the highlight words.
   * Each word can have its own wholeWord preference.
   */
  private buildPattern(words: HighlightWord[]): RegExp | null {
    if (words.length === 0) return null;

    // Sort words by length (longest first) to ensure longer matches are found first
    const sortedWords = [...words].sort(
      (a, b) => b.text.length - a.text.length,
    );

    // Build pattern with word boundaries per-word
    const patternParts = sortedWords.map((word) => {
      const escaped = this.escapeRegex(word.text);
      if (word.wholeWord) {
        return `(?<=^|\\W)(${escaped})(?=$|\\W)`;
      }
      return `(${escaped})`;
    });

    const flags = this.settings.caseSensitive ? "g" : "gi";
    return new RegExp(patternParts.join("|"), flags);
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Find the HighlightWord object for a matched text.
   */
  private findWordForMatch(
    matchText: string,
    words: HighlightWord[],
  ): HighlightWord | undefined {
    const compareText = this.settings.caseSensitive
      ? matchText
      : matchText.toLowerCase();

    return words.find((w) => {
      const wordText = this.settings.caseSensitive
        ? w.text
        : w.text.toLowerCase();
      return wordText === compareText;
    });
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
