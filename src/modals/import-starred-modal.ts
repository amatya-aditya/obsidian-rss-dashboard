import { Modal, App, Setting, Notice, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { Feed } from "../types/types";
import {
  mapStarredExportToCandidates,
  type StarredJsonExport,
} from "../services/starred-import-mapper";
import type { StarredImportPreviewGroupSnapshot } from "../services/starred-import-preview-model";
import { StarredImportPreviewModel } from "../services/starred-import-preview-model";
import { shouldUseMobileSidebarLayout } from "../utils/platform-utils";
import { ImporterShell } from "./importer-shell";

/**
 * Import Starred Articles Modal.
 *
 * A second consumer of the shared importer shell (see `ImporterShell`),
 * alongside `ImportOpmlModal`. Reads a Google-Reader-API-compatible
 * `starred.json` export (Inoreader "Read later"/starred-items format) and
 * inserts starred articles directly into feeds the user already subscribes
 * to. Building missing source feeds, surfacing unimportable entries,
 * label-to-tag mapping, re-import dedup, and full-content fetching are all
 * deferred to later 234-* tickets — see docs/plans/234-01-import-starred-items-for-existing-feeds.md.
 */
export class ImportStarredModal extends Modal {
  plugin: RssDashboardPlugin;
  private readonly onImportStarted?: () => void;

  private validationErrorKind:
    | "invalid_extension"
    | "invalid_json"
    | "missing_items"
    | null = null;
  private previewModel: StarredImportPreviewModel | null = null;
  private collapsedFeedUrls = new Set<string>();
  private readonly importerShell: ImporterShell<
    StarredJsonExport,
    StarredImportPreviewModel
  >;

  private previewContainer!: HTMLDivElement;

  constructor(
    app: App,
    plugin: RssDashboardPlugin,
    onImportStarted?: () => void,
  ) {
    super(app);
    this.plugin = plugin;
    this.onImportStarted = onImportStarted;
    this.importerShell = new ImporterShell({
      acceptedFileTypes: ".json",
      validate: (content, file) => this.validateStarredJson(content, file),
      parse: (content) => this.parseStarredJson(content),
      createPreviewModel: (parsed) => {
        const candidates = mapStarredExportToCandidates(
          parsed,
          this.plugin.settings.feeds,
        );
        if (candidates.length === 0) {
          return null;
        }
        this.previewModel = new StarredImportPreviewModel({ candidates });
        return this.previewModel;
      },
      renderer: { render: () => this.renderPreview() },
      execute: (model) => this.performImport(model),
      noItemsError:
        "No starred articles matched a feed you already subscribe to.",
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
    this.modalEl.addClass("rss-import-starred-modal");
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-import-starred-modal");
    }

    contentEl.empty();
    new Setting(contentEl).setName("Import starred articles").setHeading();

    const subtitle = contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent =
      "Import starred articles from an exported starred.json (Inoreader / Google Reader API format) for feeds you already subscribe to.";

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
  }

  private async handleFileSelection(file: File): Promise<void> {
    this.validationErrorKind = null;
    this.previewModel = null;
    this.collapsedFeedUrls.clear();
    await this.importerShell.handleFileSelection(file);
  }

  private validateStarredJson(content: string, file: File) {
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".json")) {
      this.validationErrorKind = "invalid_extension";
      return {
        valid: false as const,
        error: "Please select a valid starred.json file (.json extension required)",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      this.validationErrorKind = "invalid_json";
      return {
        valid: false as const,
        error: "This is not a valid starred.json file. The file contains invalid JSON.",
      };
    }

    const items = (parsed as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) {
      this.validationErrorKind = "missing_items";
      return {
        valid: false as const,
        error: "This is not a valid starred.json file. Missing an items array.",
      };
    }

    return { valid: true as const };
  }

  private parseStarredJson(content: string): StarredJsonExport {
    return JSON.parse(content) as StarredJsonExport;
  }

  private renderPreview() {
    const model = this.previewModel;
    if (!model) return;

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
      text: `${stats.totalItems} articles`,
    });
    badges.createDiv({
      cls: "import-preview-count import-preview-count--primary",
      text: `${stats.selectedItems} to import`,
    });

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
      model.selectAll();
      this.renderPreview();
      this.importerShell.updateAction();
    });

    makeButton("Select none", "square", () => {
      model.selectNone();
      this.renderPreview();
      this.importerShell.updateAction();
    });

    makeButton("Expand all", "chevrons-down", () => {
      this.collapsedFeedUrls.clear();
      this.renderPreview();
    });

    makeButton("Collapse all", "chevrons-up", () => {
      this.collapsedFeedUrls = new Set(
        model.getGroups().map((group) => group.feedUrl),
      );
      this.renderPreview();
    });

    const list = this.previewContainer.createDiv({
      cls: "import-preview-list import-preview-tree",
    });

    for (const group of model.getGroups()) {
      this.renderGroup(list, group);
    }

    list.scrollTop = previousScrollTop;
  }

  private renderGroup(
    listEl: HTMLElement,
    group: StarredImportPreviewGroupSnapshot,
  ): void {
    const model = this.previewModel;
    if (!model) return;

    const groupRow = listEl.createDiv({
      cls: "import-preview-row import-preview-row--folder",
    });
    groupRow.dataset.feedUrl = group.feedUrl;

    const checkbox = groupRow.createEl("input", {
      cls: "import-preview-checkbox",
      attr: { type: "checkbox" },
    });
    const groupSelection = model.getGroupSelectionState(group.feedUrl);
    checkbox.checked = groupSelection.checked;
    checkbox.indeterminate = groupSelection.indeterminate;
    checkbox.addEventListener("change", () => {
      model.toggleGroup(group.feedUrl, checkbox.checked);
      this.renderPreview();
      this.importerShell.updateAction();
    });

    const icon = groupRow.createDiv({ cls: "import-preview-icon" });
    setIcon(icon, "rss");

    const nameWrap = groupRow.createDiv({ cls: "import-preview-name" });
    nameWrap.createSpan({
      cls: "import-preview-name-text",
      text: group.feedTitle,
    });

    const selectedCount = group.items.filter((item) => item.selected).length;
    const meta = groupRow.createDiv({ cls: "import-preview-meta" });
    meta.textContent = `${selectedCount}/${group.items.length}`;

    const collapsed = this.collapsedFeedUrls.has(group.feedUrl);
    const toggle = groupRow.createDiv({
      cls: "clickable-icon import-preview-toggle",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": collapsed ? "Expand feed" : "Collapse feed",
        title: collapsed ? "Expand" : "Collapse",
      },
    });
    setIcon(toggle, collapsed ? "chevron-right" : "chevron-down");

    const toggleCollapse = () => {
      if (this.collapsedFeedUrls.has(group.feedUrl)) {
        this.collapsedFeedUrls.delete(group.feedUrl);
      } else {
        this.collapsedFeedUrls.add(group.feedUrl);
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

    for (const item of group.items) {
      this.renderItemRow(listEl, item);
    }
  }

  private renderItemRow(
    listEl: HTMLElement,
    item: StarredImportPreviewGroupSnapshot["items"][number],
  ): void {
    const model = this.previewModel;
    if (!model) return;

    const row = listEl.createDiv({
      cls: "import-preview-row import-preview-row--feed import-preview-row--indented",
    });
    row.dataset.guid = item.guid;

    const checkbox = row.createEl("input", {
      cls: "import-preview-checkbox",
      attr: { type: "checkbox" },
    });
    checkbox.checked = item.selected;
    checkbox.addEventListener("change", () => {
      model.toggleItem(item.guid, checkbox.checked);
      this.renderPreview();
      this.importerShell.updateAction();
    });

    const icon = row.createDiv({ cls: "import-preview-icon" });
    setIcon(icon, "file-text");

    const nameWrap = row.createDiv({ cls: "import-preview-name" });
    nameWrap.createSpan({
      cls: "import-preview-name-text",
      text: item.title || item.link,
    });

    const meta = row.createDiv({ cls: "import-preview-meta" });
    meta.textContent = item.read ? "Read" : "Unread";

    row.createDiv({ cls: "import-preview-toggle-spacer" });
  }

  private getImportActionState(model: StarredImportPreviewModel | null): {
    text: string;
    disabled: boolean;
    title?: string;
  } {
    if (!model) return { text: "Import articles", disabled: true };

    const count = model.getStats().selectedItems;
    return {
      text: count === 1 ? "Import 1 article" : `Import ${count} articles`,
      disabled: count === 0,
      title: count === 0 ? "Select at least one article to import." : "",
    };
  }

  private async performImport(model: StarredImportPreviewModel): Promise<void> {
    const selected = model.getSelectedCandidates();
    if (selected.length === 0) {
      return;
    }

    const feedByUrl = new Map<string, Feed>(
      this.plugin.settings.feeds.map((feed) => [feed.url, feed]),
    );

    let insertedCount = 0;
    for (const candidate of selected) {
      const feed = feedByUrl.get(candidate.feedUrl);
      if (!feed) continue;
      feed.items.push(candidate.item);
      insertedCount += 1;
    }

    if (insertedCount === 0) {
      new Notice("No starred articles were imported.");
      this.close();
      return;
    }

    await this.plugin.saveSettings();
    this.onImportStarted?.();

    const view = await this.plugin.getActiveDashboardView();
    if (view) {
      view.render();
    }

    new Notice(
      insertedCount === 1
        ? "Imported 1 starred article."
        : `Imported ${insertedCount} starred articles.`,
    );

    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
