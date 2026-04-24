import { App, Notice, TFile, moment } from "obsidian";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { ArticleSavingSettings, FeedItem } from "../types/types";
import { fetchWithProxyFallback } from "../utils/fetch-helpers";
import { ensureUtf8Meta } from "../utils/platform-utils";
import { withSavedTagName } from "../utils/tag-utils";

export function sanitizeFilename(name: string): string {
    const sanitized = name
      .replace(/[\\/:*?"<>|#^[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const words = sanitized.split(" ");
    const shortened = words.slice(0, 5).join(" ");
    return shortened.substring(0, 50);
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
        "script, style, iframe, .ad, .ads, .advertisement, " +
          "div[class*='ad-'], div[id*='ad-'], div[class*='ads-'], div[id*='ads-']",
      );
      elementsToRemove.forEach((el) => el.remove());

      doc.querySelectorAll("svg").forEach((el) => el.remove());

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

      return new XMLSerializer().serializeToString(doc.body);
    } catch {
      return html;
    }
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
      .replace(/{{guid}}/g, item.guid);

    if (item.mediaType === "video" && item.videoId) {
      const injection = `mediaType: video\nvideoId: "${item.videoId}"\n`;
      frontmatter = frontmatter.replace(/^---\r?\n/, (m) => `${m}${injection}`);
    } else if (item.mediaType === "podcast" && item.audioUrl) {
      const injection = `mediaType: podcast\naudioUrl: "${item.audioUrl}"\n`;
      frontmatter = frontmatter.replace(/^---\r?\n/, (m) => `${m}${injection}`);
    }

    return frontmatter.endsWith("\n") ? frontmatter : `${frontmatter}\n`;
  }

  private formatMoment(date: Date, formatStr: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    return (moment as any)(date).format(formatStr);
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
    replaced = replaced.replace(/{{date:(.+?)}}/g, (_match: string, format: string) => {
      return this.formatMoment(validDate, format);
    });

    return replaced;
  }

  private applyTemplate(
    item: FeedItem,
    template: string,
    rawContent?: string,
  ): string {
    const content = rawContent || this.cleanHtml(item.description);

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
      .replace(/{{guid}}/g, item.guid);
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

  private async ensureFolderExists(folderPath: string): Promise<void> {
    if (!folderPath || folderPath.trim() === "") {
      return;
    }

    const cleanPath = this.normalizePath(folderPath);
    if (!cleanPath) {
      return;
    }

    try {
      if (this.app.vault.getAbstractFileByPath(cleanPath) === null) {
        await this.app.vault.createFolder(cleanPath);
      }
    } catch {
      throw new Error(`Failed to create folder: ${cleanPath}`);
    }
  }

  async fetchFullArticleContent(url: string): Promise<string> {
    // SAGEPUB-specific fallback: if the URL is a full-text journal article,
    // attempt the abstract URL when the full-text fails.
    const isSagepubFull =
      url.includes("journals.sagepub.com") && url.includes("/doi/full/");

    const result = await fetchWithProxyFallback(url, this.corsProxyUrl);

    if (!result && isSagepubFull) {
      const abstractUrl = url.replace("/doi/full/", "/doi/abs/");
      return fetchWithProxyFallback(abstractUrl, this.corsProxyUrl);
    }

    return result;
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
      console.error(
        "[RSS Dashboard] Failed to convert relative URLs in ArticleSaver:",
        error,
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
      const loadingNotice = new Notice("Fetching full article content...", 0);

      const fullContent = await this.fetchFullArticleContent(item.link);
      if (!fullContent) {
        loadingNotice.hide();
        new Notice(
          "Could not fetch full content. Saving with available content.",
        );
        return await this.saveArticle(item, customFolder, customTemplate);
      }

      const markdownContent = this.turndownService.turndown(fullContent);
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
      if (existingFile !== null) {
        await this.app.fileManager.trashFile(existingFile);
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

      const file = await this.app.vault.create(filePath, contentToWrite);

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
    if (!item.title) return false;
    try {
      const filePath = this.buildSavedArticleFilePath(item);
      return this.app.vault.getAbstractFileByPath(filePath) !== null;
    } catch {
      return false;
    }
  }

  private buildSavedArticleFilePath(item: FeedItem): string {
    const folder = this.normalizePath(this.settings.defaultFolder || "");
    const filename = sanitizeFilename(item.title);
    return folder && folder.trim() !== ""
        ? `${folder}/${filename}.md`
        : `${filename}.md`;
  }

  private async updateArticleStatus(
    article: FeedItem,
    updates: Partial<FeedItem>,
    _shouldRerender: boolean = true,
  ): Promise<void> {
    Object.assign(article, updates);
    if (updates.saved === false && article.tags) {
      article.tags = article.tags.filter(
        (t) => t.name.toLowerCase() !== "saved",
      );
    }
    return Promise.resolve();
  }

  async findSavedArticleFile(article: FeedItem): Promise<TFile | null> {
    if (!article.saved) {
      return null;
    }
    const expectedPath = article.savedFilePath || this.buildSavedArticleFilePath(article);
    const file = this.app.vault.getAbstractFileByPath(expectedPath);
    const savedFile = file instanceof TFile ? file : null;
    try {
      await this.updateArticleStatus(
        article,
        {
          saved: savedFile !== null,
          savedFilePath: savedFile ? expectedPath : undefined,
        },
        false,
      );
    } catch {
      // Update failed
    }
    return savedFile;
  }
}
