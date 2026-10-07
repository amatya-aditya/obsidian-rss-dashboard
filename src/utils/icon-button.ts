import { setIcon } from "obsidian";

/** Values `aria-haspopup` accepts when a button opens a popup. */
export type IconButtonPopup =
  boolean | "menu" | "listbox" | "tree" | "grid" | "dialog";

export interface IconButtonOptions {
  /**
   * Accessible name, exposed as `aria-label`. Required: an icon button has no
   * visible text, so without it the control has no name (WCAG 4.1.2). The type
   * rejects an omitted label and `createIconButton` throws on a blank one.
   */
  label: string;
  /** Lucide icon id passed to `setIcon`. */
  icon: string;
  /** Element to append the button to. Omit to build a detached button. */
  parent?: HTMLElement;
  /** Space-separated CSS classes. */
  cls?: string;
  /** Test hook, written as `data-rss-action`. Only this helper writes it. */
  action?: string;
  /** Test hook, written as `data-rss-region`. Only this helper writes it. */
  region?: string;
  /** Toggle state, written as `aria-pressed`. Omit for a plain button. */
  pressed?: boolean;
  /** Disclosure state, written as `aria-expanded`. Omit for a plain button. */
  expanded?: boolean;
  /** Popup kind, written as `aria-haspopup`. Omit for a plain button. */
  hasPopup?: IconButtonPopup;
  /** Click handler. A native button also fires it for Enter and Space. */
  onClick?: (event: MouseEvent) => void;
}

/**
 * The `action` an icon button was created with, or null. A stable identity for
 * code that must recognise the "same" button after a re-render, since the
 * accessible name can change at runtime (tooltips are written to `aria-label`).
 */
export function getIconButtonAction(button: HTMLElement): string | null {
  return button.getAttribute("data-rss-action");
}

/**
 * Creates a native `<button type="button">` icon control (WCAG 2.2 2.1.1 and
 * 4.1.2). The browser supplies the button role, focusability and Enter/Space
 * activation, so the button carries no `role`, `tabindex` or keydown handler.
 *
 * This is the one place `data-rss-action` and `data-rss-region` are written.
 * Tests find controls by role and name; the hooks only tell apart controls that
 * share a name and must never be the only way to reach one.
 */
export function createIconButton(
  options: IconButtonOptions,
): HTMLButtonElement {
  const label = typeof options.label === "string" ? options.label.trim() : "";
  if (label === "") {
    throw new Error(
      "createIconButton needs a non-empty accessible name (the label option).",
    );
  }

  const button = activeWindow.createEl("button", {
    cls: options.cls,
    attr: { type: "button", "aria-label": options.label },
  });
  options.parent?.appendChild(button);

  if (options.pressed !== undefined) {
    button.setAttribute("aria-pressed", String(options.pressed));
  }
  if (options.expanded !== undefined) {
    button.setAttribute("aria-expanded", String(options.expanded));
  }
  if (options.hasPopup !== undefined) {
    button.setAttribute("aria-haspopup", String(options.hasPopup));
  }
  if (options.action !== undefined) {
    button.setAttribute("data-rss-action", options.action);
  }
  if (options.region !== undefined) {
    button.setAttribute("data-rss-region", options.region);
  }

  setIcon(button, options.icon);

  const onClick = options.onClick;
  if (onClick) {
    button.addEventListener("click", (event: MouseEvent) => onClick(event));
  }

  return button;
}
