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
import { stripNonContentHtmlNodes } from "../utils/html-text";
import { normalizeSubstackImageUrl } from "../utils/substack-image-url";
import { resolveDisplayDate } from "./feed-parser/feed-retention";
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
  ARTICLE_FILENAME_STEPS,
  ARTICLE_SAVER_NOTE_STEPS,
} from "./article-template/call-site-steps";
import {
  addMathTurndownRule,
  protectMathForMarkdown,
} from "../utils/math-rendering";
import { firstNonFormulaImageUrl } from "../utils/image-url-utils";
import { escapeYamlDoubleQuoted } from "../utils/yaml-escape";
import { ensureVaultFolder } from "../utils/vault-files";
import { ONE_SAVE_OVERRIDE_TEMPLATE_ID } from "../utils/saved-template-utils";

const MAX_FILENAME_LENGTH = 100;
const RSS_FALLBACK_MARKER =
  "> RSS feed content shown because the full article could not be fetched.";

export function sanitizeFilename(name: string): string {
  return sanitizeFilenameStem(name) || "Untitled Article";
}

function sanitizeFilenameStem(name: string): string {
  const stem = name
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();
  return /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i.test(stem)
    ? ""
    : stem;
}

export function buildArticleFilename(
  item: FeedItem,
  filenamePattern: string | undefined,
  addSavedTag: boolean,
  useFirstSeenDateFallback = false,
): string {
  if (filenamePattern?.trim()) {
    const tags = (item.tags ?? [])
      .map((tag) => tag.name)
      .filter((tag) => tag.trim() !== "");
    const date = resolveDisplayDate(item, useFirstSeenDateFallback);
    const rendered = renderArticleTemplate(
      filenamePattern.trim().replace(/{{content}}/g, ""),
      ARTICLE_FILENAME_STEPS,
      buildArticleTemplateValues(item, {
        articleDate: date ?? new Date(),
        now: () => new Date(),
        tagNames: addSavedTag ? withSavedTagName(tags) : tags,
        image: normalizeSubstackImageUrl(
          firstNonFormulaImageUrl([
            item.coverImage,
            item.image,
            item.itunes?.image?.href,
            item.enclosure?.type?.startsWith("image/")
              ? item.enclosure.url
              : "",
          ]) || "",
        ),
      }),
    );
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

  async saveArticleWithContentPolicy(
    item: FeedItem,
    customFolder?: string,
    customTemplate?: string,
    savedTemplate?: SavedTemplate,
    readerContent?: {
      fetchAttempted: boolean;
      markdown?: string;
      fetchedHtml?: string;
    },
  ): Promise<TFile | null> {
    if (!this.settings.saveFullContent) {
      return this.saveArticle(
        item,
        customFolder,
        customTemplate,
        undefined,
        savedTemplate,
      );
    }

    if (readerContent?.fetchAttempted) {
      const markdown = readerContent.markdown?.trim()
        ? readerContent.markdown
        : readerContent.fetchedHtml
          ? this.convertFetchedHtmlToMarkdown(item, readerContent.fetchedHtml)
          : "";
      if (markdown.trim()) {
        return this.saveArticle(
          item,
          customFolder,
          customTemplate,
          markdown,
          savedTemplate,
        );
      }
      return this.saveWithRssFallback(
        item,
        customFolder,
        customTemplate,
        savedTemplate,
      );
    }

    return this.saveArticleWithFullContent(
      item,
      customFolder,
      customTemplate,
      savedTemplate,
    );
  }

  private async saveWithRssFallback(
    item: FeedItem,
    customFolder?: string,
    customTemplate?: string,
    savedTemplate?: SavedTemplate,
  ): Promise<TFile | null> {
    const feedContent = this.getPreferredFeedHtml(item);
    const fallbackMarkdown = feedContent
      ? this.htmlToMarkdown(feedContent)
      : "";
    const fallbackWithHero = fallbackMarkdown
      ? this.prependFallbackHeroMarkdown(item, fallbackMarkdown, feedContent)
      : "";
    const markedFallback = fallbackWithHero.trim()
      ? `${RSS_FALLBACK_MARKER}\n\n${fallbackWithHero}`
      : undefined;
    return this.saveArticle(
      item,
      customFolder,
      customTemplate,
      markedFallback,
      savedTemplate,
    );
  }

  private convertFetchedHtmlToMarkdown(item: FeedItem, html: string): string {
    return this.prependFallbackHeroMarkdown(
      item,
      this.htmlToMarkdown(html),
      html,
    );
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
        return await this.saveWithRssFallback(
          item,
          customFolder,
          customTemplate,
          savedTemplate,
        );
      }

      const markdownContent = this.convertFetchedHtmlToMarkdown(
        item,
        fetchResult.content,
      );
      if (!markdownContent.trim()) {
        loadingNotice.hide();
        new Notice(
          "Could not fetch full content. Saving with available content.",
        );
        return await this.saveWithRssFallback(
          item,
          customFolder,
          customTemplate,
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

  /** A saved template owns the whole file, so only the unsaved paths get plugin frontmatter. */
  private shouldAddFrontmatter(
    template: string,
    savedTemplate: SavedTemplate | undefined,
  ): boolean {
    const templateOwnsFile =
      savedTemplate !== undefined &&
      savedTemplate.id !== ONE_SAVE_OVERRIDE_TEMPLATE_ID;
    return (
      this.settings.includeFrontmatter &&
      !templateOwnsFile &&
      !template.trim().startsWith("---")
    );
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
      if (this.shouldAddFrontmatter(template, savedTemplate)) {
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

  async findSavedArticleFile(article: FeedItem): Promise<TFile | null> {
    const savedPath = article.savedFilePath;
    if (!article.saved || !savedPath?.trim()) return null;

    const savedFile = this.app.vault.getAbstractFileByPath(savedPath);
    return savedFile instanceof TFile ? savedFile : null;
  }

  getFilenamePreview(
    item: FeedItem,
    folder: string,
    filenamePattern?: string,
  ): string {
    const normalizedFolder = this.normalizePath(folder);
    const recordedPath = this.normalizePath(item.savedFilePath || "");
    const recordedFile = recordedPath
      ? this.app.vault.getAbstractFileByPath(recordedPath)
      : null;
    if (recordedFile instanceof TFile) return recordedFile.path;

    const legacyPath = item.saved ? this.buildSavedArticleFilePath(item) : "";
    const legacyFile = legacyPath
      ? this.app.vault.getAbstractFileByPath(legacyPath)
      : null;
    if (legacyFile instanceof TFile) return legacyFile.path;

    const filename = buildArticleFilename(
      item,
      filenamePattern,
      this.settings.addSavedTag,
      this.getUseFirstSeenDateFallback(),
    );
    return findAvailableArticlePath(this.app, normalizedFolder, filename);
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
