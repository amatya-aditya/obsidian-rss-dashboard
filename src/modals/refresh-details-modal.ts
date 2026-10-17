import { App } from "obsidian";
import { renderFeedErrorKinds } from "../components/feed-error-section";
import type { FeedErrorDetail } from "../utils/feed-error";
import { formatFeedErrorDiagnostic } from "../utils/feed-error";
import { copyTextToClipboard } from "../utils/export-utils";
import { AccessibleModal } from "../utils/accessible-modal";

/** The two entry-point titles. The title names the dialog. */
export type RefreshDetailsModalTitle = "Refresh details" | "Feed error";

export interface RefreshDetailsModalInput {
  title: RefreshDetailsModalTitle;
  /** The existing non-error refresh detail lines. */
  lines: string[];
  /**
   * The failing feeds to show, refresh failure first. One entry for a single
   * feed (the badge, a feed's own details), several for a multi-feed scope.
   */
  errors: FeedErrorDetail[];
}

/**
 * The one dialog behind every feed-error entry point: the sidebar error badge,
 * the sidebar's `Refresh details` / `Feed error` items, and the dashboard
 * status bar's error button. It keeps the title `Refresh details` when opened
 * from a details item and uses `Feed error` when opened from a badge.
 *
 * Shows both kinds of feed error when both are stored, at full length, each
 * with a copy action. On mobile this replaces the anchored popover, which has
 * no room to be read beside the full-width sidebar.
 */
export class RefreshDetailsModal extends AccessibleModal {
  private readonly input: RefreshDetailsModalInput;

  constructor(app: App, input: RefreshDetailsModalInput) {
    super(app);
    this.input = input;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    // Only a scoped class: Obsidian lays out and animates phone modals itself,
    // and the shared `rss-dashboard-modal` class re-centers with a transform
    // that pushes a phone modal off-screen.
    this.modalEl.addClass("rss-dashboard-refresh-details-modal");

    this.setTitle(this.input.title);
    for (const line of this.input.lines) {
      contentEl.createDiv({
        cls: "rss-dashboard-refresh-details-line",
        text: line,
      });
    }
    this.renderErrors(contentEl);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderErrors(contentEl: HTMLElement): void {
    const { errors } = this.input;
    if (errors.length === 0) return;

    const section = contentEl.createDiv({
      cls: "rss-dashboard-feed-error-section",
    });
    const perFeedCopy = errors.length > 1;
    for (const detail of errors) {
      const entry = section.createDiv({
        cls: "rss-dashboard-feed-error-entry",
      });
      entry.createDiv({
        cls: "rss-dashboard-feed-error-feed-title",
        text: detail.feedTitle,
      });
      renderFeedErrorKinds(entry, detail);
      this.appendCopyAction(
        entry,
        perFeedCopy ? "Copy" : "Copy error",
        formatFeedErrorDiagnostic(detail),
      );
    }
    if (perFeedCopy) {
      this.appendCopyAction(
        section,
        "Copy all",
        errors.map(formatFeedErrorDiagnostic).join("\n\n"),
      );
    }
  }

  /**
   * The confirmation is an inline `role="status"`, created empty and written
   * after the copy resolves: a live region inserted already holding its text
   * usually emits no accessibility change (#1119). Copy actions outside a
   * dialog keep their `Notice`.
   */
  private appendCopyAction(
    parent: HTMLElement,
    label: string,
    payload: string,
  ): void {
    const button = parent.createEl("button", {
      cls: "rss-dashboard-feed-error-copy",
      text: label,
      attr: { type: "button" },
    });
    const status = parent.createDiv({
      cls: "rss-dashboard-feed-error-copy-status",
      attr: { role: "status" },
    });
    button.addEventListener("click", () => {
      void copyTextToClipboard(payload).then((result) => {
        status.setText(result === "copied" ? "Copied" : "Copy failed");
      });
    });
  }
}
