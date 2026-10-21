/**
 * The class the article element carries while a cover-image fetch runs (#1314).
 * The stylesheet keys the visible part off it, and the keyboard route reads it
 * to leave an already-running fetch alone (#1466).
 */
export const COVER_IMAGE_BUSY_CLASS = "rss-dashboard-cover-fetching";

/**
 * Runs a cover-image fetch with the progress state the article's element shows
 * (#1314). One implementation for both entry points — the in-card control and
 * the context menu — so the two cannot drift apart.
 *
 * The stylesheet keys the visible part off the class; `aria-busy` carries the
 * same state to a screen reader.
 */
export async function withCoverImageBusyState<T>(
  element: HTMLElement | null,
  run: () => Promise<T>,
): Promise<T> {
  element?.classList.add(COVER_IMAGE_BUSY_CLASS);
  element?.setAttribute("aria-busy", "true");
  try {
    return await run();
  } finally {
    element?.classList.remove(COVER_IMAGE_BUSY_CLASS);
    element?.removeAttribute("aria-busy");
  }
}
