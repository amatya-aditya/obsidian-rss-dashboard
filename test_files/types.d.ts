declare global {
  interface Document {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      opts?: {
        cls?: string;
        text?: string;
        attr?: Record<string, string>;
        [key: string]: any;
      },
    ): HTMLElementTagNameMap[K];
    createDiv(
      opts?: string | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLDivElement;
    createSpan(
      opts?: string | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLSpanElement;
    createFragment(): DocumentFragment;
  }

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
        [key: string]: any;
      },
    ): HTMLElementTagNameMap[K];
    appendText(text: string): void;
  }
}

export {};
