import { App, Notice, TFile } from "obsidian";
import TurndownService from "turndown";
import {
  ArticleSavingSettings,
  Feed,
  FeedItem,
  SavedTemplate,
} from "../types/types";
import { type FullArticleFetchResult } from "../utils/fetch-helpers";
import {
  fetchFullArticleContentWithOutcome,
  RESTRICTED_ARTICLE_NOTICE,
  RESTRICTED_ARTICLE_REASON,
} from "../utils/full-article-fetch";
import { ensureUtf8Meta } from "../utils/platform-utils";
import { withSavedTagName } from "../utils/tag-utils";
import { isLikelyVideoItem } from "../utils/video-detection";
import {
  htmlToReadableText,
  stripNonContentHtmlNodes,
} from "../utils/html-text";
import { normalizeSubstackImageUrl } from "../utils/substack-image-url";
import {
  buildArticleTemplateValues,
  itemTagNames,
  resolveSavedArticleDate,
  type ArticleTemplateValues,
} from "./article-template/template-values";
import {
  applyArticleMetadata,
  feedLanguageFor,
} from "../utils/article-metadata-persistence";
import { renderArticleTemplate } from "./article-template/render-template";
import {
  ARTICLE_SAVER_FRONTMATTER_STEPS,
  ARTICLE_SAVER_NOTE_STEPS,
} from "./article-template/call-site-steps";
import {
  addMathTurndownRule,
  protectMathForMarkdown,
} from "../utils/math-rendering";
import { firstNonFormulaImageUrl } from "../utils/image-url-utils";
import { escapeYamlDoubleQuoted } from "../utils/yaml-escape";
import { ensureVaultFolder } from "../utils/vault-files";

const MAX_FILENAME_LENGTH = 100;

export function sanitizeFilename(name: string): string {
  return sanitizeFilenameStem(name) || "Untitled Article";
}

function sanitizeFilenameStem(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();
}

type MomentFactory = (input: Date) => { format: (fmt: string) => string };

function formatMoment(date: Date, formatStr: string): string {
  return (moment as unknown as MomentFactory)(date).format(formatStr);
}

function replaceFilenameDatePlaceholders(
  pattern: string,
  date: Date,
  firstSeenMs?: number,
): string {
  const firstSeenDate =
    typeof firstSeenMs === "number" && !Number.isNaN(firstSeenMs)
      ? new Date(firstSeenMs)
      : date;
  const longDate = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const firstSeen = firstSeenDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const now = new Date();
  return pattern
    .replace(/{{date}}/g, () => longDate)
    .replace(/{{dateShort}}/g, () => formatMoment(date, "YYYY-MM-DD"))
    .replace(/{{isoDate}}/g, () => date.toISOString())
    .replace(/{{isoDateTime}}/g, () => date.toISOString())
    .replace(/{{firstSeen}}/g, () => firstSeen)
    .replace(/{{firstSeenISO}}/g, () =>
      formatMoment(firstSeenDate, "YYYY-MM-DD"),
    )
    .replace(/{{saveDate}}/g, () => formatMoment(now, "YYYY-MM-DD"))
    .replace(/{{saveTime12}}/g, () => formatMoment(now, "hh:mm A"))
    .replace(/{{saveTime24}}/g, () => formatMoment(now, "HH:mm"))
    .replace(/{{date:(.+?)}}/g, (_match, format: string) =>
      formatMoment(date, format),
    );
}

