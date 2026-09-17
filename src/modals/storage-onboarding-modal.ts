import { App, Modal, Notice, Setting } from "obsidian";
import type { FeedStorageMode, SyncV3Status } from "../types/types";
import type { ShardFolderDeletionError } from "../services/feed-storage-repository";
import {
  StorageTransitionModal,
  runShardDeletionFailureFlow,
  type StorageTransitionAction,
} from "../settings/modals/storage-settings-modals";
import { renderSyncV3HealthTable } from "../settings/sync-v3-health-table";

export interface StorageOnboardingPlugin {
  configureLocalStorageForFirstRun(): Promise<void>;
  createSyncV3Set(): Promise<void>;
  prepareSyncV3Join(): Promise<void>;
  joinSyncV3Set(): Promise<boolean>;
  isSyncV3SetAlreadyExistsError(error: unknown): boolean;
  deleteSyncV3Set(): Promise<boolean>;
  getSyncV3Status?(): Promise<SyncV3Status>;
  // Advanced/legacy destinations (pre-3.0 only). See ADR 0006 -- these are
  // deleted at 3.0 along with the storage-mode selector entries that reach
  // them, so keep every call to them isolated to this interface segment and
  // the renderAdvancedLegacyDisclosure()/completeLegacyModeSwitch() methods
  // below.
  migrateToVaultStorage(): Promise<void>;
  revertToLegacyJsonStorageWithOptions(options?: {
    deleteShardFolder?: boolean;
  }): Promise<void>;
  exportDataJson(): Promise<void>;
  isShardFolderDeletionError(error: unknown): error is ShardFolderDeletionError;
  openStorageFolderInSystem(folderPath?: string): Promise<void>;
}

export interface StorageOnboardingModalOptions {
  currentStorageMode: FeedStorageMode;
  isFirstRun: boolean;
  /** Vault-relative shard folder, used only by the advanced legacy destinations. */
  storageFolder?: string;
  /** Called once a storage change has actually been applied, before the modal closes. */
  onStorageChanged?: () => void;
}

const FIRST_RUN_OPTIONS: StorageOnboardingModalOptions = {
  currentStorageMode: "vault-shards-v2",
  isFirstRun: true,
};

