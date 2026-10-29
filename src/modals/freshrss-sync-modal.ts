import { App, Setting } from "obsidian";
import { AccessibleModal } from "../utils/accessible-modal";
import type { FreshRssPendingFacetMutation } from "../services/freshrss-connection-scope-repository";
import type {
  FreshRssSyncPreviewOutcome,
  FreshRssSyncRunStatus,
} from "../services/freshrss-sync-coordinator";

export interface FreshRssSyncModalHost {
  getFreshRssSyncPreview(): Promise<FreshRssSyncPreviewOutcome>;
  getFreshRssPendingMutations(): Promise<FreshRssPendingFacetMutation[]>;
  syncFreshRssNow(): Promise<FreshRssSyncRunStatus>;
  cancelFreshRssSyncNow(): void;
  retryFreshRssMutation(operationId: string): Promise<void>;
  cancelFreshRssMutation(operationId: string): Promise<void>;
  getFreshRssStateSyncMode(): "two-way" | "receive-only";
}

/** Reviews the local FreshRSS sync plan and terminal mutations before retry. */
export class FreshRssSyncModal extends AccessibleModal {
  private running = false;
  private opened = false;

  constructor(
    app: App,
    private readonly host: FreshRssSyncModalHost,
  ) {
    super(app);
  }

  onOpen(): void {
    this.opened = true;
    this.modalEl.addClass("rss-freshrss-sync-modal");
    void this.render();
  }

