/**
 * Storage Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts and split out from the
 * General and Media tabs.
 *
 * Only the active feed storage mode's own section renders in full; the other
 * three modes' descriptions and setup actions are not shown at all. A device
 * that just left Sync v3 (a "Set departure" back to Shard storage v2, or a
 * Storage revert to Legacy JSON) still needs its diagnostic/recovery actions
 * reachable for a bug report or to recover conflict copies, so those stay
 * available behind a collapsed <details> instead of disappearing outright.
 */
import {
  App,
  Notice,
  Setting,
  TFolder,
  normalizePath,
  type WorkspaceLeaf,
} from "obsidian";
import { FolderSuggest } from "../../components/folder-suggest";
import { setCssProps } from "../../utils/platform-utils";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
  type SyncV3RecoveryResult,
  type SyncV3Status,
} from "../../types/types";
import {
  MetadataCleanupModal,
  type MetadataCleanupAction,
} from "../modals/storage-settings-modals";
import { StorageOnboardingModal } from "../../modals/storage-onboarding-modal";
import { renderSyncV3HealthTable } from "../sync-v3-health-table";
import type {
  FeedStorageStatus,
  ShardFolderDeletionError,
} from "../../services/feed-storage-repository";

interface StorageSettingsPlugin {
  app: App;
  settingTab: { display(): void } | null;
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
  } | null>;
  getStorageStatus(): FeedStorageStatus;
  getOrphanedUserStatePath(): Promise<string | null>;
  getMetadataFilePath(): string;
  migrateToVaultStorage(): Promise<void>;
  repairVaultStorage(): Promise<void>;
  exportDataJson(): Promise<void>;
  revertToLegacyJsonStorageWithOptions(options?: {
    deleteShardFolder?: boolean;
  }): Promise<void>;
  isShardFolderDeletionError(error: unknown): error is ShardFolderDeletionError;
  openStorageFolderInSystem(folderPath?: string): Promise<void>;
  migrateMetadataToVaultLocation(): Promise<void>;
  revertMetadataToPluginDefault(): Promise<void>;
  getSyncV3Status?(): Promise<SyncV3Status>;
  createSyncV3Set(): Promise<void>;
  joinSyncV3Set(): Promise<boolean>;
  deleteSyncV3Set(): Promise<boolean>;
  isSyncV3SetAlreadyExistsError(error: unknown): boolean;
  exportSyncV3HealthReport?(): Promise<void>;
  recoverSyncV3?(): Promise<SyncV3RecoveryResult>;
  exportPortableDataBundleChecked?(): Promise<boolean>;
  exportPortableDataBundle(): Promise<void>;
  configureLocalStorageForFirstRun(): Promise<void>;
  prepareSyncV3Join(): Promise<void>;
}

/**
 * Confirm, export a portable backup, then run a Sync v3 action — shared by
 * "Create v3 sync set" and "Run sync v3 recovery" so both actually check the
 * backup succeeded before proceeding, and so a future similar button doesn't
 * need to copy this chain a third time.
 */
function runConfirmedBackupThenAction(
  plugin: StorageSettingsPlugin,
  options: {
    confirmMessage: string;
    action: () => Promise<void>;
    onSuccess: () => void;
    errorPrefix: string;
  },
): void {
  const confirmed = activeWindow.confirm(options.confirmMessage);
  if (!confirmed) return;
  const exportBackup = plugin.exportPortableDataBundleChecked
    ? plugin.exportPortableDataBundleChecked()
    : plugin.exportPortableDataBundle().then(() => true);
  void exportBackup
    .then((backedUp) => {
      if (!backedUp) {
        new Notice(`${options.errorPrefix}: portable backup was not completed.`);
        return;
      }
      return options.action().then(options.onSuccess);
    })
    .catch((error: unknown) => {
      new Notice(`${options.errorPrefix}${error instanceof Error ? `: ${error.message}` : ""}`);
    });
}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

type MediaFolderSettingKey =
  | "defaultMastodonFolder"
  | "defaultYouTubeFolder"
  | "defaultPodcastFolder"
  | "defaultRssFolder"
  | "defaultSmallwebFolder";

function renderFolderSetting(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
  name: string,
  desc: string,
  key: MediaFolderSettingKey,
): void {
  new Setting(containerEl)
    .setName(name)
    .setDesc(desc)
    .addText((text) => {
      text
        .setValue(plugin.settings.media[key] || DEFAULT_SETTINGS.media[key])
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media[key] = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });
}