const DEFAULT_STORAGE_FOLDER = ".rss-dashboard-data/feeds";

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
      .setName("Sync across devices (experimental)")
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

    this.renderAdvancedLegacyDisclosure();
  }

  /**
   * Legacy JSON and shard storage v1 are deprecated pre-3.0 destinations
   * (ADR 0006), kept only for recovery and migration. They are gated behind
   * this disclosure rather than offered in the primary picker above, and are
   * deleted as a unit once 3.0 drops the storage-mode entries that reach them.
   */
  private renderAdvancedLegacyDisclosure(): void {
    const details = this.contentEl.createEl("details", {
      cls: "rss-dashboard-storage-legacy-disclosure",
    });
    details.createEl("summary", { text: "Advanced: legacy storage (pre-3.0)" });
    const body = details.createDiv();
    body.createEl("p", {
      text: "Legacy JSON and shard storage v1 are deprecated pre-3.0 storage modes, kept for recovery and migration. They are removed at the next major release.",
      cls: "rss-dashboard-modal-message",
    });

    new Setting(body)
      .setName("Shard storage v1")
      .setDesc("Per-feed vault files with read/starred state stored inside each feed file. Superseded by shard storage v2.")
      .addButton((button) => button.setButtonText("Use shard storage v1").onClick(() => {
        this.requestStorageChange(
          "vault-shards",
          () =>
            this.completeLegacyModeSwitch(
              "vault-shards",
              () => this.plugin.migrateToVaultStorage(),
              "Shard storage v1 is active.",
              "Could not switch to shard storage v1",
            ),
          () => this.renderStorageChoice(),
        );
      }));

    new Setting(body)
      .setName("Legacy JSON")
      .setDesc("Single monolith data.json file. Does not sync well across devices (often exceeds the 5mb sync limit).")
      .addButton((button) => button.setButtonText("Use legacy JSON").onClick(() => {
        this.requestStorageChange(
          "legacy-json",
          () =>
            this.completeLegacyModeSwitch(
              "legacy-json",
              () =>
                this.plugin.revertToLegacyJsonStorageWithOptions({
                  deleteShardFolder: false,
                }),
              "Legacy JSON storage enabled.",
              "Could not switch to legacy JSON",
            ),
          () => this.renderStorageChoice(),
        );
      }));
  }

  private storageFolder(): string {
    return this.options.storageFolder ?? DEFAULT_STORAGE_FOLDER;
  }

  /**
   * Shared by both advanced legacy destinations: when the switch crosses a
   * shard folder boundary (legacy JSON <-> shard storage), reuses the same
   * StorageTransitionModal + shard-deletion-failure recovery flow the
   * Storage settings tab used to run inline, so a backup reminder or a
   * blocked shard-folder delete is handled identically wherever the switch
   * was started from.
   */
  private async completeLegacyModeSwitch(
    targetMode: "vault-shards" | "legacy-json",
    migrateAction: () => Promise<void>,
    successMessage: string,
    errorPrefix: string,
  ): Promise<void> {
    const crossesShardFolderBoundary =
      (targetMode === "legacy-json" &&
        (this.options.currentStorageMode === "vault-shards" ||
          this.options.currentStorageMode === "vault-shards-v2")) ||
      (targetMode === "vault-shards" &&
        this.options.currentStorageMode === "legacy-json");

    if (!crossesShardFolderBoundary) {
      await this.runAction(migrateAction, successMessage, errorPrefix);
      return;
    }

    const transitionModal = new StorageTransitionModal(this.app, {
      currentMode: this.options.currentStorageMode,
      targetMode,
      storageFolder: this.storageFolder(),
    });
    transitionModal.open();
    const action: StorageTransitionAction = await transitionModal.waitForClose();
    if (action === "cancel") {
      return;
    }

    try {
      if (action === "export-data-json") {
        await this.plugin.exportDataJson();
        return;
      }

      if (action === "apply-delete-shards") {
        try {
          await this.plugin.revertToLegacyJsonStorageWithOptions({
            deleteShardFolder: true,
          });
        } catch (error) {
          if (!this.plugin.isShardFolderDeletionError(error)) {
            throw error;
          }

          const followUpAction = await runShardDeletionFailureFlow(
            this.app,
            this.storageFolder(),
            (folder) => this.plugin.openStorageFolderInSystem(folder),
          );
          if (followUpAction === "cancel") {
            return;
          }

          await this.plugin.revertToLegacyJsonStorageWithOptions({
            deleteShardFolder: false,
          });
        }
      } else {
        await migrateAction();
      }

      new Notice(successMessage);
      this.options.onStorageChanged?.();
      this.close();
    } catch (error) {
      new Notice(`${errorPrefix}${error instanceof Error ? `: ${error.message}` : ""}`);
    }
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
    new Setting(this.contentEl).setName("Set up sync v3 (experimental)").setHeading();
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
    if (targetMode === "replicated-v3" && this.options.currentStorageMode !== "replicated-v3") {
      this.renderExperimentalConfirmation(onConfirm, onCancel);
      return;
    }

    if (
      this.options.isFirstRun ||
      this.options.currentStorageMode === targetMode
    ) {
      void onConfirm();
      return;
    }

    this.renderStorageChangeConfirmation(targetMode, onConfirm, onCancel);
  }

  private renderExperimentalConfirmation(
    onConfirm: () => Promise<void>,
    onCancel: () => void,
  ): void {
    this.contentEl.empty();
    new Setting(this.contentEl).setName("Sync v3 is experimental").setHeading();
    this.contentEl.createEl("p", {
      text: "Sync v3 replicas have had less real-world testing than local vault shards v2 storage. Data stays in your vault and remains exportable as a portable data bundle at any time, but replica setup and sync behavior are still being hardened.",
      cls: "rss-dashboard-modal-message",
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => {
          onCancel();
        }),
      )
      .addButton((button) => {
        button.setButtonText("Set up sync v3").onClick(() => {
          void onConfirm();
        });
        button.buttonEl.addClass("mod-warning");
      });
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
      .addButton((button) => {
        button.setButtonText("Change storage").onClick(() => {
          void onConfirm();
        });
        // setWarning()/setDestructive() are unavailable pre-1.13.0 or
        // deprecated; apply the same style class directly so the button
        // still reads as a hard-to-undo action on minAppVersion 1.8.7.
        button.buttonEl.addClass("mod-warning");
      });
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

  private async runAction(
    action: () => Promise<void>,
    successMessage: string,
    errorPrefix: string,
  ): Promise<void> {
    try {
      await action();
      new Notice(successMessage);
      this.options.onStorageChanged?.();
      this.close();
    } catch (error) {
      new Notice(`${errorPrefix}${error instanceof Error ? `: ${error.message}` : ""}`);
    }
  }

  private async completeLocalChoice(unsure: boolean): Promise<void> {
    await this.runAction(
      () => this.plugin.configureLocalStorageForFirstRun(),
      unsure
        ? "Local storage is active. You can set up Sync v3 later in Settings → Storage."
        : "Local storage is active.",
      "Could not configure local storage",
    );
  }

  private async createPrimarySet(): Promise<void> {
    try {
      await this.plugin.createSyncV3Set();
      new Notice("Sync v3 set created. Join it from each other device.");
      this.options.onStorageChanged?.();
      this.close();
    } catch (error) {
      if (this.plugin.isSyncV3SetAlreadyExistsError(error)) {
        this.renderSetAlreadyExistsRecovery();
        return;
      }
      new Notice(`Could not create sync v3${error instanceof Error ? `: ${error.message}` : ""}`);
    }
  }

  private async prepareJoin(): Promise<void> {
    await this.runAction(
      () => this.plugin.prepareSyncV3Join(),
      "Waiting for the first device's sync v3 replica files.",
      "Could not prepare Sync v3",
    );
  }

  /**
   * Reached when `createSyncV3Set` refuses to reseed over an existing
   * epoch. The previous only escape was "join it instead" as a message with
   * no action attached -- a dead end for a stale/orphaned set nothing has
   * ever joined. Shows what the existing set actually looks like, then lets
   * the user join it now (not "wait", since it's already present) or delete
   * it and retry create.
   */
  private renderSetAlreadyExistsRecovery(): void {
    this.contentEl.empty();
    new Setting(this.contentEl).setName("Sync v3 set already exists").setHeading();
    this.contentEl.createEl("p", {
      text: "A shared sync v3 set already exists in this vault. Join it if it belongs to your other devices, or delete it if it's stale (for example, left over from earlier testing) and start fresh.",
      cls: "rss-dashboard-modal-message",
    });

    const statusBody = this.contentEl.createDiv({
      cls: "rss-dashboard-sync-v3-health-body",
    });
    statusBody.setText("Checking the existing set…");
    if (this.plugin.getSyncV3Status) {
      void this.plugin.getSyncV3Status()
        .then((status) => renderSyncV3HealthTable(statusBody, status))
        .catch(() => {
          statusBody.empty();
          statusBody.setText("Could not read the existing set's status.");
        });
    } else {
      statusBody.empty();
    }

    new Setting(this.contentEl)
      .setName("Join the existing set")
      .setDesc("Adopt it as this device's sync v3 set right now.")
      .addButton((button) =>
        button.setButtonText("Join now").setCta().onClick(() => {
          void this.joinExistingSet();
        }),
      );

    new Setting(this.contentEl)
      .setName("Delete the existing set")
      .setDesc(
        "Permanently removes the shared epoch and every device's replica folder, then lets you create a fresh set. This cannot be undone — only do this if no other device still needs it.",
      )
      .addButton((button) => {
        button.setButtonText("Delete and create fresh").onClick(() => {
          void this.deleteExistingSetThenRetryCreate();
        });
        button.buttonEl.addClass("mod-warning");
      });

    new Setting(this.contentEl).addButton((button) =>
      button.setButtonText("Cancel").onClick(() => {
        this.renderSyncChoice();
      }),
    );
  }

  private async joinExistingSet(): Promise<void> {
    try {
      const joined = await this.plugin.joinSyncV3Set();
      if (!joined) {
        new Notice("Could not join: no valid set was found after all.");
        return;
      }
      new Notice("Joined the existing sync v3 set.");
      this.options.onStorageChanged?.();
      this.close();
    } catch (error) {
      new Notice(`Could not join sync v3${error instanceof Error ? `: ${error.message}` : ""}`);
    }
  }

  private async deleteExistingSetThenRetryCreate(): Promise<void> {
    const confirmed = activeWindow.confirm(
      "Delete the existing Sync v3 set? This removes the shared epoch and every device's replica folder and cannot be undone.",
    );
    if (!confirmed) return;
    try {
      const deleted = await this.plugin.deleteSyncV3Set();
      new Notice(
        deleted
          ? "Existing sync v3 set deleted."
          : "No existing sync v3 set was found to delete.",
      );
      await this.createPrimarySet();
    } catch (error) {
      new Notice(`Could not delete the existing set${error instanceof Error ? `: ${error.message}` : ""}`);
    }
  }
}
