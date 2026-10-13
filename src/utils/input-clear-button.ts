/** Class on the element that holds a clearable input and its clear button. */
export const INPUT_CLEAR_CONTAINER_CLASS = "rss-input-clear";

/**
 * Obsidian's own clear-button class (`SearchComponent`, 1.8.7 to 1.14.4). Its
 * app.css draws the filled circle-x, sizes it per platform, and colors it.
 */
export const INPUT_CLEAR_BUTTON_CLASS = "search-input-clear-button";

export interface InputClearButtonOptions {
  /**
   * Element that already holds only the input, used as the positioning box.
   * Omit to wrap the input in a new container in its current place.
   */
  container?: HTMLElement;
  /**
   * Make a new container fill its parent's width, for an input that already
   * spans its row. Ignored when `container` is given.
   */
  fill?: boolean;
  /** Accessible name of the button. Defaults to "Clear". */
  label?: string;
  /**
   * Runs after the input is emptied, in place of the `input` and `change`
   * events the button otherwise dispatches.
   */
  onClear?: () => void;
}

/**
 * Adds Obsidian's clear (circle-x) button inside a text input, at its end.
 *
 * Like Obsidian's `SearchComponent`, the button is hidden by CSS while the
 * input shows its placeholder, so it tracks values set by code as well as by
 * typing. An input without a placeholder gets a blank one for that rule.
 *
 * Clicking empties the input, then calls `onClear` or, without it, dispatches
 * `input` and `change` so the input's own listeners (a `TextComponent`'s
 * `onChange`, a commit-on-change handler) see the empty value. Focus stays in
 * the input. The button is a native `<button>`, so it needs no keyboard code.
 */
export function addInputClearButton(
  input: HTMLInputElement,
  options: InputClearButtonOptions = {},
): HTMLButtonElement {
  const container = options.container ?? wrapInput(input, options.fill);
  container.addClass(INPUT_CLEAR_CONTAINER_CLASS);
  if (!input.placeholder) input.placeholder = " ";

  // The plugin class lets input-clear-button.css outrank host button rules.
  const button = container.createEl("button", {
    cls: `${INPUT_CLEAR_BUTTON_CLASS} rss-input-clear-button`,
    attr: { type: "button", "aria-label": options.label ?? "Clear" },
  });
  // Keep focus (and a phone's keyboard) on the input, as Obsidian does.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    if (input.disabled || input.readOnly) return;
    input.value = "";
    if (options.onClear) {
      options.onClear();
    } else {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    input.focus();
  });
  return button;
}

function wrapInput(input: HTMLInputElement, fill?: boolean): HTMLElement {
  const parent = input.parentElement;
  if (!parent) {
    throw new Error("addInputClearButton needs an input that is in the DOM.");
  }
  const wrapper = parent.createDiv({
    cls: fill ? "rss-input-clear-fill" : "rss-input-clear-wrap",
  });
  parent.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  return wrapper;
}
