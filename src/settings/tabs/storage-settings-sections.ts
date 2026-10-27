/** Focused renderers and actions for the Storage settings tab. */
import {
  App,
  Notice,
  Setting,
  normalizePath,
  type WorkspaceLeaf,
} from "obsidian";
import type { ImportResult } from "../../services/import-export-service";
import { FolderSuggest } from "../../components/folder-suggest";
import { setCssProps } from "../../utils/platform-utils";
import { trashVaultFile, vaultFileExists } from "../../utils/vault-files";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../types/types";
import {
  MetadataCleanupModal,
  MetadataLocationClearModal,
  RepairPreviewModal,
  ShardDeletionFailureModal,
  UnloadedFeedsFolderChangeModal,
  StorageTransitionModal,
  type MetadataCleanupAction,
  type ShardDeletionFailureAction,
  type StorageTransitionAction,
  type StorageTransitionOptions,
} from "../modals/storage-settings-modals";
import {
  isHiddenFromSync,
  type FeedStorageStatus,
  type RepairPreview,
  type RepairResult,
  type ShardFolderDeletionError,
} from "../../services/feed-storage-repository";
import { addInputClearButton } from "../../utils/input-clear-button";

export interface StorageSettingsPlugin {
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
  getUnloadedShardFeedCount(): number;
  previewRepairVaultStorage(): Promise<RepairPreview>;
  repairVaultStorage(): Promise<RepairResult>;
  importPortableDataBundleFromFile(file: File): Promise<ImportResult>;
  exportPortableDataBundle(): Promise<void>;
  importFeedBundleFromFile(file: File): Promise<ImportResult>;
  exportFeedBundle(): Promise<void>;
  importSettingsBundleFromFile(file: File): Promise<ImportResult>;
  exportSettingsBundle(): Promise<void>;
  exportDataJson(): Promise<void>;
  revertToLegacyJsonStorageWithOptions(options?: {
    deleteShardFolder?: boolean;
  }): Promise<void>;
  isShardFolderDeletionError(error: unknown): error is ShardFolderDeletionError;
  openStorageFolderInSystem(folderPath?: string): Promise<void>;
  migrateMetadataToVaultLocation(): Promise<void>;
  revertMetadataToPluginDefault(): Promise<void>;
}

type MediaFolderSettingKey =
  | "defaultMastodonFolder"
  | "defaultYouTubeFolder"
  | "defaultPodcastFolder"
  | "defaultRssFolder"
  | "defaultSmallwebFolder";

interface StorageSettingsState {
  pendingStorageMode: RssDashboardSettings["storageMode"];
  pendingStorageFolder: string;
  pendingMetadataStorageFolder: string;
  lastSavedMetadataStorageFolder: string;
}

interface BundleAction {
  label: string;
  logName: string;
  failureName: string;
  run(file?: File): Promise<void>;
  import?: boolean;
}

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

/**
 * Shard storage v2 keeps article state in `user-state.json` inside the
 * metadata folder, not the storage folder (ADR 0004). Returns a hint when the
 * feeds sync (visible storage folder) but that state file does not sync.
 */
export function getHiddenUserStateHint(
  settings: Pick<
    RssDashboardSettings,
    "storageMode" | "storageFolder" | "metadataStorageFolder"
  >,
): string | null {
  if (settings.storageMode !== "vault-shards-v2") {
    return null;
  }
  const metadataFolder =
    settings.metadataStorageFolder.trim().replace(/^\/+|\/+$/g, "") ||
    ".rss-dashboard-data";
  if (
    isHiddenFromSync(settings.storageFolder) ||
    !isHiddenFromSync(metadataFolder)
  ) {
    return null;
  }
  return `Your feeds sync, but read, starred, and tag state (user-state.json) stays in the hidden folder ${metadataFolder}, which sync tools skip. To sync it too, set Metadata data.json location to a folder without a leading '.'.`;
}

