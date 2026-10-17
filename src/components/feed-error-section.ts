import type { FeedErrorDetail } from "../utils/feed-error";
import {
  IMPORT_FAILURE_LABEL,
  REFRESH_FAILURE_LABEL,
} from "../utils/feed-error";

/**
 * Renders one feed's error kinds as labelled, read-only groups: a heading
 * naming the kind and the stored message in full. Refresh failure first.
 *
 * Shared by the feed error dialog and the edit feed modal's stored-error area
 * so both surfaces announce the same way (WCAG 2.2 4.1.2 Name, Role, Value;
 * the heading is the group's name, so the message is never just prose under an
 * unexplained icon). Selectability and layout live in `styles/modals.css`.
 */
export function renderFeedErrorKinds(
  parent: HTMLElement,
  detail: FeedErrorDetail,
  options: { refreshLabel?: string } = {},
): void {
  const kinds: Array<[string, string | null]> = [
    [options.refreshLabel ?? REFRESH_FAILURE_LABEL, detail.refreshError],
    [IMPORT_FAILURE_LABEL, detail.importError],
  ];
  for (const [label, message] of kinds) {
    if (!message) continue;
    const labelId = `rss-feed-error-kind-${Math.random().toString(36).slice(2)}`;
    const kind = parent.createDiv({ cls: "rss-dashboard-feed-error-kind" });
    kind.setAttr("role", "group");
    kind.setAttr("aria-labelledby", labelId);
    kind.createEl("h4", {
      cls: "rss-dashboard-feed-error-kind-label",
      text: label,
      attr: { id: labelId },
    });
    kind.createDiv({
      cls: "rss-dashboard-feed-error-kind-message",
      text: message,
    });
  }
}