  onClose(): void {
    this.opened = false;
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    new Setting(contentEl).setName("FreshRSS sync preview").setHeading();
    const mode = this.host.getFreshRssStateSyncMode();
    const incoming = contentEl.createEl("section", {
      cls: "rss-freshrss-sync-preview",
    });
    incoming.setAttribute("aria-label", "Incoming FreshRSS changes");
    incoming.createEl("h3", { text: "Incoming" });
    const incomingList = incoming.createDiv({
      cls: "rss-freshrss-sync-preview-list",
    });
    incomingList.createEl("p", {
      text: "Loading subscriptions and recent articles…",
    });
    const outgoing = contentEl.createEl("section", {
      cls: "rss-freshrss-sync-preview",
    });
    outgoing.setAttribute("aria-label", "Outgoing FreshRSS changes");
    outgoing.createEl("h3", { text: "Outgoing article state" });
    const failures = contentEl.createDiv({ cls: "rss-freshrss-sync-failures" });
    failures.setAttribute("aria-label", "Failed FreshRSS mutations");
    // The preview can run to dozens of screens, so the status and buttons live
    // in a footer that stays pinned to the bottom of the scrolling content.
    const footer = contentEl.createDiv({ cls: "rss-freshrss-sync-footer" });
    const status = footer.createEl("p", { cls: "rss-freshrss-sync-status" });
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Loading FreshRSS preview.";
    const actions = footer.createDiv({ cls: "rss-dashboard-modal-buttons" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => {
      if (this.running) {
        this.host.cancelFreshRssSyncNow();
        status.textContent = "Stopping FreshRSS sync.";
      } else {
        this.close();
      }
    });
    const start = actions.createEl("button", {
      text: "Start sync",
    });
    start.disabled = true;
    start.addEventListener("click", () => {
      if (this.running || start.disabled) return;
      this.running = true;
      status.textContent = "Sync in progress.";
      start.disabled = true;
      void this.host
        .syncFreshRssNow()
        .then((result) => {
          status.textContent = this.runStatusText(result);
        })
        .catch(() => {
          status.textContent = "FreshRSS sync failed.";
        })
        .finally(() => {
          this.running = false;
          if (!this.opened) return;
          start.textContent = "Start sync";
          start.disabled = false;
        });
    });

    const [previewResult, pendingResult] = await Promise.allSettled([
      this.host.getFreshRssSyncPreview(),
      this.host.getFreshRssPendingMutations(),
    ]);
    if (!this.opened) return;

    if (
      previewResult.status === "fulfilled" &&
      previewResult.value.outcome === "ready"
    ) {
      this.renderIncomingPreview(incomingList, previewResult.value);
      this.renderOutgoingPreview(
        outgoing,
        mode,
        pendingResult,
        previewResult.value.labelConflicts,
      );
      status.textContent = previewResult.value.partial
        ? "Preview ready; some recent articles could not be loaded."
        : "Preview ready.";
      start.disabled = false;
    } else {
      incomingList.empty();
      incomingList.createEl("p", {
        text: this.previewFailureText(previewResult),
      });
      outgoing.createEl("p", {
        text: "Outgoing mutation details are unavailable until the preview can be loaded.",
      });
      status.textContent =
        "FreshRSS preview unavailable. Sync was not started.";
      start.disabled = true;
    }
    this.renderFailures(failures, pendingResult);
  }

  private renderIncomingPreview(
    container: HTMLDivElement,
    preview: Extract<FreshRssSyncPreviewOutcome, { outcome: "ready" }>,
  ): void {
    container.empty();
    if (preview.subscriptions.length === 0) {
      container.createEl("p", {
        text: "No FreshRSS subscriptions were found.",
      });
      return;
    }
    for (const subscription of preview.subscriptions) {
      const group = container.createDiv({ cls: "rss-freshrss-preview-feed" });
      group.createEl("h4", { text: subscription.title });
      group.createEl("p", { text: subscription.url });
      if (subscription.articles.length === 0) {
        group.createEl("p", {
          text: subscription.partial
            ? "Recent articles could not be loaded."
            : "No recent articles were found.",
        });
      } else {
        const articles = group.createEl("ul");
        for (const article of subscription.articles) {
          articles.createEl("li", {
            text: article.link
              ? `${article.title} — ${article.link}`
              : article.title,
          });
        }
      }
    }
  }

  private renderOutgoingPreview(
    container: HTMLElement,
    mode: "two-way" | "receive-only",
    pendingResult: PromiseSettledResult<FreshRssPendingFacetMutation[]>,
    labelConflicts: string[],
  ): void {
    const previous = container.querySelector(".rss-freshrss-outgoing-list");
    previous?.remove();
    const list = container.createDiv({ cls: "rss-freshrss-outgoing-list" });
    for (const name of labelConflicts) {
      list.createEl("p", {
        cls: "rss-freshrss-category-conflict",
        text: `FreshRSS category "${name}" cannot sync as an article label. The Dashboard tag will be kept locally.`,
      });
    }
    if (pendingResult.status !== "fulfilled") {
      list.createEl("p", {
        text: "Pending article-state changes could not be loaded.",
      });
      return;
    }
    const mutations = pendingResult.value;
    list.createEl("p", {
      text:
        mode === "two-way"
          ? "Read, starred, and normalized-label changes queued for FreshRSS:"
          : "Receive-only is active. These local changes will wait until Two-way is enabled:",
    });
    if (mutations.length === 0) {
      list.createEl("p", { text: "No pending article-state changes." });
      return;
    }
    const entries = list.createEl("ul");
    for (const mutation of mutations) {
      const desired =
        mutation.facet === "labels"
          ? mutation.desiredState.join(", ") || "no labels"
          : mutation.desiredState
            ? "yes"
            : "no";
      entries.createEl("li", {
        text: `${mutation.facet}: ${desired} (${mutation.remoteArticleId})${mutation.retryDisposition === "manual" ? " — retry needed" : ""}`,
      });
    }
  }

  private renderFailures(
    container: HTMLDivElement,
    pendingResult: PromiseSettledResult<FreshRssPendingFacetMutation[]>,
  ): void {
    container.empty();
    if (pendingResult.status !== "fulfilled") {
      container.createEl("p", {
        text: "Failed mutation recovery is unavailable because saved sync state could not be read.",
      });
      container.setAttribute("role", "alert");
      return;
    }
    container.removeAttribute("role");
    for (const mutation of pendingResult.value.filter(
      (item) => item.retryDisposition === "manual",
    )) {
      const row = container.createDiv({ cls: "rss-freshrss-sync-failure" });
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", `Failed ${mutation.facet} update`);
      row.createSpan({
        text: `${mutation.facet}: ${mutation.lastError ?? "Update failed"}`,
      });
      row
        .createEl("button", { text: "Retry" })
        .addEventListener("click", () => {
          void this.recoverMutation(mutation.operationId, "retry", container);
        });
      row
        .createEl("button", { text: "Cancel mutation" })
        .addEventListener("click", () => {
          void this.recoverMutation(mutation.operationId, "cancel", container);
        });
    }
  }

  private async recoverMutation(
    operationId: string,
    action: "retry" | "cancel",
    container: HTMLDivElement,
  ): Promise<void> {
    try {
      if (action === "retry") {
        await this.host.retryFreshRssMutation(operationId);
      } else {
        await this.host.cancelFreshRssMutation(operationId);
      }
      this.renderFailures(container, {
        status: "fulfilled",
        value: await this.host.getFreshRssPendingMutations(),
      });
    } catch {
      container.setAttribute("role", "alert");
      container.empty();
      container.createEl("p", {
        text: "The failed mutation could not be updated. Try again.",
      });
    }
  }

  private previewFailureText(
    result: PromiseSettledResult<FreshRssSyncPreviewOutcome>,
  ): string {
    if (result.status === "rejected") {
      return "The FreshRSS preview could not be loaded. Check the connection and try again.";
    }
    switch (result.value.outcome) {
      case "credentials-rejected":
        return "FreshRSS rejected the saved credentials. Test the connection before syncing.";
      case "scope-mismatch":
        return "The FreshRSS account changed. Test the connection before syncing.";
      case "server-unavailable":
        return "FreshRSS did not return a preview. Check the server and try again.";
    }
    return "FreshRSS preview could not be loaded.";
  }

  private runStatusText(status: FreshRssSyncRunStatus): string {
    switch (status) {
      case "completed":
        return "FreshRSS sync completed.";
      case "incomplete":
        return "FreshRSS sync incomplete. Article-state reconciliation could not be confirmed.";
      case "failed":
        return "FreshRSS sync failed.";
      case "cancelled":
        return "FreshRSS sync cancelled.";
      case "not-started":
        return "FreshRSS sync did not start.";
    }
    return "FreshRSS sync failed.";
  }
}