function renderStorageStatus(plugin: StorageSettingsPlugin): string {
  const status = plugin.getStorageStatus();
  const migrationState = status.migrationReady
    ? "Migration ready"
    : status.mode === "vault-shards-v2"
      ? "Shard storage v2 active"
      : status.mode === "vault-shards"
        ? "Shard storage v1 active"
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

function noticeHiddenUserState(plugin: StorageSettingsPlugin): void {
  const hint = getHiddenUserStateHint(plugin.settings);
  if (hint) {
    new Notice(hint, 15000);
  }
}

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
          const nextValue = typeof value === "string" ? value.trim() : "";
          // normalizePath returns "/" for an empty path; keep "" so a cleared
          // field means the root, not a feed folder named "/".
          const normalized = normalizePath(nextValue);
          plugin.settings.media[key] = normalized === "/" ? "" : normalized;
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
      addInputClearButton(text.inputEl, { label: "Clear folder" });
    });
}

export function renderStorageSettingsSections(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  const state: StorageSettingsState = {
    pendingStorageMode: plugin.settings.storageMode,
    pendingStorageFolder: plugin.settings.storageFolder,
    pendingMetadataStorageFolder:
      plugin.settings.metadataStorageMode === "vault-location"
        ? plugin.settings.metadataStorageFolder
        : "",
    lastSavedMetadataStorageFolder:
      plugin.settings.metadataStorageMode === "vault-location"
        ? plugin.settings.metadataStorageFolder
        : "",
  };

  new Setting(containerEl).setName("Storage").setHeading();
  renderModeAndFolderSettings(containerEl, plugin, state);
  renderStorageActionSettings(containerEl, plugin, state);
  renderMetadataSettings(containerEl, plugin, state);
  renderDefaultFolderSettings(containerEl, plugin);
}

function renderModeAndFolderSettings(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
): void {
  const descFragment = containerEl.win.createFragment();
  const legacyDiv = containerEl.win.createDiv();
  setCssProps(legacyDiv, { "margin-bottom": "10px" });
  legacyDiv.createEl("strong", { text: "Legacy JSON:" });
  legacyDiv.appendText(
    " One large data.json holding feeds, articles, and settings (a deprecated storage mode). It often exceeds the 5 MB sync limit, so it may not sync across devices.",
  );
  descFragment.appendChild(legacyDiv);

  const v1Div = containerEl.win.createDiv();
  setCssProps(v1Div, { "margin-bottom": "10px" });
  v1Div.createEl("strong", { text: "Shard storage v1:" });
  v1Div.appendText(
    " One vault file per feed to improve syncing (a deprecated storage mode). Article state (read, starred) stays inside each feed file, which can still cause minor sync conflicts.",
  );
  descFragment.appendChild(v1Div);

  const v2Div = containerEl.win.createDiv();
  v2Div.createEl("strong", { text: "Shard storage v2:" });
  v2Div.appendText(
    " One vault file per feed for feed content, with article state (read, starred, tags) in a separate user-state.json. Reading or starring an article never rewrites a feed file, which avoids most sync conflicts.",
  );
  descFragment.appendChild(v2Div);

  const storageModeSetting = new Setting(containerEl)
    .setName("Feed storage mode")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("legacy-json", "Legacy JSON")
        .addOption("vault-shards", "Shard storage v1")
        .addOption("vault-shards-v2", "Shard storage v2")
        .setValue(state.pendingStorageMode)
        .onChange((value) => {
          storageLog("Storage mode dropdown changed", {
            requestedMode: value,
            currentMode: plugin.settings.storageMode,
            folder: plugin.settings.storageFolder,
          });
          state.pendingStorageMode =
            value as typeof plugin.settings.storageMode;
        }),
    );
  // Setting.setDesc routes fragments through a realm-sensitive instanceof.
  storageModeSetting.descEl.empty();
  storageModeSetting.descEl.appendChild(descFragment);

  new Setting(containerEl)
    .setName("Feed storage folder")
    .setDesc(
      "Vault folder for per-feed shard files. A change takes effect only after you apply it. Adding a '.' prefix to the path will hide the folder. The '.' must be removed for Obsidian sync to work properly.",
    )
    .addText((text) => {
      text
        .setPlaceholder(".rss-dashboard-data/feeds")
        .setValue(plugin.settings.storageFolder)
        .onChange((value) => {
          state.pendingStorageFolder =
            value.trim() || ".rss-dashboard-data/feeds";
          storageLog("Storage folder staged", {
            previousFolder: plugin.settings.storageFolder,
            pendingStorageFolder: state.pendingStorageFolder,
          });
        });
      addInputClearButton(text.inputEl, { label: "Clear folder" });
    });

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

  new Setting(containerEl)
    .setName("Repair/rebuild storage")
    .setDesc(
      "Use this when shard storage seems out of sync, incomplete, or after manual folder moves. This will: 1. Re-check and normalize your feed storage folder path. 2. Regenerate shard files for feeds whose articles are loaded; feeds with no loaded articles are skipped. 3. Force-save storage metadata. 4. Refresh storage status.",
    );
}

