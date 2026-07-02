import { App, Modal, Setting } from "obsidian";
import type { FeedStorageMode } from "../../types/types";

export type StorageTransitionAction =
  | "cancel"
  | "export-data-json"
  | "apply"
  | "apply-delete-shards";

export type ShardDeletionFailureAction =
  | "cancel"
  | "apply-anyway"
  | "open-folder";

export type MetadataCleanupAction = "keep" | "delete";

export interface StorageTransitionOptions {
  currentMode: FeedStorageMode;
  targetMode: FeedStorageMode;
  storageFolder: string;
}

export interface MetadataCleanupOptions {
  previousLocationLabel: string;
}

export class StorageTransitionModal extends Modal {
  private readonly currentMode: FeedStorageMode;
  private readonly targetMode: FeedStorageMode;
  private readonly storageFolder: string;
  private action: StorageTransitionAction = "cancel";
  private resolvePromise: ((value: StorageTransitionAction) => void) | null =
    null;

  constructor(app: App, options: StorageTransitionOptions) {
    super(app);
    this.currentMode = options.currentMode;
    this.targetMode = options.targetMode;
    this.storageFolder = options.storageFolder;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");
    this.modalEl.addClass("rss-storage-transition-modal");

    if (this.targetMode === "legacy-json") {
      this.renderShardsToLegacyModal(contentEl);
      return;
    }

    this.renderLegacyToShardsModal(contentEl);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.resolvePromise?.(this.action);
  }

  waitForClose(): Promise<StorageTransitionAction> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private renderLegacyToShardsModal(contentEl: HTMLElement): void {
    contentEl.createEl("h2", { text: "Apply storage change?" });
    if (this.currentMode === "legacy-json") {
      contentEl.createEl("p", {
        text: "You are switching from legacy data.json storage to shard storage v1.",
      });
      contentEl.createEl("p", {
        text: "Before continuing, back up your current data.json file. You can use the existing export action here first, then come back and apply the change.",
      });
    } else if (this.targetMode === "vault-shards-v2") {
      contentEl.createEl("p", {
        text: "You are upgrading to shard storage v2 (split user state).",
      });
    } else {
      contentEl.createEl("p", {
        text: "You are switching to shard storage v1.",
      });
    }
    contentEl.createEl("p", {
      text: `Shard files will be written into: ${this.storageFolder}`,
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting.controlEl.addClass("rss-storage-transition-buttons");
    buttonsSetting
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.action = "cancel";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Export data.json").onClick(() => {
          this.action = "export-data-json";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Apply")
          .setCta()
          .onClick(() => {
            this.action = "apply";
            this.close();
          }),
      );
  }

  private renderShardsToLegacyModal(contentEl: HTMLElement): void {
    contentEl.createEl("h2", { text: "Apply storage change?" });
    contentEl.createEl("p", {
      text: "You are switching from shard storage v1 back to legacy data.json storage.",
    });
    contentEl.createEl("p", {
      text: `All feeds will be stored in data.json again. If you choose cleanup, the shard folder "${this.storageFolder}" will be deleted.`,
    });
    contentEl.createEl("p", {
      text: "You can also leave the shard folder in place if you want to keep it as a manual backup.",
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting.controlEl.addClass("rss-storage-transition-buttons");
    buttonsSetting
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.action = "cancel";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Leave shard folder").onClick(() => {
          this.action = "apply";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Delete shard folder")
          .setWarning()
          .onClick(() => {
            this.action = "apply-delete-shards";
            this.close();
          }),
      );
  }
}

export class ShardDeletionFailureModal extends Modal {
  private readonly storageFolder: string;
  private action: ShardDeletionFailureAction = "cancel";
  private resolvePromise: ((value: ShardDeletionFailureAction) => void) | null =
    null;

  constructor(app: App, storageFolder: string) {
    super(app);
    this.storageFolder = storageFolder;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    contentEl.createEl("h2", { text: "Shard folder could not be deleted" });
    contentEl.createEl("p", {
      text: `The shard folder "${this.storageFolder}" still exists, so the switch back to legacy JSON has been paused.`,
    });
    contentEl.createEl("p", {
      text: "You can open the folder and delete it manually, continue anyway and keep using data.json, or cancel without changing storage modes.",
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.action = "cancel";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Open shard folder").onClick(() => {
          this.action = "open-folder";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Apply anyway")
          .setWarning()
          .onClick(() => {
            this.action = "apply-anyway";
            this.close();
          }),
      );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.resolvePromise?.(this.action);
  }

  waitForClose(): Promise<ShardDeletionFailureAction> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

export class MetadataCleanupModal extends Modal {
  private readonly previousLocationLabel: string;
  private action: MetadataCleanupAction = "keep";
  private resolvePromise: ((value: MetadataCleanupAction) => void) | null =
    null;

  constructor(app: App, options: MetadataCleanupOptions) {
    super(app);
    this.previousLocationLabel = options.previousLocationLabel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    contentEl.createEl("h2", { text: "Delete previous metadata copy?" });
    contentEl.createEl("p", {
      text: "Metadata migration completed successfully.",
    });
    contentEl.createEl("p", {
      text: `A previous data.json copy still exists at: ${this.previousLocationLabel}`,
    });
    contentEl.createEl("p", {
      text: "Do you want to delete the previous copy, or keep it as a backup?",
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting
      .addButton((btn) =>
        btn.setButtonText("Keep previous copy").onClick(() => {
          this.action = "keep";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Delete previous copy")
          .setWarning()
          .onClick(() => {
            this.action = "delete";
            this.close();
          }),
      );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.resolvePromise?.(this.action);
  }

  waitForClose(): Promise<MetadataCleanupAction> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}
