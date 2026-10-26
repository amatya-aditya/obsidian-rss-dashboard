import { App, setIcon, Setting } from "obsidian";
import { AccessibleModal } from "../utils/accessible-modal";
import { FeedMetadata } from "../types/discover-types";
import { fetchFeedXml } from "../services/feed-parser";
import {
  parseFeedPreviewXml,
  sanitizeFeedPreviewText,
  type FeedPreviewArticle,
} from "./feed-preview-parser";

export class FeedPreviewModal extends AccessibleModal {
  private feed: FeedMetadata;
  private articles: FeedPreviewArticle[] = [];
  private isLoading = true;
  private error: string | null = null;

  private corsProxyEnabled: boolean;

  constructor(app: App, feed: FeedMetadata, corsProxyEnabled: boolean = true) {
    super(app);
    this.feed = feed;
    this.corsProxyEnabled = corsProxyEnabled;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClasses([
      "rss-dashboard-modal",
      "rss-dashboard-modal-container",
      "feed-preview-modal",
    ]);
    contentEl.empty();

    this.renderHeader(contentEl);
    void this.loadFeedPreview();
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: "feed-preview-header" });

    const titleSection = header.createDiv({
      cls: "feed-preview-title-section",
    });

    const logoContainer = titleSection.createDiv({
      cls: "feed-preview-logo-container",
    });
    if (this.feed.imageUrl) {
      logoContainer.createEl("img", {
        cls: "feed-preview-logo",
        attr: { src: this.feed.imageUrl },
      });
    } else {
      logoContainer.createDiv({
        cls: "feed-preview-initials",
        text: this.getInitials(this.feed.title),
      });
    }

    const titleInfo = titleSection.createDiv({
      cls: "feed-preview-title-info",
    });
    const titleSetting = new Setting(titleInfo)
      .setName(this.feed.title)
      .setHeading();
    titleSetting.settingEl.addClass("feed-preview-title");
    titleInfo.createEl("p", { text: this.feed.url, cls: "feed-preview-url" });

    if (this.feed.summary) {
      titleInfo.createEl("p", {
        text: this.feed.summary,
        cls: "feed-preview-summary",
      });
    }

    const metaContainer = header.createDiv({ cls: "feed-preview-meta" });

    if (this.feed.type) {
      const typeEl = metaContainer.createDiv({ cls: "feed-preview-type" });
      typeEl.textContent = this.feed.type;
    }

    if (this.feed.domain.length > 0) {
      const categories = metaContainer.createDiv({
        cls: "feed-preview-categories",
      });
      this.feed.domain.forEach((category) => {
        const categoryEl = categories.createDiv({
          cls: "feed-preview-category",
          text: category,
        });
        categoryEl.style.setProperty("--tag-color", this.getTagColor(category));
      });
    }

    if (this.feed.tags.length > 0) {
      const tags = metaContainer.createDiv({ cls: "feed-preview-tags" });
      this.feed.tags.forEach((tag) => {
        const tagEl = tags.createDiv({ cls: "feed-preview-tag", text: tag });
        tagEl.style.setProperty("--tag-color", this.getTagColor(tag));
      });
    }
  }

  private async loadFeedPreview(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      const xmlString = await fetchFeedXml(
        this.feed.url,
        this.corsProxyEnabled,
      );
      this.articles = this.parseFeedXml(xmlString);

      this.renderContent();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.renderError();
    } finally {
      this.isLoading = false;
    }
  }

  private parseFeedXml(xmlString: string): FeedPreviewArticle[] {
    return parseFeedPreviewXml(xmlString);
  }

  private sanitizeText(text: string): string {
    return sanitizeFeedPreviewText(text);
  }

  private renderError(): void {
    const container = this.contentEl;
    const errorEl = container.createDiv({ cls: "feed-preview-error" });
    setIcon(errorEl, "alert-triangle");
    errorEl.appendText(` Error: ${this.error}`);

    const retryBtn = errorEl.createEl("button", { cls: "mod-cta" });
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      void this.loadFeedPreview();
    });
  }

  private renderContent(): void {
    const container = this.contentEl;

    if (this.articles.length === 0) {
      const emptyEl = container.createDiv({ cls: "feed-preview-empty" });
      setIcon(emptyEl, "rss");
      emptyEl.appendText(" No articles found in this feed");
      return;
    }

    const contentSection = container.createDiv({ cls: "feed-preview-content" });

    const header = contentSection.createDiv({
      cls: "feed-preview-articles-header",
    });
    const headerSetting = new Setting(header)
      .setName(`Latest ${this.articles.length} articles`)
      .setHeading();
    headerSetting.settingEl.addClass("feed-preview-articles-title");

    const grid = contentSection.createDiv({ cls: "feed-preview-grid" });

    this.articles.forEach((article) => {
      this.renderArticleCard(grid, article);
    });
  }

  private renderArticleCard(
    container: HTMLElement,
    article: FeedPreviewArticle,
  ): void {
    const card = container.createDiv({ cls: "feed-preview-article-card" });

    if (article.image) {
      const imageContainer = card.createDiv({
        cls: "feed-preview-article-image-container",
      });
      const img = imageContainer.createEl("img", {
        cls: "feed-preview-article-image",
        attr: { src: article.image },
      });
      img.addEventListener("error", () => {
        imageContainer.remove();
      });
    }

    const content = card.createDiv({ cls: "feed-preview-article-content" });

    const title = content.createEl("h4", {
      text: article.title,
      cls: "feed-preview-article-title",
    });
    title.addEventListener("click", () => {
      activeWindow.open(article.link, "_blank");
    });

    if (article.description) {
      content.createDiv({
        text:
          article.description.length > 150
            ? article.description.substring(0, 150) + "..."
            : article.description,
        cls: "feed-preview-article-description",
      });
    }

    const meta = content.createDiv({ cls: "feed-preview-article-meta" });

    if (article.author) {
      const author = meta.createDiv({ cls: "feed-preview-article-author" });
      setIcon(author, "user");
      author.appendText(` ${article.author}`);
    }

    if (article.pubDate) {
      const date = meta.createDiv({ cls: "feed-preview-article-date" });
      setIcon(date, "calendar");
      const pubDate = new Date(article.pubDate);
      const formattedDate = pubDate.toLocaleDateString();
      date.appendText(` ${formattedDate}`);
    }
  }

  private getInitials(title: string): string {
    const words = title.split(" ");
    const firstWord = words[0] ?? "";
    const secondWord = words[1] ?? "";
    if (words.length > 1) {
      return `${firstWord[0] ?? ""}${secondWord[0] ?? ""}`.toUpperCase();
    } else if (words.length === 1 && firstWord.length > 1) {
      return `${firstWord[0] ?? ""}${firstWord[1] ?? ""}`.toUpperCase();
    } else if (words.length === 1 && firstWord.length === 1) {
      return (firstWord[0] ?? "").toUpperCase();
    }
    return "NA";
  }

  private getTagColor(tag: string): string {
    let hash = 0;
    if (tag.length === 0) return "hsl(0, 0%, 80%)";
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 75%)`;
  }

  onClose() {
    this.contentEl.empty();
  }
}