function renderStorageActionSettings(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
): void {
  const storageActions = new Setting(containerEl);
  storageActions.settingEl.addClass("rss-dashboard-storage-actions");
  storageActions
    .setName("Storage actions")
    .setDesc(
      "Apply the selected storage mode, repair shard files, or import/export a portable data bundle (everything), a feed bundle (feeds, folders, tags, articles, and article state — no app settings), or a settings bundle (app preferences, including storage settings) for desktop/mobile transfer workflows.",
    );
  addApplyButton(storageActions, plugin, state);
  addRepairButton(storageActions, plugin);
  addBundleButtons(storageActions, plugin);

  const applyButton = Array.from(
    storageActions.controlEl.querySelectorAll("button"),
  ).find((button) => button.textContent === "Apply");
  if (applyButton?.instanceOf(HTMLButtonElement)) {
    setCssProps(applyButton, {
      "background-color": "#7c5cff",
      color: "#ffffff",
      border: "1px solid #6a4df0",
    });
  }
}

function addApplyButton(
  setting: Setting,
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
): void {
  setting.addButton((button) =>
    button
      .setButtonText("Apply")
      .setCta()
      .setTooltip("Apply the selected storage mode and/or folder location")
      .onClick(() => {
        void applyStorageSettings(plugin, state);
      }),
  );
}

async function applyStorageSettings(
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
): Promise<void> {
  const modeChanged = state.pendingStorageMode !== plugin.settings.storageMode;
  const folderChanged =
    state.pendingStorageFolder !== plugin.settings.storageFolder;
  storageLog("Clicked apply storage settings", {
    pendingStorageMode: state.pendingStorageMode,
    currentMode: plugin.settings.storageMode,
    pendingStorageFolder: state.pendingStorageFolder,
    currentFolder: plugin.settings.storageFolder,
    modeChanged,
    folderChanged,
    feedCount: plugin.settings.feeds.length,
  });

  if (!modeChanged && !folderChanged) {
    new Notice("No storage changes to apply.");
    return;
  }

  if (!(await confirmStorageFolderChange(plugin, folderChanged))) {
    return;
  }

  if (!modeChanged && folderChanged) {
    await applyFolderOnlyChange(plugin, state);
    return;
  }

  await applyStorageModeChange(plugin, state, folderChanged);
}

async function confirmStorageFolderChange(
  plugin: StorageSettingsPlugin,
  folderChanged: boolean,
): Promise<boolean> {
  const unloadedFeedCount = folderChanged
    ? plugin.getUnloadedShardFeedCount()
    : 0;
  if (unloadedFeedCount <= 0) {
    return true;
  }
  const warningModal = new UnloadedFeedsFolderChangeModal(plugin.app, {
    unloadedFeedCount,
    totalFeedCount: plugin.settings.feeds.length,
  });
  const warningClosed = warningModal.waitForClose();
  warningModal.open();
  if ((await warningClosed) === "apply") {
    return true;
  }
  storageLog("Storage folder change cancelled: feeds not loaded", {
    unloadedFeedCount,
  });
  return false;
}

async function applyFolderOnlyChange(
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
): Promise<void> {
  try {
    plugin.settings.storageFolder = state.pendingStorageFolder;
    if (plugin.settings.storageMode === "vault-shards") {
      await plugin.repairVaultStorage();
    } else {
      await plugin.saveSettings();
    }
    new Notice(`Storage folder updated to "${state.pendingStorageFolder}".`);
    noticeHiddenUserState(plugin);
  } catch (error) {
    storageError("Storage folder apply failed", error, {
      pendingStorageFolder: state.pendingStorageFolder,
      mode: plugin.settings.storageMode,
    });
    new Notice(
      `Storage folder update failed${
        error instanceof Error ? `: ${error.message}` : ""
      }`,
    );
  }
}