const MODE_DESCRIPTIONS: Record<RssDashboardSettings["storageMode"], string> = {
  "legacy-json":
    "Large monolith file. Does not sync across devices (often exceeds 5mb limit).",
  "vault-shards":
    "Creates individual vault files for each feed to improve syncing, but stores state (read, starred) inside the feed file, which can still cause minor sync conflicts.",
  "vault-shards-v2":
    "Splits feed content and user state (read, starred, tags) into separate files. It remains available for recovery and migration.",
  "replicated-v3":
    "Device-owned replicas with explicit read/unread values. Use \"Change storage mode\" to create or join a set; legacy repair does not rewrite v3 replicas.",
};

const MODE_DISPLAY_NAMES: Record<RssDashboardSettings["storageMode"], string> = {
  "legacy-json": "Legacy JSON",
  "vault-shards": "Shard storage v1",
  "vault-shards-v2": "Shard storage v2",
  "replicated-v3": "Sync v3 (experimental)",
};

export function renderStorageSettingsTab(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  new Setting(containerEl).setName("Storage").setHeading();

  const activeMode = plugin.settings.storageMode;

  if (activeMode === "replicated-v3") {
    renderSyncV3ActiveSection(containerEl, plugin);
  } else {
    renderSyncV3DepartedDisclosure(containerEl, plugin);
  }

  const openChangeStorageModeModal = (): void => {
    new StorageOnboardingModal(plugin.app, plugin, {
      currentStorageMode: plugin.settings.storageMode,
      isFirstRun: false,
      storageFolder: plugin.settings.storageFolder,
      onStorageChanged: () => plugin.settingTab?.display(),
    }).open();
  };

  const modeDescFragment = containerEl.win.createFragment();
  const modeDescDiv = containerEl.win.createDiv();
  modeDescDiv.createEl("strong", { text: `${MODE_DISPLAY_NAMES[activeMode]}:` });
  modeDescDiv.appendText(` ${MODE_DESCRIPTIONS[activeMode]}`);
  modeDescFragment.appendChild(modeDescDiv);

  const storageModeSetting = new Setting(containerEl)
    .setName("Storage mode")
    .addButton((button) =>
      button
        .setButtonText("Change storage mode")
        .setCta()
        .onClick(openChangeStorageModeModal),
    );
  // Obsidian's Setting.setDesc() routes through descEl.setText(), which only
  // appends a DocumentFragment when `instanceof DocumentFragment` succeeds --
  // that check fails when the fragment was built in a different window realm
  // than descEl (e.g. a popped-out window), and silently falls back to
  // stringifying it as "[object DocumentFragment]". Appending directly to
  // descEl sidesteps that fragile realm-sensitive dispatch entirely.
  storageModeSetting.descEl.empty();
  storageModeSetting.descEl.appendChild(modeDescFragment);

  if (activeMode === "vault-shards" || activeMode === "vault-shards-v2") {
    renderShardModeSection(containerEl, plugin);
  }

  new Setting(containerEl)
    .setName("Storage status")
    .setDesc(renderStorageStatus(plugin));

  const leftoverStateSetting = new Setting(containerEl).setName(
    "Leftover article state file",
  );
  leftoverStateSetting.settingEl.hidden = true;
  void plugin.getOrphanedUserStatePath().then((leftoverPath) => {
    if (!leftoverPath) {
      return;
    }
    leftoverStateSetting.setDesc(
      `A user-state.json from a previous shard storage v2 setup is still at ${leftoverPath}. It is not read in the current storage mode, and is kept as a backup of read, starred, tagged, and saved state. Delete it manually once you no longer need it.`,
    );
    leftoverStateSetting.settingEl.hidden = false;
  });

  renderMetadataStorageSection(containerEl, plugin);
  renderDefaultFoldersSection(containerEl, plugin);
}

function renderStorageStatus(plugin: StorageSettingsPlugin): string {
  const status = plugin.getStorageStatus();
  const migrationState = status.migrationReady
    ? "Migration ready"
    : status.mode === "replicated-v3"
      ? "Sync V3 active"
      : status.mode === "vault-shards-v2"
      ? "Shard Storage v2 active"
      : status.mode === "vault-shards"
        ? "Shard Storage v1 active"
        : "Legacy JSON active";
  return [
    `Mode: ${status.mode}`,
    `Folder: ${status.folder}`,
    `Metadata: ${plugin.getMetadataFilePath()}`,
    `Feeds: ${status.feedCount}`,
    `Shards: ${status.shardCount}`,
    migrationState,
    status.lastRepairResult,
  ].join(" • ");
}

