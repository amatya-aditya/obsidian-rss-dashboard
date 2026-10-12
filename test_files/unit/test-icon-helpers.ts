/**
 * Helpers for asserting which icon the Obsidian stub rendered.
 *
 * The stub models Obsidian's `setIcon` (ADR 0014): it writes a
 * `<svg class="svg-icon lucide-<id>">` into the element instead of the old
 * `data-icon` attribute, so tests read the icon from the rendered svg.
 *
 * Obsidian resolves aliases and stamps the id it chose, not the name passed in
 * (`setIcon(el, "trash")` renders `lucide-trash-2`), so `lucideIconId` returns
 * the resolved id and the expectation names the id Obsidian actually renders.
 */

/** The lucide id rendered into `container` (for example `play`), or null. */
export function lucideIconId(
  container: ParentNode | null | undefined,
): string | null {
  const className =
    container?.querySelector("svg.svg-icon")?.getAttribute("class") ?? "";
  const match = /\blucide-([a-z0-9-]+)\b/.exec(className);
  return match ? match[1] : null;
}

/** The button or extra-button whose icon is `lucideIconId`, or null. */
export function findIconButton(
  container: ParentNode | null | undefined,
  lucideId: string,
): HTMLElement | null {
  return (
    container
      ?.querySelector(`svg.svg-icon.lucide-${lucideId}`)
      ?.closest("button, .extra-setting-button") ?? null
  );
}
