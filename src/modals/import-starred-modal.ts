import { Modal, App, Setting, Notice, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { Feed } from "../types/types";
import {
  buildNewFeedRecord,
  mapStarredExportToCandidates,
  type StarredJsonExport,
} from "../services/starred-import-mapper";
import type { StarredImportPreviewGroupSnapshot } from "../services/starred-import-preview-model";
import { StarredImportPreviewModel } from "../services/starred-import-preview-model";
import { isValidFolderName } from "../utils/validation";
import { shouldUseMobileSidebarLayout } from "../utils/platform-utils";
import { ImporterShell } from "./importer-shell";

/**
 * Import Starred Articles Modal.
 *
 * A second consumer of the shared importer shell (see `ImporterShell`),
 * alongside `ImportOpmlModal`. Reads a Google-Reader-API-compatible
 * `starred.json` export (Inoreader "Read later"/starred-items format) and
 * inserts starred articles into feeds the user already subscribes to. For
 * source feeds the user does not already subscribe to, the preview groups
 * their starred items under an editable-folder "new feed" row (234-02); on
 * execute, the feed is created, a single background fetch is triggered to
 * populate its metadata/current items, and the historical starred item(s)
 * are inserted immediately, independent of that fetch. Surfacing
 * unimportable entries, label-to-tag mapping, re-import dedup, and
 * full-content fetching are all deferred to later 234-* tickets — see
 * docs/plans/234-02-auto-create-missing-source-feeds.md.
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
      noItemsError: "No importable starred articles were found in this file.",
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
      "Import starred articles from an exported starred.json (Inoreader / Google Reader API format). Articles for feeds you don't already subscribe to will create the source feed too.";

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
    if (stats.newFeedGroups > 0) {
      badges.createDiv({
        cls: "import-preview-count",
        text:
          stats.newFeedGroups === 1
            ? "1 new feed"
            : `${stats.newFeedGroups} new feeds`,
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
    setIcon(icon, group.isNewFeed ? "plus-circle" : "rss");

    const nameWrap = groupRow.createDiv({ cls: "import-preview-name" });
    nameWrap.createSpan({
      cls: "import-preview-name-text",
      text: group.feedTitle,
    });

    if (group.isNewFeed) {
      nameWrap.createSpan({
        cls: "import-preview-meta",
        text: "New feed",
      });
      this.renderNewFeedFolderControl(nameWrap, group);
    }

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

  /**
   * Editable target-folder control for a new-feed group. Mirrors
   * `ImportOpmlModal`'s inline folder-rename interaction (click pencil,
   * edit inline, commit on Enter/blur, validate via `isValidFolderName`).
   */
  private renderNewFeedFolderControl(
    nameWrap: HTMLElement,
    group: StarredImportPreviewGroupSnapshot,
  ): void {
    const model = this.previewModel;
    if (!model) return;

    const folderText = nameWrap.createSpan({
      cls: "import-preview-meta",
      text: `Folder: ${group.folder ?? ""}`,
    });

    const edit = nameWrap.createDiv({
      cls: "clickable-icon import-preview-edit",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Edit target folder",
        title: "Edit target folder",
      },
    });
    setIcon(edit, "pencil");

    const startEdit = () => {
      const input = folderText.win.createEl("input");
      input.className = "import-preview-edit-input";
      input.value = group.folder ?? "";
      folderText.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const next = input.value.trim();
        const validation = isValidFolderName(next);
        if (!validation.valid) {
          input.classList.add("is-invalid");
          input.setAttribute("title", validation.error ?? "Invalid folder name");
          input.focus();
          return;
        }
        model.setNewFeedFolder(group.feedUrl, next);
        this.renderPreview();
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

    const createdFeedUrls: string[] = [];
    for (const newFeedGroup of model.getSelectedNewFeedGroups()) {
      if (feedByUrl.has(newFeedGroup.feedUrl)) {
        // Feed already exists locally (e.g. added since the file was
        // selected) — reuse it instead of creating a duplicate.
        continue;
      }

      const feed = buildNewFeedRecord({
        url: newFeedGroup.feedUrl,
        title: newFeedGroup.feedTitle,
        folder: newFeedGroup.folder,
        siteUrl: newFeedGroup.siteUrl,
      });

      if (feed.folder) {
        await this.plugin.ensureFolderExists(feed.folder, {
          saveSettings: false,
          refreshView: false,
        });
      }

      this.plugin.settings.feeds.push(feed);
      feedByUrl.set(feed.url, feed);
      createdFeedUrls.push(feed.url);
    }

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

    // Persist the new feed(s) and the historical starred item(s)
    // immediately. The starred/read state must not wait on the live
    // fetch triggered below.
    await this.plugin.saveSettings();
    this.onImportStarted?.();

    const view = await this.plugin.getActiveDashboardView();
    if (view) {
      view.render();
    }

    // Fire-and-forget: populate each newly created feed's metadata and
    // current items via a single background fetch, independent of the
    // starred-item insertion already persisted above.
    for (const feedUrl of createdFeedUrls) {
      this.fetchNewlyCreatedFeed(feedUrl);
    }

    new Notice(
      insertedCount === 1
        ? "Imported 1 starred article."
        : `Imported ${insertedCount} starred articles.`,
    );

    this.close();
  }

  /**
   * Triggers exactly one feed-fetch/refresh for a feed created during this
   * import, to populate its metadata (title/siteUrl/icon) and current
   * items. Deliberately not awaited by `performImport` — the historical
   * starred item(s) for this feed were already inserted and saved. Any
   * fetch failure is non-fatal: `FeedParser.refreshFeed` already catches
   * and records `lastFetchError` on the feed rather than throwing.
   */
  private fetchNewlyCreatedFeed(feedUrl: string): void {
    const feed = this.plugin.settings.feeds.find((f) => f.url === feedUrl);
    if (!feed) return;

    void this.plugin.feedParser
      .refreshFeed(feed)
      .then(async (refreshedFeed) => {
        const index = this.plugin.settings.feeds.findIndex(
          (f) => f.url === feedUrl,
        );
        if (index < 0) return;

        this.plugin.settings.feeds[index] = refreshedFeed;
        await this.plugin.saveSettings();

        const view = await this.plugin.getActiveDashboardView();
        if (view) {
          view.render();
        }
      })
      .catch((error) => {
        console.error(
          `[RSS dashboard] Failed to fetch newly imported feed ${feedUrl}:`,
          error,
        );
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}
