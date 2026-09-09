import { Notice, Setting, type ButtonComponent, type DropdownComponent } from "obsidian";
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
  setFreshRssAutomaticSyncEnabled(enabled: boolean): Promise<void>;
  setFreshRssAutomaticSyncIntervalMinutes(minutes: number): Promise<void>;
  exportFreshRssOpml(): Promise<void>;
  copyFreshRssOpmlToClipboard(): Promise<void>;
  /** Every active-scope FreshRSS-linked feed whose history import is capped or incomplete. */
  getFreshRssHistoryEligibleFeeds(): Promise<Array<{ feedId: string; title: string }>>;
  /** Extends the selected feed's imported history by one bounded invocation. */
  fetchMoreFreshRssHistory(feedId: string): Promise<void>;
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

/**
 * Renders the dedicated FreshRSS subscription export section. This is a
 * pure local transform of the dashboard's own feed list -- it needs no
 * FreshRSS connection, credential, or storage capability, so it is shown
 * regardless of `FreshRssCapability`.
 */
function renderSubscriptionExportSection(
  containerEl: HTMLElement,
  plugin: FreshRssSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("FreshRSS subscription export")
    .setDesc(
      "Export a FreshRSS subscription OPML file for the feeds and folders configured in this dashboard. This is a FreshRSS subscription export, not an article-state backup: read/starred state, dashboard tags, FreshRSS labels, and saved notes are never included.",
    )
    .addButton((button) =>
      button
        .setIcon("download")
        .setButtonText("Export FreshRSS OPML")
        .onClick(() => {
          void plugin.exportFreshRssOpml();
        }),
    )
    .addButton((button) =>
      button
        .setIcon("copy")
        .setTooltip("Copy FreshRSS subscription OPML to clipboard")
        .onClick(() => {
          void plugin.copyFreshRssOpmlToClipboard();
        }),
    );
}

/**
 * Renders the explicit, bounded "Fetch more history" action (ticket 10): a
 * dropdown of active-scope FreshRSS-linked feeds whose history import is
 * capped or incomplete, plus a button that extends the selected feed's
 * history by one bounded invocation through the same coordinator, session,
 * lease, paging, and checkpoint machinery as ordinary sync. The eligible-feed
 * list is loaded asynchronously (it depends on the sidecar's feed bindings
 * and checkpoints); both controls render disabled with a loading placeholder
 * until it resolves.
 */
function renderFetchMoreHistorySection(
  containerEl: HTMLElement,
  plugin: FreshRssSettingsPlugin,
): void {
  let dropdownComponent: DropdownComponent | null = null;
  let buttonComponent: ButtonComponent | null = null;

  // Reads/writes `.selectEl`/`.buttonEl` directly rather than
  // `getValue()`/`setDisabled()`, matching this file's existing "Sync now"
  // button (`button.buttonEl.disabled = ...`) so behavior stays identical
  // against both the real Obsidian components and the lighter test stub.
  const refreshButtonEnablement = (): void => {
    if (!buttonComponent) return;
    buttonComponent.buttonEl.disabled =
      plugin.settings.freshRss.status !== "connected" ||
      !dropdownComponent ||
      dropdownComponent.selectEl.value === "";
  };

  new Setting(containerEl)
    .setName("Fetch more history")
    .setDesc(
      "Extends one linked FreshRSS feed's imported history by a bounded amount beyond its initial import. Available only for a feed whose history import has not yet fully completed.",
    )
    .addDropdown((dropdown) => {
      dropdownComponent = dropdown;
      dropdown.addOption("", "Loading eligible feeds...");
      dropdown.selectEl.disabled = true;
      dropdown.onChange(() => refreshButtonEnablement());
    })
    .addButton((button) => {
      buttonComponent = button;
      button.setButtonText("Fetch more history");
      button.buttonEl.disabled = true;
      button.onClick(async () => {
        const feedId = dropdownComponent?.selectEl.value;
        if (!feedId) return;
        button.buttonEl.disabled = true;
        await plugin.fetchMoreFreshRssHistory(feedId);
        refreshButtonEnablement();
      });
    });

  void plugin.getFreshRssHistoryEligibleFeeds().then((feeds) => {
    const dropdown = dropdownComponent;
    if (!dropdown) return;
    dropdown.selectEl.empty();
    if (feeds.length === 0) {
      dropdown.addOption("", "No feeds need more history");
      dropdown.selectEl.disabled = true;
      if (buttonComponent) buttonComponent.buttonEl.disabled = true;
      return;
    }
    feeds.forEach((feed) => {
      dropdown.addOption(feed.feedId, feed.title);
    });
    dropdown.selectEl.disabled = false;
    refreshButtonEnablement();
  });
}

export function renderFreshRssSettingsTab(
  containerEl: HTMLElement,
  plugin: FreshRssSettingsPlugin,
): void {
  new Setting(containerEl).setName("FreshRSS").setHeading();

  renderSubscriptionExportSection(containerEl, plugin);

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

  renderFetchMoreHistorySection(containerEl, plugin);

  new Setting(containerEl)
    .setName("Automatic sync")
    .setDesc(
      "Opt in to quiet startup and scheduled FreshRSS synchronization, independent of the ordinary feed refresh interval. Off by default.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.freshRss.automaticSyncEnabled)
        .onChange(async (value) => {
          await plugin.setFreshRssAutomaticSyncEnabled(value);
        }),
    );

  new Setting(containerEl)
    .setName("Automatic sync interval")
    .setDesc("Minutes between automatic FreshRSS syncs. Defaults to 15.")
    .addText((text) =>
      text
        .setValue(String(plugin.settings.freshRss.automaticSyncIntervalMinutes))
        .onChange(async (value) => {
          const minutes = Number(value);
          if (!Number.isFinite(minutes) || minutes <= 0) {
            return;
          }
          await plugin.setFreshRssAutomaticSyncIntervalMinutes(minutes);
        }),
    );
}
