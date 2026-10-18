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
  element?.classList.add("rss-dashboard-cover-fetching");
  element?.setAttribute("aria-busy", "true");
  try {
    return await run();
  } finally {
    element?.classList.remove("rss-dashboard-cover-fetching");
    element?.removeAttribute("aria-busy");
  }
}
