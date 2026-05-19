declare global {
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
  }
}

export {};
