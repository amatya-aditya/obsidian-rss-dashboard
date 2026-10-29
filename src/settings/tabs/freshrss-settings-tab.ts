import { Notice, Setting } from "obsidian";
import type {
  FreshRssConnectionStatus,
  FreshRssSettings,
} from "../../types/types";
import type { FreshRssPendingFacetMutation } from "../../services/freshrss-connection-scope-repository";
import type { FreshRssSyncRunStatus } from "../../services/freshrss-sync-coordinator";

export type FreshRssCapability =
  "available" | "capability-unavailable" | "storage-migration-required";

export interface FreshRssSettingsPlugin {
  settings: { freshRss: FreshRssSettings };
  getFreshRssCapability(): FreshRssCapability;
  getFreshRssSecretReferences(): string[];
  saveFreshRssEndpoint(endpoint: string): Promise<void>;
  saveFreshRssCredentialReference(reference: string): Promise<void>;
  saveFreshRssStateSyncMode(
    mode: FreshRssSettings["stateSyncMode"],
  ): Promise<void>;
  openFreshRssStorageMigrationChoice(): void;
  testFreshRssConnection(): Promise<FreshRssConnectionStatus>;
  syncFreshRssNow(): Promise<FreshRssSyncRunStatus>;
  openFreshRssSyncPreview(opener?: HTMLElement): void;
  getFreshRssPendingMutations(): Promise<FreshRssPendingFacetMutation[]>;
  cancelFreshRssSyncNow(): void;
  retryFreshRssMutation(operationId: string): Promise<void>;
  cancelFreshRssMutation(operationId: string): Promise<void>;
  getFreshRssStateSyncMode(): FreshRssSettings["stateSyncMode"];
}

function statusDescription(status: FreshRssConnectionStatus): string {
  switch (status) {
    case "capability-unavailable":
      return "FreshRSS requires Obsidian 1.11.5 or newer with usable SecretStorage.";
    case "storage-migration-required":
      return "FreshRSS requires Vault Shards v2 metadata storage. Upgrade storage before connecting.";
    case "credentials-unconfigured":
      return "Select a SecretStorage entry containing the FreshRSS credential bundle.";
    case "test-required":
      return "Test this connection before using FreshRSS.";
    case "credentials-rejected":
      return "FreshRSS rejected the selected credential bundle.";
    case "server-unavailable":
      return "FreshRSS did not complete the required connection checks.";
    case "connected":
      return "FreshRSS is connected and ready.";
  }
}

function renderStatus(
  containerEl: HTMLElement,
  status: FreshRssConnectionStatus,
): Setting {
  return new Setting(containerEl)
    .setName("Connection status")
    .setDesc(statusDescription(status))
    .setDisabled(true);
}

export function renderFreshRssSettingsTab(
  containerEl: HTMLElement,
  plugin: FreshRssSettingsPlugin,
): void {
  new Setting(containerEl).setName("FreshRSS").setHeading();

  const capability = plugin.getFreshRssCapability();
  if (capability === "capability-unavailable") {
    renderStatus(containerEl, "capability-unavailable");
    return;
  }
  if (capability === "storage-migration-required") {
    renderStatus(containerEl, "storage-migration-required");
    new Setting(containerEl)
      .setName("Storage upgrade")
      .setDesc("Choose whether to upgrade this vault to vault shard v2.")
      .addButton((button) =>
        button
          .setButtonText("Choose storage upgrade")
          .onClick(() => plugin.openFreshRssStorageMigrationChoice()),
      );
    return;
  }

  const connectionStatusSetting = renderStatus(
    containerEl,
    plugin.settings.freshRss.status,
  );
  let testConnectionButton: HTMLButtonElement | null = null;
  let endpointSaveSequence = 0;
  let endpointInputInvalid = false;

  new Setting(containerEl)
    .setName("FreshRSS endpoint")
    .setDesc("The secure FreshRSS endpoint, without credentials.")
    .addText((text) => {
      text.setValue(plugin.settings.freshRss.endpoint);
      text.setPlaceholder("https://reader.example.com/api/greader.php");
      text.inputEl.addEventListener("blur", () => {
        if (!endpointInputInvalid) return;
        endpointInputInvalid = false;
        text.setValue(plugin.settings.freshRss.endpoint);
        new Notice(
          "Enter a valid secure FreshRSS endpoint without credentials.",
        );
      });
      text.onChange(async (value) => {
        const saveSequence = ++endpointSaveSequence;
        const save = plugin.saveFreshRssEndpoint(value);
        if (testConnectionButton) {
          testConnectionButton.disabled =
            !plugin.settings.freshRss.endpoint ||
            !plugin.settings.freshRss.credentialReference;
        }
        try {
          await save;
          if (saveSequence !== endpointSaveSequence) return;
          endpointInputInvalid = false;
          connectionStatusSetting.setDesc(
            statusDescription(plugin.settings.freshRss.status),
          );
        } catch {
          if (saveSequence === endpointSaveSequence) {
            endpointInputInvalid = true;
          }
        }
      });
    });

  new Setting(containerEl)
    .setName("FreshRSS credential bundle")
    .setDesc(
      "Select a user-managed secret entry. RSS dashboard stores only its reference.",
    )
    .addDropdown((dropdown) => {
      dropdown.addOption("", "Select a SecretStorage entry");
      plugin.getFreshRssSecretReferences().forEach((reference) => {
        dropdown.addOption(reference, reference);
      });
      dropdown
        .setValue(plugin.settings.freshRss.credentialReference)
        .onChange(async (reference) => {
          await plugin.saveFreshRssCredentialReference(reference);
        });
    });

  new Setting(containerEl)
    .setName("Article state sync")
    .setDesc(
      "Two-way sync shares read state with FreshRSS. Receive-only imports feeds and articles while keeping read state local.",
    )
    .addDropdown((dropdown) => {
      dropdown
        .addOption("two-way", "Two-way")
        .addOption("receive-only", "Receive-only")
        .setValue(plugin.settings.freshRss.stateSyncMode)
        .onChange(async (value) => {
          await plugin.saveFreshRssStateSyncMode(
            value as FreshRssSettings["stateSyncMode"],
          );
        });
    });

  new Setting(containerEl)
    .setName("Test connection")
    .setDesc(
      "Checks login, identity, and write authorization without changing FreshRSS state.",
    )
    .addButton((button) => {
      testConnectionButton = button.buttonEl;
      button.setButtonText("Test connection");
      button.buttonEl.disabled =
        !plugin.settings.freshRss.endpoint ||
        !plugin.settings.freshRss.credentialReference;
      button.onClick(async () => {
        button.buttonEl.disabled = true;
        try {
          await plugin.testFreshRssConnection();
        } finally {
          button.buttonEl.disabled =
            !plugin.settings.freshRss.endpoint ||
            !plugin.settings.freshRss.credentialReference;
        }
      });
    });

  new Setting(containerEl)
    .setName("Sync now")
    .setDesc(
      "Links FreshRSS subscriptions and imports a bounded set of recent articles.",
    )
    .addButton((button) => {
      button.setButtonText("Sync now");
      button.buttonEl.disabled =
        plugin.settings.freshRss.status !== "connected";
      button.onClick(async () => {
        button.buttonEl.disabled = true;
        try {
          plugin.openFreshRssSyncPreview(button.buttonEl);
        } finally {
          button.buttonEl.disabled =
            plugin.settings.freshRss.status !== "connected";
        }
      });
    });
}