async function applyStorageModeChange(
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
  folderChanged: boolean,
): Promise<void> {
  const originalFolder = plugin.settings.storageFolder;
  if (folderChanged) {
    plugin.settings.storageFolder = state.pendingStorageFolder;
    await plugin.saveSettings();
  }

  const modalOptions: StorageTransitionOptions = {
    currentMode: plugin.settings.storageMode,
    targetMode: state.pendingStorageMode,
    storageFolder:
      plugin.settings.storageFolder.trim() || ".rss-dashboard-data/feeds",
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
    if (await runStorageTransition(plugin, state, action, folderChanged)) {
      state.pendingStorageMode = plugin.settings.storageMode;
      state.pendingStorageFolder = plugin.settings.storageFolder;
    }
  } catch (error) {
    storageError("Apply storage settings action failed", error, {
      pendingStorageMode: state.pendingStorageMode,
      currentMode: plugin.settings.storageMode,
      pendingStorageFolder: state.pendingStorageFolder,
      currentFolder: plugin.settings.storageFolder,
    });
    new Notice(
      `Storage change failed${
        error instanceof Error ? `: ${error.message}` : ""
      }`,
    );
  }
}

async function runStorageTransition(
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
  action: StorageTransitionAction,
  folderChanged: boolean,
): Promise<boolean> {
  if (action === "export-data-json") {
    await plugin.exportDataJson();
    return false;
  }
  if (state.pendingStorageMode === "vault-shards") {
    await plugin.migrateToVaultStorage();
    new Notice(
      folderChanged
        ? `Storage folder updated to "${state.pendingStorageFolder}" and vault storage migration completed.`
        : "Vault storage migration completed.",
    );
    return true;
  }
  if (state.pendingStorageMode === "vault-shards-v2") {
    await plugin.migrateToVaultShardsV2();
    new Notice(
      folderChanged
        ? `Storage folder updated to "${state.pendingStorageFolder}" and vault storage v2 migration completed.`
        : "Vault storage v2 migration completed.",
    );
    noticeHiddenUserState(plugin);
    return true;
  }
  if (!(await revertToLegacyStorage(plugin, action))) {
    return false;
  }
  new Notice(
    folderChanged
      ? `Storage folder updated to "${state.pendingStorageFolder}" and legacy JSON storage enabled.`
      : "Legacy JSON storage enabled.",
  );
  return true;
}

async function revertToLegacyStorage(
  plugin: StorageSettingsPlugin,
  action: StorageTransitionAction,
): Promise<boolean> {
  if (action !== "apply-delete-shards") {
    await plugin.revertToLegacyJsonStorageWithOptions({
      deleteShardFolder: false,
    });
    return true;
  }
  try {
    await plugin.revertToLegacyJsonStorageWithOptions({
      deleteShardFolder: true,
    });
    return true;
  } catch (error) {
    if (!plugin.isShardFolderDeletionError(error)) {
      throw error;
    }
    const followUpAction = await runShardDeletionFailureFlow(
      plugin,
      plugin.settings.storageFolder,
    );
    if (followUpAction === "cancel") {
      return false;
    }
    await plugin.revertToLegacyJsonStorageWithOptions({
      deleteShardFolder: false,
    });
  }
  return true;
}

async function runShardDeletionFailureFlow(
  plugin: StorageSettingsPlugin,
  storageFolder: string,
): Promise<"cancel" | "apply-anyway"> {
  while (true) {
    const failureModal = new ShardDeletionFailureModal(
      plugin.app,
      storageFolder,
    );
    failureModal.open();
    const action: ShardDeletionFailureAction =
      await failureModal.waitForClose();
    if (action !== "open-folder") {
      return action;
    }
    try {
      await plugin.openStorageFolderInSystem(storageFolder);
    } catch (error) {
      storageError("Open shard folder action failed", error, { storageFolder });
      new Notice(
        `Could not open shard folder${
          error instanceof Error ? `: ${error.message}` : ""
        }`,
      );
    }
  }
}

function addRepairButton(
  setting: Setting,
  plugin: StorageSettingsPlugin,
): void {
  setting.addButton((button) =>
    button.setButtonText("Repair/rebuild storage").onClick(() => {
      void runRepairAction(plugin);
    }),
  );
}

