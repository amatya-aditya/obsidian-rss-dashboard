/**
 * Finds the Reader's feed-first version toggle by role and accessible name
 * (testing-guide §10), not by its CSS class. Its name flips between
 * "Show fetched content" and "Show RSS content" as the selection changes.
 */
const TOGGLE_NAME = /^Show (?:fetched|RSS) content$/;

export function findContentToggle(
  root: ParentNode | null | undefined,
): HTMLButtonElement | null {
  const buttons = root?.querySelectorAll<HTMLButtonElement>("button") ?? [];
  for (const button of Array.from(buttons)) {
    if (TOGGLE_NAME.test((button.textContent ?? "").trim())) return button;
  }
  return null;
}
