import { setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import { collectFolderPaths } from "../utils/folder-paths";
import { FolderNameModal } from "../modals/folder-name-modal";

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
  private clearBtnEl?: HTMLElement;
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
  // True while a modal this popup opened (e.g. create-folder) is on top of
  // it — see setInert().
  private isInert = false;
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

    // On mobile, the CSS @media sheet rule positions the popup — no inline override needed.
    // On desktop, calculate and apply anchor-relative positioning.
    const isMobile = activeWindow.matchMedia("(max-width: 600px)").matches;
    if (isMobile) {
      popup.style.removeProperty("left");
      popup.style.removeProperty("top");
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

      this.clearBtnEl = inputWrapper.createDiv({
        cls: `rss-folder-selector-clear${initialQuery ? "" : " is-hidden"}`,
      });
      setIcon(this.clearBtnEl, "x");
      this.clearBtnEl.addEventListener("click", () => {
        if (this.inputEl) {
          this.inputEl.value = "";
          if (this.clearBtnEl) {
            this.clearBtnEl.addClass("is-hidden");
          }
          this.filterFolders("");
          this.inputEl.focus();
        }
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
    // Swallow clicks on this popup's own contents while inert (a modal it
    // opened, e.g. create-folder, is on top of it). Registered in the
    // capture phase directly on popupEl so it runs before any individual
    // item's own click listener — one guard instead of threading an
    // isInert check through every item handler.
    this.popupEl.addEventListener(
      "click",
      (e) => {
        if (this.isInert) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );

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

        if (this.inputEl!.value) {
          this.clearBtnEl?.removeClass("is-hidden");
        } else {
          this.clearBtnEl?.addClass("is-hidden");
        }
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
      activeDocument.addEventListener("click", this.clickOutsideHandler);
    }, 0);

    // Keyboard navigation
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };
    activeDocument.addEventListener("keydown", this.keydownHandler);
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
   * Handles keyboard navigation
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (this.isDestroyed || this.isInert) return;

    const items = this.listEl.querySelectorAll(".rss-folder-selector-item");
    const itemCount = items.length;

    // Find current selected index
    let currentIndex = -1;
    items.forEach((item, index) => {
      if (item.hasClass("is-selected")) {
        currentIndex = index;
      }
    });

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (itemCount > 0) {
          const newIndex = currentIndex < itemCount - 1 ? currentIndex + 1 : 0;
          this.clearSelection();
          items[newIndex]?.addClass("is-selected");
          this.scrollSelectedItemIntoView();
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        if (itemCount > 0) {
          const newIndex = currentIndex > 0 ? currentIndex - 1 : itemCount - 1;
          this.clearSelection();
          items[newIndex]?.addClass("is-selected");
          this.scrollSelectedItemIntoView();
        }
        break;

      case "Enter": {
        e.preventDefault();
        const selectedItem = this.listEl.querySelector(
          ".rss-folder-selector-item.is-selected",
        );
        const query = this.inputEl?.value.trim() || "";

        if (selectedItem) {
          if (
            !this.listOnly &&
            selectedItem.hasClass("rss-folder-selector-create")
          ) {
            // Create new folder with the typed text (only if not in list-only mode)
            this.selectFolder(query);
          } else if (selectedItem.hasClass("rss-folder-selector-root")) {
            this.selectRoot();
          } else if (selectedItem.hasClass("rss-folder-selector-add-new")) {
            this.openCreateFolderModal();
          } else {
            // Select existing folder
            const textEl = selectedItem.querySelector(
              ".rss-folder-selector-text",
            );
            if (textEl) {
              this.selectFolder(textEl.textContent || "");
            }
          }
        } else if (!this.listOnly && query.length > 0) {
          // No item selected but there's text - create new folder (only if not in list-only mode)
          this.selectFolder(query);
        }
        break;
      }

      case "Escape":
        e.preventDefault();
        this.close();
        break;

      case "Tab":
        // Close on tab
        this.close();
        break;
    }
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
   */
  private openCreateFolderModal(): void {
    const modal = new FolderNameModal(this.plugin.app, {
      title: "Create new folder",
      existingNames: this.folders,
      onSubmit: (folderName) => {
        this.selectFolder(folderName);
      },
      onClose: () => {
        this.setInert(false);
      },
    });

    // The modal renders outside popupEl's own DOM subtree, so any click
    // inside it — typing, hitting OK, even Cancel — would otherwise bubble
    // all the way up to document and trip this popup's outside-click
    // handler, closing it out from under the modal. Stop that bubbling one
    // step up from the click, on the modal's own container, in the BUBBLE
    // phase — that runs *after* the target's own listener (okButton's
    // submit, cancelButton's close), so the modal still behaves normally;
    // it just never climbs any higher than its own container. (A
    // capture-phase listener on document would run before the target's own
    // handler and silently swallow every click in the modal instead —
    // learned that one the hard way.)
    modal.containerEl.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // A real Obsidian Modal normally blocks the rest of the page via its own
    // backdrop, but this popup's z-index is set high enough to float above
    // feed cards and other page chrome — high enough, it turns out, to float
    // above the modal's backdrop too. Make the popup itself inert for as
    // long as the modal is open so its folder list can't be clicked through.
    this.setInert(true);

    modal.open();
  }

  /**
   * Toggles whether this popup's own contents can be interacted with —
   * used while a modal it opened (e.g. create-folder) is on top of it.
   */
  private setInert(inert: boolean): void {
    this.isInert = inert;
    this.popupEl.toggleClass("rss-folder-selector-popup-inert", inert);
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

    activeDocument.removeEventListener("click", this.clickOutsideHandler);
    activeDocument.removeEventListener("keydown", this.keydownHandler);
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