async function runRepairAction(plugin: StorageSettingsPlugin): Promise<void> {
  storageLog("Clicked repair/rebuild storage", {
    currentMode: plugin.settings.storageMode,
    folder: plugin.settings.storageFolder,
    feedCount: plugin.settings.feeds.length,
  });
  try {
    const preview = await plugin.previewRepairVaultStorage();
    const previewModal = new RepairPreviewModal(plugin.app, preview);
    const previewClosed = previewModal.waitForClose();
    previewModal.open();
    if ((await previewClosed) !== "repair") {
      storageLog("Repair cancelled from preview");
      return;
    }
    const { skippedFeedCount } = await plugin.repairVaultStorage();
    if (plugin.settingTab) {
      plugin.settingTab.display();
    }
    new Notice(
      skippedFeedCount > 0
        ? `Storage repair completed. ${skippedFeedCount} feeds were skipped because this device has no articles loaded to rebuild them from.`
        : "Storage repair completed.",
    );
  } catch (error) {
    storageError("Repair button action failed", error, {
      currentMode: plugin.settings.storageMode,
      folder: plugin.settings.storageFolder,
    });
    new Notice(
      `Storage repair failed${
        error instanceof Error ? `: ${error.message}` : ""
      }`,
    );
  }
}

function addBundleButtons(
  setting: Setting,
  plugin: StorageSettingsPlugin,
): void {
  const actions: BundleAction[] = [
    {
      label: "Import portable data bundle",
      logName: "portable data bundle",
      failureName: "Portable data bundle import",
      import: true,
      run: (file) =>
        file
          ? plugin.importPortableDataBundleFromFile(file).then(() => {})
          : Promise.resolve(),
    },
    {
      label: "Export portable data bundle",
      logName: "portable data bundle",
      failureName: "Portable data bundle export",
      run: () => plugin.exportPortableDataBundle(),
    },
    {
      label: "Import feed bundle",
      logName: "Feed bundle",
      failureName: "Feed bundle import",
      import: true,
      run: (file) =>
        file
          ? plugin.importFeedBundleFromFile(file).then(() => {})
          : Promise.resolve(),
    },
    {
      label: "Export feed bundle",
      logName: "Feed bundle",
      failureName: "Feed bundle export",
      run: () => plugin.exportFeedBundle(),
    },
    {
      label: "Import settings bundle",
      logName: "Settings bundle",
      failureName: "Settings bundle import",
      import: true,
      run: (file) =>
        file
          ? plugin.importSettingsBundleFromFile(file).then(() => {})
          : Promise.resolve(),
    },
    {
      label: "Export settings bundle",
      logName: "Settings bundle",
      failureName: "Settings bundle export",
      run: () => plugin.exportSettingsBundle(),
    },
  ];
  for (const action of actions) {
    if (action.import) {
      addImportBundleButton(setting, plugin, action);
    } else {
      addExportBundleButton(setting, plugin, action);
    }
  }
}

function addImportBundleButton(
  setting: Setting,
  plugin: StorageSettingsPlugin,
  action: BundleAction,
): void {
  setting.addButton((button) =>
    button.setButtonText(action.label).onClick(() => {
      const input = activeDocument.body.createEl("input", {
        attr: { type: "file", accept: ".json,.backup,application/json" },
      });
      input.onchange = () => {
        void (async () => {
          const file = input.files?.[0];
          if (!file) return;
          storageLog(`Clicked import ${action.logName}`, {
            currentMode: plugin.settings.storageMode,
            folder: plugin.settings.storageFolder,
          });
          try {
            await action.run(file);
          } catch (error) {
            reportBundleFailure(action, plugin, error);
          }
        })();
      };
      input.click();
    }),
  );
}

function addExportBundleButton(
  setting: Setting,
  plugin: StorageSettingsPlugin,
  action: BundleAction,
): void {
  setting.addButton((button) =>
    button.setButtonText(action.label).onClick(() => {
      void (async () => {
        storageLog(`Clicked export ${action.logName}`, {
          currentMode: plugin.settings.storageMode,
          folder: plugin.settings.storageFolder,
        });
        try {
          await action.run();
        } catch (error) {
          reportBundleFailure(action, plugin, error);
        }
      })();
    }),
  );
}

function reportBundleFailure(
  action: BundleAction,
  plugin: StorageSettingsPlugin,
  error: unknown,
): void {
  storageError(`${action.failureName} failed`, error, {
    currentMode: plugin.settings.storageMode,
    folder: plugin.settings.storageFolder,
  });
  new Notice(
    `${action.failureName} failed${
      error instanceof Error ? `: ${error.message}` : ""
    }`,
  );
}

