import { setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import { collectFolderPaths } from "../utils/folder-paths";
import { FolderNameModal } from "../modals/folder-name-modal";
import { addInputClearButton } from "../utils/input-clear-button";
import { createFolderSelectorKeydownHandler } from "./folder-selector-keyboard";
import {
  FOLDER_POPUP_MOBILE_MAX_WIDTH_PX,
  isNarrowViewport,
} from "../utils/platform-utils";

export interface FolderSelectorOptions {
  /** The element to position the popup relative to */
  anchorEl: HTMLElement;
  /** Callback when a folder is selected */
  onSelect: (folderName: string) => void;
  /** Callback when popup is closed without selection */
  onClose?: () => void;
  /** Default folder to pre-select and prioritize */
  defaultFolder?: string;
  /** Initial query to pre-fill the input */
  initialQuery?: string;
  /** List-only mode: no text input, no folder creation — just select from existing folders */
  listOnly?: boolean;
}

/**
 * A popup menu for selecting or creating folders
 * Shows a scrollable list of folders with search/filter capability
 */
export class FolderSelectorPopup {
  private plugin: RssDashboardPlugin;
  private popupEl!: HTMLElement;
  private inputEl?: HTMLInputElement;
  private listEl!: HTMLElement;
  private folders: string[];
  private filteredFolders: string[];
  private defaultFolder: string | undefined;
  private selectedIndex = 0;
  private onSelect: (folderName: string) => void;
  private onClose?: () => void;
  private clickOutsideHandler!: (e: MouseEvent) => void;
  private keydownHandler!: (e: KeyboardEvent) => void;
  private isDestroyed = false;
  private releasePluginCleanupReference?: () => void;
  private listOnly: boolean = false;

  constructor(plugin: RssDashboardPlugin, options: FolderSelectorOptions) {
    this.plugin = plugin;
    this.onSelect = options.onSelect;
    this.onClose = options.onClose;
    this.defaultFolder = options.defaultFolder;
    this.listOnly = options.listOnly ?? false;
    this.folders = collectFolderPaths(plugin.settings.folders, { sort: true });
    this.filteredFolders = this.getPrioritizedFolders(options.defaultFolder);

    this.popupEl = this.createPopup(
      options.anchorEl,
      options.defaultFolder,
      options.initialQuery,
    );
    this.attachEventListeners();
    const popupReference: { current?: FolderSelectorPopup } = {
      current: this,
    };
    this.plugin.register(() => {
      const popup = popupReference.current;
      popupReference.current = undefined;
      popup?.close();
    });
    this.releasePluginCleanupReference = () => {
      popupReference.current = undefined;
    };

    if (!this.listOnly && options.initialQuery) {
      this.filterFolders(options.initialQuery);
    }

    // Focus input after popup is rendered (only if not in list-only mode)
    if (!this.listOnly) {
      window.setTimeout(() => {
        this.inputEl?.focus();
      }, 0);
    }
  }

  /**
   * Gets folders with default folder prioritized at the top
   */
  private getPrioritizedFolders(defaultFolder?: string): string[] {
    if (!defaultFolder) {
      return [...this.folders];
    }

    // Check if default folder exists
    const defaultExists = this.folders.some(
      (f) => f.toLowerCase() === defaultFolder.toLowerCase(),
    );

    if (defaultExists) {
      // Move default folder to the top
      const defaultIndex = this.folders.findIndex(
        (f) => f.toLowerCase() === defaultFolder.toLowerCase(),
      );
      const folders = [...this.folders];
      const [removed] = folders.splice(defaultIndex, 1);
      if (removed !== undefined) folders.unshift(removed);
      return folders;
    }

    return [...this.folders];
  }

  /**
   * Creates the popup element positioned relative to the anchor
   */
  private createPopup(
    anchorEl: HTMLElement,
    _defaultFolder?: string,
    initialQuery?: string,
  ): HTMLElement {
    const popup = activeDocument.body.createDiv({
      cls: "rss-folder-selector-popup",
    });

    // Calculate position
    const rect = anchorEl.getBoundingClientRect();
    const viewportWidth = activeWindow.innerWidth;
    const viewportHeight = activeWindow.innerHeight;

    // Default position: below the anchor
    let left = rect.left;
    let top = rect.bottom + 4;

    // Check if popup would overflow right edge
    const popupWidth = 240; // Approximate width
    if (left + popupWidth > viewportWidth - 16) {
      left = viewportWidth - popupWidth - 16;
    }

    // Check if popup would overflow bottom edge
    const popupHeight = 200; // Approximate max height
    if (top + popupHeight > viewportHeight - 16) {
      top = rect.top - 4; // Position above instead
      popup.addClass("rss-folder-selector-popup-above");
    }

    // On mobile, CSS controls the popup's horizontal sheet layout while the
    // inline top keeps it anchored to the button. Desktop uses both offsets.
    const isMobile = isNarrowViewport(
      activeWindow,
      FOLDER_POPUP_MOBILE_MAX_WIDTH_PX,
    );
    if (isMobile) {
      popup.style.removeProperty("left");
      popup.style.top = `${top}px`;
    } else {
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }

    // Search input container — skip in list-only mode
    if (!this.listOnly) {
      const inputWrapper = popup.createDiv({
        cls: "rss-folder-selector-input-wrapper",
      });

      this.inputEl = inputWrapper.createEl("input", {
        cls: "rss-folder-selector-input",
        attr: {
          type: "text",
          placeholder: "Select or create folder...",
          autocomplete: "off",
          spellcheck: "false",
          value: initialQuery || "",
        },
      });

      addInputClearButton(this.inputEl, {
        container: inputWrapper,
        label: "Clear folder",
        onClear: () => this.filterFolders(""),
      });
    }

    // Folder list container
    this.listEl = popup.createDiv({
      cls: "rss-folder-selector-list",
    });
    this.renderFolderList();

    return popup;
  }

  /**
   * Renders the filtered folder list
   */
  private renderFolderList(): void {
    this.listEl.empty();

    const itemHeight = 32;
    const maxVisible = 5;
    this.listEl.style.maxHeight = `${maxVisible * itemHeight}px`;

    const query = this.inputEl?.value.trim() || "";
    const showCreateOption =
      !this.listOnly &&
      query.length > 0 &&
      !this.filteredFolders.some(
        (f) => f.toLowerCase() === query.toLowerCase(),
      );

    // List-only mode has no text input, so it can never offer inline folder
    // creation via showCreateOption above. Without an explicit way forward,
    // a vault with zero folders is a dead end (no item to click, nothing to
    // type). Always surface "Root" and "Add new folder" here instead.
    if (this.listOnly) {
      const rootItem = this.listEl.createDiv({
        cls: "rss-folder-selector-item rss-folder-selector-root",
      });
      const rootIcon = rootItem.createSpan({
        cls: "rss-folder-selector-icon",
      });
      setIcon(rootIcon, "home");
      rootItem.createSpan({
        text: "Root (no folder)",
        cls: "rss-folder-selector-text",
      });
      rootItem.addEventListener("click", () => {
        this.selectRoot();
      });
      rootItem.addEventListener("mouseenter", () => {
        this.clearSelection();
        rootItem.addClass("is-selected");
      });

      const addNewItem = this.listEl.createDiv({
        cls: "rss-folder-selector-item rss-folder-selector-add-new",
      });
      const addNewIcon = addNewItem.createSpan({
        cls: "rss-folder-selector-icon",
      });
      setIcon(addNewIcon, "folder-plus");
      addNewItem.createSpan({
        text: "Add new folder",
        cls: "rss-folder-selector-text",
      });
      addNewItem.addEventListener("click", () => {
        this.openCreateFolderModal();
      });
      addNewItem.addEventListener("mouseenter", () => {
        this.clearSelection();
        addNewItem.addClass("is-selected");
      });
    }

    // Show "Create new folder" option if query doesn't match existing folder (and not in list-only mode)
    if (showCreateOption) {
      const createItem = this.listEl.createDiv({
        cls: "rss-folder-selector-item rss-folder-selector-create",
      });
      const iconSpan = createItem.createSpan({
        cls: "rss-folder-selector-icon",
      });
      setIcon(iconSpan, "folder-plus");
      createItem.createSpan({
        text: `Create "${query}"`,
        cls: "rss-folder-selector-text",
      });
      createItem.addEventListener("click", () => {
        this.selectFolder(query);
      });
      createItem.addEventListener("mouseenter", () => {
        this.clearSelection();
        createItem.addClass("is-selected");
      });
    }

    if (
      this.filteredFolders.length === 0 &&
      !showCreateOption &&
      !this.listOnly
    ) {
      // Empty state
      const emptyItem = this.listEl.createDiv({
        cls: "rss-folder-selector-item rss-folder-selector-empty",
      });
      emptyItem.createSpan({
        text: "No folders found",
        cls: "rss-folder-selector-text",
      });
      return;
    }

    // Render folder items
    this.filteredFolders.forEach((folder, index) => {
      const item = this.listEl.createDiv({
        cls: "rss-folder-selector-item",
      });

      if (index === this.selectedIndex && !showCreateOption) {
        item.addClass("is-selected");
      }

      const iconSpan = item.createSpan({ cls: "rss-folder-selector-icon" });
      setIcon(iconSpan, "folder");
      item.createSpan({
        text: folder,
        cls: "rss-folder-selector-text",
      });

      item.addEventListener("click", () => {
        this.selectFolder(folder);
      });

      item.addEventListener("mouseenter", () => {
        this.clearSelection();
        item.addClass("is-selected");
      });
    });

    // Scroll selected item into view
    this.scrollSelectedItemIntoView();
  }

  /**
   * Clears selection from all items
   */
  private clearSelection(): void {
    const items = this.listEl.querySelectorAll(".rss-folder-selector-item");
    items.forEach((item) => item.removeClass("is-selected"));
  }

  /**
   * Scrolls the selected item into view
   */
  private scrollSelectedItemIntoView(): void {
    const selectedItem = this.listEl.querySelector(
      ".rss-folder-selector-item.is-selected",
    );
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
  }

  /**
   * Attaches event listeners for user interaction
   */
  private attachEventListeners(): void {
    const popupDocument = this.popupEl.ownerDocument;

    // Input filtering with validation — skip in list-only mode
    if (!this.listOnly && this.inputEl) {
      this.inputEl.addEventListener("input", () => {
        // Sanitize input in real-time
        const sanitized = this.sanitizeFolderName(this.inputEl!.value);
        if (sanitized !== this.inputEl!.value) {
          // Show visual feedback for invalid characters
          this.inputEl!.addClass("rss-folder-selector-input-invalid");
          this.inputEl!.value = sanitized;
          window.setTimeout(() => {
            this.inputEl?.removeClass("rss-folder-selector-input-invalid");
          }, 500);
        }
        this.filterFolders(this.inputEl!.value);
      });
    }

    // Click outside to close - delay registration to avoid immediate trigger
    // from the same click that opened the popup
    this.clickOutsideHandler = (e: MouseEvent) => {
      if (!this.popupEl.contains(e.target as Node)) {
        this.close();
      }
    };
    window.setTimeout(() => {
      if (!this.isDestroyed) {
        popupDocument.addEventListener("click", this.clickOutsideHandler);
      }
    }, 0);

    // Keyboard navigation
    this.keydownHandler = createFolderSelectorKeydownHandler({
      isDestroyed: () => this.isDestroyed,
      listEl: this.listEl,
      inputEl: () => this.inputEl,
      isListOnly: () => this.listOnly,
      clearSelection: () => this.clearSelection(),
      scrollSelectedItemIntoView: () => this.scrollSelectedItemIntoView(),
      selectFolder: (folderName) => this.selectFolder(folderName),
      selectRoot: () => this.selectRoot(),
      openCreateFolderModal: () => this.openCreateFolderModal(),
      close: () => this.close(),
    });
    popupDocument.addEventListener("keydown", this.keydownHandler);
  }

  /**
   * Filters the folder list based on the query
   */
  private filterFolders(query: string): void {
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) {
      this.filteredFolders = this.getPrioritizedFolders(this.defaultFolder);
    } else {
      this.filteredFolders = this.folders.filter((f) =>
        f.toLowerCase().includes(lowerQuery),
      );
    }

    this.selectedIndex = 0;
    this.renderFolderList();
  }

  /**
   * Selects a folder and triggers the callback
   */
  private selectFolder(folderName: string): void {
    // Validate and sanitize folder name
    const sanitized = this.sanitizeFolderName(folderName);
    if (!sanitized) {
      return;
    }

    this.onSelect(sanitized);
    this.close();
  }

  /**
   * Selects "no folder" (root) — used by the list-only empty-state action,
   * bypassing selectFolder's sanitization check that treats an empty string
   * as invalid input.
   */
  private selectRoot(): void {
    this.onSelect("");
    this.close();
  }

  /**
   * Opens the shared "create folder" modal for the list-only "Add new
   * folder" action. Submitting it both creates the folder and assigns the
   * feed(s) this popup was opened for to it — the caller's onSelect handler
   * is responsible for actually creating the folder (via
   * plugin.ensureFolderExists) before adding the feed, exactly as it does
   * for any other folder picked from the list.
   *
   * The popup closes first. Its z-index sits above the modal layer, so
   * leaving it open would draw it over the modal. Cancelling the modal
   * leaves nothing open; the user taps the button again to restart.
   */
  private openCreateFolderModal(): void {
    const existingNames = this.folders;
    const app = this.plugin.app;
    const onSelect = this.onSelect;

    this.close();

    new FolderNameModal(app, {
      title: "Create new folder",
      existingNames,
      onSubmit: (folderName) => {
        const sanitized = this.sanitizeFolderName(folderName);
        if (sanitized) onSelect(sanitized);
      },
    }).open();
  }

  /**
   * Sanitizes a folder name according to Obsidian's filename constraints
   * Removes forbidden characters: \ : * ? " < > |
   */
  private sanitizeFolderName(name: string): string {
    const forbidden = /[\\:*?"<>|]/g;
    const sanitized = name.replace(forbidden, "").trim();

    // Also remove leading/trailing dots and spaces
    return sanitized.replace(/^[\s.]+|[\s.]+$/g, "");
  }

  /**
   * Closes the popup and cleans up
   */
  close(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.releasePluginCleanupReference?.();
    this.releasePluginCleanupReference = undefined;

    const popupDocument = this.popupEl.ownerDocument;
    popupDocument.removeEventListener("click", this.clickOutsideHandler);
    popupDocument.removeEventListener("keydown", this.keydownHandler);
    this.popupEl.remove();
    this.onClose?.();
  }

  /**
   * Updates the folder list (useful if folders changed externally)
   */
  updateFolders(): void {
    this.folders = collectFolderPaths(this.plugin.settings.folders, {
      sort: true,
    });
    this.filterFolders(this.inputEl?.value || "");
  }
}
