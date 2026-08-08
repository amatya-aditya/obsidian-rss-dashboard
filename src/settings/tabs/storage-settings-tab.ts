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
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../types/types";
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
  migrateToVaultStorage(): Promise<void>;
  migrateToVaultShardsV2(): Promise<void>;
  repairVaultStorage(): Promise<void>;
  importPortableDataBundleFromFile(file: File): Promise<void>;
  exportPortableDataBundle(): Promise<void>;
  exportDataJson(): Promise<void>;
  revertToLegacyJsonStorageWithOptions(options?: {
    deleteShardFolder?: boolean;
  }): Promise<void>;
  isShardFolderDeletionError(error: unknown): error is ShardFolderDeletionError;
  openStorageFolderInSystem(folderPath?: string): Promise<void>;
  migrateMetadataToVaultLocation(): Promise<void>;
  revertMetadataToPluginDefault(): Promise<void>;
  getSyncV3Status?(): Promise<{
    health: "migration-required" | "waiting-for-primary" | "ready" | "degraded";
    root: string;
    deviceId: string;
    replicaCount: number;
    invalidReplicaCount: number;
    localCachePath: string;
    lastLocalWrite: number | null;
    lastIncomingMerge: number | null;
  }>;
  createSyncV3Set?(): Promise<void>;
  joinSyncV3Set?(): Promise<boolean>;
}

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

type MediaFolderSettingKey =
  | "defaultTwitterFolder"
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

  const syncV3StatusText = activeDocument.createElement("span");
  syncV3StatusText.setText("Checking RSS dashboard sync v3 replica health…");
  const syncV3StatusDescription = activeDocument.createDocumentFragment();
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
    syncV3StatusText.setText(
      `Status: ${status.health}. Shared folder: ${status.root}. Device: ${status.deviceId.slice(0, 16)}. ` +
        `replicas: ${status.replicaCount}; invalid or incomplete: ${status.invalidReplicaCount}. ` +
        `local cache: ${status.localCachePath}. Last local write: ${lastWrite}. Last incoming merge: ${lastMerge}.` +
        setupGuidance,
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
      const confirmed = activeWindow.confirm(
        "Create Sync v3 from this device? Export a portable backup first, then use this device as the authoritative source for the new shared set.",
      );
      if (!confirmed) return;
      void plugin.exportPortableDataBundle().then(() => plugin.createSyncV3Set!()).then(() => {
        new Notice("Sync v3 set created. Join it from each other device.");
        plugin.settingTab?.display();
      }).catch((error: unknown) => {
        new Notice(`Could not create sync v3${error instanceof Error ? `: ${error.message}` : ""}`);
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

  const descFragment = activeDocument.createDocumentFragment();
  const legacyDiv = activeDocument.createElement("div");
  setCssProps(legacyDiv, { "margin-bottom": "10px" });
  legacyDiv.createEl("strong", { text: "Legacy JSON:" });
  legacyDiv.appendText(
    " large monolith file. does not sync across devices (often exceeds 5mb limit)",
  );
  descFragment.appendChild(legacyDiv);

  const v1Div = activeDocument.createElement("div");
  setCssProps(v1Div, { "margin-bottom": "10px" });
  v1Div.createEl("strong", { text: "Shard storage v1:" });
  v1Div.appendText(
    " Creates individual vault files for each feed to improve syncing, but stores state (read, starred) inside the feed file, which can still cause minor sync conflicts.",
  );
  descFragment.appendChild(v1Div);

  const v2Div = activeDocument.createElement("div");
  v2Div.createEl("strong", { text: "Shard storage v2:" });
  v2Div.appendText(
    " Splits feed content and user state (read, starred, tags) into separate files. It remains available for recovery and migration.",
  );
  descFragment.appendChild(v2Div);

  const v3Div = activeDocument.createElement("div");
  v3Div.createEl("strong", { text: "Sync v3:" });
  v3Div.appendText(
    " device-owned replicas with explicit read/unread values. Use the setup actions above; legacy repair does not rewrite v3 replicas.",
  );
  descFragment.appendChild(v3Div);

  const storageModeSetting = new Setting(containerEl)
    .setName("Storage mode")
    .setDesc("");
  storageModeSetting.descEl.empty();
  storageModeSetting.descEl.appendChild(descFragment);
  storageModeSetting.addDropdown((dropdown) =>
      dropdown
        .addOption("legacy-json", "Legacy JSON")
        .addOption("vault-shards", "Shard storage v1")
        .addOption("vault-shards-v2", "Shard storage v2")
        .addOption("replicated-v3", "Sync v3 replicas")
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
      "Apply the selected storage mode, repair shard files, or export a portable bundle for desktop/mobile transfer workflows.",
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
      button.setButtonText("Import shard data").onClick(() => {
        const input = activeDocument.body.createEl("input", {
          attr: { type: "file", accept: ".json,.backup,application/json" },
        });
        input.onchange = () => {
          void (async () => {
            const file = input.files?.[0];
            if (!file) return;
            storageLog("Clicked import shard data", {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            try {
              await plugin.importPortableDataBundleFromFile(file);
            } catch (error) {
              storageError("Shard data import failed", error, {
                currentMode: plugin.settings.storageMode,
                folder: plugin.settings.storageFolder,
              });
              new Notice(
                `Shard data import failed${
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
      button.setButtonText("Export shard data").onClick(() => {
        void (async () => {
          storageLog("Clicked export shard data", {
            currentMode: plugin.settings.storageMode,
            folder: plugin.settings.storageFolder,
          });
          try {
            await plugin.exportPortableDataBundle();
          } catch (error) {
            storageError("Shard data export failed", error, {
              currentMode: plugin.settings.storageMode,
              folder: plugin.settings.storageFolder,
            });
            new Notice(
              `Shard data export failed${
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
    "Default Twitter folder",
    "Default folder for Twitter/X/Nitter feeds",
    "defaultTwitterFolder",
  );
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
        plugin.settings.media.defaultTwitterFolder = d.defaultTwitterFolder;
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
