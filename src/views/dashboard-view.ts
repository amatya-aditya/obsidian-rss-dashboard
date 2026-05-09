import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  TFile,
  requireApiVersion,
  Platform,
  setIcon,
  type EventRef,
} from "obsidian";
import {
  Feed,
  FeedKeywordRulesSettings,
  FeedItem,
  HighlightWord,
  KeywordFilterRule,
  RssDashboardSettings,
  Folder,
} from "../types/types";
import type {
  FiltersUpdatedEventPayload,
  default as RssDashboardPlugin,
} from "../../main";
import { Sidebar } from "../components/sidebar";
import { ArticleList } from "../components/article-list";
import { ArticleSaver } from "../services/article-saver";
import { ArticleRenderer } from "../components/article-renderer";
import { ReaderView, RSS_READER_VIEW_TYPE } from "./reader-view";
import { FeedManagerModal } from "../modals/feed-manager-modal";
import { MobileNavigationModal } from "../modals/mobile-navigation-modal";
import { KeywordFilterService } from "../services/keyword-filter-service";
import { shouldUseMobileSidebarLayout } from "../utils/platform-utils";
import { formatDashboardMultiFiltersTitle } from "../utils/filter-title-format";
import { computePagination } from "../utils/pagination-utils";
import { applyAutomaticArticleTags } from "../utils/tag-utils";
import { resolveItemExternalUrl } from "../utils/item-url-utils";
import { buildArticleEmptyStateContext } from "../utils/filter-detection";

export const RSS_DASHBOARD_VIEW_TYPE = "rss-dashboard-view";

export class RssDashboardView extends ItemView {
  private static readonly CARD_LAYOUT_RELAYOUT_DELAY_MS = 90;
  private static readonly CARD_LAYOUT_SAVE_DELAY_MS = 120;
  private settings: RssDashboardSettings;
  private saver: ArticleSaver;
  public currentFolder: string | null = null;
  private currentFeed: Feed | null = null;
  private selectedTags: string[] = [];
  private selectedArticle: FeedItem | null = null;
  private tagsCollapsed = true;
  private collapsedFolders: string[] = [];
  private allArticlesPage = 1;
  private unreadArticlesPage = 1;
  private readArticlesPage = 1;
  private savedArticlesPage = 1;
  private starredArticlesPage = 1;
  private activeStatusFilters = new Set<string>();
  private activeTagFilters = new Set<string>();
  private filterLogic: "AND" | "OR" = "OR";
  public sidebar!: Sidebar;
  private articleList!: ArticleList;
  private sidebarContainer: HTMLElement | null = null;
  private verificationTimeout: number | null = null;
  private dashboardMultiFiltersDirty = false;
  private dashboardMultiFiltersSaveTimeout: number | null = null;
  private cardLayoutSaveTimeout: number | null = null;
  private cardLayoutRefreshTimeout: number | null = null;
  private headerTitleRefreshTimeout: number | null = null;
  private folderPages: Record<string, number> = {};
  private feedPages: Record<string, number> = {};
  private articleReaderLeafWhilePodcast: WorkspaceLeaf | null = null;
  private isResizing: boolean = false;
  private resizeHandle: HTMLElement | null = null;
  private layoutChangeRef: EventRef | null = null;
  private dashboardContainer: HTMLElement | null = null;
  private keywordFilterStats = {
    articlesRetrieved: 0,
    globalExcluded: 0,
    feedExcluded: 0,
    finalVisible: 0,
    bypassActive: false,
    filtersActive: false,
  };
  private dashboardMultiFilterCounts: {
    shown: number;
    filteredOut: number;
    total: number;
  } | null = null;
  private keywordFilterTooltip = "";
  private isFilterSubheaderCollapsed = false;
  private mobileSidebarModal: MobileNavigationModal | null = null;
  private lastViewportMobileSidebarMode: boolean | null = null;
  private inlineArticle: FeedItem | null = null;
  private articleRenderer: ArticleRenderer | null = null;

  // ── Highlight match stats ─────────────────────────────────────────────────
  // Populated by computeHighlightMatchCounts() on every render cycle (before
  // renderFilterSubheader() runs). Each entry holds one enabled highlight word
  // and the count of currently-displayed articles that contain it.
  // Reset to [] when highlights are disabled or no words are enabled.
  private highlightMatchCounts: Array<{ word: HighlightWord; count: number }> =
    [];

