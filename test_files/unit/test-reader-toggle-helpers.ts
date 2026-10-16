/**
 * Finds the Reader's feed-first version toggle by role (`button`) and
 * accessible name (testing-guide §10), not by its CSS class. The name comes
 * from `aria-label`, else the visible text, and flips between
 * "Show fetched content" and "Show RSS content" as the selection changes.
 */
const TOGGLE_NAME = /^Show (?:fetched|RSS) content$/;

function accessibleName(button: HTMLElement): string {
  return (button.getAttribute("aria-label") ?? button.textContent ?? "").trim();
}

export function findContentToggle(
  root: ParentNode | null | undefined,
): HTMLButtonElement | null {
  const buttons =
    root?.querySelectorAll<HTMLButtonElement>('button, [role="button"]') ?? [];
  for (const button of Array.from(buttons)) {
    if (TOGGLE_NAME.test(accessibleName(button))) return button;
  }
  return null;
}
