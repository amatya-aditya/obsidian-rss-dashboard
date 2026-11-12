import { App, Setting } from "obsidian";
import { AccessibleModal } from "../utils/accessible-modal";
import {
  identifyConflictingArticles,
  type FeedShardConflictContext,
} from "../services/feed-shard-reconcile";

export interface FeedConflictRecoveryActions {
  list(): Promise<string[]>;
  read(name: string): Promise<FeedShardConflictContext>;
  resolve(
    name: string,
    choices: Readonly<Record<string, "local" | "synced">>,
    displayedContext: FeedShardConflictContext,
  ): Promise<boolean>;
  stripState?: boolean;
}

export class FeedConflictRecoveryModal extends AccessibleModal {
  constructor(
    app: App,
    private readonly actions: FeedConflictRecoveryActions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass(
      "rss-dashboard-modal",
      "rss-dashboard-modal-container",
    );
    void this.render();
  }

  private async render(message?: string): Promise<void> {
    const content = this.contentEl;
    content.empty();
    if (message) content.createEl("p", { text: message });
    new Setting(content).setName("Resolve feed conflicts").setHeading();
    try {
      const names = await this.actions.list();
      if (names.length === 0) {
        content.createEl("p", { text: "There are no saved conflicts." });
        return;
      }
      const name = names[names.length - 1];
      if (!name) return;
      const context = await this.actions.read(name);
      const ids = identifyConflictingArticles(context, this.actions.stripState);
      content.createEl("p", { text: `Feed: ${context.local.feedUrl}` });
      content.createEl("p", {
        text: "Choose which version to keep for each conflict. Other independent edits will be merged.",
      });
      const choices: Record<string, "local" | "synced"> = {};
      const controls = content.createDiv();
      const save = content.createEl("button", {
        text: "Save choices",
        cls: "mod-cta",
      });
      save.disabled = ids.length > 0;
      ids.forEach((id, index) => {
        const local = context.local.items.find((item) => item.guid === id);
        const synced = context.incoming.items.find((item) => item.guid === id);
        const row = controls.createDiv();
        row.createEl("h3", { text: local?.title || synced?.title || id });
        row.createEl("p", {
          text: `Local: ${local?.title ?? "Deleted locally"} | Synced: ${synced?.title ?? "Deleted on synced device"}`,
        });
        const details = row.createEl("details");
        details.createEl("summary", { text: "Compare article details" });
        details.createEl("pre", {
          text: `Local:\n${JSON.stringify(local ?? null, null, 2)}\n\nSynced:\n${JSON.stringify(synced ?? null, null, 2)}`,
        });
        const label = row.createEl("label", {
          text: "Choose version",
          attr: { for: `rss-conflict-${index}` },
        });
        const select = row.createEl("select", {
          attr: { id: `rss-conflict-${index}` },
        });
        select.createEl("option", { text: "Choose…", value: "" });
        select.createEl("option", {
          text: "Keep local version",
          value: "local",
        });
        select.createEl("option", {
          text: "Keep synced version",
          value: "synced",
        });
        label.appendChild(select);
        select.addEventListener("change", () => {
          if (select.value === "local" || select.value === "synced")
            choices[id] = select.value;
          else delete choices[id];
          save.disabled = ids.some((key) => !choices[key]);
        });
      });
      save.addEventListener("click", () => {
        void this.save(name, choices, context, save);
      });
    } catch {
      content.createEl("p", {
        text: "Could not read saved conflicts. Your recovery files have been kept.",
      });
    }
  }

  private async save(
    name: string,
    choices: Record<string, "local" | "synced">,
    context: FeedShardConflictContext,
    button: HTMLButtonElement,
  ): Promise<void> {
    button.disabled = true;
    try {
      if (await this.actions.resolve(name, choices, context)) {
        await this.render();
        return;
      }
      await this.render(
        "The feed or synced version changed while you reviewed it. Review the latest saved version and choose again.",
      );
      return;
    } catch {
      this.contentEl.createEl("p", {
        text: "Could not save the resolution. The recovery copy is still available.",
      });
    }
    button.disabled = false;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
