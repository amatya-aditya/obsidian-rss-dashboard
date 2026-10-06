import { setIcon } from "obsidian";

/**
 * Fills a dialog button with an icon and a text label, like the Save article
 * dialog's actions. Returns the label span so the caller can retitle it.
 */
export function addActionButtonContent(
  button: HTMLElement,
  iconName: string,
  label: string,
): HTMLSpanElement {
  const icon = button.createSpan({
    cls: "rss-dashboard-custom-save-button-icon",
    attr: { "aria-hidden": "true" },
  });
  setIcon(icon, iconName);
  return button.createSpan({
    cls: "rss-dashboard-custom-save-button-label",
    text: label,
  });
}