/** Full, uncollapsed Sync v3 status/setup/recovery when it is the active mode. */
function renderSyncV3ActiveSection(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  const syncV3StatusSetting = new Setting(containerEl).setName(
    "Sync v3 replica health",
  );
  syncV3StatusSetting.descEl.empty();
  const syncV3StatusBody = syncV3StatusSetting.descEl.createDiv({
    cls: "rss-dashboard-sync-v3-health-body",
  });
  syncV3StatusBody.setText("Checking RSS dashboard sync v3 replica health…");
  if (plugin.getSyncV3Status) void plugin.getSyncV3Status().then((status) => {
    renderSyncV3HealthTable(syncV3StatusBody, status);
  }).catch(() => {
    syncV3StatusBody.empty();
    syncV3StatusBody.setText(
      "Sync v3 status could not be read. Existing shared files were not changed.",
    );
  });
  else syncV3StatusBody.setText("Sync v3 is unavailable in this plugin build.");

  new Setting(containerEl)
    .setName("Sync v3 setup")
    .setDesc(
      "Sync v3 supports concurrent devices. This reports RSS dashboard replica health, not Obsidian sync completion. Enable sync all other types on every device, do not exclude RSS-dashboard-data, and upgrade every participating device before relying on v3.",
    );

  const syncV3SetupActions = new Setting(containerEl);
  syncV3SetupActions.settingEl.addClass("rss-dashboard-storage-actions");
  syncV3SetupActions
    .addButton((button) => button.setButtonText("Create v3 sync set from this device").setCta().onClick(() => {
      runConfirmedBackupThenAction(plugin, {
        confirmMessage: "Create Sync v3 from this device? Export a portable backup first, then use this device as the authoritative source for the new shared set.",
        action: () => plugin.createSyncV3Set(),
        onSuccess: () => {
          new Notice("Sync v3 set created. Join it from each other device.");
          plugin.settingTab?.display();
        },
        errorPrefix: "Could not create sync v3",
      });
    }))
    .addButton((button) => button.setButtonText("Join existing v3 sync set").onClick(() => {
      void plugin.joinSyncV3Set().then((joined) => {
        new Notice(joined ? "Joined sync v3 set." : "No valid sync v3 set is available yet.");
        plugin.settingTab?.display();
      }).catch((error: unknown) => {
        new Notice(`Could not join sync v3${error instanceof Error ? `: ${error.message}` : ""}`);
      });
    }));

  renderSyncV3RecoverySetting(containerEl, plugin);
}

