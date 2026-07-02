import { App, Notice, TFile, moment } from "obsidian";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { ArticleSavingSettings, FeedItem } from "../types/types";
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

export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || "Untitled Article";
}

export class ArticleSaver {
  private app: App;
  private settings: ArticleSavingSettings;
  private turndownService: TurndownService;
  private corsProxyUrl: string | undefined;

  constructor(
    app: App,
    settings: ArticleSavingSettings,
    corsProxyUrl?: string,
  ) {
    this.app = app;
    this.settings = settings;
    this.corsProxyUrl = corsProxyUrl;
    this.turndownService = new TurndownService();

    this.turndownService.addRule("math", {
      filter: (node: Node) =>
        node.nodeName === "SPAN" &&
        (node as Element).classList.contains("math"),
      replacement: (_content: string, node: Node) => node.textContent || "",
    });
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
          const fragment = doc.createDocumentFragment();
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

    const heroUrl =
      item.coverImage ||
      item.image ||
      item.itunes?.image?.href ||
      enclosureImageUrl ||
      "";

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
    return this.turndownService.turndown(normalized);
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

    const tagNames = (item.tags ?? [])
      .map((tag) => tag.name)
      .filter(
        (name): name is string =>
          typeof name === "string" && name.trim() !== "",
      );

    if (this.settings.addSavedTag) {
      tagNames.splice(0, tagNames.length, ...withSavedTagName(tagNames));
    }

    const tagsString = tagNames.join(", ");

    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();

    frontmatter = this.replaceDatePlaceholders(frontmatter, pubDate)
      .replace(/{{title}}/g, item.title)
      .replace(/{{tags}}/g, tagsString)
      .replace(/{{source}}/g, item.feedTitle)
      .replace(/{{link}}/g, item.link)
      .replace(/{{author}}/g, item.author || "")
      .replace(/{{feedTitle}}/g, item.feedTitle)
      .replace(/{{guid}}/g, item.guid)
      .replace(/{{image}}/g, this.getFallbackHeroUrl(item));

    if (item.mediaType === "video" && item.videoId) {
      const injection = `mediaType: video\nvideoId: "${item.videoId}"\n`;
      frontmatter = frontmatter.replace(/^---\r?\n/, (m) => `${m}${injection}`);
    } else if (item.mediaType === "podcast" && item.audioUrl) {
      const injection = `mediaType: podcast\naudioUrl: "${item.audioUrl}"\n`;
      frontmatter = frontmatter.replace(/^---\r?\n/, (m) => `${m}${injection}`);
    }

    return frontmatter.endsWith("\n") ? frontmatter : `${frontmatter}\n`;
  }

  private sanitizeFilename(name: string): string {
    return sanitizeFilename(name);
  }

  private formatMoment(date: Date, formatStr: string): string {
    type MomentFactory = (input: Date) => { format: (fmt: string) => string };
    return (moment as unknown as MomentFactory)(date).format(formatStr);
  }

