export {};

declare global {
  /**
   * Obsidian exposes its DOM creation helpers on window objects so elements can
   * be created in the correct popout document. The runtime API and official
   * linter support these methods, but the published API types omit them.
   */
  interface Window {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: DomElementInfo | string,
      callback?: (element: HTMLElementTagNameMap[K]) => void,
    ): HTMLElementTagNameMap[K];
    createEl(
      tag: string,
      options?: DomElementInfo | string,
      callback?: (element: HTMLElement) => void,
    ): HTMLElement;
    createDiv(
      options?: DomElementInfo | string,
      callback?: (element: HTMLDivElement) => void,
    ): HTMLDivElement;
    createSpan(
      options?: DomElementInfo | string,
      callback?: (element: HTMLSpanElement) => void,
    ): HTMLSpanElement;
    createSvg<K extends keyof SVGElementTagNameMap>(
      tag: K,
      options?: SvgElementInfo | string,
      callback?: (element: SVGElementTagNameMap[K]) => void,
    ): SVGElementTagNameMap[K];
    createFragment(
      callback?: (fragment: DocumentFragment) => void,
    ): DocumentFragment;
  }
}
