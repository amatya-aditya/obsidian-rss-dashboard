/**
 * Selection and focus policy for an article row that leaves the rendered list.
 * The list's in-place removal and the dashboard's page rebuild both need the
 * same answer, so it lives here instead of in two components (#1380, #1468).
 */
export const ARTICLE_ROW_SELECTOR =
  ".rss-dashboard-article-item, .rss-dashboard-article-card, .rss-dashboard-feed-item";

/**
 * The row that becomes the selection when `targetEl` leaves the list: the next
 * rendered row, else the previous one. The order is the one on screen, so
 * grouped sections, collapsed sections, and rows the local search hides all
 * count the way the user sees them (#1468).
 */
export function findRenderedNeighbourRow(
  targetEl: HTMLElement,
  listEl: HTMLElement | null,
): HTMLElement | null {
  if (!listEl) return null;

  const rows = Array.from(
    listEl.querySelectorAll<HTMLElement>(ARTICLE_ROW_SELECTOR),
  ).filter(
    (row) =>
      !row.classList.contains("rss-dashboard-search-hidden") &&
      !row.closest(".rss-dashboard-feed-section-cards.collapsed"),
  );
  const index = rows.indexOf(targetEl);
  if (index === -1) return null;
  return rows[index + 1] ?? rows[index - 1] ?? null;
}

/**
 * Whether keyboard focus sits in the article list, so a rebuild that replaces
 * the list can hand focus back to the dashboard afterwards (#1468).
 */
export function captureArticleListFocus(container: HTMLElement): boolean {
  const active = activeDocument.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  const list = container.querySelector<HTMLElement>(
    ".rss-dashboard-articles-list",
  );
  return list !== null && (active === list || list.contains(active));
}

/**
 * Returns focus to the dashboard container after a rebuild. It never restores
 * focus into a card's inner control: a control swallows the dashboard keymap,
 * which leaves the next shortcut dead (#1468).
 */
export function restoreArticleListFocus(
  container: HTMLElement,
  hadFocus: boolean,
): void {
  if (hadFocus) container.focus({ preventScroll: true });
}