  private replaceDatePlaceholders(text: string, date: Date): string {
    const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const isoDateTime = validDate.toISOString();

    const longFormattedDate = validDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let replaced = text
      .replace(/{{date}}/g, longFormattedDate)
      .replace(/{{dateShort}}/g, this.formatMoment(validDate, "YYYY-MM-DD"))
      .replace(/{{isoDate}}/g, isoDateTime)
      .replace(/{{isoDateTime}}/g, isoDateTime);

    // Handle dynamic formats: {{date:FORMAT}}
    replaced = replaced.replace(
      /{{date:(.+?)}}/g,
      (_match: string, format: string) => {
        return this.formatMoment(validDate, format);
      },
    );

    return replaced;
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

    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();

    const tagNames = (item.tags ?? [])
      .map((tag) => tag.name)
      .filter(
        (name): name is string =>
          typeof name === "string" && name.trim() !== "",
      );
    const tagsString = this.settings.addSavedTag
      ? withSavedTagName(tagNames).join(", ")
      : tagNames.join(", ");

    const replacedWithDates = this.replaceDatePlaceholders(template, pubDate);

    return replacedWithDates
      .replace(/{{title}}/g, item.title)
      .replace(/{{link}}/g, item.link)
      .replace(/{{author}}/g, item.author || "")
      .replace(/{{source}}/g, item.feedTitle)
      .replace(/{{feedTitle}}/g, item.feedTitle)
      .replace(/{{summary}}/g, item.summary || "")
      .replace(/{{content}}/g, content)
      .replace(/{{tags}}/g, tagsString)
      .replace(/{{guid}}/g, item.guid)
      .replace(/{{image}}/g, this.getFallbackHeroUrl(item));
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

  private async ensureFolderExists(folderPath: string): Promise<void> {
    if (!folderPath || folderPath.trim() === "") {
      return;
    }

    const cleanPath = this.normalizePath(folderPath);
    if (!cleanPath) {
      return;
    }

    try {
      const parts = cleanPath.split("/").filter((part) => part.trim() !== "");
      let currentPath = "";

      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (this.app.vault.getAbstractFileByPath(currentPath) === null) {
          await this.app.vault.createFolder(currentPath);
        }
      }
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

  private extractContentFromDocument(doc: Document, url: string): string {
    if (typeof Readability !== "undefined") {
      const article = new Readability(doc).parse();
      const content = article?.content || "";
      return this.convertRelativeUrlsInContent(content, url);
    }

    const mainContent = doc.querySelector(
      "main, article, .content, .post-content, .entry-content, .article-content, .full-text",
    );
    if (mainContent) {
      return this.convertRelativeUrlsInContent(
        new XMLSerializer().serializeToString(mainContent),
        url,
      );
    }

    const contentSelectors = [
      ".article-body",
      ".article-text",
      ".fulltext",
      ".full-text",
      ".content-body",
      ".main-content",
      'section[role="main"]',
      ".article",
    ];

    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        return this.convertRelativeUrlsInContent(
          new XMLSerializer().serializeToString(element),
          url,
        );
      }
    }

    return this.convertRelativeUrlsInContent(
      new XMLSerializer().serializeToString(doc.body),
      url,
    );
  }

