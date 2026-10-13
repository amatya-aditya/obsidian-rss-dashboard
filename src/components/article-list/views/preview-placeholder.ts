/** Render-time state only: never put placeholder text in article data or caches. */
export function shouldShowPreviewPlaceholder(
  showSummary: boolean,
  previewText: string,
  hasDisplayedImage: boolean,
): boolean {
  return showSummary && !previewText && !hasDisplayedImage;
}

export function renderPreviewPlaceholder(
  container: HTMLElement,
  className: string,
  descriptionId: string,
): HTMLElement {
  return container.createDiv({
    cls: className,
    text: "No description",
    attr: { id: descriptionId, role: "note" },
  });
}
