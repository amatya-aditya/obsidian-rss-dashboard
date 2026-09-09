import { Modal, App, Setting, Notice, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { Feed, Folder } from "../types/types";
import { OpmlManager } from "../services/opml-manager";
import { shouldUseMobileSidebarLayout } from "../utils/platform-utils";
import type { OpmlImportPreviewFolderSnapshot } from "../services/opml-import-preview-model";
import { OpmlImportPreviewModel } from "../services/opml-import-preview-model";
import { isValidFeedTitle, isValidFolderName } from "../utils/validation";
import { ImporterShell } from "./importer-shell";

/**
 * Import OPML Modal - Provides a preview-based import experience
 * Allows users to select, validate, preview, and import OPML files
 */
export class ImportOpmlModal extends Modal {
  plugin: RssDashboardPlugin;
  private readonly onImportStarted?: () => void;

  private static readonly OPML_CLEANER_URL =
    "https://www.freecodeformat.com/opml-to-format.php";

  // State
  private selectedFile: File | null = null;
  private opmlContent: string | null = null;
  private parsedFeeds: Feed[] = [];
  private parsedFolders: Folder[] = [];
  private importMode: "update" | "overwrite" = "update";
  private validationErrorKind:
    | "invalid_extension"
    | "invalid_xml"
    | "missing_opml"
    | "missing_body"
    | "parse_failed"
    | "no_feeds"
    | null = null;
  private previewModel: OpmlImportPreviewModel | null = null;
  private collapsedFolderPaths = new Set<string>();
  private readonly importerShell: ImporterShell<
    { feeds: Feed[]; folders: Folder[] },
    OpmlImportPreviewModel
  >;

  // UI References
  private previewContainer!: HTMLDivElement;
  private modeSelectorContainer!: HTMLDivElement;

  constructor(
    app: App,
    plugin: RssDashboardPlugin,
    onImportStarted?: () => void,
  ) {
    super(app);
    this.plugin = plugin;
    this.onImportStarted = onImportStarted;
    this.importerShell = new ImporterShell({
      acceptedFileTypes: ".opml,.xml,.backup",
      validate: (content, file) => this.validateOpml(content, file),
      parse: (content) => this.parseOpml(content),
      createPreviewModel: (parsed) => {
        if (parsed.feeds.length === 0) {
          this.validationErrorKind = "no_feeds";
          return null;
        }
        this.previewModel = new OpmlImportPreviewModel({
          feeds: parsed.feeds,
          folders: parsed.folders,
          importMode: this.importMode,
          existingUrls: new Set(this.plugin.settings.feeds.map((feed) => feed.url)),
        });
        return this.previewModel;
      },
      renderer: { render: () => this.renderPreview() },
      execute: async () => this.performImport(),
      onAction: () => {
        if (this.importMode === "overwrite") {
          this.showOverwriteWarning();
        } else {
          void this.importerShell.execute();
        }
      },
      noItemsError: "No feeds found in the OPML file.",
      renderError: (container, error) => this.renderOpmlError(container, error),
      onPreviewVisibilityChange: (visible) => this.setModeSelectorVisibility(visible),
      getActionState: (model) => this.getImportActionState(model),
    });
  }

  onOpen() {
    const { contentEl } = this;
    const isMobile = shouldUseMobileSidebarLayout();

    this.modalEl.addClasses([
      "rss-dashboard-modal",
      "rss-dashboard-modal-container",
    ]);
    this.modalEl.addClass("rss-import-opml-modal");
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-import-opml-modal");
    }

    contentEl.empty();
    new Setting(contentEl).setName("Import OPML").setHeading();

    // Add subtitle
    const subtitle = contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent =
      "Import feeds from an OPML file with preview and validation";

    // Button container
    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.onclick = () => this.close();

    this.importerShell.mount(contentEl, buttonContainer);
    this.previewContainer = contentEl.querySelector<HTMLDivElement>(
      ".import-preview-container",
    )!;
    this.modeSelectorContainer = contentEl.createDiv({
      cls: "import-mode-selector import-hidden",
    });
    buttonContainer.parentElement?.insertBefore(
      this.modeSelectorContainer,
      buttonContainer,
    );
    this.createModeSelector(this.modeSelectorContainer);
  }

  private async handleFileSelection(file: File) {
    this.selectedFile = file;
    this.validationErrorKind = null;
    this.parsedFeeds = [];
    this.parsedFolders = [];
    this.opmlContent = null;
    this.previewModel = null;
    this.collapsedFolderPaths.clear();
    await this.importerShell.handleFileSelection(file);
  }

  private validateOpml(content: string, file: File) {
    // Check file extension
    const fileName = file.name.toLowerCase();
    if (
      !fileName.endsWith(".opml") &&
      !fileName.endsWith(".xml") &&
      !fileName.endsWith(".backup")
    ) {
      this.validationErrorKind = "invalid_extension";
      return {
        valid: false as const,
        error: "Please select a valid OPML or XML file (.opml, .xml, or .backup extension required)",
      };
    }

      // Basic XML validation
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, "text/xml");

      // Check for parsing errors
      const parseError = xmlDoc.querySelector("parsererror");
      if (parseError) {
        this.validationErrorKind = "invalid_xml";
        return { valid: false as const, error: "This is not a valid OPML file. The file contains invalid XML." };
      }

      // Check for OPML structure
      const opmlRoot = xmlDoc.querySelector("opml");
      if (!opmlRoot) {
        this.validationErrorKind = "missing_opml";
        return { valid: false as const, error: "This is not a valid OPML file. Missing OPML root element." };
      }

      const body = xmlDoc.querySelector("body");
      if (!body) {
        this.validationErrorKind = "missing_body";
        return { valid: false as const, error: "This is not a valid OPML file. Missing body element." };
      }

    return { valid: true as const };
  }

  private parseOpml(content: string): { feeds: Feed[]; folders: Folder[] } {
    try {
      const result = OpmlManager.parseOpml(content);
      this.parsedFeeds = result.feeds;
      this.parsedFolders = result.folders;
      this.opmlContent = content;
      return result;
    } catch (error) {
      this.validationErrorKind = "parse_failed";
      throw new Error(`Failed to parse OPML: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private renderPreview() {
    const model = this.previewModel;
    if (!model) return;

    // Preserve scroll position across re-renders
    const existingList = this.previewContainer.querySelector<HTMLDivElement>(
      ".import-preview-list",
    );
    const previousScrollTop = existingList?.scrollTop ?? 0;

    this.previewContainer.removeClass("import-hidden");
    this.previewContainer.addClass("import-visible");
    this.previewContainer.empty();

    const stats = model.getStats();

    const header = this.previewContainer.createDiv({
      cls: "import-preview-header",
    });
    header.createEl("h4", { text: "Preview" });

    const badges = header.createDiv({ cls: "import-preview-badges" });
    badges.createDiv({
      cls: "import-preview-count",
      text: `${stats.totalFeeds} feeds`,
    });
    badges.createDiv({
      cls: "import-preview-count import-preview-count--primary",
      text: `${stats.selectedImportableFeeds} to import`,
    });
    if (this.importMode === "update" && stats.duplicateFeeds > 0) {
      badges.createDiv({
        cls: "import-preview-count",
        text: `${stats.duplicateFeeds} already exist`,
      });
    }

    const toolbar = this.previewContainer.createDiv({
      cls: "import-preview-toolbar",
    });

    const makeButton = (
      text: string,
      iconName: string,
      onClick: () => void,
    ) => {
      const btn = toolbar.createEl("button");
      setIcon(btn, iconName);
      btn.createSpan({ text });
      btn.onclick = onClick;
      return btn;
    };

    makeButton("Select all", "check-square", () => {
      const urls = this.collectAllFeedUrls(model.getFolderTree());
      urls.forEach((url) => model.toggleFeed(url, true));
      this.renderPreview();
      this.updateImportButtonFromModel();
    });

    makeButton("Select none", "square", () => {
      const urls = this.collectAllFeedUrls(model.getFolderTree());
      urls.forEach((url) => model.toggleFeed(url, false));
      this.renderPreview();
      this.updateImportButtonFromModel();
    });

    makeButton("Expand all", "chevrons-down", () => {
      this.collapsedFolderPaths.clear();
      this.renderPreview();
    });

    makeButton("Collapse all", "chevrons-up", () => {
      this.collapsedFolderPaths = new Set(
        this.collectAllFolderPaths(model.getFolderTree()),
      );
      this.renderPreview();
    });

    makeButton("Auto-fix invalid names", "wand-2", () => {
      model.autoFixInvalidNames();
      this.renderPreview();
      this.updateImportButtonFromModel();
    });

    const list = this.previewContainer.createDiv({
      cls: "import-preview-list import-preview-tree",
    });

    const tree = model.getFolderTree();
    for (const node of tree) {
      this.renderFolderNode(list, node, 0);
    }
    // Browsers clamp scrollTop on an empty scroll container to zero. Restore it
    // only after the rows are present so selection re-renders keep their place.
    list.scrollTop = previousScrollTop;
  }

  private updateImportButtonFromModel(): void {
    this.importerShell.updateAction();
  }

  private getImportActionState(model: OpmlImportPreviewModel | null): {
    text: string;
    disabled: boolean;
    title?: string;
  } {
    if (!model) return { text: "Import feeds", disabled: true };

    const stats = model.getStats();
    const count = stats.selectedImportableFeeds;
    if (stats.hasBlockingErrors) {
      return {
        text: count === 1 ? "Import 1 feed" : `Import ${count} feeds`,
        disabled: true,
        title: "Fix invalid names (or unselect them) to import.",
      };
    }
    return {
      text: count === 1 ? "Import 1 feed" : `Import ${count} feeds`,
      disabled: count === 0,
      title: count === 0 ? "Select at least one feed to import." : "",
    };
  }

  private setModeSelectorVisibility(visible: boolean): void {
    this.modeSelectorContainer.toggleClass("import-hidden", !visible);
    this.modeSelectorContainer.toggleClass("import-visible", visible);
  }

  private renderOpmlError(container: HTMLElement, error: string): void {
    container.createDiv({ cls: "import-error-message", text: error });
    if (
      this.validationErrorKind === "invalid_xml" ||
      this.validationErrorKind === "missing_opml" ||
      this.validationErrorKind === "missing_body" ||
      this.validationErrorKind === "parse_failed"
    ) {
      this.renderOpmlCleanerSuggestion(container);
    }
  }

  private renderOpmlCleanerSuggestion(container: HTMLElement): void {
    const wrapper = container.createDiv({
      cls: "import-opml-cleaner-suggestion",
    });
    wrapper.createDiv({
      cls: "import-opml-cleaner-title",
      text: "Tip: try cleaning/formatting your OPML file",
    });
    const row = wrapper.createDiv({ cls: "import-opml-cleaner-row" });
    const link = row.createEl("a", {
      cls: "import-opml-cleaner-link",
      text: ImportOpmlModal.OPML_CLEANER_URL,
      href: ImportOpmlModal.OPML_CLEANER_URL,
    });
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");

    const external = row.createDiv({
      cls: "clickable-icon import-opml-cleaner-external",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Open OPML cleaner in browser",
        title: "Open OPML cleaner in browser",
      },
    });
    setIcon(external, "external-link");

    const open = () => {
      const opened = activeWindow.open(
        ImportOpmlModal.OPML_CLEANER_URL,
        "_blank",
        "noopener,noreferrer",
      );
      if (!opened) {
        new Notice(
          `Unable to open browser. Copy/paste: ${ImportOpmlModal.OPML_CLEANER_URL}`,
        );
      }
    };

    external.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    });
    external.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  }

  private collectAllFeedUrls(
    tree: OpmlImportPreviewFolderSnapshot[],
  ): string[] {
    const urls: string[] = [];
    const stack = [...tree];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) break;
      urls.push(...node.feedUrls);
      stack.push(...(node.children ?? []));
    }
    return urls;
  }

  private collectAllFolderPaths(
    tree: OpmlImportPreviewFolderSnapshot[],
  ): string[] {
    const paths: string[] = [];
    const stack = [...tree];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) break;
      paths.push(node.path);
      stack.push(...(node.children ?? []));
    }
    return paths;
  }

  private renderFolderNode(
    listEl: HTMLElement,
    node: OpmlImportPreviewFolderSnapshot,
    depth: number,
  ): void {
    if (!this.previewModel) return;

    const model = this.previewModel;
    const folderRow = listEl.createDiv({
      cls: "import-preview-row import-preview-row--folder",
    });
    folderRow.dataset.folderPath = node.path;
    folderRow.style.setProperty("--import-indent", `${depth * 14}px`);

    const checkbox = folderRow.createEl("input", {
      cls: "import-preview-checkbox",
      attr: { type: "checkbox" },
    });

    const folderSelection = model.getFolderSelectionState(node.path);
    checkbox.checked = folderSelection.checked;
    checkbox.indeterminate = folderSelection.indeterminate;

    const descendantUrls = this.collectAllFeedUrls([node]);
    checkbox.disabled = descendantUrls.length === 0;

    checkbox.addEventListener("change", () => {
      model.toggleFolder(node.path, checkbox.checked);
      this.updateSelectionPresentation();
    });

    const icon = folderRow.createDiv({ cls: "import-preview-icon" });
    setIcon(icon, "folder");

    const nameWrap = folderRow.createDiv({ cls: "import-preview-name" });
    const nameText = nameWrap.createSpan({
      cls: "import-preview-name-text",
      text: node.name,
    });

    const nameValidation = isValidFolderName(node.name);
    if (!nameValidation.valid) {
      folderRow.addClass("is-invalid");
      nameText.setAttr("title", nameValidation.error ?? "Invalid folder name");
    }

    const edit = nameWrap.createDiv({
      cls: "clickable-icon import-preview-edit",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Rename folder",
        title: "Rename folder",
      },
    });
    setIcon(edit, "pencil");

    const startEdit = () => {
      const input = nameText.win.createEl("input");
      input.className = "import-preview-edit-input";
      input.value = node.name;
      nameText.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const next = input.value.trim();
        const validation = isValidFolderName(next);
        if (!validation.valid) {
          input.classList.add("is-invalid");
          input.setAttribute(
            "title",
            validation.error ?? "Invalid folder name",
          );
          input.focus();
          return;
        }
        model.renameFolderSegment(node.path, next);
        this.renderPreview();
        this.updateImportButtonFromModel();
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.renderPreview();
        }
      });
      input.addEventListener("blur", () => commit());
    };

    edit.addEventListener("click", (e) => {
      e.preventDefault();
      startEdit();
    });
    edit.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startEdit();
      }
    });

    const meta = folderRow.createDiv({ cls: "import-preview-meta" });
    const selectedCount = descendantUrls.filter(
      (url) => model.getFeedState(url).selected,
    ).length;
    meta.textContent = `${selectedCount}/${descendantUrls.length}`;

    const hasChildren =
      (node.children?.length ?? 0) > 0 || node.feedUrls.length > 0;
    const collapsed = this.collapsedFolderPaths.has(node.path);
    const toggle = folderRow.createDiv({
      cls: "clickable-icon import-preview-toggle",
      attr: {
        role: "button",
        tabindex: hasChildren ? "0" : "-1",
        "aria-label": collapsed ? "Expand folder" : "Collapse folder",
        title: collapsed ? "Expand" : "Collapse",
      },
    });
    setIcon(toggle, collapsed ? "chevron-right" : "chevron-down");
    if (!hasChildren) {
      toggle.addClass("is-disabled");
    }

    const toggleCollapse = () => {
      if (!hasChildren) return;
      if (this.collapsedFolderPaths.has(node.path)) {
        this.collapsedFolderPaths.delete(node.path);
      } else {
        this.collapsedFolderPaths.add(node.path);
      }
      this.renderPreview();
    };

    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      toggleCollapse();
    });
    toggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleCollapse();
      }
    });

    if (collapsed) return;

    // Render feeds directly under this folder
    for (const url of node.feedUrls) {
      this.renderFeedRow(listEl, url, depth + 1);
    }

    // Render children folders
    for (const child of node.children ?? []) {
      this.renderFolderNode(listEl, child, depth + 1);
    }
  }

  private renderFeedRow(listEl: HTMLElement, url: string, depth: number): void {
    if (!this.previewModel) return;
    const model = this.previewModel;

    const { feed, selected, duplicate } = model.getFeedState(url);

    const row = listEl.createDiv({
      cls: "import-preview-row import-preview-row--feed",
    });
    row.dataset.feedUrl = url;
    row.style.setProperty("--import-indent", `${depth * 14}px`);

    const checkbox = row.createEl("input", {
      cls: "import-preview-checkbox",
      attr: { type: "checkbox" },
    });
    checkbox.checked = selected;
    checkbox.disabled = duplicate;
    checkbox.addEventListener("change", () => {
      model.toggleFeed(url, checkbox.checked);
      this.updateSelectionPresentation();
    });

    const icon = row.createDiv({ cls: "import-preview-icon" });
    setIcon(icon, "rss");

    const nameWrap = row.createDiv({ cls: "import-preview-name" });
    const titleText = nameWrap.createSpan({
      cls: "import-preview-name-text",
      text: feed.title,
    });

    const titleValidation = isValidFeedTitle(feed.title);
    if (!titleValidation.valid && selected && !duplicate) {
      row.addClass("is-invalid");
      titleText.setAttr("title", titleValidation.error ?? "Invalid feed title");
    }

    const edit = nameWrap.createDiv({
      cls: "clickable-icon import-preview-edit",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Rename feed",
        title: "Rename feed",
      },
    });
    setIcon(edit, "pencil");

    const startEdit = () => {
      const input = titleText.win.createEl("input");
      input.className = "import-preview-edit-input";
      input.value = feed.title;
      titleText.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const next = input.value;
        const validation = isValidFeedTitle(next);
        if (!validation.valid) {
          input.classList.add("is-invalid");
          input.setAttribute("title", validation.error ?? "Invalid feed title");
          input.focus();
          return;
        }
        model.renameFeedTitle(url, next);
        this.renderPreview();
        this.updateImportButtonFromModel();
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.renderPreview();
        }
      });
      input.addEventListener("blur", () => commit());
    };

    edit.addEventListener("click", (e) => {
      e.preventDefault();
      startEdit();
    });
    edit.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startEdit();
      }
    });

    const meta = row.createDiv({ cls: "import-preview-meta" });
    if (this.importMode === "update" && duplicate) {
      meta.textContent = "Already exists";
      row.addClass("is-duplicate");
    } else if (!titleValidation.valid && selected) {
      meta.textContent = "Needs fix";
    } else {
      meta.textContent = "";
    }

    // Keep grid alignment: empty toggle cell
    row.createDiv({ cls: "import-preview-toggle-spacer" });
  }

  private updateSelectionPresentation(): void {
    const model = this.previewModel;
    if (!model) return;

    const primaryBadge = this.previewContainer.querySelector<HTMLElement>(
      ".import-preview-count--primary",
    );
    if (primaryBadge) {
      primaryBadge.textContent = `${model.getStats().selectedImportableFeeds} to import`;
    }

    const folderUrls = new Map<string, string[]>();
    const collectFolderUrls = (
      nodes: OpmlImportPreviewFolderSnapshot[],
    ): string[] => {
      const collected: string[] = [];
      for (const node of nodes) {
        const urls = [
          ...node.feedUrls,
          ...collectFolderUrls(node.children ?? []),
        ];
        folderUrls.set(node.path, urls);
        collected.push(...urls);
      }
      return collected;
    };
    collectFolderUrls(model.getFolderTree());

    this.previewContainer
      .querySelectorAll<HTMLElement>(".import-preview-row--folder")
      .forEach((row) => {
        const path = row.dataset.folderPath;
        if (!path) return;
        const checkbox = row.querySelector<HTMLInputElement>(
          ".import-preview-checkbox",
        );
        const meta = row.querySelector<HTMLElement>(".import-preview-meta");
        const selection = model.getFolderSelectionState(path);
        if (checkbox) {
          checkbox.checked = selection.checked;
          checkbox.indeterminate = selection.indeterminate;
        }
        const urls = folderUrls.get(path) ?? [];
        if (meta) {
          const selectedCount = urls.filter(
            (url) => model.getFeedState(url).selected,
          ).length;
          meta.textContent = `${selectedCount}/${urls.length}`;
        }
      });

    this.previewContainer
      .querySelectorAll<HTMLElement>(".import-preview-row--feed")
      .forEach((row) => {
        const url = row.dataset.feedUrl;
        if (!url) return;
        const { feed, selected, duplicate } = model.getFeedState(url);
        const checkbox = row.querySelector<HTMLInputElement>(
          ".import-preview-checkbox",
        );
        if (checkbox) checkbox.checked = selected;
        const titleValidation = isValidFeedTitle(feed.title);
        row.classList.toggle(
          "is-invalid",
          !titleValidation.valid && selected && !duplicate,
        );
        const meta = row.querySelector<HTMLElement>(".import-preview-meta");
        if (meta) {
          meta.textContent = duplicate
            ? "Already exists"
            : !titleValidation.valid && selected
              ? "Needs fix"
              : "";
        }
      });

    this.updateImportButtonFromModel();
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
    updateContent.createDiv({
      cls: "import-mode-option-title",
      text: "Update",
    });
    updateContent.createDiv({
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
    overwriteContent.createDiv({
      cls: "import-mode-option-title",
      text: "Overwrite",
    });
    overwriteContent.createDiv({
      cls: "import-mode-option-desc",
      text: "Replace all existing feeds with the imported feeds",
    });

    // Add click handlers after elements are created
    updateOption.onclick = () => {
      this.importMode = "update";
      updateOption.addClass("selected");
      overwriteOption.removeClass("selected");

      if (this.previewModel) {
        const existingUrls = new Set(
          this.plugin.settings.feeds.map((f) => f.url),
        );
        this.previewModel.setImportMode("update", existingUrls);
        this.renderPreview();
        this.updateImportButtonFromModel();
      }
    };

    overwriteOption.onclick = () => {
      this.importMode = "overwrite";
      overwriteOption.addClass("selected");
      updateOption.removeClass("selected");

      if (this.previewModel) {
        this.previewModel.setImportMode("overwrite", new Set());
        this.renderPreview();
        this.updateImportButtonFromModel();
      }
    };
  }

  private showOverwriteWarning() {
    // Create overlay modal that appears ON TOP of the import modal
    const overlay = activeDocument.body.createDiv({
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
      text: "Before overwriting, we strongly recommend backing up your current feeds by exporting to an OPML file.",
    });

    // Button container
    const buttonContainer = modalContent.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    // Export OPML button
    const exportBtn = buttonContainer.createEl("button", {
      text: "Export OPML",
      cls: "rss-dashboard-primary-button export-opml-btn",
    });
    exportBtn.onclick = () => {
      this.plugin.exportOpml();
    };

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.onclick = () => {
      activeDocument.body.removeChild(overlay);
    };

    const confirmButton = buttonContainer.createEl("button", {
      text: "Overwrite feeds",
      cls: "rss-dashboard-danger-button",
    });
    confirmButton.onclick = () => {
      activeDocument.body.removeChild(overlay);
      void this.executeImport();
    };
  }

  private async executeImport() {
    await this.importerShell.execute();
  }

  private async performImport() {
    if (!this.previewModel) {
      return;
    }

    try {
      const selectedFeeds = this.previewModel.getSelectedImportableFeeds();
      if (selectedFeeds.length === 0) {
        return;
      }

      const derivedFolders =
        this.previewModel.getDerivedFoldersForSelectedFeeds();
      const result = await this.plugin.ingestFeedsForBackgroundImport(
        selectedFeeds,
        {
          mode: this.importMode,
          folders: derivedFolders,
          globalOperation: true,
        },
      );

      this.onImportStarted?.();

      if (this.importMode === "update" && result.addedCount === 0) {
        new Notice("No new feeds found in the OPML file.");
        this.close();
        return;
      }

      const modeText =
        this.importMode === "overwrite" ? "replaced with" : "updated with";
      new Notice(
        `Feeds ${modeText} ${selectedFeeds.length} imported feeds. Articles will be fetched in the background.`,
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