function renderSyncV3RecoverySetting(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Sync v3 recovery")
    .setDesc(
      "Export a diagnostic report to compare devices or attach to a bug report, or run recovery if health above is degraded. " +
        "Recovery always exports a portable backup first, then clears any detected sync conflict copies and either re-adopts " +
        "the current shared set (if this device fell behind in an adoption race) or re-derives this device's view from every " +
        "replica. It never touches another device's replica data.",
    );

  const syncV3RecoveryActions = new Setting(containerEl);
  syncV3RecoveryActions.settingEl.addClass("rss-dashboard-storage-actions");
  syncV3RecoveryActions
    .addButton((button) => button.setButtonText("Export sync v3 health report").onClick(() => {
      if (!plugin.exportSyncV3HealthReport) return;
      void plugin.exportSyncV3HealthReport().catch((error: unknown) => {
        new Notice(`Could not export sync v3 health report${error instanceof Error ? `: ${error.message}` : ""}`);
      });
    }))
    .addButton((button) => {
      button.setButtonText("Run sync v3 recovery").onClick(() => {
        if (!plugin.recoverSyncV3) return;
        runConfirmedBackupThenAction(plugin, {
          confirmMessage: "Run Sync v3 recovery? This exports a portable backup first, then reconciles this device with the current shared set.",
          action: () => plugin.recoverSyncV3!().then((result) => {
            const clearedNote = result.clearedConflictCopies > 0
              ? ` Cleared ${result.clearedConflictCopies} sync conflict ${result.clearedConflictCopies === 1 ? "copy" : "copies"}.`
              : "";
            new Notice(
              (result.recovered ? `Sync v3 recovery complete (${result.reason}).` : `Sync v3 recovery could not complete (${result.reason}).`) + clearedNote,
            );
          }),
          onSuccess: () => plugin.settingTab?.display(),
          errorPrefix: "Sync v3 recovery failed",
        });
      });
      // setWarning()/setDestructive() are unavailable pre-1.13.0 or
      // deprecated; apply the same style class directly so the button
      // still reads as a hard-to-undo action on minAppVersion 1.8.7.
      button.buttonEl.addClass("mod-warning");
    });

  new Setting(containerEl)
    .setName("Delete existing sync v3 set")
    .setDesc(
      "Permanently removes the shared epoch and every device's replica folder — the only way to clear a stuck or stale set (for example, one left over from earlier testing) once create refuses to reseed over it. Backs up first. This cannot be undone; only do this if you're sure no other device still needs it.",
    )
    .addButton((button) => {
      button.setButtonText("Delete existing set").onClick(() => {
        runConfirmedBackupThenAction(plugin, {
          confirmMessage: "Delete the existing Sync v3 set? This removes the shared epoch and every device's replica folder and cannot be undone.",
          action: () => plugin.deleteSyncV3Set().then((deleted) => {
            new Notice(
              deleted
                ? "Existing sync v3 set deleted."
                : "No existing sync v3 set was found to delete.",
            );
          }),
          onSuccess: () => plugin.settingTab?.display(),
          errorPrefix: "Could not delete sync v3 set",
        });
      });
      button.buttonEl.addClass("mod-warning");
    });
}

/**
 * A device that just left Sync v3 (a Set departure back to Shard storage v2,
 * or further back to Legacy JSON/Shard v1) may still need to view the shared
 * set's status, export a diagnostic report, run recovery, or delete a stuck
 * set -- for a bug report, to recover conflict copies, or to clear a stale
 * set from earlier testing. Keep all of that reachable, just collapsed,
 * instead of hiding it outright.
 */
function renderSyncV3DepartedDisclosure(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  if (!plugin.exportSyncV3HealthReport && !plugin.recoverSyncV3 && !plugin.getSyncV3Status) {
    return;
  }

  const details = containerEl.createEl("details", {
    cls: "rss-dashboard-sync-v3-departed-disclosure",
  });
  details.createEl("summary", { text: "Sync v3 diagnostics (this device is not currently on sync v3)" });
  const body = details.createDiv();

  const statusBody = body.createDiv({ cls: "rss-dashboard-sync-v3-health-body" });
  statusBody.setText("Checking for an existing sync v3 set…");
  if (plugin.getSyncV3Status) {
    void plugin.getSyncV3Status()
      .then((status) => renderSyncV3HealthTable(statusBody, status))
      .catch(() => {
        statusBody.empty();
        statusBody.setText("Sync v3 status could not be read.");
      });
  } else {
    statusBody.empty();
  }

  renderSyncV3RecoverySetting(body, plugin);
}