export function buildArticleFilename(
  item: FeedItem,
  filenamePattern: string | undefined,
  addSavedTag: boolean,
  useFirstSeenDateFallback = false,
): string {
  if (filenamePattern?.trim()) {
    const date =
      resolveDisplayDate(item, useFirstSeenDateFallback) ?? new Date();
    const tags = (item.tags ?? [])
      .map((tag) => tag.name)
      .filter((tag) => tag.trim() !== "");
    const rendered = replaceFilenameDatePlaceholders(
      filenamePattern.trim(),
      date,
      item.firstSeenMs,
    )
      .replace(/{{title}}/g, () => item.title)
      .replace(/{{link}}/g, () => item.link)
      .replace(/{{author}}/g, () => item.author || "")
      .replace(/{{source}}/g, () => item.feedTitle)
      .replace(/{{feedTitle}}/g, () => item.feedTitle)
      .replace(/{{summary}}/g, () => item.summary || "")
      .replace(/{{tags}}/g, () =>
        (addSavedTag ? withSavedTagName(tags) : tags).join(", "),
      )
      .replace(/{{guid}}/g, () => item.guid)
      .replace(/{{image}}/g, () =>
        normalizeSubstackImageUrl(
          firstNonFormulaImageUrl([
            item.coverImage,
            item.image,
            item.itunes?.image?.href,
            item.enclosure?.type?.startsWith("image/")
              ? item.enclosure.url
              : "",
          ]) || "",
        ),
      )
      .replace(/{{content}}/g, "");
    const safeName = sanitizeFilenameStem(rendered);
    if (safeName) return safeName;
  }
  return sanitizeFilename(item.title);
}

export function findAvailableArticlePath(
  app: App,
  folder: string,
  filename: string,
): string {
  const pathFor = (stem: string) =>
    folder ? `${folder}/${stem}.md` : `${stem}.md`;
  let candidate = filename;
  let suffix = 2;
  while (app.vault.getAbstractFileByPath(pathFor(candidate)) !== null) {
    const suffixText = ` ${suffix}`;
    const shortened = filename
      .slice(0, MAX_FILENAME_LENGTH - suffixText.length)
      .trim();
    candidate = `${shortened}${suffixText}`;
    suffix += 1;
  }
  return pathFor(candidate);
}

export class ArticleSaver {
  private app: App;
  private settings: ArticleSavingSettings;
  private turndownService: TurndownService;
  private corsProxyUrl: string | undefined;
  private getUseFirstSeenDateFallback: () => boolean;
  /** The feeds, for an item's feed-level language (#246). */
  private getFeeds: () => readonly Feed[];

  constructor(
    app: App,
    settings: ArticleSavingSettings,
    corsProxyUrl?: string,
    getUseFirstSeenDateFallback: () => boolean = () => false,
    getFeeds: () => readonly Feed[] = () => [],
  ) {
    this.app = app;
    this.settings = settings;
    this.corsProxyUrl = corsProxyUrl;
    this.getUseFirstSeenDateFallback = getUseFirstSeenDateFallback;
    this.getFeeds = getFeeds;
    this.turndownService = new TurndownService();
    addMathTurndownRule(this.turndownService);
  }

