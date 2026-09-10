import { Modal, App, Setting, Notice, setIcon } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { Feed, Tag } from "../types/types";
import {
  buildNewFeedRecord,
  mapStarredExportToCandidates,
  type StarredImportCandidate,
  type StarredImportUnimportableEntry,
  type StarredJsonExport,
} from "../services/starred-import-mapper";
import type { StarredImportPreviewGroupSnapshot } from "../services/starred-import-preview-model";
import {
  DEFAULT_NEW_FEED_FOLDER,
  StarredImportPreviewModel,
} from "../services/starred-import-preview-model";
import { isValidFolderName } from "../utils/validation";
import { applyStarredImportCandidateToFeed } from "../services/starred-import-merge";
import { shouldUseMobileSidebarLayout } from "../utils/platform-utils";
import { ImporterShell } from "./importer-shell";
import { renderSingleRowCardTagChips } from "../components/article-list/utils/tag-layout-utils";
import { createTagsDropdownPortal } from "../utils/tags-dropdown-portal";

/**
 * Import Starred Articles Modal.
 *
 * A second consumer of the shared importer shell (see `ImporterShell`),
 * alongside `ImportOpmlModal`. Reads a Google-Reader-API-compatible
 * `starred.json` export (Inoreader "Read later"/starred-items format) and
 * inserts starred articles into feeds the user already subscribes to. For
 * source feeds the user does not already subscribe to, the preview groups
 * their starred items under an editable-folder "new feed" row (234-02); on
 * execute, the feed is created unconditionally using only the export's own
 * `origin.title`/`origin.htmlUrl` data, and the historical starred item(s)
 * are inserted immediately. Whether a single background fetch is also
 * triggered to populate that new feed's live metadata/current items is
 * controlled by the Options panel's "New-feed metadata refresh" toggle
 * (234-07), off by default; when off, the feed keeps only the export-derived
 * placeholder data until its next normal refresh. Entries that can never
 * produce a candidate at all are surfaced in an "Unable to import" section
 * (234-03) instead of being silently dropped.
 *
 * Label-to-tag mapping (234-04): `mapStarredExportToCandidates` assigns each
 * imported article its `label/X` categories as `Tag`s, reusing an existing
 * `settings.availableTags` entry's color when the name matches, or a default
 * color for a brand-new label. This modal's `performImport` (the execute
 * step) is the seam that actually persists any brand-new label into
 * `settings.availableTags`, since the mapper itself is pure and must not
 * touch plugin state.
 *
 * Idempotent re-import (234-05): `performImport` runs each candidate through
 * `applyStarredImportCandidateToFeed`, which matches it against the target
 * feed's existing items by guid-or-link identity. A match merges newly
 * present labels into the existing article's tags and forces `starred` back
 * to `true`, without touching `read`, `saved`, `savedFilePath`, or any other
 * locally-edited field. Re-running the import against the same or an updated
 * export is therefore safe and produces no duplicate articles.
 *
 * There is no import-time full-content fetch (234-06 was removed by
 * 234-10). Every imported article starts in the "unfetched" content state
 * stamped by `starred-import-mapper.ts`'s `toFeedItem` (234-09); the
 * reader's manual "Fetch now" banner is the only path to full content for
 * a starred-imported article.
 *
 * Tag-import toggle and unified confirmation (234-11): the Options panel's
 * second toggle, on by default, gates whether a selected candidate's
 * label-derived tags (assigned unconditionally by the pure mapper above)
 * actually reach the imported article and the tag palette. When off,
 * `getEffectiveTags` returns `undefined` for every candidate so no tag ever
 * reaches `applyStarredImportCandidateToFeed` or `settings.availableTags`.
 * The inline "New tags (N)" section (`renderNewTagsSection`) is the single
 * place any brand-new tag is surfaced before execute, sourced from every
 * currently-selected candidate's effective tags — not just the bulk label
 * mapping — so a later ad hoc per-article tagging ticket (234-12) can feed
 * the same section without restructuring it.
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
  private unimportableEntries: StarredImportUnimportableEntry[] = [];
  private collapsedFeedUrls = new Set<string>();
  private newFeedMetadataRefreshEnabled = false;
  private tagImportEnabled = true;
  private readonly importerShell: ImporterShell<
    StarredJsonExport,
    StarredImportPreviewModel
  >;

  private previewContainer!: HTMLDivElement;
  private itemTagsDropdownCleanup: (() => void) | null = null;
  private itemTagsDropdownAnchor: HTMLElement | null = null;

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
        const { candidates, unimportable } = mapStarredExportToCandidates(
          parsed,
          this.plugin.settings.feeds,
          this.plugin.settings.availableTags,
        );
        this.unimportableEntries = unimportable;
        if (candidates.length === 0 && unimportable.length === 0) {
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
    new Setting(contentEl)
      .setName("Import starred articles from Inoreader")
      .setHeading();

    const subtitle = contentEl.createDiv({ cls: "add-feed-subtitle" });
    subtitle.textContent =
      "Import starred articles from an exported starred.json (the Google Reader API's 'Read later' format, as exported by Inoreader). Articles for feeds you don't already subscribe to will create the source feed too.";

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
    this.unimportableEntries = [];
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

    this.renderOptionsPanel();

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

    if (stats.newFeedGroups > 0) {
      this.previewContainer.createEl("p", {
        cls: "import-preview-helper",
        text: "New feeds are imported into an editable target folder. Use the folder icon on a new feed's row to change it before importing.",
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

    this.renderUnimportableSection(this.previewContainer);
    this.renderNewTagsSection(this.previewContainer);
  }

  /**
   * "Options" panel (234-07), rendered above the "Preview" section. Hosts
   * the new-feed metadata-refresh toggle and the tag-import toggle (234-11).
   */
  private renderOptionsPanel(): void {
    const panel = this.previewContainer.createDiv({
      cls: "import-options-panel",
    });
    panel.createEl("h4", {
      cls: "import-options-heading",
      text: "Options",
    });

    const metadataRefreshSetting = new Setting(panel)
      .setName("New-feed metadata refresh")
      .setDesc(
        "When a starred article belongs to a feed you don't already follow, live-fetch that new feed's title, site URL, icon, and current items right away. The starred article itself is always imported, whether this is on or off.",
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.newFeedMetadataRefreshEnabled)
          .onChange((value) => {
            this.newFeedMetadataRefreshEnabled = value;
            this.setOptionDescriptionDimmed(metadataRefreshSetting, !value);
          });
      });
    metadataRefreshSetting.settingEl.addClass("import-option-setting");
    this.setOptionDescriptionDimmed(
      metadataRefreshSetting,
      !this.newFeedMetadataRefreshEnabled,
    );

    const tagImportSetting = new Setting(panel)
      .setName("Import labels as tags")
      .setDesc(
        "Inoreader labels become tags on each starred article, reusing a matching tag's color when your palette already has one. Any new tags this creates appear below before you import.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.tagImportEnabled).onChange((value) => {
          this.tagImportEnabled = value;
          this.setOptionDescriptionDimmed(tagImportSetting, !value);
          this.renderPreview();
          this.importerShell.updateAction();
        });
      });
    tagImportSetting.settingEl.addClasses([
      "import-option-setting",
      "import-tag-import-setting",
    ]);
    this.setOptionDescriptionDimmed(tagImportSetting, !this.tagImportEnabled);
  }

  /**
   * Dims an Options-panel toggle's own description text when that toggle is
   * off, per story 17 in draft-20260910-starred-import-followups.md — a
   * scoped CSS class on the description element, not `!important`.
   */
  private setOptionDescriptionDimmed(setting: Setting, dimmed: boolean): void {
    setting.descEl.toggleClass("import-option-description--disabled", dimmed);
  }

  private renderUnimportableSection(container: HTMLElement): void {
    if (this.unimportableEntries.length === 0) return;

    const section = container.createDiv({
      cls: "import-unimportable-section",
    });
    section.createEl("h4", {
      cls: "import-unimportable-heading",
      text: `Unable to import (${this.unimportableEntries.length})`,
    });

    const list = section.createDiv({ cls: "import-unimportable-list" });
    for (const entry of this.unimportableEntries) {
      const row = list.createDiv({ cls: "import-unimportable-row" });

      const icon = row.createDiv({ cls: "import-unimportable-icon" });
      setIcon(icon, "alert-triangle");

      const nameWrap = row.createDiv({ cls: "import-unimportable-name" });
      nameWrap.createSpan({
        cls: "import-unimportable-name-text",
        text: entry.title || entry.id,
      });

      row.createDiv({
        cls: "import-unimportable-reason",
        text: this.describeUnimportableReason(entry.reason),
      });
    }
  }

  private describeUnimportableReason(
    reason: StarredImportUnimportableEntry["reason"],
  ): string {
    switch (reason) {
      case "no_source_feed":
        return "No source feed identified";
      case "no_article_url":
        return "No article link found";
      default:
        return "Unable to import";
    }
  }

  /**
   * A candidate's tags as they will actually be imported and displayed,
   * gated by the Options panel's tag-import toggle (234-11). The pure mapper
   * always assigns `item.tags` from the export's labels regardless of this
   * toggle (it has no plugin-state/settings dependency to gate against);
   * every site that would let a tag reach the imported article, the tag
   * palette, or the per-article chip display must go through this helper
   * instead of reading `item.tags` directly.
   *
   * When the toggle is off, only tags named in `labelDerivedTagNames` are
   * stripped — a tag a user added by hand via the per-article chip (234-12)
   * is never in that set (it's computed once, from labels only, at mapping
   * time), so it always survives here regardless of the toggle's state.
   */
  private getEffectiveTags(
    candidate: Pick<StarredImportCandidate, "item" | "labelDerivedTagNames">,
  ): Tag[] | undefined {
    const tags = candidate.item.tags;
    if (!tags || tags.length === 0) return undefined;
    if (this.tagImportEnabled) return tags;

    const labelNames = new Set(candidate.labelDerivedTagNames ?? []);
    const remaining = tags.filter(
      (tag) => !labelNames.has(tag.name.toLowerCase()),
    );
    return remaining.length > 0 ? remaining : undefined;
  }

  /**
   * Every distinct tag (by case-insensitive name) that is assigned to at
   * least one currently-selected candidate and is not yet present in
   * `settings.availableTags`. This is the "New tags (N)" section's data
   * source (234-11) — it reads every selected candidate's *effective* tags,
   * not only the bulk label mapping, so a future ad hoc per-article tagging
   * ticket (234-12) can add to this same list without a second confirmation
   * path.
   */
  private computeNewTags(model: StarredImportPreviewModel): Tag[] {
    const existingLowerNames = new Set(
      this.plugin.settings.availableTags.map((tag) => tag.name.toLowerCase()),
    );
    const newTagsByLowerName = new Map<string, Tag>();

    for (const candidate of model.getSelectedCandidates()) {
      for (const tag of this.getEffectiveTags(candidate) ?? []) {
        const lowerName = tag.name.toLowerCase();
        if (existingLowerNames.has(lowerName)) continue;
        if (!newTagsByLowerName.has(lowerName)) {
          newTagsByLowerName.set(lowerName, tag);
        }
      }
    }

    return Array.from(newTagsByLowerName.values());
  }

  /**
   * Inline "New tags (N)" confirmation (234-11), visually matching the
   * "Unable to import (N)" section above. Lists every tag `computeNewTags`
   * finds so the user can catch an unwanted tag before it becomes part of
   * their permanent palette — this section, not any other code path, is
   * what actually adds these tags in `performImport`. Recomputed on every
   * `renderPreview` call, so it stays live as articles/labels are
   * (de)selected or the tag-import toggle changes.
   */
  private renderNewTagsSection(container: HTMLElement): void {
    const model = this.previewModel;
    if (!model) return;

    const newTags = this.computeNewTags(model);
    if (newTags.length === 0) return;

    const section = container.createDiv({ cls: "import-new-tags-section" });
    section.createEl("h4", {
      cls: "import-new-tags-heading",
      text: `New tags (${newTags.length})`,
    });

    const list = section.createDiv({ cls: "import-new-tags-list" });
    for (const tag of newTags) {
      const row = list.createDiv({ cls: "import-new-tags-row" });

      const icon = row.createDiv({ cls: "import-new-tags-icon" });
      setIcon(icon, "tag");

      row.createDiv({
        cls: "import-new-tags-name",
        text: tag.name,
      });
    }
  }

  /**
   * Re-renders only the "New tags (N)" section in place, without tearing
   * down the whole preview list (`renderPreview` would remove the anchor
   * element the per-article tag portal is currently positioned against).
   * Called after every tag change made through a row's tag chip (234-12) so
   * a tag added/created via that control is reflected immediately, while
   * the portal itself stays open for further edits.
   */
  private refreshNewTagsSection(): void {
    this.previewContainer
      .querySelectorAll(".import-new-tags-section")
      .forEach((el) => el.remove());
    this.renderNewTagsSection(this.previewContainer);
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
   * Leads with the same "folder" icon `ImportOpmlModal` uses for its folder
   * rows (234-08) so the control reads as folder assignment rather than a
   * generic rename affordance.
   */
  private renderNewFeedFolderControl(
    nameWrap: HTMLElement,
    group: StarredImportPreviewGroupSnapshot,
  ): void {
    const model = this.previewModel;
    if (!model) return;

    const folderIcon = nameWrap.createDiv({
      cls: "import-preview-icon import-preview-folder-icon",
      attr: { "aria-hidden": "true" },
    });
    setIcon(folderIcon, "folder");

    const displayFolder =
      group.folder === DEFAULT_NEW_FEED_FOLDER || !group.folder
        ? "<None>"
        : group.folder;
    const folderText = nameWrap.createSpan({
      cls: "import-preview-meta",
      text: `Folder: ${displayFolder}`,
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

    const candidate = model.getCandidate(item.guid);

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

    if (candidate) {
      this.renderItemTagsControl(row, candidate);
    } else {
      row.createDiv({ cls: "import-preview-meta" });
    }

    row.createDiv({ cls: "import-preview-toggle-spacer" });
  }

  /**
   * Per-article tag chip (234-12), replacing the old meaningless
   * "Read"/"Unread" text that used to occupy this column. Reuses the exact
   * chip renderer already used on dashboard cards
   * (`renderSingleRowCardTagChips`: one or more visible chips plus a "+N"
   * overflow chip) so an article's assigned tags are visible at a glance
   * before import. Clicking the control opens the same tag-editing portal
   * used from the article list and reader view, wired directly against
   * `candidate.item` — the live `FeedItem` backing this row, not a copy — so
   * any edit made here already lives on the object `performImport` reads
   * from later.
   */
  private renderItemTagsControl(
    row: HTMLElement,
    candidate: StarredImportCandidate,
  ): void {
    const control = row.createDiv({
      cls: "import-preview-meta import-preview-tags-control rss-dashboard-tag-container",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Manage tags",
        title: "Manage tags",
      },
    });

    this.renderItemTagsChips(control, candidate);

    const openPortal = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.showItemTagsDropdown(control, candidate);
    };
    control.addEventListener("click", openPortal);
    control.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        openPortal(e);
      }
    });
  }

  /**
   * Renders the row's chips from its *effective* tags (234-11's
   * `getEffectiveTags`), not the candidate's raw `item.tags` — so turning
   * "Import labels as tags" off correctly hides label-derived chips here
   * too, while any tag added by hand via this same control's portal keeps
   * showing regardless of that toggle's state.
   */
  private renderItemTagsChips(
    control: HTMLElement,
    candidate: Pick<StarredImportCandidate, "item" | "labelDerivedTagNames">,
  ): void {
    control.empty();
    const tags = this.getEffectiveTags(candidate) ?? [];
    if (tags.length === 0) {
      const placeholder = control.createDiv({
        cls: "import-preview-tags-placeholder",
        attr: { "aria-hidden": "true" },
      });
      setIcon(placeholder, "tag");
      return;
    }
    renderSingleRowCardTagChips(control, tags);
  }

  /**
   * Opens `createTagsDropdownPortal` against `candidateItem` (the live
   * candidate object, not a snapshot). Adding, removing, or creating a tag
   * mutates `candidateItem.tags` in place via `onTagAssignmentChange`, then
   * refreshes this row's chips and the "New tags (N)" confirmation section
   * (234-11) so an ad hoc tag surfaces there immediately — the only
   * palette-confirmation path this work introduces or reuses.
   *
   * The palette shown inside the portal is `settings.availableTags` plus
   * every tag `computeNewTags` currently considers pending (i.e. already
   * assigned to some selected candidate but not yet in the real palette).
   * This lets the user reuse an ad hoc tag created from a different row's
   * portal without recreating it, while keeping the actual mutation of
   * `settings.availableTags` itself confined to `performImport`'s existing
   * `ensureAvailableTagsForSelection` step — the portal never pushes
   * directly into the real palette array here.
   */
  private showItemTagsDropdown(
    anchor: HTMLElement,
    candidate: StarredImportCandidate,
  ): void {
    const model = this.previewModel;
    if (!model) return;
    const candidateItem = candidate.item;

    const isSameAnchor = this.itemTagsDropdownAnchor === anchor;
    if (this.itemTagsDropdownCleanup) {
      this.itemTagsDropdownCleanup();
      this.itemTagsDropdownCleanup = null;
      if (isSameAnchor) {
        this.itemTagsDropdownAnchor = null;
        return;
      }
    }
    this.itemTagsDropdownAnchor = anchor;

    const pendingTags = this.computeNewTags(model);
    const portalSettings: typeof this.plugin.settings = {
      ...this.plugin.settings,
      availableTags: [...this.plugin.settings.availableTags, ...pendingTags],
    };

    const cleanup = createTagsDropdownPortal({
      anchor,
      settings: portalSettings,
      item: candidateItem,
      onTagAssignmentChange: (tag, checked) => {
        if (!candidateItem.tags) candidateItem.tags = [];
        if (checked) {
          if (!candidateItem.tags.some((t) => t.name === tag.name)) {
            candidateItem.tags.push({ ...tag });
          }
        } else {
          candidateItem.tags = candidateItem.tags.filter(
            (t) => t.name !== tag.name,
          );
        }
        this.renderItemTagsChips(anchor, candidate);
        this.refreshNewTagsSection();
      },
      appContainer: this.previewContainer,
      onClosed: () => {
        if (this.itemTagsDropdownCleanup === cleanup) {
          this.itemTagsDropdownCleanup = null;
          this.itemTagsDropdownAnchor = null;
        }
      },
    });
    this.itemTagsDropdownCleanup = cleanup;
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

  /**
   * Adds any label-derived tag that appears on a selected candidate but is
   * not yet present in `settings.availableTags` (case-insensitive name
   * match), so it immediately shows up in the normal tag-filter UI. Reuses
   * the exact `{name, color}` the pure mapper already assigned to the
   * candidate's `item.tags` rather than re-deciding a color here. Only ever
   * called when the tag-import toggle is on (234-11) — this is the same
   * palette-mutation step the "New tags (N)" section previews before
   * execute, via `getEffectiveTags`/`computeNewTags`.
   */
  private ensureAvailableTagsForSelection(
    selected: readonly Pick<
      StarredImportCandidate,
      "item" | "labelDerivedTagNames"
    >[],
  ): void {
    const availableTags = this.plugin.settings.availableTags;
    const existingByLowerName = new Map(
      availableTags.map((tag) => [tag.name.toLowerCase(), tag]),
    );

    for (const candidate of selected) {
      for (const tag of this.getEffectiveTags(candidate) ?? []) {
        const lowerName = tag.name.toLowerCase();
        if (existingByLowerName.has(lowerName)) continue;

        const newTag: Tag = { name: tag.name, color: tag.color };
        availableTags.push(newTag);
        existingByLowerName.set(lowerName, newTag);
      }
    }
  }

  /**
   * Builds the completion Notice text for a starred-import run. When the run
   * only inserted brand-new articles (the common case, and the only case
   * prior to 234-05), the message is unchanged from before. When a re-import
   * matched and updated one or more already-imported articles, the message
   * calls that out separately rather than conflating updates with inserts.
   */
  private buildImportCompleteNotice(
    insertedCount: number,
    updatedCount: number,
  ): string {
    if (updatedCount === 0) {
      return insertedCount === 1
        ? "Imported 1 starred article."
        : `Imported ${insertedCount} starred articles.`;
    }

    if (insertedCount === 0) {
      return updatedCount === 1
        ? "Updated 1 already-imported starred article."
        : `Updated ${updatedCount} already-imported starred articles.`;
    }

    return `Imported ${insertedCount} starred article${insertedCount === 1 ? "" : "s"} and updated ${updatedCount} already-imported article${updatedCount === 1 ? "" : "s"}.`;
  }

  private async performImport(model: StarredImportPreviewModel): Promise<void> {
    const selected = model.getSelectedCandidates();
    if (selected.length === 0) {
      return;
    }

    // Tag-import toggle (234-11): off skips both the bulk label-to-tag
    // palette mutation and stripping any label-derived tag from the items
    // actually persisted below, via `getEffectiveTags`.
    if (this.tagImportEnabled) {
      this.ensureAvailableTagsForSelection(selected);
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
    let updatedCount = 0;
    for (const candidate of selected) {
      const feed = feedByUrl.get(candidate.feedUrl);
      if (!feed) continue;
      // When the tag-import toggle is off, the item actually persisted
      // carries no label-derived tags (234-11), even though the pure
      // mapper always assigned them to `candidate.item.tags` — any tag the
      // user added by hand via the per-article chip (234-12) still survives,
      // since `getEffectiveTags` only strips names in `labelDerivedTagNames`.
      const itemToApply: typeof candidate.item = this.tagImportEnabled
        ? candidate.item
        : { ...candidate.item, tags: this.getEffectiveTags(candidate) };
      // Re-import dedup (234-05): matches against the target feed's existing
      // items by guid-or-link identity. A match is merged (new labels added,
      // starred forced true, locally-edited fields left untouched) instead
      // of being inserted again.
      const result = applyStarredImportCandidateToFeed(feed, itemToApply);
      if (result === "inserted") {
        insertedCount += 1;
      } else {
        updatedCount += 1;
      }
    }

    const totalCount = insertedCount + updatedCount;
    if (totalCount === 0) {
      new Notice("No starred articles were imported.");
      this.close();
      return;
    }

    // Persist the new feed(s) and the historical starred item(s)
    // immediately. The starred/read state must not wait on the
    // new-feed metadata-refresh fetch triggered below.
    await this.plugin.saveSettings();
    this.onImportStarted?.();

    const view = await this.plugin.getActiveDashboardView();
    if (view) {
      view.render();
    }

    // Fire-and-forget: populate each newly created feed's metadata and
    // current items via a single background fetch, independent of the
    // starred-item insertion already persisted above. Gated behind the
    // Options panel's "New-feed metadata refresh" toggle (234-07) — the
    // feed itself was already created unconditionally regardless of this
    // toggle's state.
    if (this.newFeedMetadataRefreshEnabled) {
      for (const feedUrl of createdFeedUrls) {
        this.fetchNewlyCreatedFeed(feedUrl);
      }
    }

    new Notice(this.buildImportCompleteNotice(insertedCount, updatedCount));

    this.close();
  }

  /**
   * Triggers exactly one feed-fetch/refresh for a feed created during this
   * import, to populate its metadata (title/siteUrl/icon) and current
   * items. Only called when the Options panel's "New-feed metadata
   * refresh" toggle is on (234-07). Deliberately not awaited by
   * `performImport` — the historical starred item(s) for this feed were
   * already inserted and saved. Any fetch failure is non-fatal:
   * `FeedParser.refreshFeed` already catches and records `lastFetchError`
   * on the feed rather than throwing.
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
    this.itemTagsDropdownCleanup?.();
    this.itemTagsDropdownCleanup = null;
    this.itemTagsDropdownAnchor = null;
    this.contentEl.empty();
  }
}