  private convertRelativeUrlsInContent(
    content: string,
    baseUrl: string,
  ): string {
    if (!content || !baseUrl) return content;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");

      doc.querySelectorAll("img").forEach((img) => {
        let src = img.getAttribute("src");

        const dataAttrs = img.getAttribute("data-attrs");
        if (dataAttrs) {
          try {
            const attrs = JSON.parse(dataAttrs) as { src?: string };
            if (attrs.src && typeof attrs.src === "string") {
              src = attrs.src;
            }
          } catch {
            // ignore
          }
        }

        if (src) {
          img.setAttribute(
            "src",
            this.convertToAbsoluteUrl(src.trim(), baseUrl),
          );
        }

        const srcset = img.getAttribute("srcset");
        if (srcset) {
          img.setAttribute("srcset", this.processSrcset(srcset, baseUrl));
        }

        [
          "data-src",
          "data-srcset",
          "data-original",
          "data-delayed-url",
        ].forEach((attrName) => {
          const val = img.getAttribute(attrName);
          if (!val) return;

          if (attrName.includes("srcset")) {
            img.setAttribute(attrName, this.processSrcset(val, baseUrl));
          } else {
            img.setAttribute(
              attrName,
              this.convertToAbsoluteUrl(val.trim(), baseUrl),
            );
          }
        });
      });

      doc.querySelectorAll("source").forEach((source) => {
        const srcset = source.getAttribute("srcset");
        if (srcset) {
          source.setAttribute("srcset", this.processSrcset(srcset, baseUrl));
        }

        const dataSrcset = source.getAttribute("data-srcset");
        if (dataSrcset) {
          source.setAttribute(
            "data-srcset",
            this.processSrcset(dataSrcset, baseUrl),
          );
        }
      });

      doc.querySelectorAll("a").forEach((a) => {
        const href = a.getAttribute("href");
        if (href) {
          a.setAttribute("href", this.convertToAbsoluteUrl(href, baseUrl));
        }
      });

      doc.querySelectorAll("iframe").forEach((iframe) => {
        const src = iframe.getAttribute("src");
        if (src) {
          iframe.setAttribute("src", this.convertToAbsoluteUrl(src, baseUrl));
        }
      });

      return doc.body.innerHTML;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        "[RSS Dashboard] Failed to convert relative URLs in ArticleSaver:",
        errorMessage,
      );
      return content;
    }
  }

  private convertToAbsoluteUrl(relativeUrl: string, baseUrl: string): string {
    if (!relativeUrl || !baseUrl) return relativeUrl;

    if (relativeUrl.startsWith("app://")) {
      return relativeUrl.replace("app://", "https://");
    }

    if (relativeUrl.startsWith("//")) {
      return `https:${relativeUrl}`;
    }

    if (
      relativeUrl.startsWith("http://") ||
      relativeUrl.startsWith("https://")
    ) {
      return relativeUrl;
    }

    try {
      const base = new URL(baseUrl);

      if (relativeUrl.startsWith("/")) {
        return `${base.protocol}//${base.host}${relativeUrl}`;
      }

      return new URL(relativeUrl, base).href;
    } catch {
      return relativeUrl;
    }
  }

  private processSrcset(srcset: string, baseUrl: string): string {
    if (!srcset) return "";

    return srcset
      .split(/,\s+|,(?=https?:|\/\/)/)
      .map((part) => {
        const trimmedPart = part.trim();
        const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w|\s+\d+x)?$/);
        if (urlMatch) {
          const url = urlMatch[1];
          const sizeDescriptor = urlMatch[2] || "";
          return (
            this.convertToAbsoluteUrl(url.trim(), baseUrl) + sizeDescriptor
          );
        }
        return trimmedPart;
      })
      .join(", ");
  }

  async saveArticleWithFullContent(
    item: FeedItem,
    customFolder?: string,
    customTemplate?: string,
  ): Promise<TFile | null> {
    try {
      if (isLikelyVideoItem(item)) {
        return await this.saveArticle(item, customFolder, customTemplate);
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
        );
      }

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
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Error saving article with full content: ${message}`);
      return await this.saveArticle(item, customFolder, customTemplate);
    }
  }

  async saveArticle(
    item: FeedItem,
    customFolder?: string,
    customTemplate?: string,
    rawContent?: string,
  ): Promise<TFile | null> {
    try {
      let folder = customFolder || this.settings.defaultFolder || "";
      folder = this.normalizePath(folder);

      if (folder && folder.trim() !== "") {
        await this.ensureFolderExists(folder);
      }

      const filename = sanitizeFilename(item.title);
      const filePath =
        folder && folder.trim() !== ""
          ? `${folder}/${filename}.md`
          : `${filename}.md`;

      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile instanceof TFile) {
        try {
          await this.app.fileManager.trashFile(existingFile);
        } catch (error) {
          if (!this.isMissingPathError(error)) {
            throw error;
          }
        }
      } else if (existingFile !== null) {
        throw new Error(
          `Cannot save article because ${filePath} exists and is not a file.`,
        );
      }

      const template =
        customTemplate ||
        this.settings.defaultTemplate ||
        "# {{title}}\n\n{{content}}\n\n[Source]({{link}})";

      let contentToWrite = "";
      const templateHasFrontmatter = template.trim().startsWith("---");
      if (this.settings.includeFrontmatter && !templateHasFrontmatter) {
        contentToWrite += this.generateFrontmatter(item);
      }

      contentToWrite += this.applyTemplate(item, template, rawContent);

      let file: TFile;
      try {
        file = await this.app.vault.create(filePath, contentToWrite);
      } catch (error) {
        if (!(folder && this.isMissingPathError(error))) {
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
