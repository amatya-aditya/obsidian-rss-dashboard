import { Modal, App, Setting, Notice, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { Feed, Folder } from "../types/types";
import { OpmlManager } from "../services/opml-manager";

/**
 * Helper function to check if screen is mobile/tablet width
 */
function isMobileWidth(): boolean {
  return window.innerWidth <= 1200;
}

/**
 * Import OPML Modal - Provides a preview-based import experience
 * Allows users to select, validate, preview, and import OPML files
 */
export class ImportOpmlModal extends Modal {
  plugin: RssDashboardPlugin;

  // State
  private selectedFile: File | null = null;
  private opmlContent: string | null = null;
  private parsedFeeds: Feed[] = [];
  private parsedFolders: Folder[] = [];
  private validationError: string | null = null;
  private importMode: "update" | "overwrite" = "update";

  // UI References
  private filePathInput!: HTMLInputElement;
  private previewContainer!: HTMLDivElement;
  private errorContainer!: HTMLDivElement;
  private importButton!: HTMLButtonElement;
  private modeSelectorContainer!: HTMLDivElement;

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    const isMobile = isMobileWidth();

    this.modalEl.addClasses([
      "rss-dashboard-modal",
      "rss-dashboard-modal-container",
    ]);
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
    }

    contentEl.empty();
    // OPML is an acronym - sentence case doesn't apply
    // eslint-disable-next-line obsidianmd/ui/sentence-case
    new Setting(contentEl).setName("Import OPML").setHeading();

    // Add subtitle
    const subtitle = contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent =
      // OPML is an acronym - sentence case doesn't apply
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      "Import feeds from an OPML file with preview and validation";

    // File selector row
    this.createFileSelector(contentEl);

    // Error container (hidden by default)
    this.errorContainer = contentEl.createDiv({
      cls: "import-error-container import-hidden",
    });

    // Preview container (hidden by default)
    this.previewContainer = contentEl.createDiv({
      cls: "import-preview-container import-hidden",
    });

    // Import mode selector (hidden by default)
    this.modeSelectorContainer = contentEl.createDiv({
      cls: "import-mode-selector import-hidden",
    });
    this.createModeSelector(this.modeSelectorContainer);

    // Button container
    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.onclick = () => this.close();

    this.importButton = buttonContainer.createEl("button", {
      text: "Import feeds",
      cls: "rss-dashboard-primary-button",
    });
    this.importButton.disabled = true;
    this.importButton.onclick = () => {
      if (this.importMode === "overwrite") {
        this.showOverwriteWarning();
      } else {
        void this.executeImport();
      }
    };
  }

  private createFileSelector(contentEl: HTMLElement) {
    const fileSelector = contentEl.createDiv({
      cls: "import-file-selector",
    });

    // File path input (disabled, shows selected file path)
    this.filePathInput = fileSelector.createEl("input", {
      type: "text",
      cls: "import-file-path-input",
      attr: {
        placeholder: "No file selected...",
        disabled: "true",
      },
    });

    // Import OPML file button
    const fileButton = fileSelector.createEl("button", {
      cls: "import-file-button",
    });
    setIcon(fileButton, "folder-open");
    fileButton.createSpan({ text: " Import OPML file..." });
    fileButton.onclick = () => this.openFilePicker();
  }

  private openFilePicker() {
    const input = document.body.createEl("input", {
      attr: { type: "file", accept: ".opml" },
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        await this.handleFileSelection(file);
      }
      input.remove();
    };
    input.click();
  }

  private async handleFileSelection(file: File) {
    this.selectedFile = file;
    this.filePathInput.value = file.name;

    // Clear previous state
    this.validationError = null;
    this.parsedFeeds = [];
    this.parsedFolders = [];
    this.opmlContent = null;

    // Validate and parse
    await this.validateAndParseFile(file);

    // Update UI
    this.updateUI();
  }

  private async validateAndParseFile(file: File): Promise<void> {
    // Check file extension
    if (!file.name.endsWith(".opml")) {
      this.validationError =
        "Please select a valid OPML file (.opml extension required)";
      return;
    }

    try {
      const content = await file.text();

      // Basic XML validation
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, "text/xml");

      // Check for parsing errors
      const parseError = xmlDoc.querySelector("parsererror");
      if (parseError) {
        this.validationError =
          "This is not a valid OPML file. The file contains invalid XML.";
        return;
      }

      // Check for OPML structure
      const opmlRoot = xmlDoc.querySelector("opml");
      if (!opmlRoot) {
        this.validationError =
          "This is not a valid OPML file. Missing OPML root element.";
        return;
      }

      const body = xmlDoc.querySelector("body");
      if (!body) {
        this.validationError =
          "This is not a valid OPML file. Missing body element.";
        return;
      }

      // Parse the valid OPML
      const result = OpmlManager.parseOpml(content);
      this.parsedFeeds = result.feeds;
      this.parsedFolders = result.folders;
      this.opmlContent = content;
      this.validationError = null;
    } catch (error) {
      this.validationError = `Error reading file: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  private updateUI() {
    // Update error container
    if (this.validationError) {
      this.errorContainer.removeClass("import-hidden");
      this.errorContainer.addClass("import-visible");
      this.errorContainer.empty();
      const errorDiv = this.errorContainer.createDiv({
        cls: "import-error-message",
      });
      errorDiv.textContent = this.validationError;

      // Hide preview and mode selector
      this.previewContainer.removeClass("import-visible");
      this.previewContainer.addClass("import-hidden");
      this.modeSelectorContainer.removeClass("import-visible");
      this.modeSelectorContainer.addClass("import-hidden");
      this.importButton.disabled = true;
    } else if (this.parsedFeeds.length > 0) {
      // Hide error
      this.errorContainer.removeClass("import-visible");
      this.errorContainer.addClass("import-hidden");

      // Show preview
      this.renderPreview();

      // Show mode selector
      this.modeSelectorContainer.removeClass("import-hidden");
      this.modeSelectorContainer.addClass("import-visible");

      // Enable import button
      this.importButton.disabled = false;
    } else {
      // No feeds found
      this.errorContainer.removeClass("import-hidden");
      this.errorContainer.addClass("import-visible");
      this.errorContainer.empty();
      const errorDiv = this.errorContainer.createDiv({
        cls: "import-error-message",
      });
      // OPML is an acronym - sentence case doesn't apply
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      errorDiv.textContent = "No feeds found in the OPML file.";

      this.previewContainer.removeClass("import-visible");
      this.previewContainer.addClass("import-hidden");
      this.modeSelectorContainer.removeClass("import-visible");
      this.modeSelectorContainer.addClass("import-hidden");
      this.importButton.disabled = true;
    }
  }

  private renderPreview() {
    this.previewContainer.removeClass("import-hidden");
    this.previewContainer.addClass("import-visible");
    this.previewContainer.empty();

    // Summary header
    const header = this.previewContainer.createDiv({
      cls: "import-preview-header",
    });
    header.createEl("strong", {
      text: `📋 Preview - ${this.parsedFeeds.length} feeds found`,
    });

    // Group feeds by folder
    const feedsByFolder = this.groupFeedsByFolder();

    // Create scrollable preview list
    const list = this.previewContainer.createDiv({
      cls: "import-preview-list",
    });

    for (const [folder, feeds] of Object.entries(feedsByFolder)) {
      const folderDiv = list.createDiv({ cls: "import-preview-folder" });
      folderDiv.createEl("div", {
        cls: "import-preview-folder-name",
        text: `📁 ${folder}`,
      });

      const feedsList = folderDiv.createDiv({ cls: "import-preview-feeds" });
      const displayFeeds = feeds.slice(0, 5); // Show max 5 feeds per folder

      for (const feed of displayFeeds) {
        feedsList.createEl("div", {
          cls: "import-preview-feed",
          text: `• ${feed.title}`,
        });
      }

      if (feeds.length > 5) {
        feedsList.createEl("div", {
          cls: "import-preview-more",
          text: `... and ${feeds.length - 5} more feeds`,
        });
      }
    }
  }

  private groupFeedsByFolder(): Record<string, Feed[]> {
    const groups: Record<string, Feed[]> = {};

    for (const feed of this.parsedFeeds) {
      const folder = feed.folder || "Uncategorized";
      if (!groups[folder]) {
        groups[folder] = [];
      }
      groups[folder].push(feed);
    }

    return groups;
  }

  private createModeSelector(container: HTMLElement) {
    container.empty();

    const label = container.createDiv({ cls: "import-mode-label" });
    label.textContent = "Import mode:";

    const optionsWrapper = container.createDiv({ cls: "import-mode-options" });

    // Update option - click to select
    const updateOption = optionsWrapper.createDiv({
      cls: "import-mode-option selected",
    });
    const updateContent = updateOption.createDiv({
      cls: "import-mode-option-content",
    });
    updateContent.createEl("div", {
      cls: "import-mode-option-title",
      text: "Update",
    });
    updateContent.createEl("div", {
      cls: "import-mode-option-desc",
      text: "Add new feeds to your existing list (duplicates will be skipped)",
    });

    // Overwrite option - click to select
    const overwriteOption = optionsWrapper.createDiv({
      cls: "import-mode-option",
    });
    const overwriteContent = overwriteOption.createDiv({
      cls: "import-mode-option-content",
    });
    overwriteContent.createEl("div", {
      cls: "import-mode-option-title",
      text: "Overwrite",
    });
    overwriteContent.createEl("div", {
      cls: "import-mode-option-desc",
      text: "Replace all existing feeds with the imported feeds",
    });

    // Add click handlers after elements are created
    updateOption.onclick = () => {
      this.importMode = "update";
      updateOption.addClass("selected");
      overwriteOption.removeClass("selected");
    };

    overwriteOption.onclick = () => {
      this.importMode = "overwrite";
      overwriteOption.addClass("selected");
      updateOption.removeClass("selected");
    };
  }

  private showOverwriteWarning() {
    // Create overlay modal that appears ON TOP of the import modal
    const overlay = document.body.createDiv({
      cls: "rss-dashboard-modal-overlay",
    });

    const modal = overlay.createDiv({
      cls: "rss-dashboard-modal rss-dashboard-modal-container rss-dashboard-confirm-modal",
    });
    const modalContent = modal.createDiv({
      cls: "rss-dashboard-modal-content",
    });

    new Setting(modalContent).setName("Overwrite all feeds").setHeading();

    // Warning message
    const warningDiv = modalContent.createDiv({
      cls: "delete-all-warning",
    });
    warningDiv.createEl("p", {
      text: "This action is irreversible. All your existing feeds will be permanently replaced with the imported feeds.",
    });

    // Backup recommendation
    const backupDiv = modalContent.createDiv({
      cls: "delete-all-backup-notice",
    });
    backupDiv.createEl("strong", {
      text: "Recommended: export your feeds first",
    });
    backupDiv.createEl("p", {
      // OPML is an acronym - sentence case doesn't apply
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      text: "Before overwriting, we strongly recommend backing up your current feeds by exporting to an OPML file.",
    });

    // Export OPML button
    const exportBtn = backupDiv.createEl("button", {
      // OPML is an acronym - sentence case doesn't apply
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      text: "Export OPML",
      cls: "rss-dashboard-primary-button export-opml-btn",
    });
    exportBtn.onclick = () => {
      this.plugin.exportOpml();
    };

    // Button container
    const buttonContainer = modalContent.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.onclick = () => {
      document.body.removeChild(overlay);
    };

    const confirmButton = buttonContainer.createEl("button", {
      text: "Overwrite feeds",
      cls: "rss-dashboard-danger-button",
    });
    confirmButton.onclick = () => {
      document.body.removeChild(overlay);
      void this.executeImport();
    };
  }

  private async executeImport() {
    if (!this.opmlContent || this.parsedFeeds.length === 0) {
      return;
    }

    try {
      if (this.importMode === "overwrite") {
        // Clear existing feeds and folders
        this.plugin.settings.feeds = [];
        this.plugin.settings.folders = [];

        // Add all imported feeds
        for (const feed of this.parsedFeeds) {
          // Apply default media folders if needed
          if (
            feed.mediaType === "video" &&
            (!feed.folder || feed.folder === "Uncategorized")
          ) {
            feed.folder = this.plugin.settings.media.defaultYouTubeFolder;
          } else if (
            feed.mediaType === "podcast" &&
            (!feed.folder || feed.folder === "Uncategorized")
          ) {
            feed.folder = this.plugin.settings.media.defaultPodcastFolder;
          }

          this.plugin.settings.feeds.push({
            ...feed,
            items: [],
            lastUpdated: Date.now(),
          });
        }

        // Set folders
        this.plugin.settings.folders = [...this.parsedFolders];
      } else {
        // Update mode - merge with existing
        const existingUrls = new Set(
          this.plugin.settings.feeds.map((f) => f.url),
        );
        let addedCount = 0;

        for (const feed of this.parsedFeeds) {
          if (!existingUrls.has(feed.url)) {
            // Apply default media folders if needed
            if (
              feed.mediaType === "video" &&
              (!feed.folder || feed.folder === "Uncategorized")
            ) {
              feed.folder = this.plugin.settings.media.defaultYouTubeFolder;
            } else if (
              feed.mediaType === "podcast" &&
              (!feed.folder || feed.folder === "Uncategorized")
            ) {
              feed.folder = this.plugin.settings.media.defaultPodcastFolder;
            }

            this.plugin.settings.feeds.push({
              ...feed,
              items: [],
              lastUpdated: Date.now(),
            });
            addedCount++;
          }
        }

        // Merge folders
        this.plugin.settings.folders = OpmlManager.mergeFolders(
          this.plugin.settings.folders,
          this.parsedFolders,
        );

        if (addedCount === 0) {
          // OPML is an acronym - sentence case doesn't apply
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          new Notice("No new feeds found in the OPML file.");
          this.close();
          return;
        }
      }

      await this.plugin.saveSettings();

      // Close any open MobileNavigationModal to ensure fresh data on mobile
      const mobileModals = document.querySelectorAll(
        ".rss-mobile-navigation-modal",
      );
      mobileModals.forEach((modal) => {
        // Try to close via the header close button
        const headerCloseBtn = modal.querySelector(
          ".rss-dashboard-header-close-button",
        );
        if (headerCloseBtn) {
          (headerCloseBtn as HTMLElement).click();
        }
      });

      // Refresh the dashboard view and sidebar if they exist
      const dashboardView = await this.plugin.getActiveDashboardView();

      if (dashboardView) {
        // Clear the sidebar's folder path cache to ensure fresh data
        if (dashboardView.sidebar) {
          // Explicitly update sidebar's settings reference
          dashboardView.sidebar["settings"] = this.plugin.settings;
          dashboardView.sidebar.clearFolderPathCache();
        }
        // Full re-render
        dashboardView.refresh();
      }

      const modeText =
        this.importMode === "overwrite" ? "replaced with" : "updated with";
      new Notice(
        `Feeds ${modeText} ${this.parsedFeeds.length} imported feeds. Articles will be fetched in the background.`,
      );

      // Start background import for article fetching
      void this.plugin.startBackgroundImport(
        this.plugin.settings.feeds.filter((f) => f.items.length === 0),
      );

      this.close();
    } catch (error) {
      new Notice(
        `Error importing OPML: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
