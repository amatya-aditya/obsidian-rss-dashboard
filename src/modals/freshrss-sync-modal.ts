import { App, Setting } from "obsidian";
import { AccessibleModal } from "../utils/accessible-modal";
import type { FreshRssPendingFacetMutation } from "../services/freshrss-connection-scope-repository";

export interface FreshRssSyncModalHost {
  getFreshRssPendingMutations(): Promise<FreshRssPendingFacetMutation[]>;
  syncFreshRssNow(): Promise<void>;
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
    contentEl.createEl("p", {
      text: "Incoming subscriptions and up to 50 recent articles per subscription will be reviewed and imported.",
    });
    const incoming = contentEl.createEl("section", {
      cls: "rss-freshrss-sync-preview",
    });
    incoming.setAttribute("aria-label", "Incoming FreshRSS changes");
    incoming.createEl("h3", { text: "Incoming" });
    incoming.createEl("p", { text: "Subscriptions and recent articles" });
    const outgoing = contentEl.createEl("section", {
      cls: "rss-freshrss-sync-preview",
    });
    outgoing.setAttribute("aria-label", "Outgoing FreshRSS changes");
    outgoing.createEl("h3", { text: "Outgoing article state" });
    outgoing.createEl("p", {
      text:
        mode === "two-way"
          ? "Read, starred, and normalized-label changes will be shared."
          : "Receive-only is active; outgoing article-state changes are paused.",
    });
    const pending = await this.host.getFreshRssPendingMutations();
    if (!this.opened) return;
    const failures = contentEl.createDiv({ cls: "rss-freshrss-sync-failures" });
    for (const mutation of pending.filter(
      (item) => item.retryDisposition === "manual",
    )) {
      const row = failures.createDiv({ cls: "rss-freshrss-sync-failure" });
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", `Failed ${mutation.facet} update`);
      row.createSpan({
        text: `${mutation.facet}: ${mutation.lastError ?? "Update failed"}`,
      });
      row
        .createEl("button", { text: "Retry" })
        .addEventListener("click", () => {
          void this.host
            .retryFreshRssMutation(mutation.operationId)
            .then(() => this.render());
        });
      row
        .createEl("button", { text: "Cancel mutation" })
        .addEventListener("click", () => {
          void this.host
            .cancelFreshRssMutation(mutation.operationId)
            .then(() => this.render());
        });
    }
    const status = contentEl.createEl("p", { cls: "rss-freshrss-sync-status" });
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = this.running ? "Sync in progress." : "Ready to sync.";
    const actions = contentEl.createDiv({ cls: "rss-dashboard-modal-buttons" });
    actions
      .createEl("button", { text: "Cancel" })
      .addEventListener("click", () => {
        if (this.running) this.host.cancelFreshRssSyncNow();
        this.close();
      });
    const start = actions.createEl("button", {
      text: this.running ? "Syncing…" : "Start sync",
    });
    start.disabled = this.running;
    start.addEventListener("click", () => {
      if (this.running) return;
      this.running = true;
      status.textContent = "Sync in progress.";
      start.disabled = true;
      void this.host.syncFreshRssNow().finally(() => {
        this.running = false;
        if (!this.opened) return;
        status.textContent = "Sync finished.";
        start.textContent = "Start sync";
        start.disabled = false;
      });
    });
  }
}
