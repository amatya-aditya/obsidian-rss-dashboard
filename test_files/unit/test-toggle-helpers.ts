/**
 * Helpers for reading and driving an Obsidian `Setting` toggle.
 *
 * Obsidian renders a toggle as a `label.checkbox-container` wrapping an
 * `input[type=checkbox]`; `setValue` toggles `is-enabled` on the label and
 * leaves the inner input's `checked` unset (ADR 0014, observed on 1.14.4). A
 * test that reads the on/off state must therefore read the label, not the
 * input's `checked`.
 */

/** The toggle's label, the element that carries the on/off state. */
export function getToggleLabel(
  target: ParentNode | null | undefined,
): Element | null {
  if (!target) {
    return null;
  }
  const label =
    target instanceof Element ? target.closest(".checkbox-container") : null;
  return label ?? target.querySelector(".checkbox-container");
}

/** Whether a toggle is on, read from its label's `is-enabled` class. */
export function isToggleOn(target: ParentNode | null | undefined): boolean {
  return getToggleLabel(target)?.classList.contains("is-enabled") ?? false;
}

/**
 * Simulates a user toggling the switch: assigns the input and fires its
 * `change` event, the path the stub models for a toggle interaction.
 */
export function setToggle(
  toggle: HTMLInputElement | null | undefined,
  on: boolean,
): void {
  if (!toggle) {
    return;
  }
  toggle.checked = on;
  toggle.dispatchEvent(new Event("change"));
}
