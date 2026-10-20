/**
 * Focus policy for an article row that leaves the rendered list. The list's
 * in-place removal and the dashboard's page rebuild both need the same answer,
 * so it lives here instead of in two components (#1380).
 */
const ROW_SELECTOR =
  ".rss-dashboard-article-item, .rss-dashboard-article-card, .rss-dashboard-feed-item";

const FOCUS_CONTROL_SELECTOR = ".rss-dashboard-read-toggle";

const FIRST_ROW_CONTROL_SELECTOR = ROW_SELECTOR.split(",")
  .map((selector) => `${selector.trim()} ${FOCUS_CONTROL_SELECTOR}`)
  .join(", ");

export type ArticleListFocusTarget =
  { guid: string; feedUrl: string | undefined } | { list: true };

/**
 * The control focus should land on when `targetEl` leaves the list: the next
 * article's read control, else the previous one, else the list itself so
 * keyboard navigation continues (#1385).
 */
export function resolveFocusAfterRemoval(
  targetEl: HTMLElement,
  listEl: HTMLElement | null,
): HTMLElement | null {
  if (!listEl) return null;

  const rows = Array.from(
    listEl.querySelectorAll<HTMLElement>(ROW_SELECTOR),
  ).filter((row) => !row.classList.contains("rss-dashboard-search-hidden"));
  const index = rows.indexOf(targetEl);

  for (const row of [rows[index + 1], rows[index - 1]]) {
    const control = row?.querySelector<HTMLElement>(FOCUS_CONTROL_SELECTOR);
    if (control) return control;
  }

  listEl.setAttr("tabindex", "-1");
  return listEl;
}

/**
 * Remembers where focus was before a rebuild replaces the list. The row is
 * identified by GUID and feed URL because the rebuilt DOM has new elements.
 */
export function captureArticleListFocus(
  container: HTMLElement,
): ArticleListFocusTarget | null {
  const active = activeDocument.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  const list = container.querySelector<HTMLElement>(
    ".rss-dashboard-articles-list",
  );
  if (!list) return null;
  if (active === list) return { list: true };
  if (!list.contains(active)) return null;

  const row = active.closest<HTMLElement>(ROW_SELECTOR);
  if (!row || !list.contains(row)) return { list: true };
  return {
    guid: row.id.replace(/^article-/, ""),
    feedUrl: row.dataset.feedUrl,
  };
}

/**
 * Restores focus after a rebuild. A row that still exists keeps focus on its
 * read control; otherwise the first row's control is the nearest place to
 * continue, and an empty page falls back to the list.
 */
export function restoreArticleListFocus(
  container: HTMLElement,
  target: ArticleListFocusTarget | null,
): void {
  if (!target) return;
  const list = container.querySelector<HTMLElement>(
    ".rss-dashboard-articles-list",
  );
  if (!list) return;

  if ("guid" in target) {
    const row = Array.from(
      list.querySelectorAll<HTMLElement>(ROW_SELECTOR),
    ).find(
      (candidate) =>
        candidate.id === `article-${target.guid}` &&
        (target.feedUrl === undefined ||
          candidate.dataset.feedUrl === target.feedUrl),
    );
    const control = row?.querySelector<HTMLElement>(FOCUS_CONTROL_SELECTOR);
    if (control) {
      control.focus({ preventScroll: true });
      return;
    }
    // The focused row left this page entirely; the first row of the clamped
    // page is the nearest place to continue from.
    const first = list.querySelector<HTMLElement>(FIRST_ROW_CONTROL_SELECTOR);
    if (first) {
      first.focus({ preventScroll: true });
      return;
    }
  }

  list.setAttr("tabindex", "-1");
  list.focus({ preventScroll: true });
}
