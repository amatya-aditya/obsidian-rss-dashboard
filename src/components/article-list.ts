import { Notice, Menu, MenuItem, setIcon, Setting } from "obsidian";
import { FeedItem, RssDashboardSettings, Tag } from "../types/types";
import {
	formatDateWithRelative,
	ensureUtf8Meta,
} from "../utils/platform-utils";

const MAX_VISIBLE_TAGS = 6;

function extractDomain(url: string): string {
	try {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname;
		const parts = hostname.split(".");
		if (parts.length >= 2) {
			if (parts.length === 3 && parts[0] === "feeds") {
				return `${parts[1]}.${parts[2]}`;
			} else if (parts.length >= 3) {
				return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
			} else {
				return hostname;
			}
		}
		return hostname;
	} catch {
		const match = url.match(/https?:\/\/([^/?]+)/);
		if (match) {
			const hostname = match[1];
			const parts = hostname.split(".");
			if (parts.length >= 2) {
				if (parts.length === 3 && parts[0] === "feeds") {
					return `${parts[1]}.${parts[2]}`;
				} else if (parts.length >= 3) {
					return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
				} else {
					return hostname;
				}
			}
			return hostname;
		}
		return "";
	}
}

function getFaviconUrl(domain: string): string {
	if (!domain) return "";
	return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=32`;
}

interface ArticleListCallbacks {
	onArticleClick: (article: FeedItem) => void;
	onToggleViewStyle: (style: "list" | "card") => void;
	onRefreshFeeds: () => void;
	onArticleUpdate: (
		article: FeedItem,
		updates: Partial<FeedItem>,
		shouldRerender?: boolean,
	) => void;
	onArticleSave: (article: FeedItem) => void;
	onOpenSavedArticle?: (article: FeedItem) => void;
	onOpenInReaderView?: (article: FeedItem) => void;
	onToggleSidebar: () => void;
	onSortChange: (value: "newest" | "oldest") => void;
	onGroupChange: (value: "none" | "feed" | "date" | "folder") => void;
	onFilterChange: (value: {
		type: string;
		value: unknown;
		checked?: boolean;
		isTag?: boolean;
		logic?: "AND" | "OR";
	}) => void;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
	onMarkAllAsRead?: () => void;
}

export class ArticleList {
	private container: HTMLElement;
	private settings: RssDashboardSettings;
	private title: string;
	private articles: FeedItem[];
	private selectedArticle: FeedItem | null;
	private callbacks: ArticleListCallbacks;
	private refreshButton: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private currentPage: number;
	private totalPages: number;
	private pageSize: number;
	private totalArticles: number;
	private currentFeedUrl: string | null = null;
	private statusFilters: Set<string>;
	private tagFilters: Set<string>;
	private filterLogic: "AND" | "OR";
	private documentListeners: Array<{
		target: Document;
		type: string;
		listener: EventListenerOrEventListenerObject;
	}> = [];

	constructor(
		container: HTMLElement,
		settings: RssDashboardSettings,
		title: string,
		articles: FeedItem[],
		selectedArticle: FeedItem | null,
		callbacks: ArticleListCallbacks,
		currentPage: number,
		totalPages: number,
		pageSize: number,
		totalArticles: number,
		statusFilters: Set<string>,
		tagFilters: Set<string>,
		filterLogic: "AND" | "OR",
		currentFeedUrl?: string | null,
	) {
		this.container = container;
		this.settings = settings;
		this.title = title;
		this.articles = articles;
		this.selectedArticle = selectedArticle;
		this.callbacks = callbacks;
		this.currentPage = currentPage;
		this.totalPages = totalPages;
		this.pageSize = pageSize;
		this.totalArticles = totalArticles;
		this.statusFilters = statusFilters;
		this.tagFilters = tagFilters;
		this.filterLogic = filterLogic;
		this.currentFeedUrl = currentFeedUrl || null;
	}

	public destroy(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		if (this.activePortal) {
			this.activePortal.remove();
			this.activePortal = null;
		}
		this.documentListeners.forEach(({ target, type, listener }) => {
			target.removeEventListener(type, listener);
		});
		this.documentListeners = [];
	}

	private addDocumentListener(
		target: Document,
		type: string,
		listener: EventListenerOrEventListenerObject,
	) {
		target.addEventListener(type, listener);
		const entry = { target, type, listener };
		this.documentListeners.push(entry);
		return () => {
			target.removeEventListener(type, listener);
			this.documentListeners = this.documentListeners.filter(
				(e) => e !== entry,
			);
		};
	}

	render(): void {
		const articlesList = this.container.querySelector(
			".rss-dashboard-articles-list",
		);
		const scrollPosition = articlesList?.scrollTop;

		this.container.empty();

		this.renderHeader();
		this.renderArticles();

		if (articlesList && scrollPosition !== undefined) {
			requestAnimationFrame(() => {
				articlesList.scrollTop = scrollPosition;
			});
		}
	}

	/**
	 * Update filters and re-render only the articles section,
	 * leaving the header (and any open filter menus) intact.
	 */
	public refilter(
		statusFilters: Set<string>,
		tagFilters: Set<string>,
		filterLogic: "AND" | "OR",
		articles: FeedItem[],
	): void {
		this.statusFilters = statusFilters;
		this.tagFilters = tagFilters;
		this.filterLogic = filterLogic;
		this.articles = articles;

		// Update filter badge
		const multiFilterBtn = this.container.querySelector(
			".rss-dashboard-multi-filter-btn",
		);
		if (multiFilterBtn) {
			multiFilterBtn.classList.remove("has-active-filters");
			multiFilterBtn
				.querySelectorAll(".rss-dashboard-filter-badge")
				.forEach((el) => el.remove());

			const count = this.statusFilters.size + this.tagFilters.size;
			if (count > 0) {
				multiFilterBtn.classList.add("has-active-filters");
				multiFilterBtn.createDiv({
					cls: "rss-dashboard-filter-badge",
					text: String(count),
				});
			}
		}

		// Remove both the articles list and the pagination wrapper
		// (pagination is rendered as a sibling to the articles list)
		this.container
			.querySelectorAll(
				".rss-dashboard-articles-list, .rss-dashboard-pagination-wrapper",
			)
			.forEach((el) => el.remove());
		this.renderArticles();
	}

	private renderHeader(): void {
		const articlesHeader = this.container.createDiv({
			cls: "rss-dashboard-articles-header",
		});

		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}

		this.resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const width = entry.contentRect.width;
				// Breakpoint: <= 1024px triggers hamburger menu
				// Must match the CSS breakpoint in controls.css
				if (width <= 1024) {
					articlesHeader.classList.add("is-narrow");
				} else {
					articlesHeader.classList.remove("is-narrow");
				}
			}
		});
		this.resizeObserver.observe(articlesHeader);

		const leftSection = articlesHeader.createDiv({
			cls: "rss-dashboard-header-left",
		});

		const sidebarToggleButton = leftSection.createDiv({
			cls: "rss-dashboard-sidebar-toggle",
			attr: { title: "Toggle sidebar" },
		});
		setIcon(
			sidebarToggleButton,
			this.settings.sidebarCollapsed
				? "panel-left-open"
				: "panel-left-close",
		);
		sidebarToggleButton.addEventListener("click", (e) => {
			e.stopPropagation();
			this.callbacks.onToggleSidebar();
		});

		// Add feed logo if viewing a specific feed
		if (this.currentFeedUrl) {
			const feedIconContainer = leftSection.createDiv({
				cls: "rss-dashboard-header-feed-icon",
			});
			this.renderHeaderFeedIcon(feedIconContainer, this.currentFeedUrl);
		}

		leftSection.createDiv({
			cls: "rss-dashboard-articles-title",
			text: this.title,
		});

		const rightSection = articlesHeader.createDiv({
			cls: "rss-dashboard-header-right",
		});

		const hamburgerMenu = rightSection.createDiv({
			cls: "rss-dashboard-hamburger-menu",
		});

		const hamburgerButton = hamburgerMenu.createDiv({
			cls: "rss-dashboard-hamburger-button",
			attr: { title: "Menu" },
		});
		setIcon(hamburgerButton, "menu");

		const dropdownMenu = hamburgerMenu.createDiv({
			cls: "rss-dashboard-dropdown-menu",
		});

		const dropdownControls = dropdownMenu.createDiv({
			cls: "rss-dashboard-dropdown-controls",
		});

		this.createControls(dropdownControls);

		const desktopControls = rightSection.createDiv({
			cls: "rss-dashboard-desktop-controls",
		});

		this.createControls(desktopControls);

		hamburgerButton.addEventListener("click", (e) => {
			e.stopPropagation();
			dropdownMenu.classList.toggle("active");
			hamburgerButton.classList.toggle("active");
		});

		const handleDocumentClick = (e: Event) => {
			if (!hamburgerMenu.contains(e.target as Node)) {
				dropdownMenu.classList.remove("active");
				hamburgerButton.classList.remove("active");
			}
		};

		this.addDocumentListener(
			this.container.ownerDocument || document,
			"click",
			handleDocumentClick,
		);
	}

	private createControls(container: HTMLElement): void {
		const articleControls = container.createDiv({
			cls: "rss-dashboard-article-controls",
		});

		const multiFilterBtn = articleControls.createEl("button", {
			cls: "rss-dashboard-multi-filter-btn",
		});
		const filterIcon = multiFilterBtn.createDiv();
		setIcon(filterIcon, "filter");
		multiFilterBtn.createSpan({ text: "Filter" });
		if (this.statusFilters.size > 0 || this.tagFilters.size > 0) {
			multiFilterBtn.addClass("has-active-filters");
			multiFilterBtn.createDiv({
				cls: "rss-dashboard-filter-badge",
				text: String(this.statusFilters.size + this.tagFilters.size),
			});
		}

		multiFilterBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.showFiltersMenu(multiFilterBtn);
		});

		// Move age filter into its own space or keep as is?
		// For now, let's keep it but make it smaller or label it better.
		const ageDropdown = articleControls.createEl("select");
		ageDropdown.addClass(
			"rss-dashboard-filter",
			"rss-dashboard-age-filter",
		);
		const ageOptions = {
			"Max age: Unlimited": 0,
			"1 hour": 3600 * 1000,
			"2 hours": 2 * 3600 * 1000,
			"4 hours": 4 * 3600 * 1000,
			"8 hours": 8 * 3600 * 1000,
			"24 hours": 24 * 3600 * 1000,
			"48 hours": 48 * 3600 * 1000,
			"3 days": 3 * 24 * 3600 * 1000,
			"1 week": 7 * 24 * 3600 * 1000,
			"2 weeks": 14 * 24 * 3600 * 1000,
			"1 month": 30 * 24 * 3600 * 1000,
			"2 months": 60 * 24 * 3600 * 1000,
			"6 months": 180 * 24 * 3600 * 1000,
			"1 year": 365 * 24 * 3600 * 1000,
		};

		for (const [text, value] of Object.entries(ageOptions)) {
			ageDropdown.createEl("option", {
				text: text,
				value: String(value),
			});
		}

		const filterValue =
			typeof this.settings.articleFilter.value === "number"
				? this.settings.articleFilter.value
				: 0;
		ageDropdown.value = String(filterValue);

		ageDropdown.addEventListener("change", (e: Event) => {
			const value = Number((e.target as HTMLSelectElement).value);
			this.callbacks.onFilterChange({
				type: value === 0 ? "none" : "age",
				value: value,
			});
		});

		const sortDropdown = articleControls.createEl("select");
		sortDropdown.addClass("rss-dashboard-sort");
		sortDropdown.createEl("option", {
			text: "Sort by newest",
			value: "newest",
		});
		sortDropdown.createEl("option", {
			text: "Sort by oldest",
			value: "oldest",
		});
		sortDropdown.value = this.settings.articleSort;
		sortDropdown.addEventListener("change", (e: Event) => {
			this.callbacks.onSortChange(
				(e.target as HTMLSelectElement).value as "newest" | "oldest",
			);
		});

		const groupDropdown = articleControls.createEl("select");
		groupDropdown.addClass("rss-dashboard-group");
		groupDropdown.createEl("option", {
			text: "No grouping",
			value: "none",
		});
		groupDropdown.createEl("option", {
			text: "Group by feed",
			value: "feed",
		});
		groupDropdown.createEl("option", {
			text: "Group by date",
			value: "date",
		});
		groupDropdown.createEl("option", {
			text: "Group by folder",
			value: "folder",
		});
		groupDropdown.value = this.settings.articleGroupBy;
		groupDropdown.addEventListener("change", (e: Event) => {
			this.callbacks.onGroupChange(
				(e.target as HTMLSelectElement).value as
				| "none"
				| "feed"
				| "date"
				| "folder",
			);
		});

		const viewStyleToggle = articleControls.createDiv({
			cls: "rss-dashboard-view-toggle",
		});

		const listViewButton = viewStyleToggle.createEl("button", {
			cls:
				"rss-dashboard-list-view-button" +
				(this.settings.viewStyle === "list" ? " active" : ""),
		});
		const listIcon = listViewButton.createDiv();
		setIcon(listIcon, "list");
		listViewButton.createSpan({ text: "List" });

		listViewButton.addEventListener("click", () => {
			this.callbacks.onToggleViewStyle("list");
		});

		const cardViewButton = viewStyleToggle.createEl("button", {
			cls:
				"rss-dashboard-card-view-button" +
				(this.settings.viewStyle === "card" ? " active" : ""),
		});
		const cardIcon = cardViewButton.createDiv();
		setIcon(cardIcon, "layout-grid");
		cardViewButton.createSpan({ text: "Card" });

		cardViewButton.addEventListener("click", () => {
			this.callbacks.onToggleViewStyle("card");
		});

		const dashboardRefreshButton = articleControls.createEl("button", {
			cls: "rss-dashboard-refresh-button",
		});
		const refreshIcon = dashboardRefreshButton.createDiv();
		setIcon(refreshIcon, "refresh-cw");
		dashboardRefreshButton.createSpan({ text: "Refresh" });
		dashboardRefreshButton.setAttr("title", "Refresh feeds");

		if (!container.classList.contains("rss-dashboard-dropdown-controls")) {
			this.refreshButton = dashboardRefreshButton;
		}

		dashboardRefreshButton.addEventListener("click", () => {
			this.callbacks.onRefreshFeeds();
		});

		const markAllReadButton = articleControls.createEl("button", {
			cls: "rss-dashboard-mark-all-read-button",
		});
		const markIcon = markAllReadButton.createDiv({
			cls: "rss-dashboard-mark-all-read-icon",
		});
		setIcon(markIcon, "check-circle");
		markAllReadButton.createSpan({
			cls: "rss-dashboard-mark-all-read-text",
			text: "Mark all read",
		});
		markAllReadButton.setAttr(
			"title",
			"Mark all articles in current view as read",
		);

		markAllReadButton.addEventListener("click", () => {
			if (this.callbacks.onMarkAllAsRead) {
				this.callbacks.onMarkAllAsRead();
			}
		});
	}

	private activePortal: HTMLElement | null = null;

	private showFiltersMenu(toggleBtn: HTMLElement): void {
		const targetDocument = toggleBtn.ownerDocument;
		const targetBody = targetDocument.body;

		// Remove any existing menus
		if (this.activePortal) {
			this.activePortal.remove();
			this.activePortal = null;
		}
		targetDocument
			.querySelectorAll(".rss-dashboard-filter-menu-portal")
			.forEach((el) => el.remove());

		const menuPortal = targetBody.createDiv({
			cls: "rss-dashboard-filter-menu rss-dashboard-filter-menu-portal",
		});
		this.activePortal = menuPortal;

		// Logic Toggles: And / Either/Or
		const logicToggles = menuPortal.createDiv({
			cls: "rss-dashboard-filter-logic-toggles",
		});

		const andBtn = logicToggles.createEl("button", {
			cls:
				"rss-dashboard-filter-logic-btn" +
				(this.filterLogic === "AND" ? " active" : ""),
			text: "And",
		});
		const orBtn = logicToggles.createEl("button", {
			cls:
				"rss-dashboard-filter-logic-btn" +
				(this.filterLogic === "OR" ? " active" : ""),
			text: "Either/or",
		});

		andBtn.addEventListener("click", () => {
			this.callbacks.onFilterChange({
				type: "logic",
				value: null,
				logic: "AND",
			});
			menuPortal.remove();
		});

		orBtn.addEventListener("click", () => {
			this.callbacks.onFilterChange({
				type: "logic",
				value: null,
				logic: "OR",
			});
			menuPortal.remove();
		});

		menuPortal.createDiv({ cls: "rss-dashboard-filter-menu-separator" });

		const filterOptions = [
			{ id: "unread", name: "Unread", icon: "circle" },
			{ id: "read", name: "Read", icon: "check-circle" },
			{ id: "saved", name: "Saved", icon: "save" },
			{ id: "starred", name: "Starred", icon: "star" },
			{ id: "podcasts", name: "Podcasts", icon: "mic" },
			{ id: "videos", name: "Videos", icon: "play" },
			{ id: "tagged", name: "Tagged", icon: "tag" },
		];

		filterOptions.forEach((opt) => {
			const item = menuPortal.createDiv({
				cls: "rss-dashboard-filter-menu-item",
			});

			const checkbox = item.createEl("input", {
				attr: { type: "checkbox" },
				cls: "rss-dashboard-filter-checkbox",
			});
			checkbox.checked = this.statusFilters.has(opt.id);

			const iconDiv = item.createDiv({
				cls: "rss-dashboard-filter-menu-icon",
			});
			setIcon(iconDiv, opt.icon);

			item.createDiv({
				cls: "rss-dashboard-filter-menu-text",
				text: opt.name,
			});

			if (opt.id === "tagged") {
				const arrow = item.createDiv({
					cls: "rss-dashboard-filter-menu-arrow",
				});
				setIcon(arrow, "chevron-right");

				// Submenu logic
				item.addEventListener("mouseenter", () => {
					this.showTagsSubMenu(item, menuPortal);
				});
			} else {
				item.addEventListener("mouseenter", () => {
					// Remove submenus if hovering non-tagged items
					menuPortal
						.querySelectorAll(".rss-dashboard-tag-submenu")
						.forEach((el) => el.remove());
				});
			}

			checkbox.addEventListener("change", (e) => {
				e.stopPropagation();
				this.callbacks.onFilterChange({
					type: opt.id,
					value: null,
					checked: checkbox.checked,
				});
			});

			item.addEventListener("click", (e) => {
				if (e.target !== checkbox) {
					checkbox.checked = !checkbox.checked;
					this.callbacks.onFilterChange({
						type: opt.id,
						value: null,
						checked: checkbox.checked,
					});
				}
			});
		});

		// Position the menu
		const rect = toggleBtn.getBoundingClientRect();
		menuPortal.style.top = `${rect.bottom + 5}px`;
		menuPortal.style.left = `${rect.left}px`;

		// Close menu on click outside
		const targetWindow = targetDocument.defaultView || window;
		targetWindow.setTimeout(() => {
			const handleClickOutside = (e: Event) => {
				if (
					!menuPortal.contains(e.target as Node) &&
					!toggleBtn.contains(e.target as Node)
				) {
					menuPortal.remove();
					this.activePortal = null;
					removeListener();
				}
			};
			const removeListener = this.addDocumentListener(
				targetDocument,
				"mousedown",
				handleClickOutside,
			);
		}, 0);
	}

	private showTagsSubMenu(
		parentItem: HTMLElement,
		parentMenu: HTMLElement,
	): void {
		// Remove existing submenus
		parentMenu
			.querySelectorAll(".rss-dashboard-tag-submenu")
			.forEach((el) => el.remove());

		const subMenu = parentMenu.createDiv({
			cls: "rss-dashboard-filter-menu rss-dashboard-tag-submenu",
		});

		if (this.settings.availableTags.length === 0) {
			subMenu.createDiv({
				cls: "rss-dashboard-filter-menu-item empty",
				text: "No tags available",
			});
		}

		this.settings.availableTags.forEach((tag) => {
			const item = subMenu.createDiv({
				cls: "rss-dashboard-filter-menu-item",
			});

			const checkbox = item.createEl("input", {
				attr: { type: "checkbox" },
				cls: "rss-dashboard-filter-checkbox",
			});
			checkbox.checked = this.tagFilters.has(tag.name);

			const colorDot = item.createDiv({
				cls: "rss-dashboard-tag-color-dot",
			});
			colorDot.style.setProperty("--tag-color", tag.color);

			item.createDiv({
				cls: "rss-dashboard-filter-menu-text",
				text: tag.name,
			});

			checkbox.addEventListener("change", (e) => {
				e.stopPropagation();
				this.callbacks.onFilterChange({
					type: tag.name,
					value: null,
					checked: checkbox.checked,
					isTag: true,
				});
			});

			item.addEventListener("click", (e) => {
				if (e.target !== checkbox) {
					checkbox.checked = !checkbox.checked;
					this.callbacks.onFilterChange({
						type: tag.name,
						value: null,
						checked: checkbox.checked,
						isTag: true,
					});
				}
			});
		});

		// Position the submenu using fixed viewport coordinates
		const rect = parentItem.getBoundingClientRect();
		const parentMenuRect = parentMenu.getBoundingClientRect();

		// Start: position fixed, to the right of the parent menu
		let subLeft = parentMenuRect.right + 4;
		let subTop = rect.top;

		subMenu.addClass("rss-dashboard-submenu-fixed");
		subMenu.style.setProperty("--submenu-top", `${subTop}px`);
		subMenu.style.setProperty("--submenu-left", `${subLeft}px`);

		// After the browser renders it, flip left if it goes off-screen
		requestAnimationFrame(() => {
			const subRect = subMenu.getBoundingClientRect();
			if (subRect.right > window.innerWidth) {
				subMenu.style.setProperty(
					"--submenu-left",
					`${parentMenuRect.left - subRect.width - 4}px`,
				);
			}
			if (subRect.bottom > window.innerHeight) {
				subMenu.style.setProperty(
					"--submenu-top",
					`${window.innerHeight - subRect.height - 8}px`,
				);
			}
		});
	}

	private renderArticles(): void {
		const articlesList = this.container.createDiv({
			cls: `rss-dashboard-articles-list rss-dashboard-${this.settings.viewStyle}-view`,
		});

		if (this.articles.length === 0) {
			const emptyState = articlesList.createDiv({
				cls: "rss-dashboard-empty-state",
			});
			const iconDiv = emptyState.createDiv();
			setIcon(iconDiv, "rss");
			iconDiv.addClass("rss-dashboard-empty-state-icon");
			new Setting(emptyState).setName("No articles found").setHeading();
			emptyState.createEl("p", {
				text: "Try refreshing your feeds or adding new ones.",
			});
			return;
		}

		const prevScroll = this.container.scrollTop;

		if (this.settings.articleGroupBy === "none") {
			if (this.settings.viewStyle === "list") {
				this.renderListView(articlesList, this.articles);
			} else {
				this.renderCardView(articlesList, this.articles);
			}
		} else {
			const groupedArticles = this.groupArticles(
				this.articles,
				this.settings.articleGroupBy,
			);
			for (const groupName in groupedArticles) {
				const groupContainer = articlesList.createDiv({
					cls: "rss-dashboard-article-group",
				});
				new Setting(groupContainer).setName(groupName).setHeading();
				const groupArticles = groupedArticles[groupName];
				if (this.settings.viewStyle === "list") {
					this.renderListView(groupContainer, groupArticles);
				} else {
					this.renderCardView(groupContainer, groupArticles);
				}
			}
		}

		const paginationWrapper = this.container.createDiv({
			cls: "rss-dashboard-pagination-wrapper",
		});
		this.renderPagination(
			paginationWrapper,
			this.currentPage,
			this.totalPages,
			this.pageSize,
			this.totalArticles,
		);

		if (this.container) this.container.scrollTop = prevScroll;
	}

	private groupArticles(
		articles: FeedItem[],
		groupBy: "feed" | "date" | "folder" | "none",
	): Record<string, FeedItem[]> {
		if (groupBy === "none") return { "All articles": articles };

		return articles.reduce(
			(acc, article) => {
				let key: string;
				switch (groupBy) {
					case "feed":
						key = article.feedTitle || "Uncategorized";
						break;
					case "date":
						key = formatDateWithRelative(article.pubDate).text;
						break;

					case "folder":
						key =
							this.getFeedFolder(article.feedUrl) ||
							"Uncategorized";
						break;
					default:
						key = "All articles";
				}

				if (!acc[key]) {
					acc[key] = [];
				}
				acc[key].push(article);
				return acc;
			},
			{} as Record<string, FeedItem[]>,
		);
	}

	private getFeedFolder(feedUrl: string): string | undefined {
		const feed = this.settings.feeds.find((f) => f.url === feedUrl);
		return feed?.folder;
	}

	private renderFeedIcon(
		container: HTMLElement,
		feedUrl: string,
		mediaType?: "article" | "video" | "podcast",
	): void {
		const iconContainer = container.createDiv({
			cls: "rss-dashboard-article-feed-icon",
		});

		if (mediaType === "video") {
			setIcon(iconContainer, "play");
			iconContainer.addClass("video");
		} else if (mediaType === "podcast") {
			setIcon(iconContainer, "mic");
			iconContainer.addClass("podcast");
		} else if (this.settings.display.useDomainFavicons) {
			const domain = extractDomain(feedUrl);
			if (domain) {
				const faviconUrl = getFaviconUrl(domain);
				iconContainer.empty();
				const imgEl = iconContainer.createEl("img", {
					attr: {
						src: faviconUrl,
						alt: domain,
					},
					cls: "rss-dashboard-feed-favicon",
				});
				imgEl.onerror = () => {
					iconContainer.empty();
					if (!this.settings.display.hideDefaultRssIcon) {
						setIcon(iconContainer, "rss");
					}
				};
			} else if (!this.settings.display.hideDefaultRssIcon) {
				setIcon(iconContainer, "rss");
			}
		} else if (!this.settings.display.hideDefaultRssIcon) {
			setIcon(iconContainer, "rss");
		}
	}

	private renderHeaderFeedIcon(
		container: HTMLElement,
		feedUrl: string,
	): void {
		const feed = this.settings.feeds.find((f) => f.url === feedUrl);
		const mediaType = feed?.mediaType;

		if (mediaType === "video") {
			setIcon(container, "play");
			container.addClass("video");
		} else if (mediaType === "podcast") {
			setIcon(container, "mic");
			container.addClass("podcast");
		} else if (this.settings.display.useDomainFavicons) {
			const domain = extractDomain(feedUrl);
			if (domain) {
				const faviconUrl = getFaviconUrl(domain);
				const imgEl = container.createEl("img", {
					attr: {
						src: faviconUrl,
						alt: domain,
					},
					cls: "rss-dashboard-header-favicon",
				});
				imgEl.onerror = () => {
					container.empty();
					if (!this.settings.display.hideDefaultRssIcon) {
						setIcon(container, "rss");
					}
				};
			} else if (!this.settings.display.hideDefaultRssIcon) {
				setIcon(container, "rss");
			}
		} else if (!this.settings.display.hideDefaultRssIcon) {
			setIcon(container, "rss");
		}
	}

	private renderListView(container: HTMLElement, articles: FeedItem[]): void {
		for (const article of articles) {
			const articleEl = container.createDiv({
				cls:
					"rss-dashboard-article-item" +
					(this.selectedArticle &&
						article.guid === this.selectedArticle.guid
						? " active"
						: "") +
					(article.read ? " read" : " unread") +
					(article.starred ? " starred" : " unstarred") +
					(article.saved ? " saved" : "") +
					(article.mediaType === "video" ? " video" : "") +
					(article.mediaType === "podcast" ? " podcast" : ""),
				attr: { id: `article-${article.guid}` },
			});

			const contentEl = articleEl.createDiv(
				"rss-dashboard-article-content",
			);

			const mainGrid = contentEl.createDiv("rss-dashboard-article-grid");

			// Top Left: Headline
			const headlineEl = mainGrid.createDiv(
				"rss-dashboard-grid-headline",
			);
			headlineEl.createDiv({
				cls: "rss-dashboard-article-title rss-dashboard-list-title",
				text: article.title,
			});

			// Top Right: Time posted/updated
			const timeEl = mainGrid.createDiv("rss-dashboard-grid-time");
			const dateInfo = formatDateWithRelative(article.pubDate);
			const dateEl = timeEl.createSpan("rss-dashboard-article-date");
			dateEl.textContent = dateInfo.text;
			dateEl.setAttribute("title", dateInfo.title);

			// Bottom Left: Interactive buttons & Tags
			const actionsEl = mainGrid.createDiv("rss-dashboard-grid-actions");
			const actionToolbar = actionsEl.createDiv(
				"rss-dashboard-action-toolbar rss-dashboard-list-toolbar",
			);

			const saveButton = actionToolbar.createDiv({
				cls: `rss-dashboard-save-toggle ${article.saved ? "saved" : ""}`,
				attr: {
					title: article.saved
						? "Click to open saved article"
						: this.settings.articleSaving.saveFullContent
							? "Save full article content to notes"
							: "Save article summary to notes",
				},
			});
			setIcon(saveButton, "save");
			if (!saveButton.querySelector("svg")) {
				saveButton.textContent = "💾";
			}
			saveButton.addEventListener("click", (e) => {
				e.stopPropagation();
				if (article.saved) {
					if (this.callbacks.onOpenSavedArticle) {
						this.callbacks.onOpenSavedArticle(article);
					} else {
						new Notice(
							"Article already saved. Look in your notes.",
						);
					}
				} else {
					if (this.callbacks.onArticleSave) {
						if (saveButton.classList.contains("saving")) {
							return;
						}

						saveButton.classList.add("saving");
						saveButton.setAttribute("title", "Saving article...");

						this.callbacks.onArticleSave(article);
						saveButton.classList.add("saved");
						setIcon(saveButton, "save");
						if (!saveButton.querySelector("svg")) {
							saveButton.textContent = "💾";
						}
						saveButton.classList.remove("saving");
						saveButton.setAttribute(
							"title",
							"Click to open saved article",
						);
					}
				}
			});

			const readToggle = actionToolbar.createDiv({
				cls: `rss-dashboard-read-toggle ${article.read ? "read" : "unread"}`,
				attr: {
					title: article.read ? "Mark as unread" : "Mark as read",
				},
			});
			setIcon(readToggle, article.read ? "check-circle" : "circle");
			readToggle.addEventListener("click", (e) => {
				e.stopPropagation();
				const newReadState = !article.read;

				// Check if auto-hide is enabled and article is being marked as read
				if (
					this.settings.display?.autoHideOnReadToggle &&
					newReadState
				) {
					// Find the article element
					const articleEl = this.container.querySelector(
						`[id="article-${article.guid}"]`,
					) as HTMLElement;

					if (articleEl) {
						// Get duration from settings (default 0ms/instant)
						const duration =
							this.settings.display?.autoHideDuration ?? 0;

						// Add hiding class for animation
						articleEl.classList.add("rss-dashboard-article-hiding");

						// Set custom transition duration via CSS variable
						articleEl.style.setProperty(
							"--hide-duration",
							`${duration}ms`,
						);

						// Wait for animation then update and re-render
						setTimeout(() => {
							this.callbacks.onArticleUpdate(
								article,
								{ read: newReadState },
								true,
							);
						}, duration);
					} else {
						// Fallback to normal behavior
						this.callbacks.onArticleUpdate(
							article,
							{ read: newReadState },
							false,
						);
						readToggle.classList.toggle(
							"read",
							!readToggle.classList.contains("read"),
						);
						readToggle.classList.toggle(
							"unread",
							!readToggle.classList.contains("unread"),
						);
						setIcon(
							readToggle,
							newReadState ? "check-circle" : "circle",
						);
					}
				} else {
					// Normal toggle behavior
					this.callbacks.onArticleUpdate(
						article,
						{ read: newReadState },
						false,
					);
					readToggle.classList.toggle(
						"read",
						!readToggle.classList.contains("read"),
					);
					readToggle.classList.toggle(
						"unread",
						!readToggle.classList.contains("unread"),
					);
					setIcon(
						readToggle,
						newReadState ? "check-circle" : "circle",
					);
				}
			});

			const starToggle = actionToolbar.createDiv({
				cls: `rss-dashboard-star-toggle ${article.starred ? "starred" : "unstarred"}`,
				attr: {
					title: article.starred
						? "Remove from starred items"
						: "Add to starred items",
				},
			});
			const starIcon = starToggle.createSpan({
				cls: "rss-dashboard-star-icon",
			});
			starToggle.appendChild(starIcon);
			setIcon(starIcon, article.starred ? "star" : "star-off");
			if (!starIcon.querySelector("svg")) {
				starIcon.textContent = article.starred ? "★" : "☆";
			}
			starToggle.addEventListener("click", (e) => {
				e.stopPropagation();
				this.callbacks.onArticleUpdate(
					article,
					{ starred: !article.starred },
					false,
				);
				starToggle.classList.toggle(
					"starred",
					!starToggle.classList.contains("starred"),
				);
				starToggle.classList.toggle(
					"unstarred",
					!starToggle.classList.contains("unstarred"),
				);
				const iconEl = starToggle.querySelector(
					".rss-dashboard-star-icon",
				);
				if (iconEl) {
					setIcon(
						iconEl as HTMLElement,
						article.starred ? "star" : "star-off",
					);
					if (!iconEl.querySelector("svg")) {
						iconEl.textContent = article.starred ? "★" : "☆";
					}
				}
			});

			const tagsDropdown = actionToolbar.createDiv({
				cls: "rss-dashboard-tags-dropdown",
			});
			const tagsToggle = tagsDropdown.createDiv({
				cls: "rss-dashboard-tags-toggle",
				attr: { title: "Manage tags" },
			});
			setIcon(tagsToggle, "tag");
			tagsToggle.addEventListener("click", (e) => {
				e.stopPropagation();
				this.createPortalDropdown(
					tagsToggle,
					article,
					(tag, checked) => {
						if (!article.tags) article.tags = [];
						if (checked) {
							if (
								!article.tags.some((t) => t.name === tag.name)
							) {
								article.tags.push({ ...tag });
							}
						} else {
							article.tags = article.tags.filter(
								(t) => t.name !== tag.name,
							);
						}

						const index = this.articles.findIndex(
							(a) => a.guid === article.guid,
						);
						if (index !== -1) {
							this.articles[index] = { ...article };
						}

						if (this.callbacks.onArticleUpdate) {
							this.callbacks.onArticleUpdate(
								article,
								{ tags: [...article.tags] },
								false,
							);
						}

						let articleEl = this.container.querySelector(
							`[id="article-${article.guid}"]`,
						) as HTMLElement;
						if (!articleEl) {
							articleEl = this.container
								.closest(".rss-dashboard-container")
								?.querySelector(
									`[id="article-${article.guid}"]`,
								) as HTMLElement;
						}
						if (!articleEl) {
							articleEl = document.getElementById(
								`article-${article.guid}`,
							) as HTMLElement;
						}
						if (articleEl) {
							articleEl.classList.add(
								"rss-dashboard-tag-change-feedback",
							);
							window.setTimeout(() => {
								articleEl.classList.remove(
									"rss-dashboard-tag-change-feedback",
								);
							}, 200);
							let tagsContainer = articleEl.querySelector(
								".rss-dashboard-article-tags",
							);
							if (!tagsContainer) {
								const cardContent =
									articleEl.querySelector(
										".rss-dashboard-card-content",
									) || articleEl;
								const actionToolbar = cardContent.querySelector(
									".rss-dashboard-action-toolbar",
								);
								if (actionToolbar) {
									tagsContainer = (
										cardContent as HTMLElement
									).createDiv({
										cls: "rss-dashboard-article-tags",
									});
									cardContent.insertBefore(
										tagsContainer,
										actionToolbar,
									);
								}
							} else {
								while (tagsContainer.firstChild) {
									tagsContainer.removeChild(
										tagsContainer.firstChild,
									);
								}
							}
							if (
								tagsContainer &&
								article.tags &&
								article.tags.length > 0
							) {
								const tagsToShow = article.tags.slice(
									0,
									MAX_VISIBLE_TAGS,
								);
								tagsToShow.forEach((tag) => {
									if (tagsContainer) {
										const tagEl = (
											tagsContainer as HTMLElement
										).createDiv({
											cls: "rss-dashboard-article-tag",
											text: tag.name,
										});
										tagEl.style.setProperty(
											"--tag-color",
											tag.color ||
											"var(--interactive-accent)",
										);
									}
								});
								if (
									article.tags.length > MAX_VISIBLE_TAGS &&
									tagsContainer
								) {
									(tagsContainer as HTMLElement).createDiv({
										cls: "rss-dashboard-tag-overflow",
										text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
										attr: {
											title: article.tags
												.slice(MAX_VISIBLE_TAGS)
												.map((t) => t.name)
												.join(", "),
										},
									});
								}
							} else if (tagsContainer) {
								while (tagsContainer.firstChild) {
									tagsContainer.removeChild(
										tagsContainer.firstChild,
									);
								}
							}
							void articleEl.offsetHeight;
						} else {
							const tempIndicator = document.body.createDiv({
								cls: "rss-dashboard-tag-change-notification",
								text: `Tag "${tag.name}" ${checked ? "added" : "removed"}`,
							});
							window.setTimeout(() => {
								if (tempIndicator.parentNode) {
									tempIndicator.parentNode.removeChild(
										tempIndicator,
									);
								}
							}, 1500);
						}
					},
				);
			});

			const articleTags = actionToolbar.createDiv(
				"rss-dashboard-article-tags",
			);
			if (article.tags && article.tags.length > 0) {
				article.tags.forEach((tag) => {
					const tagEl = articleTags.createDiv({
						cls: "rss-dashboard-article-tag",
						text: tag.name,
					});
					tagEl.style.setProperty("--tag-color", tag.color);
				});
			}

			// Bottom Right: Feed Source
			const sourceEl = mainGrid.createDiv("rss-dashboard-grid-source");
			const metaEl = sourceEl.createDiv("rss-dashboard-article-meta");
			this.renderFeedIcon(metaEl, article.feedUrl, article.mediaType);
			metaEl
				.createSpan("rss-dashboard-article-source")
				.setText(article.feedTitle);

			articleEl.addEventListener("click", () => {
				this.callbacks.onArticleClick(article);
			});
			articleEl.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				this.showArticleContextMenu(e, article);
			});
		}
	}

	private renderCardView(container: HTMLElement, articles: FeedItem[]): void {
		for (const article of articles) {
			const card = container.createDiv({
				cls:
					"rss-dashboard-article-card" +
					(this.selectedArticle &&
						article.guid === this.selectedArticle.guid
						? " active"
						: "") +
					(article.read ? " read" : " unread") +
					(article.saved ? " saved" : "") +
					(article.mediaType === "video"
						? " rss-dashboard-youtube-article"
						: "") +
					(article.mediaType === "podcast"
						? " rss-dashboard-podcast-article"
						: ""),
				attr: { id: `article-${article.guid}` },
			});

			const cardContent = card.createDiv({
				cls: "rss-dashboard-card-content",
			});

			cardContent.createDiv({
				cls: "rss-dashboard-article-title",
				text: article.title,
			});

			const articleMeta = cardContent.createDiv({
				cls: "rss-dashboard-article-meta",
			});

			const feedContainer = articleMeta.createDiv({
				cls: "rss-dashboard-article-feed-container",
			});

			this.renderFeedIcon(
				feedContainer,
				article.feedUrl,
				article.mediaType,
			);
			feedContainer.createDiv({
				cls: "rss-dashboard-article-feed",
				text: article.feedTitle,
			});

			let coverImgSrc = article.coverImage;
			if (!coverImgSrc && article.content) {
				const extracted = extractFirstImageSrc(article.content);
				if (extracted) coverImgSrc = extracted;
			}
			if (!coverImgSrc && article.summary) {
				const extracted = extractFirstImageSrc(article.summary);
				if (extracted) coverImgSrc = extracted;
			}

			if (coverImgSrc) {
				const coverContainer = cardContent.createDiv({
					cls:
						"rss-dashboard-cover-container" +
						(article.summary ? " has-summary" : ""),
				});
				const coverImg = coverContainer.createEl("img", {
					cls: "rss-dashboard-cover-image",
					attr: {
						src: coverImgSrc,
						alt: article.title,
					},
				});
				coverImg.onerror = () => {
					coverContainer.remove();
				};

				if (article.summary) {
					const summaryOverlay = coverContainer.createDiv({
						cls: "rss-dashboard-summary-overlay",
					});
					summaryOverlay.textContent = article.summary;
				}
			} else if (article.summary) {
				const summaryOnlyContainer = cardContent.createDiv({
					cls: "rss-dashboard-cover-summary-only",
				});
				summaryOnlyContainer.textContent = article.summary;
			}

			if (article.tags && article.tags.length > 0) {
				const tagsContainer = cardContent.createDiv({
					cls: "rss-dashboard-article-tags",
				});
				const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
				tagsToShow.forEach((tag) => {
					const tagEl = tagsContainer.createDiv({
						cls: "rss-dashboard-article-tag",
						text: tag.name,
					});
					tagEl.style.setProperty("--tag-color", tag.color);
				});
				if (article.tags.length > MAX_VISIBLE_TAGS) {
					const overflowTag = tagsContainer.createDiv({
						cls: "rss-dashboard-tag-overflow",
						text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
					});
					overflowTag.title = article.tags
						.slice(MAX_VISIBLE_TAGS)
						.map((t) => t.name)
						.join(", ");
				}
			}

			const actionToolbar = cardContent.createDiv({
				cls: "rss-dashboard-action-toolbar",
			});

			const saveButton = actionToolbar.createDiv({
				cls: `rss-dashboard-save-toggle ${article.saved ? "saved" : ""}`,
				attr: {
					title: article.saved
						? "Click to open saved article"
						: this.settings.articleSaving.saveFullContent
							? "Save full article content to notes"
							: "Save article summary to notes",
				},
			});
			setIcon(saveButton, "save");
			if (!saveButton.querySelector("svg")) {
				saveButton.textContent = "💾";
			}
			saveButton.addEventListener("click", (e) => {
				e.stopPropagation();
				if (article.saved) {
					if (this.callbacks.onOpenSavedArticle) {
						this.callbacks.onOpenSavedArticle(article);
					} else {
						new Notice(
							"Article already saved. Look in your notes.",
						);
					}
				} else {
					if (this.callbacks.onArticleSave) {
						if (saveButton.classList.contains("saving")) {
							return;
						}

						saveButton.classList.add("saving");
						saveButton.setAttribute("title", "Saving article...");

						this.callbacks.onArticleSave(article);
						saveButton.classList.add("saved");
						setIcon(saveButton, "save");
						if (!saveButton.querySelector("svg")) {
							saveButton.textContent = "💾";
						}
						saveButton.classList.remove("saving");
						saveButton.setAttribute(
							"title",
							"Click to open saved article",
						);
					}
				}
			});

			const readToggle = actionToolbar.createDiv({
				cls: `rss-dashboard-read-toggle ${article.read ? "read" : "unread"}`,
				attr: {
					title: article.read ? "Mark as unread" : "Mark as read",
				},
			});
			setIcon(readToggle, article.read ? "check-circle" : "circle");
			readToggle.addEventListener("click", (e) => {
				e.stopPropagation();
				const newReadState = !article.read;

				// Check if auto-hide is enabled and article is being marked as read
				if (
					this.settings.display?.autoHideOnReadToggle &&
					newReadState
				) {
					// Find the article element
					const articleEl = this.container.querySelector(
						`[id="article-${article.guid}"]`,
					) as HTMLElement;

					if (articleEl) {
						// Get duration from settings (default 0ms/instant)
						const duration =
							this.settings.display?.autoHideDuration ?? 0;

						// Add hiding class for animation
						articleEl.classList.add("rss-dashboard-article-hiding");

						// Set custom transition duration via CSS variable
						articleEl.style.setProperty(
							"--hide-duration",
							`${duration}ms`,
						);

						// Wait for animation then update and re-render
						setTimeout(() => {
							this.callbacks.onArticleUpdate(
								article,
								{ read: newReadState },
								true,
							);
						}, duration);
					} else {
						// Fallback to normal behavior
						this.callbacks.onArticleUpdate(
							article,
							{ read: newReadState },
							false,
						);
						readToggle.classList.toggle(
							"read",
							!readToggle.classList.contains("read"),
						);
						readToggle.classList.toggle(
							"unread",
							!readToggle.classList.contains("unread"),
						);
						setIcon(
							readToggle,
							newReadState ? "check-circle" : "circle",
						);
					}
				} else {
					// Normal toggle behavior
					this.callbacks.onArticleUpdate(
						article,
						{ read: newReadState },
						false,
					);
					readToggle.classList.toggle(
						"read",
						!readToggle.classList.contains("read"),
					);
					readToggle.classList.toggle(
						"unread",
						!readToggle.classList.contains("unread"),
					);
					setIcon(
						readToggle,
						newReadState ? "check-circle" : "circle",
					);
				}
			});

			const starToggle = actionToolbar.createDiv({
				cls: `rss-dashboard-star-toggle ${article.starred ? "starred" : "unstarred"}`,
				attr: {
					title: article.starred
						? "Remove from starred items"
						: "Add to starred items",
				},
			});
			const starIcon = starToggle.createSpan({
				cls: "rss-dashboard-star-icon",
			});
			starToggle.appendChild(starIcon);
			setIcon(starIcon, article.starred ? "star" : "star-off");
			if (!starIcon.querySelector("svg")) {
				starIcon.textContent = article.starred ? "★" : "☆";
			}
			starToggle.addEventListener("click", (e) => {
				e.stopPropagation();
				this.callbacks.onArticleUpdate(
					article,
					{ starred: !article.starred },
					false,
				);
				starToggle.classList.toggle(
					"starred",
					!starToggle.classList.contains("starred"),
				);
				starToggle.classList.toggle(
					"unstarred",
					!starToggle.classList.contains("unstarred"),
				);
				const iconEl = starToggle.querySelector(
					".rss-dashboard-star-icon",
				);
				if (iconEl) {
					setIcon(
						iconEl as HTMLElement,
						article.starred ? "star" : "star-off",
					);
					if (!iconEl.querySelector("svg")) {
						iconEl.textContent = article.starred ? "★" : "☆";
					}
				}
			});

			const tagsDropdown = actionToolbar.createDiv({
				cls: "rss-dashboard-tags-dropdown",
			});
			const tagsToggle = tagsDropdown.createDiv({
				cls: "rss-dashboard-tags-toggle",
				attr: { title: "Manage tags" },
			});
			setIcon(tagsToggle, "tag");

			tagsToggle.addEventListener("click", (e) => {
				e.stopPropagation();
				this.createPortalDropdown(
					tagsToggle,
					article,
					(tag, checked) => {
						if (!article.tags) article.tags = [];
						if (checked) {
							if (
								!article.tags.some((t) => t.name === tag.name)
							) {
								article.tags.push({ ...tag });
							}
						} else {
							article.tags = article.tags.filter(
								(t) => t.name !== tag.name,
							);
						}

						const index = this.articles.findIndex(
							(a) => a.guid === article.guid,
						);
						if (index !== -1) {
							this.articles[index] = { ...article };
						}

						if (this.callbacks.onArticleUpdate) {
							this.callbacks.onArticleUpdate(
								article,
								{ tags: [...article.tags] },
								false,
							);
						}

						let articleEl = this.container.querySelector(
							`[id="article-${article.guid}"]`,
						) as HTMLElement;
						if (!articleEl) {
							articleEl = this.container
								.closest(".rss-dashboard-container")
								?.querySelector(
									`[id="article-${article.guid}"]`,
								) as HTMLElement;
						}
						if (!articleEl) {
							articleEl = document.getElementById(
								`article-${article.guid}`,
							) as HTMLElement;
						}
						if (articleEl) {
							articleEl.classList.add(
								"rss-dashboard-tag-change-feedback",
							);
							window.setTimeout(() => {
								articleEl.classList.remove(
									"rss-dashboard-tag-change-feedback",
								);
							}, 200);
							let tagsContainer = articleEl.querySelector(
								".rss-dashboard-article-tags",
							);
							if (!tagsContainer) {
								const cardContent =
									articleEl.querySelector(
										".rss-dashboard-card-content",
									) || articleEl;
								const actionToolbar = cardContent.querySelector(
									".rss-dashboard-action-toolbar",
								);
								if (actionToolbar) {
									tagsContainer = (
										cardContent as HTMLElement
									).createDiv({
										cls: "rss-dashboard-article-tags",
									});
									cardContent.insertBefore(
										tagsContainer,
										actionToolbar,
									);
								}
							} else {
								while (tagsContainer.firstChild) {
									tagsContainer.removeChild(
										tagsContainer.firstChild,
									);
								}
							}
							if (
								tagsContainer &&
								article.tags &&
								article.tags.length > 0
							) {
								const tagsToShow = article.tags.slice(
									0,
									MAX_VISIBLE_TAGS,
								);
								tagsToShow.forEach((tag) => {
									if (tagsContainer) {
										const tagEl = (
											tagsContainer as HTMLElement
										).createDiv({
											cls: "rss-dashboard-article-tag",
											text: tag.name,
										});
										tagEl.style.setProperty(
											"--tag-color",
											tag.color ||
											"var(--interactive-accent)",
										);
									}
								});
								if (
									article.tags.length > MAX_VISIBLE_TAGS &&
									tagsContainer
								) {
									(tagsContainer as HTMLElement).createDiv({
										cls: "rss-dashboard-tag-overflow",
										text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
										attr: {
											title: article.tags
												.slice(MAX_VISIBLE_TAGS)
												.map((t) => t.name)
												.join(", "),
										},
									});
								}
							} else if (tagsContainer) {
								while (tagsContainer.firstChild) {
									tagsContainer.removeChild(
										tagsContainer.firstChild,
									);
								}
							}
							void articleEl.offsetHeight;
						} else {
							const tempIndicator = document.body.createDiv({
								cls: "rss-dashboard-tag-change-notification",
								text: `Tag "${tag.name}" ${checked ? "added" : "removed"}`,
							});
							window.setTimeout(() => {
								if (tempIndicator.parentNode) {
									tempIndicator.parentNode.removeChild(
										tempIndicator,
									);
								}
							}, 1500);
						}
					},
				);
			});

			const dateEl = actionToolbar.createDiv({
				cls: "rss-dashboard-article-date",
			});
			const dateInfo = formatDateWithRelative(article.pubDate);
			dateEl.textContent = dateInfo.text;
			dateEl.setAttribute("title", dateInfo.title);

			card.addEventListener("click", () => {
				this.callbacks.onArticleClick(article);
			});

			card.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				this.showArticleContextMenu(e, article);
			});
		}
	}

	private renderPagination(
		container: HTMLElement,
		currentPage: number,
		totalPages: number,
		pageSize: number,
		totalArticles: number,
	): void {
		const paginationContainer = container.createDiv({
			cls: "rss-dashboard-pagination",
		});

		const prevButton = paginationContainer.createEl("button", {
			cls: "rss-dashboard-pagination-btn prev",
			text: "<",
		});
		prevButton.disabled = currentPage === 1;
		prevButton.onclick = () => this.callbacks.onPageChange(currentPage - 1);

		const maxPagesToShow = 7;
		let startPage = Math.max(1, currentPage - 3);
		let endPage = Math.min(totalPages, currentPage + 3);
		if (endPage - startPage < maxPagesToShow - 1) {
			if (startPage === 1) {
				endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
			} else if (endPage === totalPages) {
				startPage = Math.max(1, endPage - maxPagesToShow + 1);
			}
		}
		if (startPage > 1) {
			this.createPageButton(paginationContainer, 1, currentPage);
			if (startPage > 2) {
				paginationContainer.createEl("span", {
					text: "...",
					cls: "rss-dashboard-pagination-ellipsis",
				});
			}
		}
		for (let i = startPage; i <= endPage; i++) {
			this.createPageButton(paginationContainer, i, currentPage);
		}
		if (endPage < totalPages) {
			if (endPage < totalPages - 1) {
				paginationContainer.createEl("span", {
					text: "...",
					cls: "rss-dashboard-pagination-ellipsis",
				});
			}
			this.createPageButton(paginationContainer, totalPages, currentPage);
		}

		const nextButton = paginationContainer.createEl("button", {
			cls: "rss-dashboard-pagination-btn next",
			text: ">",
		});
		nextButton.disabled = currentPage === totalPages;
		nextButton.onclick = () => this.callbacks.onPageChange(currentPage + 1);

		const pageSizeDropdown = paginationContainer.createEl("select", {
			cls: "rss-dashboard-page-size-dropdown",
		});
		const pageSizeOptions = [10, 20, 40, 50, 60, 80, 100];
		for (const size of pageSizeOptions) {
			const opt = pageSizeDropdown.createEl("option", {
				text: String(size),
				value: String(size),
			});
			if (size === pageSize) opt.selected = true;
		}
		pageSizeDropdown.onchange = (e) => {
			const size = Number((e.target as HTMLSelectElement).value);
			this.callbacks.onPageSizeChange(size);
		};

		const startIdx = (currentPage - 1) * pageSize + 1;
		const endIdx = Math.min(currentPage * pageSize, totalArticles);
		paginationContainer.createEl("span", {
			cls: "rss-dashboard-pagination-results",
			text: `Results: ${startIdx} - ${endIdx} of ${totalArticles}`,
		});
	}

	private createPageButton(
		container: HTMLElement,
		page: number,
		currentPage: number,
	) {
		const btn = container.createEl("button", {
			cls:
				"rss-dashboard-pagination-btn" +
				(page === currentPage ? " active" : ""),
			text: String(page),
		});
		btn.disabled = page === currentPage;
		btn.onclick = () => this.callbacks.onPageChange(page);
	}

	private showArticleContextMenu(event: MouseEvent, article: FeedItem): void {
		const menu = new Menu();

		if (article.saved) {
			menu.addItem((item: MenuItem) => {
				item.setTitle("Open saved article")
					.setIcon("file-text")
					.onClick(() => {
						if (this.callbacks.onOpenSavedArticle) {
							this.callbacks.onOpenSavedArticle(article);
						}
					});
			});

			menu.addItem((item: MenuItem) => {
				item.setTitle("Open in reader view")
					.setIcon("book-open")
					.onClick(() => {
						if (this.callbacks.onOpenInReaderView) {
							this.callbacks.onOpenInReaderView(article);
						}
					});
			});

			menu.addSeparator();
		}

		menu.addItem((item: MenuItem) => {
			item.setTitle("Open in browser")
				.setIcon("globe-2")
				.onClick(() => {
					window.open(article.link, "_blank");
				});
		});

		menu.addItem((item: MenuItem) => {
			item.setTitle("Open in split view")
				.setIcon("panel-left")
				.onClick(() => {
					this.callbacks.onArticleClick(article);
				});
		});

		menu.addSeparator();

		menu.addItem((item: MenuItem) => {
			item.setTitle(article.read ? "Mark as unread" : "Mark as read")
				.setIcon(article.read ? "circle" : "check-circle")
				.onClick(() => {
					this.callbacks.onArticleUpdate(
						article,
						{ read: !article.read },
						false,
					);
				});
		});

		menu.addItem((item: MenuItem) => {
			item.setTitle(article.starred ? "Unstar articles" : "Star articles")
				.setIcon("star")
				.onClick(() => {
					this.callbacks.onArticleUpdate(
						article,
						{ starred: !article.starred },
						false,
					);
				});
		});

		if (!article.saved) {
			menu.addSeparator();
			menu.addItem((item: MenuItem) => {
				item.setTitle(
					this.settings.articleSaving.saveFullContent
						? "Save full article"
						: "Save article summary",
				)
					.setIcon("save")
					.onClick(() => {
						this.callbacks.onArticleSave(article);
					});
			});
		}

		menu.showAtMouseEvent(event);
	}

	private createPortalDropdown(
		toggleElement: HTMLElement,
		article: FeedItem,
		onTagChange: (tag: Tag, checked: boolean) => void,
	): void {
		const targetDocument = toggleElement.ownerDocument;
		const targetBody = targetDocument.body;

		targetDocument
			.querySelectorAll(".rss-dashboard-tags-dropdown-content-portal")
			.forEach((el) => {
				(el as HTMLElement).parentNode?.removeChild(el);
			});

		const portalDropdown = targetBody.createDiv({
			cls: "rss-dashboard-tags-dropdown-content rss-dashboard-tags-dropdown-content-portal",
		});

		for (const tag of this.settings.availableTags) {
			const tagItem = portalDropdown.createDiv({
				cls: "rss-dashboard-tag-item",
			});
			const hasTag =
				article.tags?.some((t) => t.name === tag.name) || false;

			const tagCheckbox = tagItem.createEl("input", {
				attr: { type: "checkbox" },
				cls: "rss-dashboard-tag-checkbox",
			});
			tagCheckbox.checked = hasTag;

			const tagLabel = tagItem.createDiv({
				cls: "rss-dashboard-tag-label",
				text: tag.name,
			});
			tagLabel.style.setProperty("--tag-color", tag.color);

			tagCheckbox.addEventListener("change", (e) => {
				e.stopPropagation();
				const isChecked = (e.target as HTMLInputElement).checked;

				tagCheckbox.checked = isChecked;

				tagItem.classList.add("rss-dashboard-tag-item-processing");

				onTagChange(tag, isChecked);

				window.setTimeout(() => {
					tagItem.classList.remove(
						"rss-dashboard-tag-item-processing",
					);
				}, 200);
			});

			tagItem.appendChild(tagCheckbox);
			tagItem.appendChild(tagLabel);
			portalDropdown.appendChild(tagItem);
		}

		targetBody.appendChild(portalDropdown);
		portalDropdown.addClass("rss-dashboard-tags-dropdown-content-portal");

		const rect = toggleElement.getBoundingClientRect();
		const dropdownRect = portalDropdown.getBoundingClientRect();
		const appContainer =
			this.container.closest(".workspace-leaf-content") || targetBody;
		const appContainerRect = appContainer.getBoundingClientRect();

		let left = rect.right;
		let top = rect.top;

		if (left + dropdownRect.width > appContainerRect.right) {
			left = rect.left - dropdownRect.width;
		}

		if (left < appContainerRect.left) {
			left = appContainerRect.left;
		}

		const targetWindow = targetDocument.defaultView || window;
		if (top + dropdownRect.height > targetWindow.innerHeight) {
			top = targetWindow.innerHeight - dropdownRect.height - 5;
		}

		portalDropdown.style.left = `${left}px`;
		portalDropdown.style.top = `${top}px`;

		targetWindow.setTimeout(() => {
			const handleClickOutside = (ev: MouseEvent) => {
				if (
					portalDropdown &&
					!portalDropdown.contains(ev.target as Node)
				) {
					portalDropdown.remove();
					targetDocument.removeEventListener(
						"mousedown",
						handleClickOutside,
					);
				}
			};
			targetDocument.addEventListener("mousedown", handleClickOutside);
		}, 0);
	}

	updateRefreshButtonText(text: string): void {
		if (this.refreshButton) {
			this.refreshButton.setAttribute("title", text);
		}
	}
}

function extractFirstImageSrc(html: string): string | null {
	const htmlWithMeta = ensureUtf8Meta(html);
	const parser = new DOMParser();
	const doc = parser.parseFromString(htmlWithMeta, "text/html");
	const img = doc.querySelector("img");
	return img ? img.getAttribute("src") : null;
}