  private cleanHtml(html: string): string {
    try {
      const htmlWithMeta = ensureUtf8Meta(html);
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlWithMeta, "text/html");

      const elementsToRemove = doc.querySelectorAll(
        "script, style, iframe, noscript, template, svg, link, meta, base, object, embed, .ad, .ads, .advertisement, " +
          "div[class*='ad-'], div[id*='ad-'], div[class*='ads-'], div[id*='ads-']",
      );
      elementsToRemove.forEach((el) => el.remove());

      doc.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src");
        if (src && !src.startsWith("http") && !src.startsWith("data:")) {
          if (src.startsWith("/")) {
            const baseUrl = new URL(location.href);
            img.setAttribute("src", `${baseUrl.origin}${src}`);
          }
        }

        if (!img.hasAttribute("alt")) {
          img.setAttribute("alt", "Image");
        }
      });

      doc.querySelectorAll("a").forEach((link) => {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      });

      doc.querySelectorAll("table").forEach((table) => {
        table.classList.add("markdown-compatible-table");
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }

  private getPreferredFeedHtml(item: FeedItem): string {
    return item.content || item.description || item.summary || "";
  }

  private shouldPreferFeedHtml(item: FeedItem, feedHtml: string): boolean {
    if (!feedHtml) return false;

    if (item.link) {
      try {
        const host = new URL(item.link).hostname.toLowerCase();
        if (host === "substack.com" || host.endsWith(".substack.com")) {
          return true;
        }
      } catch {
        // Fall through to markup-based detection.
      }
    }

    const lower = feedHtml.toLowerCase();
    return (
      lower.includes('data-component-name="image2todom"') ||
      lower.includes('class="image-link image2 is-viewable-img"') ||
      lower.includes("substackcdn.com/image/fetch/")
    );
  }

  private getReadableTextLength(html: string): number {
    return htmlToReadableText(html).length;
  }

  private normalizeBlockLinksForMarkdown(html: string): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      doc.querySelectorAll("a").forEach((link) => {
        const href = link.getAttribute("href") || "";
        const hasInlineImage = !!link.querySelector("img, picture img");
        const hasBlockContent = !!link.querySelector(
          "address, article, aside, blockquote, br, dd, div, dl, dt, figcaption, figure, footer, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, ul",
        );
        if (!hasBlockContent && !hasInlineImage) return;

        link.querySelectorAll("br").forEach((br) => {
          br.replaceWith(doc.createTextNode(" "));
        });

        const label = (link.textContent || "").replace(/\s+/g, " ").trim();
        if (label) {
          link.textContent = label;
          return;
        }

        if (hasInlineImage) {
          const fragment = doc.win.createFragment();
          while (link.firstChild) {
            fragment.appendChild(link.firstChild);
          }

          if (href) {
            link.setAttribute("href", normalizeSubstackImageUrl(href));
          }

          link.replaceWith(fragment);
        }
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }

  private getFallbackHeroUrl(item: FeedItem): string {
    const enclosureImageUrl =
      item.enclosure?.type?.startsWith("image/") && item.enclosure.url
        ? item.enclosure.url
        : "";

    const heroUrl = firstNonFormulaImageUrl([
      item.coverImage,
      item.image,
      item.itunes?.image?.href,
      enclosureImageUrl,
    ]);

    return normalizeSubstackImageUrl((heroUrl || "").trim());
  }

  private htmlAlreadyContainsImage(html: string, imageUrl: string): boolean {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return Array.from(doc.querySelectorAll("img")).some(
        (img) =>
          normalizeSubstackImageUrl(img.getAttribute("src") || "") === imageUrl,
      );
    } catch {
      return false;
    }
  }

  private prependFallbackHeroHtml(item: FeedItem, html: string): string {
    if (!html) return html;

    const heroUrl = this.getFallbackHeroUrl(item);
    if (!heroUrl) return html;
    if (this.htmlAlreadyContainsImage(html, heroUrl)) return html;

    return `<p><img src="${heroUrl}" alt="Hero image" /></p>${html}`;
  }

  private prependFallbackHeroMarkdown(
    item: FeedItem,
    markdown: string,
    sourceHtml: string,
  ): string {
    if (!markdown) return markdown;

    const heroUrl = this.getFallbackHeroUrl(item);
    if (!heroUrl) return markdown;

    if (this.htmlAlreadyContainsImage(sourceHtml, heroUrl)) {
      return markdown;
    }

    if (markdown.includes(heroUrl)) {
      return markdown;
    }

    return `![Hero image](${heroUrl})\n\n${markdown}`;
  }

  private htmlToMarkdown(html: string): string {
    const cleaned = stripNonContentHtmlNodes(html);
    const normalized = this.normalizeBlockLinksForMarkdown(cleaned);
    return this.turndownService.turndown(protectMathForMarkdown(normalized));
  }

  /** The values this saver's templates fill, built separately for each template render to preserve clock timing. */
  private buildTemplateValues(item: FeedItem): ArticleTemplateValues {
    const articleDate = resolveSavedArticleDate(
      item,
      this.getUseFirstSeenDateFallback(),
    );
    const tagNames = itemTagNames(item);

    return buildArticleTemplateValues(item, {
      articleDate: Number.isNaN(articleDate.getTime())
        ? new Date()
        : articleDate,
      now: () => new Date(),
      tagNames: this.settings.addSavedTag
        ? withSavedTagName(tagNames)
        : tagNames,
      image: () => this.getFallbackHeroUrl(item),
      feedLanguage: feedLanguageFor(this.getFeeds(), item),
    });
  }

  private generateFrontmatter(item: FeedItem): string {
    let frontmatter = this.settings.frontmatterTemplate;

    if (!frontmatter) {
      frontmatter = `---
        title: "{{title}}"
        date: "{{date}}"
        tags: [{{tags}}]
        source: "{{source}}"
        link: "{{link}}"
        author: "{{author}}"
        feedTitle: "{{feedTitle}}"
        guid: "{{guid}}"
        ---`;
    }

    frontmatter = renderArticleTemplate(
      frontmatter,
      ARTICLE_SAVER_FRONTMATTER_STEPS,
      this.buildTemplateValues(item),
    );

    if (item.mediaType === "video" && item.videoId) {
      const injection = `mediaType: video\nvideoId: "${escapeYamlDoubleQuoted(item.videoId)}"\n`;
      frontmatter = frontmatter.replace(/^---\r?\n/, (m) => `${m}${injection}`);
    } else if (item.mediaType === "podcast" && item.audioUrl) {
      const injection = `mediaType: podcast\naudioUrl: "${escapeYamlDoubleQuoted(item.audioUrl)}"\n`;
      frontmatter = frontmatter.replace(/^---\r?\n/, (m) => `${m}${injection}`);
    }

    return frontmatter.endsWith("\n") ? frontmatter : `${frontmatter}\n`;
  }

  private sanitizeFilename(name: string): string {
    return sanitizeFilename(name);
  }

  private applyTemplate(
    item: FeedItem,
    template: string,
    rawContent?: string,
  ): string {
    const content = rawContent
      ? rawContent
      : this.prependFallbackHeroHtml(
          item,
          this.cleanHtml(this.getPreferredFeedHtml(item)),
        );

    return renderArticleTemplate(
      template,
      ARTICLE_SAVER_NOTE_STEPS,
      this.buildTemplateValues(item),
      content,
    );
  }

  private normalizePath(path: string): string {
    if (!path || path.trim() === "") {
      return "";
    }

    return path
      .replace(/[\\:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[/\s]+|[/\s]+$/g, "");
  }

  private isMissingPathError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error);

    return (
      message.includes("enoent") ||
      message.includes("enonet") ||
      message.includes("no such file")
    );
  }

  /**
   * Makes sure the save folder exists and returns its path as it is on disk,
   * which may differ in case from `folderPath` (see `ensureVaultFolder`).
   */
  private async ensureFolderExists(folderPath: string): Promise<string> {
    const cleanPath = this.normalizePath(folderPath);
    if (!cleanPath) {
      return "";
    }

    try {
      return await ensureVaultFolder(this.app, cleanPath);
    } catch {
      throw new Error(`Failed to create folder: ${cleanPath}`);
    }
  }

  async fetchFullArticleContent(url: string): Promise<string> {
    const result = await this.fetchArticleContentWithOutcome(url);
    return result.content;
  }

  private async fetchArticleContentWithOutcome(
    url: string,
  ): Promise<FullArticleFetchResult> {
    return fetchFullArticleContentWithOutcome(url, this.corsProxyUrl);
  }

  async saveArticleWithFullContent(
    item: FeedItem,
    customFolder?: string,
    customTemplate?: string,
    savedTemplate?: SavedTemplate,
  ): Promise<TFile | null> {
    try {
      if (isLikelyVideoItem(item)) {
        return await this.saveArticle(
          item,
          customFolder,
          customTemplate,
          undefined,
          savedTemplate,
        );
      }

      const loadingNotice = new Notice("Fetching full article content...", 0);

      const fetchResult = await this.fetchArticleContentWithOutcome(item.link);
      const feedContent = this.getPreferredFeedHtml(item);

      if (!fetchResult.content) {
        loadingNotice.hide();
        if (fetchResult.failureType === "restricted") {
          new Notice(RESTRICTED_ARTICLE_NOTICE);
          // Mark the item for inline banner
          item.restrictedReason = RESTRICTED_ARTICLE_REASON;
        } else {
          new Notice(
            "Could not fetch full content. Saving with available content.",
          );
        }
        const fallbackMarkdown = feedContent
          ? this.htmlToMarkdown(feedContent)
          : undefined;
        const fallbackWithHero = fallbackMarkdown
          ? this.prependFallbackHeroMarkdown(
              item,
              fallbackMarkdown,
              feedContent,
            )
          : undefined;
        return await this.saveArticle(
          item,
          customFolder,
          customTemplate,
          fallbackWithHero,
          savedTemplate,
        );
      }

      applyArticleMetadata(
        item,
        fetchResult.pageMetadata,
        fetchResult.content,
        undefined,
        feedLanguageFor(this.getFeeds(), item),
      );

      const fetchedTextLength = this.getReadableTextLength(fetchResult.content);
      const feedTextLength = this.getReadableTextLength(feedContent);
      const contentSource = this.shouldPreferFeedHtml(item, feedContent)
        ? feedContent || fetchResult.content
        : feedContent && feedTextLength > fetchedTextLength
          ? feedContent
          : fetchResult.content;
      const markdownContent = this.prependFallbackHeroMarkdown(
        item,
        this.htmlToMarkdown(contentSource),
        contentSource,
      );
      loadingNotice.hide();

      return await this.saveArticle(
        item,
        customFolder,
        customTemplate,
        markdownContent,
        savedTemplate,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Error saving article with full content: ${message}`);
      return await this.saveArticle(
        item,
        customFolder,
        customTemplate,
        undefined,
        savedTemplate,
      );
    }
  }

  async saveArticle(
    item: FeedItem,
    customFolder?: string,
    customTemplate?: string,
    rawContent?: string,
    savedTemplate?: SavedTemplate,
  ): Promise<TFile | null> {
    try {
      let folder =
        customFolder !== undefined
          ? customFolder
          : savedTemplate?.defaultFolder || this.settings.defaultFolder || "";
      folder = this.normalizePath(folder);

      if (folder && folder.trim() !== "") {
        folder = await this.ensureFolderExists(folder);
      }

      const template = savedTemplate
        ? (customTemplate ?? savedTemplate.template)
        : customTemplate ||
          this.settings.defaultTemplate ||
          "# {{title}}\n\n{{content}}\n\n[Source]({{link}})";

      let contentToWrite = "";
      const templateHasFrontmatter = template.trim().startsWith("---");
      if (this.settings.includeFrontmatter && !templateHasFrontmatter) {
        contentToWrite += this.generateFrontmatter(item);
      }

      contentToWrite += this.applyTemplate(item, template, rawContent);

      const filename = buildArticleFilename(
        item,
        savedTemplate?.filenamePattern,
        this.settings.addSavedTag,
        this.getUseFirstSeenDateFallback(),
      );
      const recordedFile =
        item.saved && item.savedFilePath
          ? this.app.vault.getAbstractFileByPath(
              this.normalizePath(item.savedFilePath),
            )
          : null;
      const legacyPath =
        item.saved && !(recordedFile instanceof TFile)
          ? this.buildSavedArticleFilePath(item)
          : "";
      const legacyFile = legacyPath
        ? this.app.vault.getAbstractFileByPath(legacyPath)
        : null;
      const existingSavedFile =
        recordedFile instanceof TFile
          ? recordedFile
          : legacyFile instanceof TFile
            ? legacyFile
            : null;
      const filePath = existingSavedFile
        ? existingSavedFile.path
        : findAvailableArticlePath(this.app, folder, filename);

      let file: TFile;
      try {
        if (existingSavedFile) {
          await this.app.vault.modify(existingSavedFile, contentToWrite);
          file = existingSavedFile;
        } else {
          file = await this.app.vault.create(filePath, contentToWrite);
        }
      } catch (error) {
        if (existingSavedFile || !(folder && this.isMissingPathError(error))) {
          throw error;
        }

        await this.ensureFolderExists(folder);
        file = await this.app.vault.create(filePath, contentToWrite);
      }

      item.saved = true;
      item.savedFilePath = filePath;

      if (
        this.settings.addSavedTag &&
        (!item.tags || !item.tags.some((t) => t.name.toLowerCase() === "saved"))
      ) {
        const savedTag = { name: "Saved", color: "#3498db" };
        if (!item.tags) item.tags = [savedTag];
        else item.tags.push(savedTag);
      }

      new Notice(
        "Article saved. Click/tap the icon again to open the article in your vault.",
      );
      return file;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Error saving article: ${message}`);
      return null;
    }
  }

  async fixSavedFilePaths(articles: FeedItem[]): Promise<void> {
    for (const article of articles) {
      if (!article.saved || !article.savedFilePath) continue;

      const oldPath = article.savedFilePath;
      const normalizedPath = this.normalizePath(oldPath);
      if (oldPath === normalizedPath) continue;

      if (this.app.vault.getAbstractFileByPath(normalizedPath) !== null) {
        article.savedFilePath = normalizedPath;
        continue;
      }

      const file = this.app.vault.getAbstractFileByPath(oldPath);
      if (!(file instanceof TFile)) {
        article.saved = false;
        article.savedFilePath = undefined;
        if (article.tags) {
          article.tags = article.tags.filter(
            (tag) => tag.name.toLowerCase() !== "saved",
          );
        }
        continue;
      }

      try {
        const normalizedFolder = this.normalizePath(
          this.settings.defaultFolder || "",
        );
        const filename = sanitizeFilename(article.title);
        const newName = `${filename}.md`;
        const newPath =
          normalizedFolder && normalizedFolder.trim() !== ""
            ? `${normalizedFolder}/${newName}`
            : newName;

        await this.app.fileManager.renameFile(file, newPath);
        article.savedFilePath = newPath;
      } catch {
        article.saved = false;
        article.savedFilePath = undefined;
        if (article.tags) {
          article.tags = article.tags.filter(
            (tag) => tag.name.toLowerCase() !== "saved",
          );
        }
      }
    }
  }

  verifySavedArticle(article: FeedItem): boolean {
    if (!article.saved || !article.savedFilePath) {
      return false;
    }

    try {
      const file = this.app.vault.getAbstractFileByPath(article.savedFilePath);
      if (file !== null) {
        return true;
      }

      article.saved = false;
      article.savedFilePath = undefined;

      if (article.tags) {
        article.tags = article.tags.filter(
          (tag) => tag.name.toLowerCase() !== "saved",
        );
      }

      return false;
    } catch {
      return false;
    }
  }

  verifyAllSavedArticles(articles: FeedItem[]): void {
    articles
      .filter((article) => article.saved)
      .forEach((article) => {
        this.verifySavedArticle(article);
      });
  }

  checkSavedFileExists(item: FeedItem): boolean {
    if (!item.saved) {
      return false;
    }

    try {
      const savedPath = this.normalizePath(item.savedFilePath || "");
      if (savedPath) {
        const savedFile = this.app.vault.getAbstractFileByPath(savedPath);
        if (savedFile instanceof TFile) {
          if (item.savedFilePath !== savedPath) {
            item.savedFilePath = savedPath;
          }
          return true;
        }
      }

      const fallbackPath = this.buildSavedArticleFilePath(item);
      if (!fallbackPath) {
        return false;
      }

      const fallbackFile = this.app.vault.getAbstractFileByPath(fallbackPath);
      if (fallbackFile instanceof TFile) {
        item.savedFilePath = fallbackPath;
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async findSavedArticleFile(article: FeedItem): Promise<TFile | null> {
    if (!article.saved) {
      return null;
    }

    const savedPath = this.normalizePath(article.savedFilePath || "");
    if (savedPath) {
      const savedFile = this.app.vault.getAbstractFileByPath(savedPath);
      if (savedFile instanceof TFile) {
        if (article.savedFilePath !== savedPath) {
          article.savedFilePath = savedPath;
        }
        return savedFile;
      }
    }

    const fallbackPath = this.buildSavedArticleFilePath(article);
    if (!fallbackPath) {
      return null;
    }

    const fallbackFile = this.app.vault.getAbstractFileByPath(fallbackPath);
    if (fallbackFile instanceof TFile) {
      article.savedFilePath = fallbackPath;
      return fallbackFile;
    }

    return null;
  }

  private buildSavedArticleFilePath(item: FeedItem): string {
    const folder = this.normalizePath(this.settings.defaultFolder || "");
    const filename = this.sanitizeFilename(item.title);

    if (!filename) {
      return "";
    }

    return folder ? `${folder}/${filename}.md` : `${filename}.md`;
  }
}