function renderMetadataSettings(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
): void {
  new Setting(containerEl).setName("Metadata storage").setHeading();
  new Setting(containerEl)
    .setName("Metadata data.json location")
    .setDesc(
      "Optional vault folder for metadata data.json. Leave empty to keep metadata in the plugin folder. A change takes effect only when you click Apply metadata location. Article state (user-state.json) is always stored in this folder, or in .rss-dashboard-data when the field is empty, and Shard storage v2 is the only mode that reads it. After you move to a new folder, you can delete the previous data.json and, in v2, user-state.json, or keep them as a backup. Outside v2, an orphaned user-state.json is kept as a backup. Clearing the field moves the vault data.json to the trash after you confirm. Use a folder without a '.' prefix for Obsidian Sync.",
    )
    .addText((text) => {
      text
        .setPlaceholder(
          plugin.settings.metadataStorageFolder.trim() || ".rss-dashboard-data",
        )
        .setValue(state.lastSavedMetadataStorageFolder)
        .onChange((value) => {
          state.pendingMetadataStorageFolder = value;
        });
      addInputClearButton(text.inputEl, { label: "Clear folder" });
    });

  const hiddenStateHint = getHiddenUserStateHint(plugin.settings);
  if (hiddenStateHint) {
    containerEl.createDiv({
      cls: "setting-item-description rss-dashboard-hidden-user-state-hint",
      text: hiddenStateHint,
    });
  }

  addMetadataAction(containerEl, plugin, state);
}

function addMetadataAction(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
): void {
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
              state.pendingMetadataStorageFolder.trim() !==
              state.lastSavedMetadataStorageFolder;
            if (!metadataChanged) {
              new Notice("Metadata location is already active.");
              return;
            }
            await commitMetadataStorageFolder(plugin, state);
            if (plugin.settingTab) {
              plugin.settingTab.display();
            }
          })();
        }),
    );
}

