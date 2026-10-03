import { App, Modal, Notice, Setting } from "obsidian";
import type {
  FeedDataCounts,
  ImportConfirmation,
  ImportDecision,
  StorageLocationChange,
} from "../../services/import-confirmation-model";
import { settingsUiCompatibility } from "../settings-ui-compat";

export interface ImportConfirmationModalOptions {
  confirmation: ImportConfirmation;
  /** Exports a full Portable data bundle, reporting its own outcome. */
  exportBackup: () => Promise<void>;
}

const FEED_DATA_ROWS: ReadonlyArray<[keyof FeedDataCounts, string]> = [
  ["feeds", "Feeds"],
  ["articles", "Articles"],
  ["starred", "Starred articles"],
  ["folders", "Folders"],
  ["tags", "Tags"],
];

const FEED_STORAGE_MODE_LABELS: Record<string, string> = {
  "legacy-json": "legacy data.json",
  "vault-shards": "shard storage v1",
  "vault-shards-v2": "shard storage v2",
};

/**
 * The last-chance prompt before a Replacing or Overwriting import writes
 * anything (issue #377). Resolves to confirm only from the Replace or
 * Overwrite button; every other way out is a cancel.
 */
export class ImportConfirmationModal extends Modal {
  private readonly options: ImportConfirmationModalOptions;
  private decision: ImportDecision = "cancel";
  private exporting = false;
  private resolvePromise: ((value: ImportDecision) => void) | null = null;

  constructor(app: App, options: ImportConfirmationModalOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    const { confirmation } = this.options;
    const replacing = confirmation.kind === "replacing";

    contentEl.createEl("h2", {
      text: replacing ? "Replace your feeds?" : "Overwrite your preferences?",
    });
    contentEl.createEl("p", {
      text: replacing
        ? `Your current feeds, folders, tags, articles, and article state will be replaced by the ones in ${confirmation.fileName}. This can't be undone, so export a backup first if you might need your current data.`
        : `The preferences in ${confirmation.fileName} will overwrite your current ones. Preferences the file doesn't include stay as they are.`,
    });

    if (confirmation.feedData) {
      this.renderFeedData(confirmation.feedData);
    }
    if (replacing && confirmation.unloadedFeedCount > 0) {
      const count = confirmation.unloadedFeedCount;
      contentEl.createEl("p", {
        text: `${count} ${count === 1 ? "feed hasn't loaded its" : "feeds haven't loaded their"} articles on this device, so the current article counts leave ${count === 1 ? "it" : "them"} out.`,
      });
    }
    if (confirmation.preferences) {
      this.renderPreferences(confirmation.preferences);
    }
    if (confirmation.storageLocationChange) {
      this.renderStorageLocationChange(confirmation.storageLocationChange);
    }

    const destructive = replacing || confirmation.storageLocationChange !== null;
    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting
      .addButton((btn) => {
        btn.setButtonText("Cancel").onClick(() => {
          this.decision = "cancel";
          this.close();
        });
      })
      .addButton((btn) =>
        btn.setButtonText("Export backup first").onClick(() => {
          void this.exportBackup();
        }),
      )
      .addButton((btn) => {
        btn.setButtonText(replacing ? "Replace" : "Overwrite");
        if (destructive) {
          settingsUiCompatibility.markDestructive(btn);
        } else {
          btn.setCta();
        }
        btn.onClick(() => {
          this.decision = "confirm";
          this.close();
        });
      });

    // Enter pressed by reflex must never replace the user's data.
    buttonsSetting.controlEl.querySelector("button")?.focus();
  }

  private renderFeedData(feedData: NonNullable<ImportConfirmation["feedData"]>) {
    const list = this.contentEl.createEl("ul");
    for (const [key, label] of FEED_DATA_ROWS) {
      list.createEl("li", {
        text: `${label}: ${feedData.current[key]} → ${feedData.incoming[key]}`,
      });
    }
  }

  private renderPreferences(
    preferences: NonNullable<ImportConfirmation["preferences"]>,
  ) {
    const { changedCount, highImpactChanges } = preferences;
    this.contentEl.createEl("p", {
      text:
        changedCount === 0
          ? "No preferences differ from your current ones."
          : `${changedCount} ${changedCount === 1 ? "preference" : "preferences"} will change.`,
    });
    if (highImpactChanges.length === 0) return;
    const list = this.contentEl.createEl("ul");
    for (const change of highImpactChanges) {
      list.createEl("li", {
        text: `${change.label}: ${change.before} → ${change.after}`,
      });
    }
  }

  private renderStorageLocationChange(change: StorageLocationChange) {
    const { feedStorage, metadataStorage } = change;
    if (feedStorage) {
      const { before, after } = feedStorage;
      this.contentEl.createEl("p", {
        text:
          before.mode === after.mode
            ? `Storage folder changes from ${before.folder} to ${after.folder}.`
            : `Storage mode changes from ${feedStorageModeLabel(before.mode)} to ${feedStorageModeLabel(after.mode)}.`,
      });
    }
    if (metadataStorage) {
      this.contentEl.createEl("p", {
        text: `data.json location changes from ${metadataLocationLabel(metadataStorage.before)} to ${metadataLocationLabel(metadataStorage.after)}.`,
      });
    }
    this.contentEl.createEl("p", {
      text: "This setting syncs to every device, so every device will read from the new location.",
    });
  }

  private async exportBackup(): Promise<void> {
    if (this.exporting) return;
    this.exporting = true;
    try {
      await this.options.exportBackup();
    } catch (error) {
      new Notice(
        `Backup export failed${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    } finally {
      this.exporting = false;
    }
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolvePromise?.(this.decision);
  }

  waitForClose(): Promise<ImportDecision> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

function feedStorageModeLabel(mode: string): string {
  return FEED_STORAGE_MODE_LABELS[mode] ?? mode;
}

function metadataLocationLabel(location: { mode: string; folder: string }) {
  return location.mode === "vault-location" ? location.folder : "the plugin folder";
}