/** Storage folder field + Apply/Repair actions, scoped to Shard storage v1/v2. */
function renderShardModeSection(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  let pendingStorageFolder = plugin.settings.storageFolder;

  new Setting(containerEl)
    .setName("Storage folder")
    .setDesc(
      "Vault folder for per-feed shard files. Adding a '.' prefix to the path will hide the folder. The '.' must be removed for Obsidian sync to work properly.",
    )
    .addText((text) =>
      text
        .setPlaceholder(".rss-dashboard-data/feeds")
        .setValue(plugin.settings.storageFolder)
        .onChange((value) => {
          pendingStorageFolder = value.trim() || ".rss-dashboard-data/feeds";
        }),
    );

  new Setting(containerEl)
    .setName("Repair/rebuild storage")
    .setDesc(
      "Use this when shard storage seems out of sync, incomplete, or after manual folder moves. This will: 1. Re-check and normalize your storage folder path. 2. Force-rewrite all shard files from current feed data. 3. Force-save storage metadata. 4. Refresh storage status. Think of this as a safe 're-generate all shard files' action.'",
    );

  const storageActions = new Setting(containerEl);
  storageActions.settingEl.addClass("rss-dashboard-storage-actions");
  storageActions
    .setName("Storage actions")
    .setDesc("Apply a storage folder change, or repair/rebuild shard files.")
    .addButton((button) =>
      button
        .setButtonText("Apply")
        .setCta()
        .setTooltip("Apply the storage folder location")
        .onClick(() => {
          void (async () => {
            if (pendingStorageFolder === plugin.settings.storageFolder) {
              new Notice("No storage folder changes to apply.");
              return;
            }

            try {
              plugin.settings.storageFolder = pendingStorageFolder;
              if (plugin.settings.storageMode === "vault-shards") {
                await plugin.repairVaultStorage();
              } else {
                await plugin.saveSettings();
              }
              new Notice(`Storage folder updated to "${pendingStorageFolder}".`);
            } catch (error) {
              storageError("Storage folder apply failed", error, {
                pendingStorageFolder,
                mode: plugin.settings.storageMode,
              });
              new Notice(
                `Storage folder update failed${
                  error instanceof Error ? `: ${error.message}` : ""
                }`,
              );
            }
          })();
        }),
    )
    .addButton((button) =>
      button.setButtonText("Repair/rebuild storage").onClick(() => {
        void (async () => {
          try {
            await plugin.repairVaultStorage();
            if (plugin.settingTab) {
              plugin.settingTab.display();
            }
            new Notice("Storage repair completed.");
          } catch (error) {
            storageError("Repair button action failed", error, {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            new Notice(
              `Storage repair failed${error instanceof Error ? `: ${error.message}` : ""}`,
            );
          }
        })();
      }),
    );

  const applyButton = Array.from(
    storageActions.controlEl.querySelectorAll("button"),
  ).find((button) => button.textContent === "Apply");
  if (applyButton instanceof HTMLButtonElement) {
    setCssProps(applyButton, {
      "background-color": "#7c5cff",
      color: "#ffffff",
      border: "1px solid #6a4df0",
    });
  }
}

function renderMetadataStorageSection(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  const pluginDefaultMetadataFilePath = `${plugin.app.vault.configDir}/plugins/rss-dashboard/data.json`;
  let pendingMetadataStorageFolder =
    plugin.settings.metadataStorageMode === "vault-location"
      ? plugin.settings.metadataStorageFolder
      : "";
  let lastSavedMetadataStorageFolder = pendingMetadataStorageFolder;

  const deleteMetadataFileAtPath = async (
    dataFilePath: string,
  ): Promise<boolean> => {
    const file = plugin.app.vault.getAbstractFileByPath(dataFilePath);
    if (!file || file instanceof TFolder) {
      return false;
    }
    await plugin.app.fileManager.trashFile(file);
    return true;
  };

  const maybeOfferMetadataCleanup = async (
    previousDataFilePath: string | null,
  ): Promise<void> => {
    if (!previousDataFilePath) {
      return;
    }
    const previousFile =
      plugin.app.vault.getAbstractFileByPath(previousDataFilePath);
    if (!previousFile || previousFile instanceof TFolder) {
      return;
    }

    const cleanupModal = new MetadataCleanupModal(plugin.app, {
      previousLocationLabel: previousDataFilePath,
    });
    cleanupModal.open();
    const cleanupAction: MetadataCleanupAction =
      await cleanupModal.waitForClose();

    if (cleanupAction !== "delete") {
      return;
    }

    try {
      const deleted = await deleteMetadataFileAtPath(previousDataFilePath);
      if (deleted) {
        new Notice("Previous metadata data.json copy deleted.");
      }
    } catch (error) {
      storageError("Failed to delete previous metadata copy", error, {
        previousDataFilePath,
      });
      new Notice(
        `Failed to delete previous metadata copy${
          error instanceof Error ? `: ${error.message}` : ""
        }`,
      );
    }
  };

  const commitMetadataStorageFolder = async (
    rawValue: string,
  ): Promise<void> => {
    const nextFolder = rawValue.trim();
    if (nextFolder === lastSavedMetadataStorageFolder) {
      return;
    }

    const previousMode = plugin.settings.metadataStorageMode;
    const previousFolder = plugin.settings.metadataStorageFolder;
    const previousDataFilePath =
      previousMode === "vault-location"
        ? `${previousFolder}/data.json`
        : pluginDefaultMetadataFilePath;

    try {
      if (!nextFolder) {
        if (plugin.settings.metadataStorageMode === "vault-location") {
          await plugin.revertMetadataToPluginDefault();
        }
        plugin.settings.metadataStorageFolder = ".rss-dashboard-data";
        await plugin.saveSettings();
        lastSavedMetadataStorageFolder = "";
        pendingMetadataStorageFolder = "";
        await maybeOfferMetadataCleanup(previousDataFilePath);
        return;
      }

      plugin.settings.metadataStorageFolder = nextFolder;
      if (plugin.settings.metadataStorageMode === "vault-location") {
        plugin.settings.metadataStorageMode = "plugin-default";
      }

      await plugin.migrateMetadataToVaultLocation();
      lastSavedMetadataStorageFolder = nextFolder;
      pendingMetadataStorageFolder = nextFolder;
      await maybeOfferMetadataCleanup(previousDataFilePath);
    } catch (error) {
      plugin.settings.metadataStorageMode = previousMode;
      plugin.settings.metadataStorageFolder = previousFolder;
      pendingMetadataStorageFolder =
        previousMode === "vault-location" ? previousFolder : "";

      storageError("Metadata storage folder update failed", error, {
        previousMode,
        previousFolder,
        nextFolder,
      });
      new Notice(
        `Metadata storage update failed${
          error instanceof Error ? `: ${error.message}` : ""
        }`,
      );
      throw error;
    }
  };

  new Setting(containerEl).setName("Metadata storage").setHeading();

  new Setting(containerEl)
    .setName("Metadata data.json location")
    .setDesc(
      "Optional vault folder for metadata data.json. Leave empty to keep metadata in the plugin directory.",
    )
    .addText((text) => {
      text
        .setPlaceholder(".rss-dashboard-data")
        .setValue(lastSavedMetadataStorageFolder)
        .onChange((value) => {
          pendingMetadataStorageFolder = value;
        });
    });

  new Setting(containerEl)
    .setName("Metadata actions")
    .setDesc(
      "Apply metadata location changes independently from feed storage mode.",
    )
    .addButton((button) =>
      button
        .setButtonText("Apply metadata location")
        .setTooltip("Apply metadata data.json location change")
        .onClick(() => {
          void (async () => {
            const metadataChanged =
              pendingMetadataStorageFolder.trim() !==
              lastSavedMetadataStorageFolder;
            if (!metadataChanged) {
              new Notice("Metadata location is already active.");
              return;
            }

            await commitMetadataStorageFolder(pendingMetadataStorageFolder);
            if (plugin.settingTab) {
              plugin.settingTab.display();
            }
          })();
        }),
    );
}

function renderDefaultFoldersSection(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  new Setting(containerEl).setName("Default folders").setHeading();

  renderFolderSetting(
    containerEl,
    plugin,
    "Default Mastodon folder",
    "Default folder for Mastodon feeds",
    "defaultMastodonFolder",
  );
  renderFolderSetting(
    containerEl,
    plugin,
    "Default YouTube folder",
    "Default folder for YouTube feeds",
    "defaultYouTubeFolder",
  );
  renderFolderSetting(
    containerEl,
    plugin,
    "Default podcast folder",
    "Default folder for podcast feeds",
    "defaultPodcastFolder",
  );
  renderFolderSetting(
    containerEl,
    plugin,
    "Default RSS folder",
    "Default folder for RSS feeds",
    "defaultRssFolder",
  );
  renderFolderSetting(
    containerEl,
    plugin,
    "Default smallweb folder",
    "Default folder for smallweb feeds",
    "defaultSmallwebFolder",
  );

  new Setting(containerEl)
    .setName("Reset folder names")
    .setDesc("Restore all folder names to their out-of-the-box defaults.")
    .addButton((button) => {
      button.setButtonText("Default folder names").onClick(async () => {
        const d = DEFAULT_SETTINGS.media;
        plugin.settings.media.defaultMastodonFolder = d.defaultMastodonFolder;
        plugin.settings.media.defaultYouTubeFolder = d.defaultYouTubeFolder;
        plugin.settings.media.defaultPodcastFolder = d.defaultPodcastFolder;
        plugin.settings.media.defaultRssFolder = d.defaultRssFolder;
        plugin.settings.media.defaultSmallwebFolder = d.defaultSmallwebFolder;
        await plugin.saveSettings();
        new Notice("Folder names restored to defaults.");
        const view = await plugin.getActiveDashboardView();
        if (view) view.render();
        containerEl.empty();
        renderStorageSettingsTab(containerEl, plugin);
      });
    });
}
