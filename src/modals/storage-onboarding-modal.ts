import { App, Modal, Notice, Setting } from "obsidian";
import type { FeedStorageMode } from "../types/types";

export interface StorageOnboardingPlugin {
  configureLocalStorageForFirstRun(): Promise<void>;
  createSyncV3Set(): Promise<void>;
  prepareSyncV3Join(): Promise<void>;
}

export interface StorageOnboardingModalOptions {
  currentStorageMode: FeedStorageMode;
  isFirstRun: boolean;
}

const FIRST_RUN_OPTIONS: StorageOnboardingModalOptions = {
  currentStorageMode: "vault-shards-v2",
  isFirstRun: true,
};

/** Guides a new or existing device to local V2 storage or an explicit V3 role. */
export class StorageOnboardingModal extends Modal {
  private readonly plugin: StorageOnboardingPlugin;
  private readonly options: StorageOnboardingModalOptions;

  constructor(
    app: App,
    plugin: StorageOnboardingPlugin,
    options: StorageOnboardingModalOptions = FIRST_RUN_OPTIONS,
  ) {
    super(app);
    this.plugin = plugin;
    this.options = options;
  }

  onOpen(): void {
    this.renderStorageChoice();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderStorageChoice(): void {
    this.contentEl.empty();
    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    new Setting(this.contentEl)
      .setName(this.options.isFirstRun ? "Choose storage" : "Storage setup")
      .setHeading();
    if (!this.options.isFirstRun) {
      this.contentEl.createEl("p", {
        text: "Review or change how this device uses RSS dashboard storage.",
        cls: "rss-dashboard-modal-message",
      });
    }
    this.contentEl.createEl("p", {
      text: "Choose how this device will use RSS dashboard. You can change this later in settings → storage.",
      cls: "rss-dashboard-modal-message",
    });
    new Setting(this.contentEl)
      .setName("Current storage mode")
      .setDesc(this.currentStorageModeDisplayLabel());

    new Setting(this.contentEl)
      .setName("Use on this device")
      .setDesc("Use local vault shards v2 storage. This is best when you do not plan to share feeds between devices.")
      .addButton((button) => button.setButtonText("Use local storage").setCta().onClick(() => {
        this.requestStorageChange(
          "vault-shards-v2",
          () => this.completeLocalChoice(false),
          () => this.renderStorageChoice(),
        );
      }));

    new Setting(this.contentEl)
      .setName("Sync across devices")
      .setDesc("Set up device-owned sync v3 replicas. You will choose whether this is the first or an additional device.")
      .addButton((button) => button.setButtonText("Set up sync v3").onClick(() => {
        this.renderSyncChoice();
      }));

    new Setting(this.contentEl)
      .setName("I am not sure")
      .setDesc("Start with local vault shards v2. You can switch to sync v3 later from settings → storage.")
      .addButton((button) => button.setButtonText("Use local storage for now").onClick(() => {
        this.requestStorageChange(
          "vault-shards-v2",
          () => this.completeLocalChoice(true),
          () => this.renderStorageChoice(),
        );
      }));
  }

  private currentStorageModeDisplayLabel(): string {
    if (this.options.isFirstRun) {
      return "Unassigned";
    }

    switch (this.options.currentStorageMode) {
      case "legacy-json":
        return "Legacy JSON";
      case "vault-shards":
        return "Vault shards v1";
      case "vault-shards-v2":
        return "Local vault shards v2";
      case "replicated-v3":
        return "Sync v3 replicas";
    }
  }

  private renderSyncChoice(): void {
    this.contentEl.empty();
    new Setting(this.contentEl).setName("Set up sync v3").setHeading();
    this.contentEl.createEl("p", {
      text: "Enable Obsidian sync for all other file types on every device and do not exclude RSS-dashboard-data. RSS dashboard reports replica health, not Obsidian sync completion.",
      cls: "rss-dashboard-modal-message",
    });

    new Setting(this.contentEl)
      .setName("This is my first device")
      .setDesc("Create the shared v3 set here. Other devices will join it after the replica files arrive.")
      .addButton((button) => button.setButtonText("Create sync v3 set").setCta().onClick(() => {
        this.requestStorageChange(
          "replicated-v3",
          () => this.createPrimarySet(),
          () => this.renderSyncChoice(),
        );
      }));

    new Setting(this.contentEl)
      .setName("This is an additional device")
      .setDesc("Wait for the first device's v3 files to arrive. This device will not create or overwrite shared replica files.")
      .addButton((button) => button.setButtonText("Wait to join sync v3").onClick(() => {
        this.requestStorageChange(
          "replicated-v3",
          () => this.prepareJoin(),
          () => this.renderSyncChoice(),
        );
      }));

    new Setting(this.contentEl)
      .setName("Back")
      .setDesc("Choose local storage instead.")
      .addButton((button) => button.setButtonText("Back").onClick(() => {
        this.renderStorageChoice();
      }));
  }

  private requestStorageChange(
    targetMode: FeedStorageMode,
    onConfirm: () => Promise<void>,
    onCancel: () => void,
  ): void {
    if (
      this.options.isFirstRun ||
      this.options.currentStorageMode === targetMode
    ) {
      void onConfirm();
      return;
    }

    this.renderStorageChangeConfirmation(targetMode, onConfirm, onCancel);
  }

  private renderStorageChangeConfirmation(
    targetMode: FeedStorageMode,
    onConfirm: () => Promise<void>,
    onCancel: () => void,
  ): void {
    this.contentEl.empty();
    new Setting(this.contentEl).setName("Confirm storage change").setHeading();
    this.contentEl.createEl("p", {
      text: `Switch this device from ${this.storageModeLabel(this.options.currentStorageMode)} to ${this.storageModeLabel(targetMode)}?`,
      cls: "rss-dashboard-modal-message",
    });
    this.contentEl.createEl("p", {
      text: "This changes only this device's active storage mode. It does not delete an existing sync v3 replica or its shared data.",
      cls: "rss-dashboard-modal-message",
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => {
          onCancel();
        }),
      )
      .addButton((button) =>
        button.setButtonText("Change storage").setWarning().onClick(() => {
          void onConfirm();
        }),
      );
  }

  private storageModeLabel(mode: FeedStorageMode): string {
    switch (mode) {
      case "legacy-json":
        return "legacy JSON storage";
      case "vault-shards":
        return "vault shards v1 storage";
      case "vault-shards-v2":
        return "local vault shards v2 storage";
      case "replicated-v3":
        return "sync v3";
    }
  }

  private async completeLocalChoice(unsure: boolean): Promise<void> {
    try {
      await this.plugin.configureLocalStorageForFirstRun();
      new Notice(
        unsure
          ? "Local storage is active. You can set up Sync v3 later in Settings → Storage."
          : "Local storage is active.",
      );
      this.close();
    } catch (error) {
      new Notice(
        `Could not configure local storage${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }
  }

  private async createPrimarySet(): Promise<void> {
    try {
      await this.plugin.createSyncV3Set();
      new Notice("Sync v3 set created. Join it from each other device.");
      this.close();
    } catch (error) {
      new Notice(
        `Could not create sync v3${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }
  }

  private async prepareJoin(): Promise<void> {
    try {
      await this.plugin.prepareSyncV3Join();
      new Notice("Waiting for the first device's sync v3 replica files.");
      this.close();
    } catch (error) {
      new Notice(
        `Could not prepare Sync v3${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }
  }
}
