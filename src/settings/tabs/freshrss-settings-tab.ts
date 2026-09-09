import { Notice, Setting } from "obsidian";
import type {
  FreshRssConnectionStatus,
  RssDashboardSettings,
} from "../../types/types";

export type FreshRssCapability =
  | "available"
  | "capability-unavailable"
  | "storage-migration-required";

export interface FreshRssSettingsPlugin {
  settings: RssDashboardSettings;
  getFreshRssCapability(): FreshRssCapability;
  getFreshRssSecretReferences(): string[];
  saveFreshRssEndpoint(endpoint: string): Promise<void>;
  saveFreshRssCredentialReference(reference: string): Promise<void>;
  testFreshRssConnection(): Promise<FreshRssConnectionStatus>;
  openFreshRssStorageMigrationChoice(): void;
  syncFreshRssNow(): Promise<void>;
}

function getStatusDescription(status: FreshRssConnectionStatus): string {
  switch (status) {
    case "capability-unavailable":
      return "FreshRSS requires Obsidian 1.11.4 or newer with usable SecretStorage.";
    case "storage-migration-required":
      return "FreshRSS requires Vault Shards v2. Choose the storage upgrade before connecting.";
    case "credentials-unconfigured":
      return "Select a SecretStorage entry containing the FreshRSS credential bundle.";
    case "test-required":
      return "Test this connection before FreshRSS synchronization can start.";
    case "credentials-rejected":
      return "FreshRSS rejected the selected credential bundle.";
    case "server-unavailable":
      return "FreshRSS did not complete the required connection checks.";
    case "connected":
      return "FreshRSS is connected and ready for a later synchronization step.";
  }
}

function renderStatus(
  containerEl: HTMLElement,
  status: FreshRssConnectionStatus,
): void {
  new Setting(containerEl)
    .setName("Connection status")
    .setDesc(getStatusDescription(status))
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
      .setDesc("Choose whether to upgrade this vault to vault shards v2.")
      .addButton((button) =>
        button
          .setButtonText("Choose storage upgrade")
          .onClick(() => plugin.openFreshRssStorageMigrationChoice()),
      );
    return;
  }

  new Setting(containerEl)
    .setName("FreshRSS endpoint")
    .setDesc("The google reader-compatible FreshRSS endpoint, without credentials.")
    .addText((text) =>
      text
        .setValue(plugin.settings.freshRss.endpoint)
        .setPlaceholder("https://reader.example.com/api/greader.php")
        .onChange(async (value) => {
          try {
            await plugin.saveFreshRssEndpoint(value);
          } catch {
            new Notice("Enter a valid FreshRSS endpoint without credentials.");
          }
        }),
    );

  const secretReferences = plugin.getFreshRssSecretReferences();
  new Setting(containerEl)
    .setName("FreshRSS credential bundle")
    .setDesc("Select a user-managed SecretStorage entry. RSS dashboard stores only its reference.")
    .addDropdown((dropdown) => {
      dropdown.addOption("", "Select a SecretStorage entry");
      secretReferences.forEach((reference) => {
        dropdown.addOption(reference, reference);
      });
      dropdown
        .setValue(plugin.settings.freshRss.credentialReference)
        .onChange(async (reference) => {
          await plugin.saveFreshRssCredentialReference(reference);
        });
    });

  renderStatus(containerEl, plugin.settings.freshRss.status);
  new Setting(containerEl)
    .setName("Test connection")
    .setDesc("Proves login, identity, and write authorization without changing FreshRSS state.")
    .addButton((button) => {
      button.setButtonText("Test connection");
      button.buttonEl.disabled =
        !plugin.settings.freshRss.endpoint ||
        !plugin.settings.freshRss.credentialReference;
      button.onClick(async () => {
        button.buttonEl.disabled = true;
        await plugin.testFreshRssConnection();
        button.buttonEl.disabled = false;
      });
    });

  new Setting(containerEl)
    .setName("Sync now")
    .setDesc("Links or creates FreshRSS feeds and imports a bounded set of recent articles.")
    .addButton((button) => {
      button.setButtonText("Sync now");
      button.buttonEl.disabled = plugin.settings.freshRss.status !== "connected";
      button.onClick(async () => {
        button.buttonEl.disabled = true;
        await plugin.syncFreshRssNow();
        button.buttonEl.disabled = plugin.settings.freshRss.status !== "connected";
      });
    });
}
