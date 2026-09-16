/**
 * Storage Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts and split out from the
 * General and Media tabs.
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
  ShardDeletionFailureModal,
  StorageTransitionModal,
  type MetadataCleanupAction,
  type ShardDeletionFailureAction,
  type StorageTransitionAction,
  type StorageTransitionOptions,
} from "../modals/storage-settings-modals";
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
  migrateToVaultShardsV2(): Promise<void>;
  repairVaultStorage(): Promise<void>;
  importPortableDataBundleFromFile(file: File): Promise<void>;
  exportPortableDataBundle(): Promise<void>;
  importFeedBundleFromFile(file: File): Promise<void>;
  exportFeedBundle(): Promise<void>;
  importSettingsBundleFromFile(file: File): Promise<void>;
  exportSettingsBundle(): Promise<void>;
  exportDataJson(): Promise<void>;
  revertToLegacyJsonStorageWithOptions(options?: {
    deleteShardFolder?: boolean;
  }): Promise<void>;
  isShardFolderDeletionError(error: unknown): error is ShardFolderDeletionError;
  openStorageFolderInSystem(folderPath?: string): Promise<void>;
  migrateMetadataToVaultLocation(): Promise<void>;
  revertMetadataToPluginDefault(): Promise<void>;
  getSyncV3Status?(): Promise<SyncV3Status>;
  createSyncV3Set?(): Promise<void>;
  joinSyncV3Set?(): Promise<boolean>;
  exportSyncV3HealthReport?(): Promise<void>;
  recoverSyncV3?(): Promise<SyncV3RecoveryResult>;
  exportPortableDataBundleChecked?(): Promise<boolean>;
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

function storageLog(_message: string, _details?: unknown): void {}

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

export function renderStorageSettingsTab(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  new Setting(containerEl).setName("Storage").setHeading();

  const syncV3StatusText = activeWindow.createSpan();
  syncV3StatusText.setText("Checking RSS dashboard sync v3 replica health…");
  const syncV3StatusDescription = activeWindow.createFragment();
  syncV3StatusDescription.appendChild(syncV3StatusText);
  const syncV3StatusSetting = new Setting(containerEl)
    .setName("Sync v3 replica health")
    .setDesc("");
  syncV3StatusSetting.descEl.empty();
  syncV3StatusSetting.descEl.appendChild(syncV3StatusDescription);
  if (plugin.getSyncV3Status) void plugin.getSyncV3Status().then((status) => {
    const lastWrite = status.lastLocalWrite
      ? new Date(status.lastLocalWrite).toLocaleString()
      : "not yet";
    const lastMerge = status.lastIncomingMerge
      ? new Date(status.lastIncomingMerge).toLocaleString()
      : "not yet";
    const setupGuidance = status.health === "migration-required"
      ? " This device is local-only until you create or join a Sync v3 set."
      : "";
    const conflictGuidance = status.conflictCopyPaths.length > 0
      ? ` ${status.conflictCopyPaths.length} sync conflict ${status.conflictCopyPaths.length === 1 ? "copy" : "copies"} found — ` +
        "check every device's Settings → Sync → Conflict resolution is set to \"Create conflict file\", not \"Automatically merge\"."
      : "";
    syncV3StatusText.setText(
      `Status: ${status.health}. Shared folder: ${status.root}. Device: ${status.deviceId.slice(0, 16)}. Epoch: ${status.epochId ?? "none"}. ` +
        `replicas: ${status.replicaCount}; invalid or incomplete: ${status.invalidReplicaCount}. ` +
        `local cache: ${status.localCachePath}. Last local write: ${lastWrite}. Last incoming merge: ${lastMerge}.` +
        setupGuidance + conflictGuidance,
    );
  }).catch(() => {
    syncV3StatusText.setText("Sync v3 status could not be read. Existing shared files were not changed.");
  });
  else syncV3StatusText.setText("Sync v3 is unavailable in this plugin build.");

  new Setting(containerEl)
    .setName("Sync v3 setup")
    .setDesc(
      "Sync v3 supports concurrent devices. This reports RSS dashboard replica health, not Obsidian sync completion. Enable sync all other types on every device, do not exclude RSS-dashboard-data, and upgrade every participating device before relying on v3.",
    )
    .addButton((button) => button.setButtonText("Create v3 sync set from this device").setCta().onClick(() => {
      if (!plugin.createSyncV3Set) return;
      runConfirmedBackupThenAction(plugin, {
        confirmMessage: "Create Sync v3 from this device? Export a portable backup first, then use this device as the authoritative source for the new shared set.",
        action: () => plugin.createSyncV3Set!(),
        onSuccess: () => {
          new Notice("Sync v3 set created. Join it from each other device.");
          plugin.settingTab?.display();
        },
        errorPrefix: "Could not create sync v3",
      });
    }))
    .addButton((button) => button.setButtonText("Join existing v3 sync set").onClick(() => {
      if (!plugin.joinSyncV3Set) return;
      void plugin.joinSyncV3Set().then((joined) => {
        new Notice(joined ? "Joined sync v3 set." : "No valid sync v3 set is available yet.");
        plugin.settingTab?.display();
      }).catch((error: unknown) => {
        new Notice(`Could not join sync v3${error instanceof Error ? `: ${error.message}` : ""}`);
      });
    }));

  new Setting(containerEl)
    .setName("Sync v3 recovery")
    .setDesc(
      "Export a diagnostic report to compare devices or attach to a bug report, or run recovery if health above is degraded. " +
        "Recovery always exports a portable backup first, then clears any detected sync conflict copies and either re-adopts " +
        "the current shared set (if this device fell behind in an adoption race) or re-derives this device's view from every " +
        "replica. It never touches another device's replica data.",
    )
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

  new Setting(containerEl).setName("Legacy storage recovery").setHeading();

  let pendingStorageMode = plugin.settings.storageMode;
  let pendingStorageFolder = plugin.settings.storageFolder;

  const renderStorageStatus = (): string => {
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
  };

  const runShardDeletionFailureFlow = async (
    storageFolder: string,
  ): Promise<"cancel" | "apply-anyway"> => {
    while (true) {
      const failureModal = new ShardDeletionFailureModal(
        plugin.app,
        storageFolder,
      );
      failureModal.open();
      const action: ShardDeletionFailureAction =
        await failureModal.waitForClose();

      if (action === "open-folder") {
        try {
          await plugin.openStorageFolderInSystem(storageFolder);
        } catch (error) {
          storageError("Open shard folder action failed", error, {
            storageFolder,
          });
          new Notice(
            `Could not open shard folder${
              error instanceof Error ? `: ${error.message}` : ""
            }`,
          );
        }
        continue;
      }

      return action;
    }
  };

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
      storageLog("Metadata storage folder changed", {
        previousMode,
        previousFolder,
        nextFolder,
      });

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

  const descFragment = containerEl.win.createFragment();
  const legacyDiv = containerEl.win.createDiv();
  setCssProps(legacyDiv, { "margin-bottom": "10px" });
  legacyDiv.createEl("strong", { text: "Legacy JSON:" });
  legacyDiv.appendText(
    " large monolith file. does not sync across devices (often exceeds 5mb limit)",
  );
  descFragment.appendChild(legacyDiv);

  const v1Div = containerEl.win.createDiv();
  setCssProps(v1Div, { "margin-bottom": "10px" });
  v1Div.createEl("strong", { text: "Shard storage v1:" });
  v1Div.appendText(
    " Creates individual vault files for each feed to improve syncing, but stores state (read, starred) inside the feed file, which can still cause minor sync conflicts.",
  );
  descFragment.appendChild(v1Div);

  const v2Div = containerEl.win.createDiv();
  v2Div.createEl("strong", { text: "Shard storage v2:" });
  v2Div.appendText(
    " Splits feed content and user state (read, starred, tags) into separate files. It remains available for recovery and migration.",
  );
  descFragment.appendChild(v2Div);

  const v3Div = activeWindow.createDiv();
  v3Div.createEl("strong", { text: "Sync v3 (experimental):" });
  v3Div.appendText(
    " device-owned replicas with explicit read/unread values. Use the setup actions above; legacy repair does not rewrite v3 replicas.",
  );
  descFragment.appendChild(v3Div);

  const storageModeSetting = new Setting(containerEl)
    .setName("Storage mode")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("legacy-json", "Legacy JSON")
        .addOption("vault-shards", "Shard storage v1")
        .addOption("vault-shards-v2", "Shard storage v2")
        .addOption("replicated-v3", "Sync v3 replicas (experimental)")
        .setValue(pendingStorageMode)
        .onChange((value) => {
          storageLog("Storage mode dropdown changed", {
            requestedMode: value,
            currentMode: plugin.settings.storageMode,
            folder: plugin.settings.storageFolder,
          });
          pendingStorageMode = value as typeof plugin.settings.storageMode;
        }),
    );
  // Obsidian's Setting.setDesc() routes through descEl.setText(), which only
  // appends a DocumentFragment when `instanceof DocumentFragment` succeeds --
  // that check fails when the fragment was built in a different window realm
  // than descEl (e.g. a popped-out window), and silently falls back to
  // stringifying it as "[object DocumentFragment]". Appending directly to
  // descEl sidesteps that fragile realm-sensitive dispatch entirely.
  storageModeSetting.descEl.empty();
  storageModeSetting.descEl.appendChild(descFragment);

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
          storageLog("Storage folder staged", {
            previousFolder: plugin.settings.storageFolder,
            pendingStorageFolder,
          });
        }),
    );

  new Setting(containerEl)
    .setName("Storage status")
    .setDesc(renderStorageStatus());

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

  new Setting(containerEl)
    .setName("Repair/rebuild storage")
    .setDesc(
      "Use this when shard storage seems out of sync, incomplete, or after manual folder moves. This will: 1. Re-check and normalize your storage folder path. 2. Force-rewrite all shard files from current feed data. 3. Force-save storage metadata. 4. Refresh storage status. Think of this as a safe 're-generate all shard files' action.'",
    );

  const storageActions = new Setting(containerEl);
  storageActions.settingEl.addClass("rss-dashboard-storage-actions");
  storageActions
    .setName("Storage actions")
    .setDesc(
      "Apply the selected storage mode, repair shard files, or import/export a portable data bundle (everything), a feed bundle (feeds, folders, tags, articles, and article state — no app settings), or a settings bundle (app preferences only) for desktop/mobile transfer workflows.",
    )
    .addButton((button) =>
      button
        .setButtonText("Apply")
        .setCta()
        .setTooltip("Apply the selected storage mode and/or folder location")
        .onClick(() => {
          void (async () => {
            const modeChanged =
              pendingStorageMode !== plugin.settings.storageMode;
            const folderChanged =
              pendingStorageFolder !== plugin.settings.storageFolder;

            storageLog("Clicked apply storage settings", {
              pendingStorageMode,
              currentMode: plugin.settings.storageMode,
              pendingStorageFolder,
              currentFolder: plugin.settings.storageFolder,
              modeChanged,
              folderChanged,
              feedCount: plugin.settings.feeds.length,
            });

            if (!modeChanged && !folderChanged) {
              new Notice("No storage changes to apply.");
              return;
            }

            if (pendingStorageMode === "replicated-v3") {
              new Notice("Use create v3 sync set or join existing v3 sync set above.");
              return;
            }

            if (!modeChanged && folderChanged) {
              try {
                plugin.settings.storageFolder = pendingStorageFolder;
                if (plugin.settings.storageMode === "vault-shards") {
                  await plugin.repairVaultStorage();
                } else {
                  await plugin.saveSettings();
                }
                new Notice(
                  `Storage folder updated to "${pendingStorageFolder}".`,
                );
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
              return;
            }

            const originalFolder = plugin.settings.storageFolder;
            if (folderChanged) {
              plugin.settings.storageFolder = pendingStorageFolder;
              await plugin.saveSettings();
            }

            const modalOptions: StorageTransitionOptions = {
              currentMode: plugin.settings.storageMode,
              targetMode: pendingStorageMode,
              storageFolder:
                plugin.settings.storageFolder.trim() ||
                ".rss-dashboard-data/feeds",
            };
            const modal = new StorageTransitionModal(plugin.app, modalOptions);
            modal.open();
            const action: StorageTransitionAction = await modal.waitForClose();

            if (action === "cancel") {
              if (folderChanged) {
                plugin.settings.storageFolder = originalFolder;
                await plugin.saveSettings();
              }
              return;
            }

            try {
              if (action === "export-data-json") {
                await plugin.exportDataJson();
                return;
              }

              if (pendingStorageMode === "vault-shards") {
                await plugin.migrateToVaultStorage();
                if (folderChanged) {
                  new Notice(
                    `Storage folder updated to "${pendingStorageFolder}" and vault storage migration completed.`,
                  );
                } else {
                  new Notice("Vault storage migration completed.");
                }
              } else if (pendingStorageMode === "vault-shards-v2") {
                await plugin.migrateToVaultShardsV2();
                if (folderChanged) {
                  new Notice(
                    `Storage folder updated to "${pendingStorageFolder}" and vault storage v2 migration completed.`,
                  );
                } else {
                  new Notice("Vault storage v2 migration completed.");
                }
              } else {
                if (action === "apply-delete-shards") {
                  try {
                    await plugin.revertToLegacyJsonStorageWithOptions({
                      deleteShardFolder: true,
                    });
                  } catch (error) {
                    if (!plugin.isShardFolderDeletionError(error)) {
                      throw error;
                    }

                    const followUpAction = await runShardDeletionFailureFlow(
                      plugin.settings.storageFolder,
                    );
                    if (followUpAction === "cancel") {
                      return;
                    }

                    await plugin.revertToLegacyJsonStorageWithOptions({
                      deleteShardFolder: false,
                    });
                  }
                } else {
                  await plugin.revertToLegacyJsonStorageWithOptions({
                    deleteShardFolder: false,
                  });
                }
                if (folderChanged) {
                  new Notice(
                    `Storage folder updated to "${pendingStorageFolder}" and legacy JSON storage enabled.`,
                  );
                } else {
                  new Notice("Legacy JSON storage enabled.");
                }
              }

              pendingStorageMode = plugin.settings.storageMode;
              pendingStorageFolder = plugin.settings.storageFolder;
            } catch (error) {
              storageError("Apply storage settings action failed", error, {
                pendingStorageMode,
                currentMode: plugin.settings.storageMode,
                pendingStorageFolder,
                currentFolder: plugin.settings.storageFolder,
              });
              new Notice(
                `Storage change failed${
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
          storageLog("Clicked repair/rebuild storage", {
            currentMode: plugin.settings.storageMode,
            folder: plugin.settings.storageFolder,
            feedCount: plugin.settings.feeds.length,
          });
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
    )
    .addButton((button) =>
      button.setButtonText("Import portable data bundle").onClick(() => {
        const input = activeDocument.body.createEl("input", {
          attr: { type: "file", accept: ".json,.backup,application/json" },
        });
        input.onchange = () => {
          void (async () => {
            const file = input.files?.[0];
            if (!file) return;
            storageLog("Clicked import portable data bundle", {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            try {
              await plugin.importPortableDataBundleFromFile(file);
            } catch (error) {
              storageError("Portable data bundle import failed", error, {
                currentMode: plugin.settings.storageMode,
                folder: plugin.settings.storageFolder,
              });
              new Notice(
                `Portable data bundle import failed${
                  error instanceof Error ? `: ${error.message}` : ""
                }`,
              );
            }
          })();
        };
        input.click();
      }),
    )
    .addButton((button) =>
      button.setButtonText("Export portable data bundle").onClick(() => {
        void (async () => {
          storageLog("Clicked export portable data bundle", {
            currentMode: plugin.settings.storageMode,
            folder: plugin.settings.storageFolder,
          });
          try {
            await plugin.exportPortableDataBundle();
          } catch (error) {
            storageError("Portable data bundle export failed", error, {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            new Notice(
              `Portable data bundle export failed${
                error instanceof Error ? `: ${error.message}` : ""
              }`,
            );
          }
        })();
      }),
    )
    .addButton((button) =>
      button.setButtonText("Import feed bundle").onClick(() => {
        const input = activeDocument.body.createEl("input", {
          attr: { type: "file", accept: ".json,.backup,application/json" },
        });
        input.onchange = () => {
          void (async () => {
            const file = input.files?.[0];
            if (!file) return;
            storageLog("Clicked import Feed bundle", {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            try {
              await plugin.importFeedBundleFromFile(file);
            } catch (error) {
              storageError("Feed bundle import failed", error, {
                currentMode: plugin.settings.storageMode,
                folder: plugin.settings.storageFolder,
              });
              new Notice(
                `Feed bundle import failed${
                  error instanceof Error ? `: ${error.message}` : ""
                }`,
              );
            }
          })();
        };
        input.click();
      }),
    )
    .addButton((button) =>
      button.setButtonText("Export feed bundle").onClick(() => {
        void (async () => {
          storageLog("Clicked export Feed bundle", {
            currentMode: plugin.settings.storageMode,
            folder: plugin.settings.storageFolder,
          });
          try {
            await plugin.exportFeedBundle();
          } catch (error) {
            storageError("Feed bundle export failed", error, {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            new Notice(
              `Feed bundle export failed${
                error instanceof Error ? `: ${error.message}` : ""
              }`,
            );
          }
        })();
      }),
    )
    .addButton((button) =>
      button.setButtonText("Import settings bundle").onClick(() => {
        const input = activeDocument.body.createEl("input", {
          attr: { type: "file", accept: ".json,.backup,application/json" },
        });
        input.onchange = () => {
          void (async () => {
            const file = input.files?.[0];
            if (!file) return;
            storageLog("Clicked import Settings bundle", {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            try {
              await plugin.importSettingsBundleFromFile(file);
            } catch (error) {
              storageError("Settings bundle import failed", error, {
                currentMode: plugin.settings.storageMode,
                folder: plugin.settings.storageFolder,
              });
              new Notice(
                `Settings bundle import failed${
                  error instanceof Error ? `: ${error.message}` : ""
                }`,
              );
            }
          })();
        };
        input.click();
      }),
    )
    .addButton((button) =>
      button.setButtonText("Export settings bundle").onClick(() => {
        void (async () => {
          storageLog("Clicked export Settings bundle", {
            currentMode: plugin.settings.storageMode,
            folder: plugin.settings.storageFolder,
          });
          try {
            await plugin.exportSettingsBundle();
          } catch (error) {
            storageError("Settings bundle export failed", error, {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            new Notice(
              `Settings bundle export failed${
                error instanceof Error ? `: ${error.message}` : ""
              }`,
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
