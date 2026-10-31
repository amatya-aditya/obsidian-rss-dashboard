import { createIconButton } from "../utils/icon-button";
import { randomHexColor } from "../utils/tag-colors";

export interface RandomizeColorButtonOptions {
  /** The native color picker this button fills in. */
  input: HTMLInputElement;
  /** Where to append the button. Omit to place it right after the picker. */
  parent?: HTMLElement;
}

/**
 * A dice button that gives a picker a random color. The color can be anything,
 * so a roll may be hard to read against the paired color. The value is applied
 * as a normal edit (`input`, then `change`), so everything already listening
 * to the picker reacts exactly as it would to a hand-picked color.
 */
export function addRandomizeColorButton(
  options: RandomizeColorButtonOptions,
): HTMLButtonElement {
  const { input, parent } = options;
  const button = createIconButton({
    parent,
    cls: "clickable-icon rss-dashboard-tag-color-randomize",
    label: "Randomize",
    icon: "dices",
    onClick: (event) => {
      event.preventDefault();
      input.value = randomHexColor();
      const ownerWindow = input.ownerDocument.defaultView;
      if (!ownerWindow) return;
      input.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
      input.dispatchEvent(new ownerWindow.Event("change", { bubbles: true }));
    },
  });
  if (!parent) input.after(button);
  return button;
}
