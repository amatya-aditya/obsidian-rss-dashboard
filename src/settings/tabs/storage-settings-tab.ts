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

  let pendingStorageMode = plugin.settings.storageMode;
  let pendingStorageFolder = plugin.settings.storageFolder;

  const renderStorageStatus = (): string => {
    const status = plugin.getStorageStatus();
    const migrationState = status.migrationReady
      ? "Migration ready"
      : status.mode === "vault-shards"
        ? "Shards active"
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

  new Setting(containerEl)
    .setName("Storage mode")
    .setDesc(
      "Choose between the legacy monolithic data.json store and per-feed vault shard files, then use Apply below to confirm the change.",
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOption("legacy-json", "Legacy JSON")
        .addOption("vault-shards", "Vault shards")
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
      "Vault folder for per-feed shard files. This stays in the visible vault so cross-device sync tools can access it. Use Apply below to confirm the change.",
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
      button.setButtonText("Repair/Rebuild storage").onClick(() => {
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

  new Setting(containerEl).setName("Metadata Storage").setHeading();

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