async function commitMetadataStorageFolder(
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
): Promise<void> {
  const nextFolder = state.pendingMetadataStorageFolder.trim();
  if (nextFolder === state.lastSavedMetadataStorageFolder) {
    return;
  }
  const previousMode = plugin.settings.metadataStorageMode;
  const previousFolder = plugin.settings.metadataStorageFolder;
  const pluginDefaultPath = `${plugin.app.vault.configDir}/plugins/rss-dashboard/data.json`;
  const previousDataFilePath =
    previousMode === "vault-location"
      ? `${previousFolder}/data.json`
      : pluginDefaultPath;
  try {
    storageLog("Metadata storage folder changed", {
      previousMode,
      previousFolder,
      nextFolder,
    });
    const shouldOfferCleanup = await applyMetadataFolder(
      plugin,
      state,
      nextFolder,
      previousFolder,
    );
    if (!shouldOfferCleanup) {
      return;
    }
    await maybeOfferMetadataCleanup(
      plugin,
      previousDataFilePath,
      pluginDefaultPath,
    );
  } catch (error) {
    plugin.settings.metadataStorageMode = previousMode;
    plugin.settings.metadataStorageFolder = previousFolder;
    state.pendingMetadataStorageFolder =
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
}

async function applyMetadataFolder(
  plugin: StorageSettingsPlugin,
  state: StorageSettingsState,
  nextFolder: string,
  previousFolder: string,
): Promise<boolean> {
  if (!nextFolder) {
    if (plugin.settings.metadataStorageMode === "vault-location") {
      const clearModal = new MetadataLocationClearModal(plugin.app, {
        currentLocationLabel: previousFolder,
      });
      const clearClosed = clearModal.waitForClose();
      clearModal.open();
      if ((await clearClosed) !== "move-to-trash") {
        state.pendingMetadataStorageFolder =
          state.lastSavedMetadataStorageFolder;
        return false;
      }
      await plugin.revertMetadataToPluginDefault();
    }
    plugin.settings.metadataStorageFolder = ".rss-dashboard-data";
    await plugin.saveSettings();
    state.lastSavedMetadataStorageFolder = "";
    state.pendingMetadataStorageFolder = "";
    return true;
  }
  plugin.settings.metadataStorageFolder = nextFolder;
  if (plugin.settings.metadataStorageMode === "vault-location") {
    plugin.settings.metadataStorageMode = "plugin-default";
  }
  await plugin.migrateMetadataToVaultLocation();
  state.lastSavedMetadataStorageFolder = nextFolder;
  state.pendingMetadataStorageFolder = nextFolder;
  return true;
}

async function maybeOfferMetadataCleanup(
  plugin: StorageSettingsPlugin,
  previousDataFilePath: string,
  pluginDefaultPath: string,
): Promise<void> {
  if (
    !previousDataFilePath ||
    normalizePath(previousDataFilePath) === normalizePath(pluginDefaultPath)
  ) {
    return;
  }
  const paths = [previousDataFilePath];
  if (plugin.settings.storageMode === "vault-shards-v2") {
    paths.push(
      previousDataFilePath.replace(/\/data\.json$/i, "/user-state.json"),
    );
  }
  const existingPaths: string[] = [];
  for (const path of paths) {
    if (await vaultFileExists(plugin.app, path)) {
      existingPaths.push(path);
    }
  }
  if (existingPaths.length === 0) {
    return;
  }
  const cleanupModal = new MetadataCleanupModal(plugin.app, {
    previousLocationLabel: previousDataFilePath.replace(/\/data\.json$/i, ""),
  });
  cleanupModal.open();
  const cleanupAction: MetadataCleanupAction =
    await cleanupModal.waitForClose();
  if (cleanupAction !== "delete") {
    return;
  }
  await deletePreviousMetadataFiles(plugin, existingPaths, pluginDefaultPath);
}

async function deletePreviousMetadataFiles(
  plugin: StorageSettingsPlugin,
  paths: string[],
  pluginDefaultPath: string,
): Promise<void> {
  let cleanupFailed = false;
  for (const path of paths) {
    try {
      if (normalizePath(path) !== normalizePath(pluginDefaultPath)) {
        await trashVaultFile(plugin.app, path);
      }
    } catch (error) {
      cleanupFailed = true;
      storageError("Failed to delete previous metadata copy", error, { path });
    }
  }
  new Notice(
    cleanupFailed
      ? "Failed to delete one or more previous metadata files."
      : "Previous metadata files deleted.",
  );
}

function renderDefaultFolderSettings(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  new Setting(containerEl).setName("Default folders").setHeading();
  const folders: Array<[string, string, MediaFolderSettingKey]> = [
    [
      "Default Mastodon folder",
      "Folder for new Mastodon feeds. Existing feeds keep their folder. An empty value means the vault root.",
      "defaultMastodonFolder",
    ],
    [
      "Default YouTube folder",
      "Folder for new YouTube feeds. Existing feeds keep their folder. An empty value means the vault root.",
      "defaultYouTubeFolder",
    ],
    [
      "Default podcast folder",
      "Folder for new podcast feeds. Existing feeds keep their folder. An empty value means the vault root.",
      "defaultPodcastFolder",
    ],
    [
      "Default RSS folder",
      "Folder for new RSS feeds. Existing feeds keep their folder. An empty value means the vault root.",
      "defaultRssFolder",
    ],
    [
      "Default smallweb folder",
      "Folder for new smallweb feeds. Existing feeds keep their folder. An empty value means the vault root.",
      "defaultSmallwebFolder",
    ],
  ];
  for (const [name, description, key] of folders) {
    renderFolderSetting(containerEl, plugin, name, description, key);
  }
  addResetFolderNamesButton(containerEl, plugin);
}

function addResetFolderNamesButton(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Reset folder names")
    .setDesc("Restore all folder names to their out-of-the-box defaults.")
    .addButton((button) => {
      button.setButtonText("Default folder names").onClick(async () => {
        const defaults = DEFAULT_SETTINGS.media;
        plugin.settings.media.defaultMastodonFolder =
          defaults.defaultMastodonFolder;
        plugin.settings.media.defaultYouTubeFolder =
          defaults.defaultYouTubeFolder;
        plugin.settings.media.defaultPodcastFolder =
          defaults.defaultPodcastFolder;
        plugin.settings.media.defaultRssFolder = defaults.defaultRssFolder;
        plugin.settings.media.defaultSmallwebFolder =
          defaults.defaultSmallwebFolder;
        await plugin.saveSettings();
        new Notice("Folder names restored to defaults.");
        const view = await plugin.getActiveDashboardView();
        if (view) view.render();
        containerEl.empty();
        renderStorageSettingsSections(containerEl, plugin);
      });
    });
}
