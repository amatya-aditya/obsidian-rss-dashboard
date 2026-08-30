declare global {
  interface Node {
    /**
     * The window this node belongs to, matching Obsidian's DOM extension.
     */
    win: Window;
  }

  interface Document {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      opts?: {
        cls?: string;
        text?: string;
        attr?: Record<string, string>;
        [key: string]: unknown;
      },
    ): HTMLElementTagNameMap[K];
    createEl(
      tag: string,
      opts?: {
        cls?: string;
        text?: string;
        attr?: Record<string, string>;
        [key: string]: unknown;
      },
    ): HTMLElement;
    createDiv(
      opts?: string | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLDivElement;
    createSpan(
      opts?: string | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLSpanElement;
    createFragment(): DocumentFragment;
  }

  function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    opts?: {
      cls?: string;
      text?: string;
      attr?: Record<string, string>;
      [key: string]: unknown;
    } | string,
  ): HTMLElementTagNameMap[K];
  function createEl(
    tag: string,
    opts?: {
      cls?: string;
      text?: string;
      attr?: Record<string, string>;
      [key: string]: unknown;
    } | string,
  ): HTMLElement;
  function createDiv(
    opts?: string | { cls?: string; text?: string; attr?: Record<string, string>; [key: string]: unknown },
  ): HTMLDivElement;
  function createSpan(
    opts?: string | { cls?: string; text?: string; attr?: Record<string, string>; [key: string]: unknown },
  ): HTMLSpanElement;
  function createSvg<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string>,
  ): SVGElementTagNameMap[K];
  function createFragment(): DocumentFragment;

  interface HTMLElement {
    /**
     * Custom Obsidian method: removes all child nodes and clears text content
     */
    empty(): void;
    /**
     * Custom Obsidian method: sets the text content
     */
    setText(text: string): void;
    /**
     * Custom Obsidian method: adds CSS classes
     */
    addClass(...classes: string[]): void;
    /**
     * Custom Obsidian method: adds multiple CSS classes
     */
    addClasses(...classes: string[]): void;
    createDiv(
      opts?: string | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLDivElement;
    createSpan(
      opts?: string | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLSpanElement;
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      opts?: {
        cls?: string;
        text?: string;
        attr?: Record<string, string>;
        [key: string]: unknown;
      },
    ): HTMLElementTagNameMap[K];
    createEl(
      tag: string,
      opts?: {
        cls?: string;
        text?: string;
        attr?: Record<string, string>;
        [key: string]: unknown;
      },
    ): HTMLElement;
    appendText(text: string): void;
  }
}

export {};