  // --- View lifecycle and initial setup ---
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: RssDashboardPlugin,
  ) {
    super(leaf);
    this.settings = this.plugin.settings;
    this.collapsedFolders = this.settings.collapsedFolders || [];

    // Restore dashboard multi-filter state (status/tag + AND/OR) from settings
    if (this.settings.dashboardMultiFilters) {
      this.activeStatusFilters = new Set(
        this.settings.dashboardMultiFilters.statusFilters || [],
      );
      this.activeTagFilters = new Set(
        this.settings.dashboardMultiFilters.tagFilters || [],
      );
      this.filterLogic =
        this.settings.dashboardMultiFilters.logic === "AND" ? "AND" : "OR";
    }
    this.saver = new ArticleSaver(
      this.app,
      this.settings.articleSaving,
      this.settings.corsProxyEnabled ? this.settings.corsProxyUrl : undefined,
    );

    // Always open the dashboard in All Feeds view. Any startup filtering is
    // applied via dashboard multi-filters instead of hard switching views.
    this.currentFolder = null;
  }

  getViewType(): string {
    return RSS_DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "RSS dashboard";
  }

  getIcon(): string {
    return "rss";
  }

  // --- Render pipeline ---
  onOpen(): Promise<void> {
    this.articleRenderer = new ArticleRenderer({
      app: this.app,
      settings: this.settings,
      onArticleSave: (item) => {
        item.saved = true;
        void this.render();
      },
      onArticleUpdate: (item, updates, shouldRerender) => {
        void this.updateArticleStatus(item, updates, shouldRerender);
      },
      onOpenSavedArticle: (file) => {
        void this.app.workspace.getLeaf().openFile(file);
      },
    });

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.handleFileDeleted(file);
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          this.handleFileRenamed(file, oldPath);
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", () => {
        if (this.verificationTimeout) {
          window.clearTimeout(this.verificationTimeout);
        }
        this.verificationTimeout = window.setTimeout(() => {
          void this.verifySavedArticles();
        }, 300000);
      }),
    );

    this.registerEvent(
      (
        this.app.workspace as unknown as {
          on: (
            name: string,
            callback: (payload: FiltersUpdatedEventPayload) => void,
          ) => unknown;
        }
      ).on(
        "rss-dashboard:filters-updated",
        (payload: FiltersUpdatedEventPayload) => {
          this.syncCurrentFeedReference();
          this.syncDashboardMultiFiltersFromSettings();
          this.render();
        },
      ) as never,
    );

    this.registerEvent(
      (
        this.app.workspace as unknown as {
          on: (name: string, callback: () => void) => unknown;
        }
      ).on("rss-dashboard:tags-mutated", () => {
        const availableTagNames = new Set(
          this.settings.availableTags.map((t) => t.name),
        );

        let changed = false;

        // 1. Sidebar selected tags
        const filteredSelectedTags = this.selectedTags.filter((tag) =>
          availableTagNames.has(tag),
        );
        if (filteredSelectedTags.length !== this.selectedTags.length) {
          this.selectedTags = filteredSelectedTags;
          changed = true;
        }

        // 2. Header multi-filter tags
        for (const tag of Array.from(this.activeTagFilters)) {
          if (!availableTagNames.has(tag)) {
            this.activeTagFilters.delete(tag);
            changed = true;
          }
        }

        if (changed) {
          void this.render();
        } else if (this.sidebar) {
          this.sidebar.render();
        }
      }) as never,
    );

    this.lastViewportMobileSidebarMode = this.shouldUseMobileSidebarMode(
      window.innerWidth,
    );
    this.registerDomEvent(window, "resize", () => {
      this.handleViewportResizeModeTransition();
    });

    const container = this.containerEl.children[1];
    container.addClass("rss-dashboard-container");
    let dashboardContainer = container.querySelector(
      ".rss-dashboard-layout",
    ) as HTMLElement;
    if (!dashboardContainer) {
      dashboardContainer = container.createDiv({
        cls: "rss-dashboard-layout",
      });
    }

    if (!this.sidebarContainer) {
      this.sidebarContainer = dashboardContainer.createDiv({
        cls: "rss-dashboard-sidebar-container",
      });
    } else if (this.sidebarContainer.parentElement !== dashboardContainer) {
      dashboardContainer.appendChild(this.sidebarContainer);
    }

    if (!this.sidebar) {
      this.sidebar = new Sidebar(
        this.app,
        this.sidebarContainer,
        this.plugin,
        this.settings,
        {
          currentFolder: this.currentFolder,
          currentFeed: this.currentFeed,
          selectedTags: this.selectedTags,
          tagsCollapsed: this.tagsCollapsed,
          collapsedFolders: this.collapsedFolders,
        },
        {
          onFolderClick: this.handleFolderClick.bind(this),
          onFeedClick: this.handleFeedClick.bind(this),
          onTagToggle: this.handleTagToggle.bind(this),
          onClearTags: this.handleClearTags.bind(this),
          onTagFilterModeChange: this.handleTagFilterModeChange.bind(this),
          onToggleTagsCollapse: this.handleToggleTagsCollapse.bind(this),
          onToggleFolderCollapse: this.handleToggleFolderCollapse.bind(this),
          onBatchToggleFolders: this.handleBatchToggleFolders.bind(this),
          onAddFolder: this.handleAddFolder.bind(this),
          onAddSubfolder: this.handleAddSubfolder.bind(this),
          onAddFeed: this.handleAddFeed.bind(this),
          onEditFeed: this.handleEditFeed.bind(this),
          onDeleteFeed: this.handleDeleteFeed.bind(this),
          onDeleteFolder: this.handleDeleteFolder.bind(this),
          onRefreshFeeds: this.handleRefreshFeeds.bind(this),
          onUpdateFeed: this.handleUpdateFeed.bind(this),
          onImportOpml: this.handleImportOpml.bind(this),
          onExportOpml: this.handleExportOpml.bind(this),
          onToggleSidebar: this.handleToggleSidebar.bind(this),
          onManageFeeds: () => {
            const modal = new FeedManagerModal(this.app, this.plugin);
            modal.open();
          },
        },
      );
    }

    // Keep a stable reference to the dashboard root for later renders.
    this.dashboardContainer = dashboardContainer;

    this.render();

    return Promise.resolve();
  }

  render(): void {
    this.syncCurrentFeedReference();
    this.syncDashboardMultiFiltersFromSettings();
    this.verifySavedArticles();

    if (!this.shouldUseMobileSidebarMode(window.innerWidth)) {
      this.closeMobileSidebarModal();
    }

    if (this.articleList) {
      this.articleList.destroy();
    }
    this.clearCardLayoutRefreshTimeout();

    if (this.settings.sidebarCollapsed) {
      this.containerEl.addClass("sidebar-collapsed");
    } else {
      this.containerEl.removeClass("sidebar-collapsed");
    }

    // Reapply persisted sidebar width before painting the list.
    this.applySidebarWidth();

    if (this.sidebar) {
      this.sidebar.clearFolderPathCache();
      this.sidebar["options"] = {
        currentFolder: this.currentFolder,
        currentFeed: this.currentFeed,
        selectedTags: this.selectedTags,
        tagsCollapsed: this.tagsCollapsed,
        collapsedFolders: this.collapsedFolders,
      };
      this.sidebar["settings"] = this.settings;
      this.sidebar.render();
    }

    const container = this.containerEl.children[1];
    let dashboardContainer = container.querySelector(
      ".rss-dashboard-layout",
    ) as HTMLElement;
    if (!dashboardContainer) {
      dashboardContainer = container.createDiv({
        cls: "rss-dashboard-layout",
      });
    }
    let contentContainer = dashboardContainer.querySelector(
      ".rss-dashboard-content",
    ) as HTMLElement;
    if (!contentContainer) {
      contentContainer = dashboardContainer.createDiv({
        cls: "rss-dashboard-content",
      });
    } else {
      contentContainer.empty();
    }

    const scopedArticles = this.getUnfilteredArticles();
    const articlesIgnoringAge = scopedArticles.filter((item) =>
      this.matchesFilters(item, { ignoreAgeFilter: true }),
    );
    const allFilteredArticles = this.getFilteredArticles();
    // Must run after getFilteredArticles() so counts reflect the active view,
    // and before renderFilterSubheader() which reads this.highlightMatchCounts.
    this.computeHighlightMatchCounts(allFilteredArticles);

    if (this.inlineArticle) {
      this.renderInlineArticle(contentContainer);
      return;
    }

    this.renderToolbar(contentContainer);
    this.renderFilterSubheader(contentContainer);

    const articlesContainer = contentContainer.createDiv({
      cls: "rss-dashboard-articles",
    });
    const pageSize = this.getCurrentPageSize();
    const totalArticles = allFilteredArticles.length;
    let currentPage = this.getCurrentPage();
    const pagination = computePagination({
      totalItems: totalArticles,
      pageSize,
      requestedPage: currentPage,
    });
    if (pagination.currentPage !== currentPage) {
      this.setCurrentPageState(pagination.currentPage);
      currentPage = pagination.currentPage;
    }
    const articlesForPage = allFilteredArticles.slice(
      pagination.startIdx,
      pagination.endIdx,
    );

    const titleInfo = this.getArticlesTitleInfo();
    this.articleList = new ArticleList(
      articlesContainer,
      this.settings,
      titleInfo.title,
      titleInfo.tooltip,
      articlesForPage,
      this.selectedArticle,
      {
        onArticleClick: (article) => {
          void this.handleArticleClick(article);
        },
        onToggleViewStyle: this.handleToggleViewStyle.bind(this),
        onRefreshFeeds: this.handleRefreshFeeds.bind(this),
        onSearch: (q: string) => {
          // State is handled by ArticleList locally, but we could sync it here if needed
        },
        onOpenViewFilters: () => {
          this.openViewingFiltersMenu();
        },
        onOpenPerFeedSettings: () => {
          if (this.currentFeed) {
            this.showEditFeedModal(this.currentFeed, {
              expandSection: "per-feed",
              highlightSection: "per-feed",
            });
          }
        },
        onArticleUpdate: (article, updates, shouldRerender) => {
          void this.handleArticleUpdate(article, updates, shouldRerender);
        },
        onArticleSave: (article) => {
          void this.handleArticleSave(article);
        },
        onOpenSavedArticle: (article) => {
          void this.handleOpenSavedArticle(article);
        },
        onOpenInReaderView: (article) => {
          void this.handleOpenInReaderView(article);
        },
        onToggleSidebar: this.handleToggleSidebar.bind(this),
        onSortChange: this.handleSortChange.bind(this),
        onGroupChange: this.handleGroupChange.bind(this),
        onFilterChange: (value: {
          type: string;
          value: unknown;
          checked?: boolean;
          isTag?: boolean;
        }) => {
          void this.handleFilterChange(value);
        },
        onPageChange: this.handlePageChange.bind(this),
        onPageSizeChange: this.handlePageSizeChange.bind(this),
        onMarkPageAsRead: () => {
          this.markCurrentPageAsRead();
        },
        onOpenTagsSettings: () => {
          void this.plugin.openTagsSettings();
        },
        onTagsMutated: () => {
          void this.plugin.refreshOpenTagColorViews();
          this.app.workspace.trigger("rss-dashboard:tags-mutated");
        },
        onPersistSettings: async () => {
          await this.plugin.saveSettings();
        },
        onMarkAllAsRead: () => {
          const articles = this.getFilteredArticles();
          let count = 0;
          articles.forEach((item) => {
            if (!item.read) {
              item.read = true;
              count++;
            }
          });

          if (count > 0) {
            void this.plugin.saveSettings();
            void this.render();
            new Notice(`Marked ${count} items as read`);
          } else {
            new Notice("No unread items in current view");
          }
        },
        onMarkAllAsUnread: () => {
          const articles = this.getFilteredArticles();
          let count = 0;
          articles.forEach((item) => {
            if (item.read) {
              item.read = false;
              count++;
            }
          });

          if (count > 0) {
            void this.plugin.saveSettings();
            void this.render();
            new Notice(`Marked ${count} items as unread`);
          } else {
            new Notice("No read items in current view");
          }
        },
      },
      currentPage,
      pagination.totalPages,
      pageSize,
      totalArticles,
      new Set(this.activeStatusFilters),
      new Set(this.activeTagFilters),
      this.filterLogic,
      this.currentFeed?.url,
      this.currentFeed === null,
    );

    this.articleList.setEmptyStateContext(
      buildArticleEmptyStateContext({
        visibleCount: allFilteredArticles.length,
        scopedCount: scopedArticles.length,
        availableBeforeAgeFilterCount: articlesIgnoringAge.length,
        viewFilterReasonLabel: this.getViewFilterReasonLabel(),
        articleFilter: this.settings.articleFilter,
        refreshDiagnostics: this.currentFeed?.lastRefreshDiagnostics,
      }),
    );

    this.articleList.render();

    this.updateRefreshButtonText();

    // Recreate the resize handle after sidebar.render() clears the container.
    this.setupSidebarResize();
  }

  private renderToolbar(container: HTMLElement): void {
    container.createDiv({ cls: "rss-dashboard-toolbar" });
  }

  // --- Status bar / dashboard filter summary ---
  /**
   * FILTER STATUS BAR
   * ─────────────────
   * Renders a collapsible info strip directly below the toolbar. It contains
   * up to three rows:
   *
   *   Row 1 – Keyword rules stats:
   *     "Articles retrieved: N | Excluded by global keyword rules: X | Excluded by per-feed keyword rules: Y"
   *     or "Keyword rules bypassed - showing all N articles" when bypass mode is on.
   *     Only rendered when keyword rules are active or bypassed.
   *     (Data written by applyKeywordFiltersWithStats() → this.keywordFilterStats)
   *
   *   Row 2 – Highlight match stats:
   *     "Highlights: ● word1 (N) | ● word2 (N) …"
   *     One chip per enabled highlight word, showing how many of the currently-
   *     displayed articles contain that word/phrase. Counts are per-article
   *     (an article counted once even if the word appears multiple times).
   *     (Data written by computeHighlightMatchCounts() → this.highlightMatchCounts)
   *
   *   Row 3 – Viewing filters:
   *     "Viewing filters: Showing N | Filtered out N | Total N" when dashboard
   *     multi-filters are active, or
   *     "No filters applied - Showing N | Filtered out 0 | Total N" when the
   *     status/tag filter panel is enabled but no filters are selected.
   *     (Data written by computeDashboardMultiFilterCounts() →
   *     this.dashboardMultiFilterCounts)
   *
   * Visibility: hidden entirely when settings.display.showFilterStatusBar is
   * false, or when no keyword/highlight/viewing-filter stats are available.
   *
   * Collapse state persisted in this.isFilterSubheaderCollapsed across renders.
   */
  private renderFilterSubheader(container: HTMLElement): void {
    if (this.settings.display.showFilterStatusBar === false) {
      return;
    }

    const { keywordFilterStats } = this;
    const hasKeywordStats =
      keywordFilterStats.bypassActive || keywordFilterStats.filtersActive;
    const hasDashboardMultiFilterStats =
      this.dashboardMultiFilterCounts !== null;
    const hasHighlightStats = this.highlightMatchCounts.length > 0;

    // Only render when there is at least one row worth of content.
    if (
      !hasKeywordStats &&
      !hasDashboardMultiFilterStats &&
      !hasHighlightStats
    ) {
      return;
    }

    const subheader = container.createDiv({
      cls: "rss-dashboard-filter-subheader",
    });
    // subheaderContent animates between open/collapsed via CSS max-height transition.
    const subheaderContent = subheader.createDiv({
      cls: "rss-dashboard-filter-subheader-content",
    });
    if (this.keywordFilterTooltip) {
      subheaderContent.setAttribute("title", this.keywordFilterTooltip);
    }

    // ── Row 1: Keyword rules stats ──────────────────────────────────────────
    if (hasKeywordStats) {
      const filterStatsRow = subheaderContent.createDiv({
        cls: "rss-dashboard-filter-stats-row",
      });

      // Edit button for keyword rules settings
      const filterEditBtn = filterStatsRow.createEl("button", {
        cls: "rss-dashboard-filter-edit-btn clickable-icon",
        attr: {
          type: "button",
          title: "Edit keyword rules",
          "aria-label": "Edit keyword rules",
        },
      });
      setIcon(filterEditBtn, "cog");
      filterEditBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.plugin.openSettingsToTab("Rules");
      });

      // Keyword rules stats text
      const statusText = keywordFilterStats.bypassActive
        ? `Keyword rules bypassed - showing all ${keywordFilterStats.articlesRetrieved} articles`
        : `Articles retrieved: ${keywordFilterStats.articlesRetrieved} | Excluded by global keyword rules: ${keywordFilterStats.globalExcluded} | Excluded by per-feed keyword rules: ${keywordFilterStats.feedExcluded}`;
      filterStatsRow.createSpan({
        cls: "rss-dashboard-filter-stats-text",
        text: statusText,
      });
    }

    // ── Row 2: Highlight match stats ─────────────────────────────────────────
    // Renders "Highlights: ● word (N) | ● word (N)" chips.
    // Each dot's background uses the word's individual --highlight-color,
    // matching the <mark> tags applied to article text.
    if (hasHighlightStats) {
      const highlightRow = subheaderContent.createDiv({
        cls: "rss-dashboard-highlight-stats",
      });

      // Edit button for highlights settings
      const highlightEditBtn = highlightRow.createEl("button", {
        cls: "rss-dashboard-highlight-edit-btn clickable-icon",
        attr: {
          type: "button",
          title: "Edit highlights",
          "aria-label": "Edit highlights",
        },
      });
      setIcon(highlightEditBtn, "pencil");
      highlightEditBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.plugin.openSettingsToTab("Highlights");
      });

      highlightRow.createSpan({
        cls: "rss-highlight-stats-label",
        text: "Highlights:",
      });

      this.highlightMatchCounts.forEach((entry, i) => {
        if (i > 0) {
          highlightRow.createSpan({
            cls: "rss-highlight-stats-sep",
            text: "|",
          });
        }
        const chip = highlightRow.createSpan({
          cls: "rss-highlight-stat-item",
        });
        // Colored dot — reuses the same CSS variable as the <mark> highlight tags
        const dot = chip.createSpan({ cls: "rss-highlight-dot" });
        dot.style.setProperty(
          "--highlight-color",
          entry.word.color || this.settings.highlights.defaultColor,
        );
        chip.appendText(`${entry.word.text} (${entry.count})`);
      });
    }

    // ── Row 3: Viewing filters / collapse toggle ──────────────────────────────
    if (hasDashboardMultiFilterStats && this.dashboardMultiFilterCounts) {
      const hasActiveDashboardMultiFilters =
        this.activeStatusFilters.size > 0 || this.activeTagFilters.size > 0;
      const { shown, filteredOut, total } = this.dashboardMultiFilterCounts;
      const viewingFilterRow = subheaderContent.createDiv({
        cls: "rss-dashboard-filter-stats-row rss-dashboard-viewing-filter-stats-row",
      });

      const viewFiltersBtn = viewingFilterRow.createDiv({
        cls: "rss-dashboard-viewing-filter-open-btn clickable-icon",
        attr: {
          role: "button",
          tabindex: "0",
          title: "Open viewing filters",
          "aria-label": "Open viewing filters",
        },
      });
      setIcon(viewFiltersBtn, "filter");

      const openFiltersMenu = (e?: Event) => {
        e?.stopPropagation();
        this.openViewingFiltersMenu();
      };

      viewFiltersBtn.addEventListener("click", openFiltersMenu);
      viewFiltersBtn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFiltersMenu(e);
        }
      });

      viewingFilterRow.createSpan({
        cls: "rss-dashboard-viewing-filter-stats-text",
        text: hasActiveDashboardMultiFilters
          ? `Viewing filters: Showing ${shown} | Filtered out ${filteredOut} | Total ${total}`
          : `No filters applied - Showing ${shown} | Filtered out ${filteredOut} | Total ${total}`,
      });
    }

    const toggleButton = subheader.createEl("button", {
      cls: "rss-dashboard-filter-subheader-toggle",
      attr: { type: "button" },
    });

    const applyCollapsedState = () => {
      subheader.classList.toggle(
        "is-collapsed",
        this.isFilterSubheaderCollapsed,
      );
      toggleButton.setAttribute(
        "aria-label",
        this.isFilterSubheaderCollapsed
          ? "Expand filter status"
          : "Collapse filter status",
      );
      toggleButton.setAttribute(
        "aria-expanded",
        (!this.isFilterSubheaderCollapsed).toString(),
      );
      toggleButton.setText(this.isFilterSubheaderCollapsed ? "▾" : "▴");
    };

    toggleButton.addEventListener("click", () => {
      this.isFilterSubheaderCollapsed = !this.isFilterSubheaderCollapsed;
      applyCollapsedState();
    });

    applyCollapsedState();
  }

  // --- Highlight match counting ---
  /**
   * HIGHLIGHT MATCH COUNTING
   * ─────────────────────────
   * For each enabled highlight word, counts how many articles in the
   * currently-displayed set contain at least one match. Counts are
   * per-article (an article is counted once regardless of how many times
   * the word appears inside it).
   *
   * Called once per render cycle, after getFilteredArticles() returns and
   * before renderFilterSubheader() reads this.highlightMatchCounts.
   *
   * Field selection mirrors HighlightService behaviour:
   *   settings.highlights.highlightInTitles    → article.title
   *   settings.highlights.highlightInSummaries → article.description + article.summary
   *   settings.highlights.highlightInContent   → article.content
   *
   * Regex building mirrors HighlightService behaviour per-word: escapes each
   * word text, applies optional whole-word boundaries, and respects each
   * word's caseSensitive flag.
   */
  private computeHighlightMatchCounts(articles: FeedItem[]): void {
    // Always reset so stale data from a previous render does not linger.
    this.highlightMatchCounts = [];

    const hs = this.settings.highlights;
    if (!hs?.enabled || !hs.words?.length) return;

    const enabledWords = hs.words.filter((w) => w.enabled);
    if (enabledWords.length === 0) return;

    for (const word of enabledWords) {
      // Escape special regex characters (same as HighlightService.escapeRegex)
      const escaped = word.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Optional whole-word boundaries (same logic as HighlightService.buildPattern)
      const pattern = word.wholeWord
        ? `(?:^|\\W)(${escaped})(?:$|\\W)`
        : escaped;
      // Per-word case sensitivity: add "i" only for case-insensitive words.
      const regexFlags = word.caseSensitive ? "" : "i";
      const regex = new RegExp(pattern, regexFlags);

      let count = 0;
      for (const article of articles) {
        // Collect the text fields governed by the highlight scope settings
        const fields: string[] = [];
        if (hs.highlightInTitles !== false) fields.push(article.title ?? "");
        if (hs.highlightInSummaries !== false) {
          fields.push(article.description ?? "");
          fields.push(article.summary ?? "");
        }
        if (hs.highlightInContent !== false) fields.push(article.content ?? "");

        // Fallback: always test the title when no scopes are enabled
        if (fields.length === 0) fields.push(article.title ?? "");

        if (fields.some((f) => regex.test(f))) count++;
      }

      this.highlightMatchCounts.push({ word, count });
    }
  }

  // --- Title and article-scope helpers ---
  private getArticlesTitle(): string {
    if (this.currentFeed) {
      return this.currentFeed.title;
    } else if (this.currentFolder === "starred") {
      return "Starred items";
    } else if (this.currentFolder === "unread") {
      return "Unread items";
    } else if (this.currentFolder === "read") {
      return "Read items";
    } else if (this.currentFolder === "saved") {
      return "Saved items";
    } else if (this.currentFolder === "videos") {
      return "Videos";
    } else if (this.currentFolder === "podcasts") {
      return "Podcasts";
    } else if (this.selectedTags.length > 0) {
      const mode = (this.settings.sidebarTagFilterMode || "or").toUpperCase();
      return `Tags (${mode}): ${this.selectedTags.join(", ")}`;
    } else if (this.currentFolder) {
      return this.currentFolder;
    } else {
      return "All articles";
    }
  }

  private getArticlesTitleInfo(): { title: string; tooltip: string | null } {
    const baseTitle = this.getArticlesTitle();

    // Check if there are any active filters
    const hasActiveFilters =
      this.activeStatusFilters.size > 0 || this.activeTagFilters.size > 0;

    // If no active filters, return basic title
    if (!hasActiveFilters) {
      return { title: baseTitle, tooltip: null };
    }

    // For individual feed pages, include feed name in the base title
    let effectiveBaseTitle = baseTitle;
    if (this.currentFeed !== null) {
      // When viewing a single feed, use "Latest from [Feed Name]" as the base
      effectiveBaseTitle = `Latest from ${this.currentFeed.title}`;
    }

    // Format the filter text (works for both All Feeds and individual feeds)
    return formatDashboardMultiFiltersTitle({
      baseTitle: effectiveBaseTitle,
      statusFilters: this.activeStatusFilters,
      tagFilters: this.activeTagFilters,
      logic: this.filterLogic,
    });
  }

  private getFilteredArticles(): FeedItem[] {
    this.syncCurrentFeedReference();
    let articles: FeedItem[] = [];

    if (this.currentFeed) {
      // Don't slice before filtering/sorting. Refresh merge + retention sorts newest-first,
      // but slicing early can still hide newly fetched items when ordering changes.
      articles = [...this.currentFeed.items];
    } else if (this.selectedTags.length > 0) {
      const mode = this.settings.sidebarTagFilterMode || "or";
      for (const feed of this.settings.feeds) {
        articles = articles.concat(
          feed.items
            .filter((item) => {
              const itemTags = (item.tags ?? []).map((t) => t.name);
              if (mode === "or") {
                return this.selectedTags.some((tag) => itemTags.includes(tag));
              } else if (mode === "and") {
                return this.selectedTags.every((tag) => itemTags.includes(tag));
              } else if (mode === "not") {
                return !this.selectedTags.some((tag) => itemTags.includes(tag));
              }
              return false;
            })
            .map((item) => ({
              ...item,
              feedTitle: feed.title,
              feedUrl: feed.url,
            })),
        );
      }
    } else if (this.currentFolder) {
      const specialFolders = [
        "read",
        "unread",
        "starred",
        "saved",
        "videos",
        "podcasts",
      ];
      if (specialFolders.includes(this.currentFolder)) {
        // Legacy support or fallback
        for (const feed of this.settings.feeds) {
          articles = articles.concat(
            feed.items
              .filter((item) => {
                if (this.currentFolder === "starred") return item.starred;
                if (this.currentFolder === "unread") return !item.read;
                if (this.currentFolder === "read") return item.read;
                if (this.currentFolder === "saved") return item.saved;
                if (this.currentFolder === "videos")
                  return item.mediaType === "video";
                if (this.currentFolder === "podcasts")
                  return item.mediaType === "podcast";
                return true;
              })
              .map((item) => ({
                ...item,
                feedTitle: feed.title,
                feedUrl: feed.url,
              })),
          );
        }
      } else {
        const allFolders = this.getAllDescendantFolders(this.currentFolder);
        for (const feed of this.settings.feeds) {
          if (feed.folder && allFolders.includes(feed.folder)) {
            articles = articles.concat(
              feed.items.map((item) => ({
                ...item,
                feedTitle: feed.title,
                feedUrl: feed.url,
              })),
            );
          }
        }
      }
    } else {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(
          feed.items.map((item) => ({
            ...item,
            feedTitle: feed.title,
            feedUrl: feed.url,
          })),
        );
      }
    }

    // Apply keyword rules (global/per-feed) before status/tag/age filters.
    articles = this.applyKeywordFiltersWithStats(articles);

    // Capture dashboard multi-filter counts using the post-keyword-filter pool.
    this.computeDashboardMultiFilterCounts(articles);

    // Apply filters (multi-filters, special folders, age, etc.)
    articles = articles.filter((item) => this.matchesFilters(item));

    if (this.settings.articleSort === "oldest") {
      articles.sort(
        (a, b) => new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime(),
      );
    } else {
      articles.sort(
        (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
      );
    }

    return articles;
  }

  /**
   * Get all articles in the current view BEFORE filter matching is applied.
   * Used for empty state detection to determine if articles exist but are filtered out.
   */
  private getUnfilteredArticles(): FeedItem[] {
    this.syncCurrentFeedReference();
    let articles: FeedItem[] = [];

    if (this.currentFeed) {
      articles = [...this.currentFeed.items];
    } else if (this.selectedTags.length > 0) {
      const mode = this.settings.sidebarTagFilterMode || "or";
      for (const feed of this.settings.feeds) {
        articles = articles.concat(
          feed.items
            .filter((item) => {
              const itemTags = (item.tags ?? []).map((t) => t.name);
              if (mode === "or") {
                return this.selectedTags.some((tag) => itemTags.includes(tag));
              } else if (mode === "and") {
                return this.selectedTags.every((tag) => itemTags.includes(tag));
              } else if (mode === "not") {
                return !this.selectedTags.some((tag) => itemTags.includes(tag));
              }
              return false;
            })
            .map((item) => ({
              ...item,
              feedTitle: feed.title,
              feedUrl: feed.url,
            })),
        );
      }
    } else if (this.currentFolder) {
      const specialFolders = [
        "read",
        "unread",
        "starred",
        "saved",
        "videos",
        "podcasts",
      ];
      if (specialFolders.includes(this.currentFolder)) {
        // Special folders are view filters, not scope reducers, for empty-state
        // detection. Keep the full article pool here so the empty state can
        // explain that items exist but none match the active view filter.
        for (const feed of this.settings.feeds) {
          articles = articles.concat(
            feed.items.map((item) => ({
              ...item,
              feedTitle: feed.title,
              feedUrl: feed.url,
            })),
          );
        }
      } else {
        const allFolders = this.getAllDescendantFolders(this.currentFolder);
        for (const feed of this.settings.feeds) {
          if (feed.folder && allFolders.includes(feed.folder)) {
            articles = articles.concat(
              feed.items.map((item) => ({
                ...item,
                feedTitle: feed.title,
                feedUrl: feed.url,
              })),
            );
          }
        }
      }
    } else {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(
          feed.items.map((item) => ({
            ...item,
            feedTitle: feed.title,
            feedUrl: feed.url,
          })),
        );
      }
    }

    // Apply keyword rules but not filter matching
    articles = this.applyKeywordFiltersWithStats(articles);

    return articles;
  }

  private setCurrentPageState(page: number): void {
    if (this.currentFeed && this.currentFeed.url) {
      this.feedPages[this.currentFeed.url] = page;
    } else if (
      this.currentFolder &&
      !["unread", "read", "saved", "starred", "videos", "podcasts"].includes(
        this.currentFolder,
      )
    ) {
      this.folderPages[this.currentFolder] = page;
    } else if (
      this.currentFolder === null &&
      this.currentFeed === null &&
      this.selectedTags.length === 0
    ) {
      this.allArticlesPage = page;
    } else if (this.currentFolder === "unread") {
      this.unreadArticlesPage = page;
    } else if (this.currentFolder === "read") {
      this.readArticlesPage = page;
    } else if (this.currentFolder === "saved") {
      this.savedArticlesPage = page;
    } else if (this.currentFolder === "starred") {
      this.starredArticlesPage = page;
    } else {
      this.allArticlesPage = page;
    }
  }

  private syncCurrentFeedReference(): void {
    if (!this.currentFeed) {
      return;
    }

    const feedByUrl = this.settings.feeds.find(
      (feed) => feed.url === this.currentFeed?.url,
    );
    if (feedByUrl) {
      this.currentFeed = feedByUrl;
      return;
    }

    const fallbackFeed = this.settings.feeds.find(
      (feed) =>
        feed.title === this.currentFeed?.title &&
        feed.folder === this.currentFeed?.folder,
    );
    if (fallbackFeed) {
      this.currentFeed = fallbackFeed;
    }
  }

  private syncDashboardMultiFiltersFromSettings(): void {
    const mf = this.settings.dashboardMultiFilters;
    if (!mf) {
      return;
    }

    this.activeStatusFilters = new Set(mf.statusFilters || []);
    this.activeTagFilters = new Set(mf.tagFilters || []);
    this.filterLogic = mf.logic === "AND" ? "AND" : "OR";
  }

  // --- Keyword filtering and filter matching ---
  private applyKeywordFiltersWithStats(articles: FeedItem[]): FeedItem[] {
    const globalRules = this.settings.keywordRules || {
      includeLogic: "AND" as const,
      bypassAll: false,
      rules: [],
    };

    const hasGlobalRules = KeywordFilterService.hasActiveRules(
      globalRules.rules,
    );
    const hasFeedRules = this.hasActiveFeedRulesInScope(articles);
    const filtersActive = hasGlobalRules || hasFeedRules;
    const activeGlobalRules = KeywordFilterService.getActiveRules(
      globalRules.rules,
    );
    const activeFeedRules = this.getActiveFeedRulesForScope(articles);
    this.keywordFilterTooltip = this.buildKeywordFilterTooltip(
      globalRules.includeLogic,
      activeGlobalRules,
      activeFeedRules,
      globalRules.bypassAll,
    );

    if (globalRules.bypassAll) {
      this.keywordFilterStats = {
        articlesRetrieved: articles.length,
        globalExcluded: 0,
        feedExcluded: 0,
        finalVisible: articles.length,
        bypassActive: true,
        filtersActive,
      };
      return articles;
    }

    let globalExcluded = 0;
    let feedExcluded = 0;
    const filtered: FeedItem[] = [];

    for (const article of articles) {
      const feed = this.findFeedForArticle(article);
      const decision = KeywordFilterService.evaluateForArticle(
        article,
        feed,
        globalRules,
      );
      if (decision.included) {
        filtered.push(article);
      } else if (decision.excludedBy === "global") {
        globalExcluded++;
      } else if (decision.excludedBy === "feed") {
        feedExcluded++;
      }
    }

    this.keywordFilterStats = {
      articlesRetrieved: articles.length,
      globalExcluded,
      feedExcluded,
      finalVisible: filtered.length,
      bypassActive: false,
      filtersActive,
    };

    return filtered;
  }

  private hasActiveFeedRulesInScope(articles: FeedItem[]): boolean {
    const seenFeeds = new Set<string>();
    for (const article of articles) {
      const feed = this.findFeedForArticle(article);
      if (!feed || !feed.url || seenFeeds.has(feed.url)) {
        continue;
      }
      seenFeeds.add(feed.url);
      if (KeywordFilterService.hasActiveRules(feed.keywordRules?.rules || [])) {
        return true;
      }
    }
    return false;
  }

  private getActiveFeedRulesForScope(articles: FeedItem[]): Array<{
    feedTitle: string;
    includeLogic: "AND" | "OR";
    rules: KeywordFilterRule[];
  }> {
    const seenFeeds = new Set<string>();
    const result: Array<{
      feedTitle: string;
      includeLogic: "AND" | "OR";
      rules: KeywordFilterRule[];
    }> = [];

    for (const article of articles) {
      const feed = this.findFeedForArticle(article);
      if (!feed || !feed.url || seenFeeds.has(feed.url)) {
        continue;
      }
      seenFeeds.add(feed.url);

      const rules = KeywordFilterService.getActiveRules(
        feed.keywordRules?.rules || [],
      );
      if (rules.length === 0) {
        continue;
      }

      result.push({
        feedTitle: feed.title || "Untitled feed",
        includeLogic: feed.keywordRules?.includeLogic || "AND",
        rules,
      });
    }

    return result;
  }

  private buildKeywordFilterTooltip(
    globalIncludeLogic: "AND" | "OR",
    globalRules: KeywordFilterRule[],
    feedRules: Array<{
      feedTitle: string;
      includeLogic: "AND" | "OR";
      rules: KeywordFilterRule[];
    }>,
    bypassAll: boolean,
  ): string {
    if (globalRules.length === 0 && feedRules.length === 0) {
      return "";
    }

    const lines: string[] = [];

    if (bypassAll) {
      lines.push("Bypass keyword rules is enabled.");
      lines.push("");
    }

    if (globalRules.length > 0) {
      lines.push(`Global rules (include logic: ${globalIncludeLogic}):`);
      globalRules.forEach((rule) => {
        lines.push(`- ${this.formatRuleForTooltip(rule)}`);
      });
      lines.push("");
    }

    if (feedRules.length > 0) {
      lines.push("Feed rules:");
      feedRules.forEach((entry) => {
        lines.push(
          `- ${entry.feedTitle} (include logic: ${entry.includeLogic})`,
        );
        entry.rules.forEach((rule) => {
          lines.push(`  - ${this.formatRuleForTooltip(rule)}`);
        });
      });
    }

    return lines.join("\n").trim();
  }

  private formatRuleForTooltip(rule: KeywordFilterRule): string {
    return `${rule.type.toUpperCase()} "${rule.keyword.trim()}" (${rule.matchMode}) [${this.formatRuleLocations(rule)}]`;
  }

  private formatRuleLocations(rule: KeywordFilterRule): string {
    const parts: string[] = [];
    if (rule.applyToTitle) {
      parts.push("title");
    }
    if (rule.applyToSummary) {
      parts.push("summary");
    }
    if (rule.applyToContent) {
      parts.push("content");
    }
    return parts.join(", ");
  }

  private findFeedForArticle(article: FeedItem): Feed | undefined {
    if (article.feedUrl) {
      return this.settings.feeds.find((feed) => feed.url === article.feedUrl);
    }

    if (this.currentFeed) {
      return this.currentFeed;
    }

    return this.settings.feeds.find((feed) =>
      feed.items.some((item) => item.guid === article.guid),
    );
  }

  private findFolderByPath(path: string): Folder | null {
    const parts = path.split("/");
    let current: Folder | undefined = this.settings.folders.find(
      (f) => f.name === parts[0],
    );
    for (let i = 1; i < parts.length && current; i++) {
      current = (current.subfolders || []).find((f) => f.name === parts[i]);
    }
    return current || null;
  }

  private getAllDescendantFolders(folderPath: string): string[] {
    const result: string[] = [folderPath];
    const folder = this.findFolderByPath(folderPath);

    function collect(f: Folder, base: string) {
      if (f.subfolders) {
        for (const sub of f.subfolders) {
          const subPath = base + "/" + sub.name;
          result.push(subPath);
          collect(sub, subPath);
        }
      }
    }

    if (folder) {
      collect(folder, folderPath);
    }

    return result;
  }

  // --- Sidebar navigation and selection ---
  private handleFolderClick(folder: string | null): void {
    this.inlineArticle = null;
    let scrollPosition = 0;
    if (this.sidebarContainer) {
      const foldersSection = this.sidebarContainer.querySelector(
        ".rss-dashboard-feed-folders-section",
      );
      if (foldersSection)
        scrollPosition = (foldersSection as HTMLElement).scrollTop;
    }

    this.currentFeed = null;
    this.selectedTags = [];

    if (this.currentFolder !== folder) {
      if (folder === "unread") {
        this.unreadArticlesPage = 1;
      } else if (folder === "read") {
        this.readArticlesPage = 1;
      } else if (folder === "saved") {
        this.savedArticlesPage = 1;
      } else if (folder === "starred") {
        this.starredArticlesPage = 1;
      } else if (folder === null) {
        this.allArticlesPage = 1;
      } else if (folder) {
        this.folderPages[folder] = 1;
      }
    }

    this.currentFolder = folder;

    if (this.sidebarContainer) {
      const foldersSection = this.sidebarContainer.querySelector(
        ".rss-dashboard-feed-folders-section",
      );
      if (foldersSection)
        (foldersSection as HTMLElement).scrollTop = scrollPosition;
    }

    void this.render();
  }

  private handleFeedClick(feed: Feed): void {
    this.inlineArticle = null;
    let scrollPosition = 0;
    if (this.sidebarContainer) {
      const foldersSection = this.sidebarContainer.querySelector(
        ".rss-dashboard-feed-folders-section",
      );
      if (foldersSection)
        scrollPosition = (foldersSection as HTMLElement).scrollTop;
    }
    this.currentFeed = feed;
    this.currentFolder = null;
    this.selectedTags = [];
    this.selectedArticle = null;

    if (feed && feed.url) {
      this.feedPages[feed.url] = 1;
    }
    void this.render();
    if (this.sidebarContainer) {
      window.setTimeout(() => {
        const foldersSection = this.sidebarContainer?.querySelector(
          ".rss-dashboard-feed-folders-section",
        );
        if (foldersSection)
          (foldersSection as HTMLElement).scrollTop = scrollPosition;
      }, 0);
    }
  }

  private handleTagToggle(tag: string): void {
    this.inlineArticle = null;
    if (this.selectedTags.includes(tag)) {
      this.selectedTags = this.selectedTags.filter((t) => t !== tag);
    } else {
      this.selectedTags.push(tag);
    }

    if (this.selectedTags.length > 0) {
      this.currentFolder = null;
      this.currentFeed = null;
    }
    this.selectedArticle = null;
    void this.render();
  }

  private handleClearTags(): void {
    this.selectedTags = [];
    void this.render();
  }

  private handleTagFilterModeChange(mode: "and" | "or" | "not"): void {
    this.settings.sidebarTagFilterMode = mode;
    void this.plugin.saveSettings();
    void this.render();
  }

  private handleToggleTagsCollapse(): void {
    this.tagsCollapsed = !this.tagsCollapsed;
    void this.render();
  }

  private handleToggleFolderCollapse(
    folder: string,
    shouldRerender = true,
  ): void {
    if (this.collapsedFolders.includes(folder)) {
      this.collapsedFolders = this.collapsedFolders.filter((f) => f !== folder);
    } else {
      this.collapsedFolders.push(folder);
    }
    this.settings.collapsedFolders = this.collapsedFolders;
    void this.plugin.saveSettings();

    if (shouldRerender) {
      void this.render();
    }
  }

  private handleBatchToggleFolders(
    foldersToCollapse: string[],
    foldersToExpand: string[],
  ): void {
    this.collapsedFolders = this.collapsedFolders.filter(
      (f) => !foldersToExpand.includes(f),
    );
    foldersToCollapse.forEach((folder) => {
      if (!this.collapsedFolders.includes(folder)) {
        this.collapsedFolders.push(folder);
      }
    });

    this.settings.collapsedFolders = this.collapsedFolders;
    void this.plugin.saveSettings();
    void this.render();
  }

  // --- Feed and folder management ---
  private handleAddFolder(name: string): void {
    void this.plugin.ensureFolderExists(name);
  }

  private handleAddSubfolder(parent: string, name: string): void {
    void this.plugin.addSubfolder(parent, name);
  }

  private async handleAddFeed(
    title: string,
    url: string,
    folder: string,
    autoDeleteDuration?: number,
    maxItemsLimit?: number,
    scanInterval?: number,
    feedKeywordRules?: FeedKeywordRulesSettings,
    customTemplate?: string,
    excludeFromRefresh?: boolean,
  ): Promise<void> {
    await this.plugin.addFeed(
      title,
      url,
      folder,
      autoDeleteDuration,
      maxItemsLimit,
      scanInterval,
      feedKeywordRules,
      customTemplate,
      excludeFromRefresh,
    );
    void this.render();
  }

  private handleEditFeed(
    feed: Feed,
    title: string,
    url: string,
    folder: string,
  ): void {
    void this.plugin.editFeed(feed, title, url, folder);
    void this.render();
  }

  private handleDeleteFeed(feed: Feed): void {
    this.plugin.settings.feeds = this.plugin.settings.feeds.filter(
      (f: Feed) => f !== feed,
    );
    void this.plugin.saveSettings();

    if (this.currentFeed === feed) {
      this.currentFeed = null;
    }

    void this.render();
  }

  private handleDeleteFolder(folder: string): void {
    this.plugin.settings.feeds = this.plugin.settings.feeds.filter(
      (feed: Feed) => feed.folder !== folder,
    );

    this.plugin.settings.folders = this.plugin.settings.folders.filter(
      (f: { name: string }) => f.name !== folder,
    );

    void this.plugin.saveSettings();

    if (this.currentFolder === folder) {
      this.currentFolder = null;
    }

    void this.render();
  }

  private async handleRefreshFeeds(): Promise<void> {
    if (this.currentFeed) {
      await this.plugin.refreshSelectedFeed(this.currentFeed);
    } else if (
      this.currentFolder &&
      !["read", "unread", "starred", "saved", "videos", "podcasts"].includes(
        this.currentFolder,
      )
    ) {
      await this.plugin.refreshFeedsInFolder(this.currentFolder);
    } else if (this.selectedTags.length > 0) {
      const feedsWithTags = this.settings.feeds.filter((feed) =>
        feed.items.some((item) => {
          const itemTags = (item.tags ?? []).map((t) => t.name);
          return this.selectedTags.some((tag) => itemTags.includes(tag));
        }),
      );
      if (feedsWithTags.length > 0) {
        await this.plugin.refreshFeeds(feedsWithTags);
      } else {
        new Notice("No feeds found with the selected tags");
      }
    } else {
      await this.plugin.refreshFeeds();
    }
  }

  private handleImportOpml(): void {
    void this.plugin.importOpml();
  }

  private handleExportOpml(): void {
    void this.plugin.exportOpml();
  }

  // --- Mobile sidebar and article opening ---
  public openMobileSidebar(): void {
    if (!this.shouldUseMobileSidebarMode()) {
      this.closeMobileSidebarModal();
      return;
    }

    // Keep one sidebar modal instance to prevent duplicate overlays.
    if (this.mobileSidebarModal) {
      return;
    }

    const modal = new MobileNavigationModal(
      this.app,
      this.plugin,
      this.settings,
      {
        currentFolder: this.currentFolder,
        currentFeed: this.currentFeed,
        selectedTags: this.selectedTags,
        tagsCollapsed: this.tagsCollapsed,
        collapsedFolders: this.collapsedFolders,
      },
      {
        onFolderClick: this.handleFolderClick.bind(this),
        onFeedClick: this.handleFeedClick.bind(this),
        onTagToggle: this.handleTagToggle.bind(this),
        onClearTags: this.handleClearTags.bind(this),
        onTagFilterModeChange: this.handleTagFilterModeChange.bind(this),
        onToggleTagsCollapse: this.handleToggleTagsCollapse.bind(this),
        onToggleFolderCollapse: this.handleToggleFolderCollapse.bind(this),
        onBatchToggleFolders: this.handleBatchToggleFolders.bind(this),
        onAddFolder: this.handleAddFolder.bind(this),
        onAddSubfolder: this.handleAddSubfolder.bind(this),
        onAddFeed: this.handleAddFeed.bind(this),
        onEditFeed: this.handleEditFeed.bind(this),
        onDeleteFeed: this.handleDeleteFeed.bind(this),
        onDeleteFolder: this.handleDeleteFolder.bind(this),
        onRefreshFeeds: this.handleRefreshFeeds.bind(this),
        onUpdateFeed: this.handleUpdateFeed.bind(this),
        onImportOpml: this.handleImportOpml.bind(this),
        onExportOpml: this.handleExportOpml.bind(this),
        onToggleSidebar: this.handleToggleSidebar.bind(this),
        onManageFeeds: () => {
          new FeedManagerModal(this.app, this.plugin).open();
        },
        onActivateDashboard: () => void this.plugin.activateView(),
        onActivateDiscover: () => void this.plugin.activateDiscoverView(),
      },
    );

    const originalOnClose = modal.onClose.bind(modal);
    modal.onClose = () => {
      originalOnClose();
      if (this.mobileSidebarModal === modal) {
        this.mobileSidebarModal = null;
      }
    };

    this.mobileSidebarModal = modal;
    modal.open();
  }

  private shouldUseMobileSidebarMode(viewportWidth?: number): boolean {
    return shouldUseMobileSidebarLayout(viewportWidth);
  }

  private closeMobileSidebarModal(): void {
    if (!this.mobileSidebarModal) {
      return;
    }
    this.mobileSidebarModal.close();
    this.mobileSidebarModal = null;
  }

  private handleViewportResizeModeTransition(): void {
    const currentMode = this.shouldUseMobileSidebarMode(window.innerWidth);

    if (this.lastViewportMobileSidebarMode === null) {
      this.lastViewportMobileSidebarMode = currentMode;
      return;
    }

    if (this.lastViewportMobileSidebarMode === currentMode) {
      return;
    }

    this.lastViewportMobileSidebarMode = currentMode;

    if (!currentMode) {
      this.closeMobileSidebarModal();
    }

    this.render();
  }

  private handleToggleSidebar(): void {
    if (this.shouldUseMobileSidebarMode()) {
      this.openMobileSidebar();
      return;
    }
    this.settings.sidebarCollapsed = !this.settings.sidebarCollapsed;
    void this.plugin.saveSettings();
    void this.render();
  }

  // --- Article open/save actions ---
  private async handleArticleClick(article: FeedItem): Promise<void> {
    const readerLocation = this.getReaderViewLocation();
    const shouldForceCardTopAnchor =
      this.settings.viewStyle === "card" &&
      (readerLocation === "left-sidebar" ||
        readerLocation === "right-sidebar" ||
        (readerLocation === "main" && !Platform.isMobile));

    this.selectedArticle = article;
    this.articleList?.setSelectedArticle(article);

    if (!article.read && this.settings.display.autoMarkReadOnOpen) {
      await this.updateArticleStatus(article, { read: true }, false);
    }
    await this.openArticleInConfiguredReaderLocation(article);

    if (shouldForceCardTopAnchor) {
      // Clear any stale ref from a previous rapid click.
      this._clearLayoutChangeRef();
      // ResizeObserver + 500ms fallback: sets pendingCardTopAnchor so
      // intermediate render()s don't clobber scroll position.
      this.articleList?.scheduleCardTopAnchorOnResize();
      // layout-change fires after Obsidian fully commits the new panel
      // geometry (post-CSS-transition), ensuring final rects are accurate.
      this.layoutChangeRef = this.app.workspace.on("layout-change", () => {
        this._clearLayoutChangeRef();
        this.articleList?.scrollSelectedCardToTop();
      });
    }
  }

  private _clearLayoutChangeRef(): void {
    if (this.layoutChangeRef) {
      this.app.workspace.offref(this.layoutChangeRef);
      this.layoutChangeRef = null;
    }
  }

  private async openArticleInNewTab(article: FeedItem): Promise<WorkspaceLeaf> {
    const { workspace } = this.app;
    const leaf = workspace.getLeaf(Platform.isMobile ? "tab" : "split");
    if (leaf) {
      await leaf.setViewState({
        type: RSS_READER_VIEW_TYPE,
        active: true,
      });
      await workspace.revealLeaf(leaf);
      if (leaf.view instanceof ReaderView) {
        const view = leaf.view;
        view.setReturnLeaf(this.leaf);
        const relatedItems = this.getRelatedItems(article);
        await view.displayItem(article, relatedItems);
      }
    }
    return leaf;
  }

  private async openArticleInSpecificLeaf(
    article: FeedItem,
    leaf: WorkspaceLeaf,
  ): Promise<void> {
    if (leaf) {
      await leaf.setViewState({
        type: RSS_READER_VIEW_TYPE,
        active: true,
      });
      await this.app.workspace.revealLeaf(leaf);
      if (leaf.view instanceof ReaderView) {
        const view = leaf.view;
        view.setReturnLeaf(this.leaf);
        const relatedItems = this.getRelatedItems(article);
        await view.displayItem(article, relatedItems);
      }
    }
  }

  private openArticleInExternalBrowser(article: FeedItem): void {
    const url = resolveItemExternalUrl(article);
    if (!url) {
      new Notice("No external URL available for this item.");
      return;
    }

    window.open(url, "_blank");
  }

  private getRelatedItems(article: FeedItem): FeedItem[] {
    if (!article.feedUrl) return [];

    const feed = this.settings.feeds.find(
      (f: Feed) => f.url === article.feedUrl,
    );
    if (!feed) return [];

    return feed.items
      .filter((item) => item.guid !== article.guid)
      .sort(
        (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
      )
      .slice(0, 5);
  }

  private handleToggleViewStyle(style: "list" | "card" | "feed"): void {
    this.settings.viewStyle = style;
    void this.plugin.saveSettings();
    void this.render();
  }

  private async handleArticleUpdate(
    article: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender = true,
  ): Promise<void> {
    await this.updateArticleStatus(article, updates, shouldRerender);
  }

  private async handleArticleSave(article: FeedItem): Promise<void> {
    // Find the feed to check for custom template
    const feed = this.settings.feeds.find(
      (f: Feed) => f.url === article.feedUrl,
    );
    let customTemplate: string | undefined;

    // If feed has a custom template ID, resolve it to the actual template content
    if (feed?.customTemplate) {
      const savedTemplates = this.settings.articleSaving.savedTemplates || [];
      const templateObj = savedTemplates.find(
        (t) => t.id === feed.customTemplate,
      );
      if (templateObj) {
        customTemplate = templateObj.template;
      }
    }

    const file = this.settings.articleSaving.saveFullContent
      ? await this.saver.saveArticleWithFullContent(
          article,
          undefined,
          customTemplate,
        )
      : await this.saver.saveArticle(article, undefined, customTemplate);

    if (file) {
      await this.updateArticleStatus(
        article,
        { saved: true, savedFilePath: file.path },
        false,
      );
      this.updateArticleSaveButton(article.guid);
    }
  }

  // --- Article mutation, sync, and persistence ---
  private async updateArticleStatus(
    article: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender = true,
  ): Promise<void> {
    const normalizedUpdates = applyAutomaticArticleTags(
      article,
      updates,
      this.settings,
    );
    const feed = this.settings.feeds.find(
      (f: Feed) => f.url === article.feedUrl,
    );

    if (!feed) return;

    const originalArticle = feed.items.find(
      (item: FeedItem) => item.guid === article.guid,
    );

    if (!originalArticle) return;

    Object.assign(originalArticle, normalizedUpdates);
    Object.assign(article, normalizedUpdates);

    if (normalizedUpdates.tags) {
      originalArticle.tags = normalizedUpdates.tags;
      article.tags = normalizedUpdates.tags;
    }

    await this.plugin.updateArticle(
      originalArticle.guid,
      feed.url,
      normalizedUpdates,
      false,
    );

    if (shouldRerender) {
      void this.render();
    } else {
      if (
        (normalizedUpdates.tags || normalizedUpdates.read !== undefined) &&
        this.sidebar
      ) {
        this.sidebar.render();
      }
      this.syncArticleListAfterUpdate(article);
    }
  }

  public applyExternalArticleUpdate(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRerender = false,
  ): void {
    const feed = this.settings.feeds.find((f) => f.url === feedUrl);
    if (!feed) return;

    const originalArticle = feed.items.find(
      (item) => item.guid === articleGuid,
    );
    if (!originalArticle) return;

    Object.assign(originalArticle, updates);
    if (updates.tags) {
      originalArticle.tags = updates.tags;
    }

    if (this.selectedArticle?.guid === articleGuid) {
      Object.assign(this.selectedArticle, updates);
      if (updates.tags) {
        this.selectedArticle.tags = updates.tags;
      }
    }

    if (shouldRerender) {
      void this.render();
      return;
    }

    if ((updates.tags || updates.read !== undefined) && this.sidebar) {
      this.sidebar.render();
    }

    this.syncArticleListAfterUpdate(originalArticle);
  }

  public setSelectedArticleFromExternal(article: FeedItem): void {
    this.selectedArticle = article;
    this.articleList?.setSelectedArticle(article);
  }

  public refreshTagColors(): void {
    this.articleList?.syncVisibleArticlesFromSource((article) =>
      this.findBackingArticleForDisplayItem(article),
    );
    this.articleList?.refreshVisibleArticleTags();
  }

  private syncArticleListAfterUpdate(article: FeedItem): void {
    if (!this.articleList) {
      return;
    }

    if (!this.matchesFilters(article)) {
      this.articleList.removeArticleInPlace(article.guid);
      this.refreshFilterStatusBarOnly();
      return;
    }

    if (!this.articleList.hasArticle(article.guid)) {
      const inserted = this.articleList.insertArticleInPlace(
        article,
        this.settings.articleSort,
      );

      if (!inserted) {
        const filtered = this.getFilteredArticles();
        const pageSize = this.getCurrentPageSize();
        const currentPage = this.getCurrentPage();
        const pagePagination = computePagination({
          totalItems: filtered.length,
          pageSize,
          requestedPage: currentPage,
        });
        const articlesForPage = filtered.slice(
          pagePagination.startIdx,
          pagePagination.endIdx,
        );
        this.articleList.refilter(
          new Set(this.activeStatusFilters),
          new Set(this.activeTagFilters),
          this.filterLogic,
          articlesForPage,
          pagePagination.currentPage,
          pagePagination.totalPages,
          pageSize,
          filtered.length,
        );
      }

      this.refreshFilterStatusBarOnly();
      return;
    }

    this.articleList.updateArticleInPlace(article);
    this.refreshFilterStatusBarOnly();
  }

  private markPageArticlesAsRead(
    currentPageArticles: FeedItem[],
    previousPage: number,
    previousTotalPages: number,
    pageSize: number,
    previousTotalArticles: number,
  ): void {
    if (!this.articleList) {
      return;
    }

    const updatedArticles: FeedItem[] = [];
    currentPageArticles.forEach((article) => {
      if (article.read) {
        return;
      }

      const originalArticle = this.findBackingArticleForDisplayItem(article);
      if (!originalArticle || originalArticle.read) {
        return;
      }

      originalArticle.read = true;
      article.read = true;
      updatedArticles.push(article);
    });

    if (updatedArticles.length === 0) {
      new Notice("No unread items on current page");
      return;
    }

    void this.plugin.saveSettings();

    const filtered = this.getFilteredArticles();
    const pagination = computePagination({
      totalItems: filtered.length,
      pageSize,
      requestedPage: previousPage,
    });
    if (pagination.currentPage !== previousPage) {
      this.setCurrentPageState(pagination.currentPage);
    }

    const nextPageArticles = filtered.slice(
      pagination.startIdx,
      pagination.endIdx,
    );
    const currentPageGuids = currentPageArticles.map((article) => article.guid);
    const nextPageGuids = nextPageArticles.map((article) => article.guid);
    const pageCompositionChanged =
      currentPageGuids.length !== nextPageGuids.length ||
      currentPageGuids.some((guid, index) => guid !== nextPageGuids[index]);
    const paginationChanged =
      pagination.currentPage !== previousPage ||
      pagination.totalPages !== previousTotalPages ||
      filtered.length !== previousTotalArticles;

    if (!pageCompositionChanged && !paginationChanged) {
      if (this.sidebar) {
        this.sidebar.render();
      }
      updatedArticles.forEach((article) => {
        this.articleList.updateArticleInPlace(article);
      });
      this.refreshFilterStatusBarOnly();
      new Notice(`Marked ${updatedArticles.length} items as read`);
      return;
    }

    if (this.sidebar) {
      this.sidebar.render();
    }
    this.articleList.refilter(
      new Set(this.activeStatusFilters),
      new Set(this.activeTagFilters),
      this.filterLogic,
      nextPageArticles,
      pagination.currentPage,
      pagination.totalPages,
      pageSize,
      filtered.length,
    );
    this.refreshFilterStatusBarOnly();
    new Notice(`Marked ${updatedArticles.length} items as read`);
  }

  private markCurrentPageAsRead(): void {
    if (!this.articleList) {
      return;
    }

    const filtered = this.getFilteredArticles();
    const pageSize = this.getCurrentPageSize();
    const requestedPage = this.getCurrentPage();
    const pagination = computePagination({
      totalItems: filtered.length,
      pageSize,
      requestedPage,
    });

    if (pagination.currentPage !== requestedPage) {
      this.setCurrentPageState(pagination.currentPage);
    }

    const currentPageArticles = filtered.slice(
      pagination.startIdx,
      pagination.endIdx,
    );

    this.markPageArticlesAsRead(
      currentPageArticles,
      pagination.currentPage,
      pagination.totalPages,
      pageSize,
      filtered.length,
    );
  }

  private findBackingArticleForDisplayItem(article: FeedItem): FeedItem | null {
    if (this.currentFeed) {
      const currentFeedMatch = this.currentFeed.items.find(
        (item) => item.guid === article.guid,
      );
      if (currentFeedMatch) {
        return currentFeedMatch;
      }
    }

    if (article.feedUrl) {
      const feed = this.settings.feeds.find((f) => f.url === article.feedUrl);
      const feedMatch = feed?.items.find((item) => item.guid === article.guid);
      if (feedMatch) {
        return feedMatch;
      }
    }

    for (const feed of this.settings.feeds) {
      const match = feed.items.find((item) => item.guid === article.guid);
      if (match) {
        return match;
      }
    }

    return null;
  }

  private openViewingFiltersMenu(): void {
    const root = this.containerEl ?? document.body;

    const trigger =
      root.querySelector<HTMLElement>(
        ".rss-dashboard-mobile-filter-button.rss-dashboard-filter-trigger",
      ) ??
      root.querySelector<HTMLElement>(
        ".rss-dashboard-multi-filter-btn.rss-dashboard-filter-trigger",
      ) ??
      root.querySelector<HTMLElement>(".rss-dashboard-filter-trigger");

    trigger?.click();
  }

  private getViewFilterReasonLabel(): string | null {
    const specialFolderLabels: Record<string, string> = {
      unread: "the Unread view filter",
      read: "the Read view filter",
      starred: "the Starred view filter",
      saved: "the Saved view filter",
      videos: "the Videos view filter",
      podcasts: "the Podcasts view filter",
    };

    if (this.currentFolder && specialFolderLabels[this.currentFolder]) {
      return specialFolderLabels[this.currentFolder];
    }

    if (
      this.activeStatusFilters.size === 1 &&
      this.activeTagFilters.size === 0
    ) {
      const [statusFilter] = Array.from(this.activeStatusFilters);
      const statusLabel =
        statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1);
      return `the ${statusLabel} view filter`;
    }

    if (
      this.activeStatusFilters.size === 0 &&
      this.activeTagFilters.size === 1
    ) {
      const [tagFilter] = Array.from(this.activeTagFilters);
      return `the "${tagFilter}" tag filter`;
    }

    if (this.activeStatusFilters.size > 0 || this.activeTagFilters.size > 0) {
      return "the current view filters";
    }

    if (this.selectedTags.length === 1) {
      return `the "${this.selectedTags[0]}" tag filter`;
    }

    if (this.selectedTags.length > 1) {
      return "the current tag filters";
    }

    return null;
  }

  /**
   * Checks if an item matches all active filters (sidebar tag/folder, header multi-filters, age filter).
   */
  private matchesFilters(
    item: FeedItem,
    options: {
      ignoreDashboardMultiFilters?: boolean;
      ignoreAgeFilter?: boolean;
    } = {},
  ): boolean {
    // 1. Check selected tags (if any)
    if (this.selectedTags.length > 0) {
      const mode = this.settings.sidebarTagFilterMode || "or";
      const itemTags = (item.tags ?? []).map((t) => t.name);
      if (mode === "or") {
        if (!this.selectedTags.some((tag) => itemTags.includes(tag)))
          return false;
      } else if (mode === "and") {
        if (!this.selectedTags.every((tag) => itemTags.includes(tag)))
          return false;
      } else if (mode === "not") {
        if (this.selectedTags.some((tag) => itemTags.includes(tag)))
          return false;
      }
    }

    // 2. Check special folder status (if selected in sidebar)
    const specialFolders = [
      "read",
      "unread",
      "starred",
      "saved",
      "videos",
      "podcasts",
    ];
    if (this.currentFolder && specialFolders.includes(this.currentFolder)) {
      if (this.currentFolder === "starred" && !item.starred) return false;
      if (this.currentFolder === "unread" && item.read) return false;
      if (this.currentFolder === "read" && !item.read) return false;
      if (this.currentFolder === "saved" && !item.saved) return false;
      if (this.currentFolder === "videos" && item.mediaType !== "video")
        return false;
      if (this.currentFolder === "podcasts" && item.mediaType !== "podcast")
        return false;
    }

    // 3. Check multi-filters (header checkboxes)
    if (
      !options.ignoreDashboardMultiFilters &&
      (this.activeStatusFilters.size > 0 || this.activeTagFilters.size > 0)
    ) {
      const isRead = !!item.read;
      const isSaved = !!item.saved;
      const isStarred = !!item.starred;

      if (this.filterLogic === "AND") {
        // Strict matching: Item MUST satisfy EVERY checked status filter
        if (this.activeStatusFilters.has("unread") && isRead) return false;
        if (this.activeStatusFilters.has("read") && !isRead) return false;
        if (this.activeStatusFilters.has("saved") && !isSaved) return false;
        if (this.activeStatusFilters.has("starred") && !isStarred) return false;
        if (
          this.activeStatusFilters.has("videos") &&
          item.mediaType !== "video"
        )
          return false;
        if (
          this.activeStatusFilters.has("podcasts") &&
          item.mediaType !== "podcast"
        )
          return false;
        if (
          this.activeStatusFilters.has("tagged") &&
          (!item.tags || item.tags.length === 0)
        )
          return false;
        if (
          this.activeStatusFilters.has("untagged") &&
          item.tags &&
          item.tags.length > 0
        )
          return false;

        // Specific tag checks (AND mode: match ANY of the selected tags)
        if (this.activeTagFilters.size > 0) {
          if (!item.tags || item.tags.length === 0) return false;
          const itemTagNames = item.tags.map((t) => t.name);
          const tagMatch = Array.from(this.activeTagFilters).some((tagName) =>
            itemTagNames.includes(tagName),
          );
          if (!tagMatch) return false;
        }
      } else {
        // "Or" (OR) logic: Item matches if it satisfies ANY checked filter.
        let match = false;
        if (this.activeStatusFilters.has("unread") && !isRead) match = true;
        else if (this.activeStatusFilters.has("read") && isRead) match = true;
        else if (this.activeStatusFilters.has("saved") && isSaved) match = true;
        else if (this.activeStatusFilters.has("starred") && isStarred)
          match = true;
        else if (
          this.activeStatusFilters.has("videos") &&
          item.mediaType === "video"
        )
          match = true;
        else if (
          this.activeStatusFilters.has("podcasts") &&
          item.mediaType === "podcast"
        )
          match = true;
        else if (
          this.activeStatusFilters.has("tagged") &&
          item.tags &&
          item.tags.length > 0
        )
          match = true;
        else if (
          this.activeStatusFilters.has("untagged") &&
          (!item.tags || item.tags.length === 0)
        )
          match = true;
        else if (
          this.activeTagFilters.size > 0 &&
          item.tags &&
          item.tags.length > 0
        ) {
          const itemTagNames = item.tags.map((t) => t.name);
          if (
            Array.from(this.activeTagFilters).some((tagName) =>
              itemTagNames.includes(tagName),
            )
          ) {
            match = true;
          }
        }
        if (!match) return false;
      }
    }

    // 4. Check age filter
    if (
      !options.ignoreAgeFilter &&
      this.settings.articleFilter.type === "age" &&
      typeof this.settings.articleFilter.value === "number" &&
      this.settings.articleFilter.value > 0
    ) {
      const maxAge = Date.now() - this.settings.articleFilter.value;
      if (new Date(item.pubDate).getTime() <= maxAge) return false;
    }

    return true;
  }

  private computeDashboardMultiFilterCounts(
    keywordFilteredArticles: FeedItem[],
  ): { shown: number; filteredOut: number; total: number } {
    let total = 0;
    let shown = 0;

    for (const item of keywordFilteredArticles) {
      if (this.matchesFilters(item, { ignoreDashboardMultiFilters: true })) {
        total++;
      }
      if (this.matchesFilters(item)) {
        shown++;
      }
    }

    const result = {
      shown,
      total,
      filteredOut: Math.max(0, total - shown),
    };

    this.dashboardMultiFilterCounts = result;
    return result;
  }

  public updateArticleSaveButton(articleGuid: string): void {
    const articleEl = document.getElementById(`article-${articleGuid}`);
    if (articleEl) {
      const saveButton = articleEl.querySelector(".rss-dashboard-save-toggle");
      if (saveButton) {
        saveButton.classList.add("saved");
      }
    }
  }

  showEditFeedModal(
    feed: Feed,
    options?: {
      expandSection?: "per-feed" | "rules";
      highlightSection?: "per-feed" | "rules";
    },
  ): void {
    this.sidebar.showEditFeedModal(feed, options);
  }

  /**
   * Refresh only the filter/highlight status subheader without rebuilding the
   * articles list. This preserves current scroll position while keeping counts
   * and chips in sync with latest settings.
   */
  refreshFilterStatusBarOnly(): void {
    const contentContainer = this.containerEl.querySelector<HTMLElement>(
      ".rss-dashboard-content",
    );
    if (!contentContainer) return;

    const existingSubheader = contentContainer.querySelector(
      ".rss-dashboard-filter-subheader",
    );
    existingSubheader?.remove();

    const allFilteredArticles = this.getFilteredArticles();
    this.computeHighlightMatchCounts(allFilteredArticles);
    this.renderFilterSubheader(contentContainer);

    const newSubheader = contentContainer.querySelector(
      ".rss-dashboard-filter-subheader",
    );
    const articlesContainer = contentContainer.querySelector(
      ".rss-dashboard-articles",
    );
    if (newSubheader && articlesContainer) {
      contentContainer.insertBefore(newSubheader, articlesContainer);
    }
  }

  refreshSidebarOnly(): void {
    if (!this.sidebar) {
      return;
    }

    this.sidebar.clearFolderPathCache();
    this.sidebar["options"] = {
      currentFolder: this.currentFolder,
      currentFeed: this.currentFeed,
      selectedTags: this.selectedTags,
      tagsCollapsed: this.tagsCollapsed,
      collapsedFolders: this.collapsedFolders,
    };
    this.sidebar["settings"] = this.settings;
    this.sidebar.render();

    if (this.sidebarContainer && !this.settings.sidebarCollapsed) {
      this.applySidebarWidth();
      this.setupSidebarResize();
    }
  }

  refresh(): void {
    this.render();
  }

  async onClose(): Promise<void> {
    this.closeMobileSidebarModal();
    this.lastViewportMobileSidebarMode = null;

    if (this.verificationTimeout) {
      window.clearTimeout(this.verificationTimeout);
    }
    if (this.dashboardMultiFiltersSaveTimeout !== null) {
      window.clearTimeout(this.dashboardMultiFiltersSaveTimeout);
      this.dashboardMultiFiltersSaveTimeout = null;
    }
    this.clearCardLayoutRefreshTimeout();
    this.clearCardLayoutSaveTimeout();
    this._clearLayoutChangeRef();
    if (this.dashboardMultiFiltersDirty) {
      this.dashboardMultiFiltersDirty = false;
      await this.plugin.saveSettings();
    }
    if (this.articleList) {
      this.articleList.destroy();
    }
    this.sidebar?.destroy();
    this.resizeHandle = null;
    this.dashboardContainer = null;
  }

  // --- Layout and resize controls ---
  private setupSidebarResize(): void {
    // Don't setup resize on mobile/tablet
    if (this.shouldUseMobileSidebarMode()) {
      return;
    }

    // Remove existing resize handle if any
    if (this.resizeHandle) {
      this.resizeHandle.remove();
    }

    // Append the resize handle to the LAYOUT container, not the sidebar.
    // The layout container is bounded (overflow: hidden, height: 100%) so the
    // handle's top:0/bottom:0 spans the full visible panel height. Attaching
    // to the sidebar fails because: (a) the sidebar's overflow: hidden clips
    // half the handle's width, cutting the hitbox in half; and (b) when
    // sidebar content is taller than the viewport the handle stops short of
    // the bottom of the panel.
    if (this.dashboardContainer) {
      this.resizeHandle = this.dashboardContainer.createDiv({
        cls: "rss-dashboard-sidebar-resize-handle",
      });
    }

    // Apply saved width
    this.applySidebarWidth();

    // Setup drag handlers using registerDomEvent for proper cleanup
    if (this.resizeHandle) {
      this.registerDomEvent(this.resizeHandle, "mousedown", (e) => {
        this.handleResizeStart(e);
      });
    }
    this.registerDomEvent(document, "mousemove", (e) => {
      this.handleResizeMove(e);
    });
    this.registerDomEvent(document, "mouseup", () => {
      this.handleResizeEnd();
    });
  }

  private handleResizeStart(e: MouseEvent): void {
    e.preventDefault();
    this.isResizing = true;
    this.resizeHandle?.addClass("dragging");
    this.dashboardContainer?.addClass("resizing");
  }

  private handleResizeMove(e: MouseEvent): void {
    if (!this.isResizing) return;

    const containerRect = this.containerEl.getBoundingClientRect();
    let newWidth = e.clientX - containerRect.left;

    // Apply constraints
    const minWidth = 200;
    const maxWidth = 500;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    this.settings.sidebarWidth = newWidth;
    this.applySidebarWidth();
  }

  private handleResizeEnd(): void {
    if (!this.isResizing) return;

    this.isResizing = false;
    this.resizeHandle?.removeClass("dragging");
    this.dashboardContainer?.removeClass("resizing");

    // Save width to settings
    void this.plugin.saveSettings();
  }

  private applySidebarWidth(): void {
    if (this.sidebarContainer && !this.settings.sidebarCollapsed) {
      const width = this.settings.sidebarWidth || 280;
      this.sidebarContainer.style.width = `${width}px`;
      // Keep the resize handle pinned to the sidebar's right edge.
      // CSS `transform: translateX(-50%)` on the handle centers it on this
      // position, giving equal hitbox on both sides of the border line.
      if (this.resizeHandle) {
        this.resizeHandle.style.left = `${width}px`;
      }
    }
  }

  private async handleUpdateFeed(feed: Feed): Promise<void> {
    try {
      new Notice(`Updating feed "${feed.title}"...`);

      const updatedFeed = await this.plugin.feedParser.parseFeed(
        feed.url,
        feed,
      );

      if (updatedFeed) {
        const feedIndex = this.settings.feeds.findIndex(
          (f) => f.url === feed.url,
        );
        if (feedIndex >= 0) {
          this.settings.feeds[feedIndex] = updatedFeed;
          await this.plugin.saveSettings();
        }
      }

      void this.render();
      new Notice(`Feed "${feed.title}" updated successfully`);
    } catch (error) {
      new Notice(
        `Error updating feed "${feed.title}": ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // --- Filter state and refresh affordances ---
  private updateRefreshButtonText(): void {
    if (!this.articleList) return;

    let refreshText = "Refresh all feeds";

    if (this.currentFeed) {
      refreshText = `Refresh feed: "${this.currentFeed.title}"`;
    } else if (
      this.currentFolder &&
      !["read", "unread", "starred", "saved", "videos", "podcasts"].includes(
        this.currentFolder,
      )
    ) {
      const feedsInFolder = this.settings.feeds.filter((feed) => {
        if (!feed.folder) return false;
        return (
          feed.folder === this.currentFolder ||
          feed.folder.startsWith(this.currentFolder + "/")
        );
      });
      refreshText = `Refresh ${feedsInFolder.length} feed${feedsInFolder.length !== 1 ? "s" : ""} in folder: "${this.currentFolder}"`;
    } else if (this.selectedTags.length > 0) {
      const mode = (this.settings.sidebarTagFilterMode || "or").toUpperCase();
      const feedsWithTags = this.settings.feeds.filter((feed) =>
        feed.items.some((item) => {
          const itemTags = (item.tags ?? []).map((t) => t.name);
          return this.selectedTags.some((tag) => itemTags.includes(tag));
        }),
      );
      refreshText = `Refresh ${feedsWithTags.length} feed${feedsWithTags.length !== 1 ? "s" : ""} with tags (${mode}): "${this.selectedTags.join(", ")}"`;
    } else {
      refreshText = `Refresh all ${this.settings.feeds.length} feeds`;
    }

    this.articleList.updateRefreshButtonText(refreshText);
  }

  private handleSortChange(value: "newest" | "oldest"): void {
    this.settings.articleSort = value;
    void this.plugin.saveSettings();
    void this.render();
  }

  private handleFilterChange(filter: {
    type: string;
    value: unknown;
    checked?: boolean;
    isTag?: boolean;
    logic?: "AND" | "OR";
    batch?: {
      statusFilters?: Set<string>;
      tagFilters?: Set<string>;
      logic?: "AND" | "OR";
      bypassAll?: boolean;
      highlightsEnabled?: boolean;
      statusBarVisible?: boolean;
      cardColumnsPerRow?: number;
      cardSpacing?: number;
    };
  }): void {
    if (filter.type === "batch" && filter.batch) {
      const b = filter.batch;
      if (b.logic) this.filterLogic = b.logic;
      if (b.statusFilters) this.activeStatusFilters = new Set(b.statusFilters);
      if (b.tagFilters) this.activeTagFilters = new Set(b.tagFilters);

      let needsFullRender = false;
      if (b.bypassAll !== undefined) {
        if (!this.settings.keywordRules) {
          this.settings.keywordRules = {
            includeLogic: "AND",
            bypassAll: false,
            rules: [],
          };
        }
        if (this.settings.keywordRules.bypassAll !== b.bypassAll) {
          this.settings.keywordRules.bypassAll = b.bypassAll;
          needsFullRender = true;
        }
      }
      if (b.highlightsEnabled !== undefined) {
        if (!this.settings.highlights) {
          this.settings.highlights = {
            enabled: false,
            defaultColor: "#ffd700",
            highlightInContent: true,
            highlightInTitles: true,
            highlightInSummaries: true,
            words: [],
          };
        }
        if (this.settings.highlights.enabled !== b.highlightsEnabled) {
          this.settings.highlights.enabled = b.highlightsEnabled;
          needsFullRender = true;
        }
      }
      if (b.statusBarVisible !== undefined) {
        if (this.settings.display.showFilterStatusBar !== b.statusBarVisible) {
          this.settings.display.showFilterStatusBar = b.statusBarVisible;
          needsFullRender = true;
        }
      }
      if (b.cardColumnsPerRow !== undefined) {
        const nextCardColumnsPerRow = Math.max(
          0,
          Math.min(6, Math.round(b.cardColumnsPerRow)),
        );
        if (this.settings.display.cardColumnsPerRow !== nextCardColumnsPerRow) {
          this.settings.display.cardColumnsPerRow = nextCardColumnsPerRow;
          needsFullRender = true;
        }
      }
      if (b.cardSpacing !== undefined) {
        const nextCardSpacing = Math.max(
          0,
          Math.min(40, Math.round(b.cardSpacing)),
        );
        if (this.settings.display.cardSpacing !== nextCardSpacing) {
          this.settings.display.cardSpacing = nextCardSpacing;
          needsFullRender = true;
        }
      }

      if (needsFullRender) {
        void this.plugin.saveSettings();
        void this.render();
        return;
      }
    } else if (
      filter.type === "card-spacing-live" ||
      filter.type === "card-spacing-commit"
    ) {
      const nextCardSpacing = Math.max(
        0,
        Math.min(40, Math.round(Number(filter.value))),
      );
      if (!Number.isFinite(nextCardSpacing)) {
        return;
      }

      if (this.settings.display.cardSpacing !== nextCardSpacing) {
        this.settings.display.cardSpacing = nextCardSpacing;
      }

      this.articleList?.updateCardSpacingLayout(nextCardSpacing);

      if (filter.type === "card-spacing-live") {
        this.scheduleCardLayoutRefresh();
        this.scheduleCardLayoutSave();
      } else {
        this.clearCardLayoutRefreshTimeout();
        this.articleList?.refreshCardTagLayout();
        this.clearCardLayoutSaveTimeout();
        void this.plugin.saveSettings();
      }
      return;
    } else if (filter.type === "logic" && filter.logic) {
      this.filterLogic = filter.logic;
    } else if (filter.type === "status-bar-visibility") {
      this.settings.display.showFilterStatusBar = filter.checked ?? true;
      void this.plugin.saveSettings();
      void this.render();
      return;
    } else if (filter.type === "bypass-filters") {
      if (!this.settings.keywordRules) {
        this.settings.keywordRules = {
          includeLogic: "AND",
          bypassAll: false,
          rules: [],
        };
      }
      this.settings.keywordRules.bypassAll = filter.checked ?? false;
      void this.plugin.saveSettings();
      void this.render();
      return;
    } else if (filter.type === "highlights") {
      // Highlights toggle - requires saving settings and full re-render
      if (!this.settings.highlights) {
        this.settings.highlights = {
          enabled: false,
          defaultColor: "#ffd700",
          highlightInContent: true,
          highlightInTitles: true,
          highlightInSummaries: true,
          words: [],
        };
      }
      this.settings.highlights.enabled = filter.checked ?? false;
      void this.plugin.saveSettings();
      void this.render();
      return;
    } else if (filter.isTag) {
      if (filter.checked) {
        this.activeTagFilters.add(filter.type);
      } else {
        this.activeTagFilters.delete(filter.type);
      }
    } else if (filter.checked !== undefined) {
      const filterType = filter.type.toLowerCase();
      if (filter.checked) {
        this.activeStatusFilters.add(filterType);
      } else {
        this.activeStatusFilters.delete(filterType);
      }
    } else {
      // Age filter - requires saving settings and full re-render
      this.settings.articleFilter = {
        type: filter.type as
          | "age"
          | "read"
          | "unread"
          | "starred"
          | "saved"
          | "none",
        value: filter.value,
      };
      void this.plugin.saveSettings();
      void this.render();
      return;
    }

    this.schedulePersistDashboardMultiFilters();

    // For status/tag/logic changes, do a partial re-render
    // so the filter menu stays open
    if (this.articleList) {
      // Typically we want to reset to page 1 when filters change
      this.setCurrentPageState(1);

      const filtered = this.getFilteredArticles();
      const pageSize = this.getCurrentPageSize();
      const currentPage = this.getCurrentPage();
      const pagePagination = computePagination({
        totalItems: filtered.length,
        pageSize,
        requestedPage: currentPage,
      });

      const articlesForPage = filtered.slice(
        pagePagination.startIdx,
        pagePagination.endIdx,
      );

      this.articleList.refilter(
        new Set(this.activeStatusFilters),
        new Set(this.activeTagFilters),
        this.filterLogic,
        articlesForPage,
        pagePagination.currentPage,
        pagePagination.totalPages,
        pageSize,
        filtered.length,
      );
      this.refreshFilterStatusBarOnly();
      this.scheduleHeaderTitleRefresh();
    }
  }

  private scheduleHeaderTitleRefresh(): void {
    if (!this.articleList) {
      return;
    }

    if (this.headerTitleRefreshTimeout !== null) {
      window.clearTimeout(this.headerTitleRefreshTimeout);
    }

    // Apply triggers multiple handleFilterChange() calls back-to-back. Coalesce
    // them into a single header title update after the batch completes.
    this.headerTitleRefreshTimeout = window.setTimeout(() => {
      this.headerTitleRefreshTimeout = null;
      if (!this.articleList) {
        return;
      }
      if (typeof this.articleList.updateHeaderTitle !== "function") {
        return;
      }
      const titleInfo = this.getArticlesTitleInfo();
      this.articleList.updateHeaderTitle(titleInfo.title, titleInfo.tooltip);
    }, 0);
  }

  private schedulePersistDashboardMultiFilters(): void {
    this.settings.dashboardMultiFilters = {
      statusFilters: Array.from(this.activeStatusFilters),
      tagFilters: Array.from(this.activeTagFilters),
      logic: this.filterLogic,
    };

    this.dashboardMultiFiltersDirty = true;
    if (this.dashboardMultiFiltersSaveTimeout !== null) {
      window.clearTimeout(this.dashboardMultiFiltersSaveTimeout);
    }

    this.dashboardMultiFiltersSaveTimeout = window.setTimeout(() => {
      this.dashboardMultiFiltersSaveTimeout = null;
      if (!this.dashboardMultiFiltersDirty) {
        return;
      }
      this.dashboardMultiFiltersDirty = false;
      void this.plugin.saveSettings();
    }, 150);
  }

  private scheduleCardLayoutRefresh(): void {
    this.clearCardLayoutRefreshTimeout();
    this.cardLayoutRefreshTimeout = window.setTimeout(() => {
      this.cardLayoutRefreshTimeout = null;
      this.articleList?.refreshCardTagLayout();
    }, RssDashboardView.CARD_LAYOUT_RELAYOUT_DELAY_MS);
  }

  private clearCardLayoutRefreshTimeout(): void {
    if (this.cardLayoutRefreshTimeout !== null) {
      window.clearTimeout(this.cardLayoutRefreshTimeout);
      this.cardLayoutRefreshTimeout = null;
    }
  }

  private async waitForAnimationFrames(count = 1): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => {
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => resolve());
          return;
        }

        window.setTimeout(resolve, 0);
      });
    }
  }

  private getReaderViewLocation():
    | "main"
    | "right-sidebar"
    | "left-sidebar"
    | "inline"
    | "external-browser" {
    const location = this.settings.readerViewLocation;
    if (
      location === "left-sidebar" ||
      location === "right-sidebar" ||
      location === "inline" ||
      location === "external-browser"
    ) {
      return location;
    }
    return "main";
  }

  private getConfiguredReaderLeaf(): WorkspaceLeaf | null {
    const { workspace } = this.app;
    const readerLeaves = workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);

    switch (this.getReaderViewLocation()) {
      case "left-sidebar":
        return workspace.getLeftLeaf(false);
      case "right-sidebar":
        return workspace.getRightLeaf(false);
      case "inline":
      case "external-browser":
        return null;
      default:
        return readerLeaves[0] ?? null;
    }
  }

  private async getPodcastPlayingReaderLeaves(): Promise<WorkspaceLeaf[]> {
    const readerLeaves =
      this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
    const playingLeaves = await Promise.all(
      readerLeaves.map(async (leaf) => {
        if (requireApiVersion("1.7.2")) {
          await leaf.loadIfDeferred();
        }
        if (leaf.view instanceof ReaderView && leaf.view.isPodcastPlaying()) {
          return leaf;
        }
        return null;
      }),
    );

    return playingLeaves.filter((leaf): leaf is WorkspaceLeaf => leaf !== null);
  }

  private async openArticleInConfiguredReaderLocation(
    article: FeedItem,
  ): Promise<void> {
    const readerLocation = this.getReaderViewLocation();

    if (readerLocation === "external-browser") {
      this.openArticleInExternalBrowser(article);
      return;
    }

    const readerLeaves =
      this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
    const podcastPlayingLeaves = await this.getPodcastPlayingReaderLeaves();
    const targetLeaf = this.getConfiguredReaderLeaf();

    if (podcastPlayingLeaves.length > 0) {
      const reusablePodcastLeaf =
        this.articleReaderLeafWhilePodcast &&
        readerLeaves.includes(this.articleReaderLeafWhilePodcast)
          ? this.articleReaderLeafWhilePodcast
          : null;

      if (
        reusablePodcastLeaf &&
        !podcastPlayingLeaves.includes(reusablePodcastLeaf)
      ) {
        await this.openArticleInSpecificLeaf(article, reusablePodcastLeaf);
        return;
      }

      if (targetLeaf && !podcastPlayingLeaves.includes(targetLeaf)) {
        this.articleReaderLeafWhilePodcast = targetLeaf;
        await this.openArticleInSpecificLeaf(article, targetLeaf);
        return;
      }

      const newLeaf = await this.openArticleInNewTab(article);
      this.articleReaderLeafWhilePodcast = newLeaf;
      return;
    }

    this.articleReaderLeafWhilePodcast = null;

    if (readerLocation === "inline") {
      this.inlineArticle = article;
      void this.render();
      return;
    }

    if (targetLeaf) {
      await this.openArticleInSpecificLeaf(article, targetLeaf);
      return;
    }

    await this.openArticleInNewTab(article);
  }

  private renderInlineArticle(container: HTMLElement): void {
    const header = container.createDiv({
      cls: "rss-reader-header inline-reader-header",
    });
    const backButton = header.createDiv({
      cls: "rss-reader-back-button clickable-icon",
      attr: { title: "Back to dashboard", "aria-label": "Back to dashboard" },
    });
    setIcon(backButton, "arrow-left");
    backButton.addEventListener("click", () => {
      this.inlineArticle = null;
      void this.render();
    });

    header.createDiv({
      cls: "rss-reader-title",
      text: this.inlineArticle?.title || "Article",
    });

    const body = container.createDiv({
      cls: "rss-reader-content inline-reader-content",
    });

    if (this.articleRenderer && this.inlineArticle) {
      const related = this.getRelatedItems(this.inlineArticle);
      void this.articleRenderer.render(body, this.inlineArticle, related);
    }
  }

  private scheduleCardLayoutSave(): void {
    this.clearCardLayoutSaveTimeout();
    this.cardLayoutSaveTimeout = window.setTimeout(() => {
      this.cardLayoutSaveTimeout = null;
      void this.plugin.saveSettings();
    }, RssDashboardView.CARD_LAYOUT_SAVE_DELAY_MS);
  }

  private clearCardLayoutSaveTimeout(): void {
    if (this.cardLayoutSaveTimeout !== null) {
      window.clearTimeout(this.cardLayoutSaveTimeout);
      this.cardLayoutSaveTimeout = null;
    }
  }

  private handleGroupChange(value: "none" | "feed" | "date" | "folder"): void {
    this.settings.articleGroupBy = value;
    void this.plugin.saveSettings();
    void this.render();
  }

  private getTotalArticlesCountForCurrentView(): number {
    let articles: FeedItem[] = [];

    if (this.currentFeed) {
      return this.currentFeed.items.length;
    }

    if (this.currentFolder === "starred") {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(feed.items.filter((item) => item.starred));
      }
    } else if (this.currentFolder === "unread") {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(feed.items.filter((item) => !item.read));
      }
    } else if (this.currentFolder === "read") {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(feed.items.filter((item) => item.read));
      }
    } else if (this.currentFolder === "saved") {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(feed.items.filter((item) => item.saved));
      }
    } else if (this.currentFolder === "videos") {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(
          feed.items.filter((item) => item.mediaType === "video"),
        );
      }
    } else if (this.currentFolder === "podcasts") {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(
          feed.items.filter((item) => item.mediaType === "podcast"),
        );
      }
    } else if (this.selectedTags.length > 0) {
      const mode = this.settings.sidebarTagFilterMode || "or";
      for (const feed of this.settings.feeds) {
        articles = articles.concat(
          feed.items.filter((item) => {
            const itemTags = (item.tags ?? []).map((t) => t.name);
            if (mode === "or") {
              return this.selectedTags.some((tag) => itemTags.includes(tag));
            } else if (mode === "and") {
              return this.selectedTags.every((tag) => itemTags.includes(tag));
            } else if (mode === "not") {
              return !this.selectedTags.some((tag) => itemTags.includes(tag));
            }
            return false;
          }),
        );
      }
    } else if (this.currentFolder) {
      const allFolders = this.getAllDescendantFolders(this.currentFolder);
      for (const feed of this.settings.feeds) {
        if (feed.folder && allFolders.includes(feed.folder)) {
          articles = articles.concat(feed.items);
        }
      }
    } else {
      for (const feed of this.settings.feeds) {
        articles = articles.concat(feed.items);
      }
    }

    if (
      this.settings.articleFilter.type === "age" &&
      typeof this.settings.articleFilter.value === "number" &&
      this.settings.articleFilter.value > 0
    ) {
      const maxAge = Date.now() - this.settings.articleFilter.value;
      articles = articles.filter((a) => new Date(a.pubDate).getTime() > maxAge);
    }

    return articles.length;
  }

  // --- Saved article file lookup and reader handoff ---
  private getCurrentPage(): number {
    if (this.currentFeed && this.currentFeed.url) {
      return this.feedPages[this.currentFeed.url] || 1;
    } else if (
      this.currentFolder &&
      !["unread", "read", "saved", "starred", "videos", "podcasts"].includes(
        this.currentFolder,
      )
    ) {
      return this.folderPages[this.currentFolder] || 1;
    } else if (
      this.currentFolder === null &&
      this.currentFeed === null &&
      this.selectedTags.length === 0
    ) {
      return this.allArticlesPage;
    } else if (this.currentFolder === "unread") {
      return this.unreadArticlesPage;
    } else if (this.currentFolder === "read") {
      return this.readArticlesPage;
    } else if (this.currentFolder === "saved") {
      return this.savedArticlesPage;
    } else if (this.currentFolder === "starred") {
      return this.starredArticlesPage;
    } else {
      return this.allArticlesPage;
    }
  }

  private async findSavedArticleFile(article: FeedItem): Promise<TFile | null> {
    const file = await this.saver.findSavedArticleFile(article);
    if (file !== null) {
      return file;
    }

    await this.updateArticleStatus(
      article,
      { saved: false, savedFilePath: undefined },
      false,
    );
    return null;
  }

  private async openSavedArticleFile(file: TFile): Promise<void> {
    try {
      const leaf = this.app.workspace.getLeaf("split");
      await leaf.openFile(file);
      void this.app.workspace.revealLeaf(leaf);

      new Notice(`Opened saved article: ${file.basename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Error opening saved article: ${message}`);
    }
  }

  private async handleOpenSavedArticle(article: FeedItem): Promise<void> {
    if (!article.saved) {
      new Notice("Article is not saved locally");
      return;
    }

    const loadingNotice = new Notice("Opening saved article...", 0);

    try {
      const savedFile = await this.saver.findSavedArticleFile(article);
      if (savedFile) {
        await this.openSavedArticleFile(savedFile);
        loadingNotice.hide();
      } else {
        await this.updateArticleStatus(article, { saved: false }, false);

        if (article.tags) {
          article.tags = article.tags.filter(
            (tag) => tag.name.toLowerCase() !== "saved",
          );
        }

        loadingNotice.hide();
        new Notice("Saved article file not found. Article status updated.");
      }
    } catch (error) {
      loadingNotice.hide();
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Error opening saved article: ${message}`);
    }
  }

  private async handleOpenInReaderView(article: FeedItem): Promise<void> {
    this.selectedArticle = article;

    if (!article.read) {
      await this.updateArticleStatus(article, { read: true }, false);
    }
    await this.openArticleInConfiguredReaderLocation(article);
  }

  private verifySavedArticles(): void {
    const allArticles = this.getFilteredArticles();
    this.saver.verifyAllSavedArticles(allArticles);
  }

  private handleFileDeleted(file: TFile): void {
    const allArticles = this.getAllArticles();
    const affectedArticles = allArticles.filter(
      (article) => article.saved && article.savedFilePath === file.path,
    );

    affectedArticles.forEach((article) => {
      article.saved = false;
      article.savedFilePath = undefined;

      if (article.tags) {
        article.tags = article.tags.filter(
          (tag) => tag.name.toLowerCase() !== "saved",
        );
      }
    });

    if (affectedArticles.length > 0) {
      void this.render();
    }
  }

  private handleFileRenamed(file: TFile, oldPath: string): void {
    const allArticles = this.getAllArticles();
    const affectedArticles = allArticles.filter(
      (article) => article.saved && article.savedFilePath === oldPath,
    );

    affectedArticles.forEach((article) => {
      article.saved = false;
      article.savedFilePath = file.path;

      if (article.tags) {
        article.tags = article.tags.filter(
          (tag) => tag.name.toLowerCase() !== "saved",
        );
      }
    });

    if (affectedArticles.length > 0) {
      void this.render();
    }
  }

  private getAllArticles(): FeedItem[] {
    let allArticles: FeedItem[] = [];
    for (const feed of this.settings.feeds) {
      allArticles = allArticles.concat(feed.items);
    }
    return allArticles;
  }

  private handlePageChange(page: number): void {
    this.setCurrentPageState(page);
    void this.render();
  }

  private handlePageSizeChange(pageSize: number): void {
    this.settings.allArticlesPageSize = pageSize;
    this.settings.unreadArticlesPageSize = pageSize;
    this.settings.readArticlesPageSize = pageSize;
    this.settings.savedArticlesPageSize = pageSize;
    this.settings.starredArticlesPageSize = pageSize;
    this.setCurrentPageState(1);
    void this.plugin.saveSettings();
    void this.render();
  }

  private getCurrentPageSize(): number {
    if (this.currentFolder === "unread")
      return this.settings.unreadArticlesPageSize;
    if (this.currentFolder === "read")
      return this.settings.readArticlesPageSize;
    if (this.currentFolder === "saved")
      return this.settings.savedArticlesPageSize;
    if (this.currentFolder === "starred")
      return this.settings.starredArticlesPageSize;
    return this.settings.allArticlesPageSize;
  }
}
