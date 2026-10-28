import { App, Notice, TFile } from "obsidian";
import {
  ArticleSavingSettings,
  Feed,
  FeedItem,
  SavedTemplate,
  SaveVersion,
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
import { articleHtmlToMarkdown } from "../utils/article-markdown";
import {
  embedMarkdown,
  isYouTubeVideoId,
  replaceYouTubeEmbedsInHtmlNote,
  stripYouTubeEmbedMarkdown,
} from "../utils/youtube-embed";
import { normalizeSubstackImageUrl } from "../utils/substack-image-url";
import {
  feedDescriptionToStripFromBody,
  resolveFeedHeroUrl,
  resolvePageImageHeroUrl,
} from "../utils/reader-article-render";
import { pageImageToStore } from "../utils/reader-article-fetch";
import { cleanFetchedArticleDocument } from "../utils/reader-html-cleanup";
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
import {
  bodyLeadsWithHero,
  noteLeadsWithHero,
  resolveNoteTemplate,
  templateImageUrl,
} from "./article-template/note-template";
import { renderArticleTemplate } from "./article-template/render-template";
import {
  ARTICLE_SAVER_FRONTMATTER_STEPS,
  ARTICLE_FILENAME_STEPS,
  ARTICLE_SAVER_NOTE_STEPS,
} from "./article-template/call-site-steps";
import { firstNonFormulaImageUrl } from "../utils/image-url-utils";
import { resolveAbsoluteHttpUrl } from "../utils/url-utils";
import { AD_CONTAINER_SELECTOR } from "../utils/ad-containers";
import { escapeYamlDoubleQuoted } from "../utils/yaml-escape";
import { ensureVaultFolder } from "../utils/vault-files";
import { ONE_SAVE_OVERRIDE_TEMPLATE_ID } from "../utils/saved-template-utils";
import { isMinimalArticleTemplate } from "../utils/minimal-article-template";
import {
  FALLBACK_BEFORE_SAVE_NOTICE,
  fetchedSaveReport,
  resolveSaveVersion,
  rssSaveReport,
  SAVE_FALLBACK_NOTICE,
  savedArticleNotice,
  type SaveReport,
} from "../utils/save-version";

const MAX_FILENAME_LENGTH = 245;
const MAX_FILENAME_BYTES = 255;
const MARKDOWN_EXTENSION_BYTES = 3;
const RSS_FALLBACK_MARKER =
  "> RSS feed content shown because the full article could not be fetched.";

export function sanitizeFilename(name: string): string {
  return sanitizeFilenameStem(name) || "Untitled Article";
}

function sanitizeFilenameStem(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|#\x5b\x5d^]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const stem = truncateFilenameStem(
    cleaned,
    MAX_FILENAME_LENGTH,
    MAX_FILENAME_BYTES - MARKDOWN_EXTENSION_BYTES,
  )
    .trim()
    .replace(/[. ]+$/g, "");
  return /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i.test(stem)
    ? ""
    : stem;
}

function truncateFilenameStem(
  value: string,
  maxCharacters: number,
  maxBytes: number,
): string {
  let characterCount = 0;
  let byteCount = 0;
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      continue;
    }
    const characterBytes =
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
    if (
      characterCount >= maxCharacters ||
      byteCount + characterBytes > maxBytes
    ) {
      break;
    }
    result += character;
    characterCount += 1;
    byteCount += characterBytes;
  }
  return result;
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
    const shortened = truncateFilenameStem(
      filename,
      MAX_FILENAME_LENGTH - [...suffixText].length,
      MAX_FILENAME_BYTES -
        MARKDOWN_EXTENSION_BYTES -
        utf8ByteLength(suffixText),
    ).trim();
    candidate = `${shortened}${suffixText}`;
    suffix += 1;
  }
  return pathFor(candidate);
}

function utf8ByteLength(value: string): number {
  let byteCount = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    byteCount +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return byteCount;
}

export class ArticleSaver {
  private app: App;
  /**
   * Resolves the Article Saving group at each read, so replacing the group (a
   * settings reload, import, or reset) reaches this saver instead of leaving
   * it on a snapshot of the group from when it was constructed.
   */
  private readonly settingsProvider: () => ArticleSavingSettings;
  private corsProxyUrl: string | undefined;
  private getUseFirstSeenDateFallback: () => boolean;
  /** The feeds, for an item's feed-level language (#246). */
  private getFeeds: () => readonly Feed[];

  constructor(
    app: App,
    settings: ArticleSavingSettings | (() => ArticleSavingSettings),
    corsProxyUrl?: string,
    getUseFirstSeenDateFallback: () => boolean = () => false,
    getFeeds: () => readonly Feed[] = () => [],
  ) {
    this.app = app;
    this.settingsProvider =
      typeof settings === "function" ? settings : () => settings;
    this.corsProxyUrl = corsProxyUrl;
    this.getUseFirstSeenDateFallback = getUseFirstSeenDateFallback;
    this.getFeeds = getFeeds;
  }

  private get settings(): ArticleSavingSettings {
    return this.settingsProvider();
  }

  private parseHtmlBody(html: string): Document | null {
    try {
      return new DOMParser().parseFromString(ensureUtf8Meta(html), "text/html");
    } catch {
      return null;
    }
  }

  /**
   * Removes ad containers, scripts, and the other non-content nodes. A
   * YouTube iframe is not removed here: the HTML-note path converts it first
   * ({@link replaceYouTubeEmbedsInHtmlNote}) and the Markdown path leaves it
   * for the shared converter, which turns a recognised embed into note text.
   */
  private stripAdsAndNonContentNodes(doc: Document): void {
    doc
      .querySelectorAll(
        "script, style, noscript, template, svg, link, meta, base, object, embed, " +
          AD_CONTAINER_SELECTOR,
      )
      .forEach((el) => el.remove());
  }

  /**
   * Makes a non-absolute image source absolute against the article URL, so it
   * still resolves in the vault. The article URL, not Obsidian's own
   * `app://…` origin, is the base a relative source belongs to (#1195).
   */
  private absolutizeImageSources(doc: Document, baseUrl: string): void {
    if (!baseUrl) return;

    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (!src) return;

      const resolved = resolveAbsoluteHttpUrl(src, baseUrl);
      if (resolved && resolved !== src) {
        img.setAttribute("src", resolved);
      }
    });
  }

  /**
   * Feed HTML for the HTML-note fallback that {@link feedHtmlAsMarkdown} keeps
   * when a non-empty body would convert to nothing. A recognised YouTube iframe
   * becomes the embed text and every other iframe is dropped, so the kept HTML
   * never carries one; the Markdown path handles that through the converter.
   */
  private cleanHtml(html: string, baseUrl: string): string {
    const doc = this.parseHtmlBody(html);
    if (!doc) return html;

    replaceYouTubeEmbedsInHtmlNote(doc);
    this.stripAdsAndNonContentNodes(doc);
    this.absolutizeImageSources(doc, baseUrl);

    doc.querySelectorAll("img").forEach((img) => {
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
  }

  /**
   * Feed HTML for the shared Markdown conversion (#1190). The same ad stripping
   * and relative-image fix-up as {@link cleanHtml}, but iframes stay for the
   * converter and the HTML-note-only link and table decorations are skipped.
   */
  private sanitizeFeedHtmlForMarkdown(html: string, baseUrl: string): string {
    const doc = this.parseHtmlBody(html);
    if (!doc) return html;

    this.stripAdsAndNonContentNodes(doc);
    this.absolutizeImageSources(doc, baseUrl);

    return doc.body.innerHTML;
  }

  private getPreferredFeedHtml(item: FeedItem): string {
    return item.content || item.description || item.summary || "";
  }

  private getFallbackHeroUrl(item: FeedItem): string {
    return templateImageUrl(item);
  }

  /**
   * The hero of a note saved from [[RSS content]] (#1354): the image the feed
   * supplied, never a cover the page replaced. `getFallbackHeroUrl` stays the
   * displayed cover, which `{{image}}` and the fetched save still read.
   */
  private getFeedHeroUrl(item: FeedItem): string {
    return normalizeSubstackImageUrl(
      resolveFeedHeroUrl(item, this.getFeeds()) || "",
    ).trim();
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

  private prependFallbackHeroHtml(
    item: FeedItem,
    html: string,
    heroUrl = this.getFallbackHeroUrl(item),
  ): string {
    if (!html) return html;
    if (!heroUrl) return html;
    if (this.htmlAlreadyContainsImage(html, heroUrl)) return html;

    return `<p><img src="${heroUrl}" alt="Hero image" /></p>${html}`;
  }

  private prependFallbackHeroMarkdown(
    item: FeedItem,
    markdown: string,
    sourceHtml: string,
    heroUrl = this.getFallbackHeroUrl(item),
  ): string {
    if (!markdown) return markdown;

    if (!heroUrl) return markdown;

    if (this.htmlAlreadyContainsImage(sourceHtml, heroUrl)) {
      return markdown;
    }

    if (markdown.includes(heroUrl)) {
      return markdown;
    }

    return `![Hero image](${heroUrl})\n\n${markdown}`;
  }

  /** The values this saver's templates fill, built separately for each template render to preserve clock timing. */
  private buildTemplateValues(
    item: FeedItem,
    writtenVersion: SaveVersion,
  ): ArticleTemplateValues {
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
      contentSource: writtenVersion,
    });
  }

  private generateFrontmatter(
    item: FeedItem,
    writtenVersion: SaveVersion,
  ): string {
    let frontmatter = this.settings.frontmatterTemplate;

    if (!frontmatter) {
      frontmatter = `---
title: "{{title}}"
date: "{{date}}"
tags: [{{tags}}]
source: "{{source}}"
contentSource: "{{contentSource}}"
link: "{{link}}"
author: "{{author}}"
feedTitle: "{{feedTitle}}"
guid: "{{guid}}"
---`;
    }

    frontmatter = renderArticleTemplate(
      frontmatter,
      ARTICLE_SAVER_FRONTMATTER_STEPS,
      this.buildTemplateValues(item, writtenVersion),
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
    rawContent: string | undefined,
    writtenVersion: SaveVersion,
  ): string {
    const content = rawContent
      ? rawContent
      : this.feedHtmlAsMarkdown(item, bodyLeadsWithHero(template, item));

    return renderArticleTemplate(
      template,
      ARTICLE_SAVER_NOTE_STEPS,
      this.buildTemplateValues(item, writtenVersion),
      content,
    );
  }

  /**
   * The validated video ID a video item saves its embed from (#1237). The
   * item's own field is the only source; feed markup is never consulted.
   */
  private videoItemEmbedId(item: FeedItem): string | null {
    if (item.mediaType !== "video") return null;
    const videoId = item.videoId?.trim() ?? "";
    return isYouTubeVideoId(videoId) ? videoId : null;
  }

  /**
   * Leads a video item's body with its native embed in place of the hero
   * thumbnail (#1237). The content keeps everything else, but an embed for the
   * same video is removed so the note holds exactly one; another video's embed
   * is a different video and stays.
   */
  private leadWithVideoEmbed(item: FeedItem, body: string): string {
    const videoId = this.videoItemEmbedId(item);
    if (!videoId) return body;

    const content = stripYouTubeEmbedMarkdown(body, videoId);
    const embed = embedMarkdown(videoId).trim();
    return content ? `${embed}\n\n${content}` : embed;
  }

  /**
   * The note body for a save that uses the feed item's own content (#1190).
   * The feed HTML becomes Markdown, the same conversion the fetch-failure
   * fallback and the fetched-article path use; ad stripping and the
   * relative-image fix-up run first, and the hero check sees that same HTML.
   * The converter keeps a recognised YouTube embed, so iframes reach it
   * intact. Turndown drops `<video>` and `<audio>` outright, so a non-empty
   * feed body that would convert to nothing keeps the HTML the old path wrote,
   * legacy hero markup included, rather than saving an empty note.
   *
   * A video item with a validated `videoId` leads with its own native embed
   * instead of the fallback hero (#1237), on both the Markdown and HTML-note
   * paths; the content follows.
   *
   * `leadWithHero` is false when the template places `{{image}}` itself; the
   * body then takes no hero, as the prepend helpers treat an empty URL.
   */
  private feedHtmlAsMarkdown(item: FeedItem, leadWithHero: boolean): string {
    const feedHtml = this.getPreferredFeedHtml(item);
    const sanitizedHtml = this.sanitizeFeedHtmlForMarkdown(feedHtml, item.link);
    const heroUrl = leadWithHero ? this.getFeedHeroUrl(item) : "";

    if (this.videoItemEmbedId(item)) {
      const markdown = articleHtmlToMarkdown(sanitizedHtml);
      if (markdown.trim()) {
        return this.leadWithVideoEmbed(item, markdown);
      }

      return this.leadWithVideoEmbed(item, this.cleanHtml(feedHtml, item.link));
    }

    const markdown = this.prependFallbackHeroMarkdown(
      item,
      articleHtmlToMarkdown(sanitizedHtml),
      sanitizedHtml,
      heroUrl,
    );

    if (markdown.trim()) {
      return markdown;
    }

    return this.prependFallbackHeroHtml(
      item,
      this.cleanHtml(feedHtml, item.link),
      heroUrl,
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
    return fetchFullArticleContentWithOutcome(
      url,
      this.corsProxyUrl,
      this.settings.fetchTimeout,
    );
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
    if (resolveSaveVersion(this.settings, savedTemplate) === "rss") {
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
          ? this.convertFetchedHtmlToMarkdown(
              item,
              readerContent.fetchedHtml,
              noteLeadsWithHero(
                this.settings,
                customTemplate,
                savedTemplate,
                item,
              ),
            )
          : "";
      if (markdown.trim()) {
        return this.saveArticle(
          item,
          customFolder,
          customTemplate,
          markdown,
          savedTemplate,
          fetchedSaveReport(),
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
    notice: string = SAVE_FALLBACK_NOTICE.fetch,
  ): Promise<TFile | null> {
    // Same ad stripping and relative-image fix-up as the RSS-content path, so
    // the fallback and a fetched save match it (#1195).
    const feedContent = this.getPreferredFeedHtml(item);
    const sanitizedHtml = this.sanitizeFeedHtmlForMarkdown(
      feedContent,
      item.link,
    );
    const fallbackMarkdown = feedContent
      ? articleHtmlToMarkdown(sanitizedHtml)
      : "";
    // A template that places {{image}} itself takes no hero lead (the prepend
    // treats an empty URL as no hero).
    const heroUrl = noteLeadsWithHero(
      this.settings,
      customTemplate,
      savedTemplate,
      item,
    )
      ? this.getFeedHeroUrl(item)
      : "";
    const fallbackWithHero = fallbackMarkdown
      ? this.prependFallbackHeroMarkdown(
          item,
          fallbackMarkdown,
          sanitizedHtml,
          heroUrl,
        )
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
      rssSaveReport(notice),
    );
  }

  private convertFetchedHtmlToMarkdown(
    item: FeedItem,
    html: string,
    leadWithHero: boolean,
  ): string {
    // The Fetched content save's hero is the page's own image first (#812),
    // then the saver's full feed chain (which also accepts an image enclosure).
    const fetchedHeroUrl =
      normalizeSubstackImageUrl(
        resolvePageImageHeroUrl(item, this.getFeeds()) || "",
      ).trim() || this.getFallbackHeroUrl(item);
    // A template that places {{image}} itself takes no hero lead (the prepend
    // treats an empty URL as no hero); the cleanup below still reads the hero
    // to drop the page's own repeated lead.
    const leadHeroUrl = leadWithHero ? fetchedHeroUrl : "";
    const doc = this.parseHtmlBody(html);
    if (!doc) {
      return this.prependFallbackHeroMarkdown(
        item,
        articleHtmlToMarkdown(html),
        html,
        leadHeroUrl,
      );
    }

    this.stripAdsAndNonContentNodes(doc);
    this.absolutizeImageSources(doc, item.link);
    // The note body follows the body the readers show: run the same fetched
    // page cleanup once, before the conversion, so a save from any route drops
    // the lead media and repeated lead the readers already drop (#1323).
    cleanFetchedArticleDocument(doc, {
      feedDescriptionHtml: feedDescriptionToStripFromBody(
        item,
        doc.body.innerHTML,
      ),
      fallbackHeroUrl: fetchedHeroUrl,
    });

    const sanitizedHtml = doc.body.innerHTML;
    return this.prependFallbackHeroMarkdown(
      item,
      articleHtmlToMarkdown(sanitizedHtml),
      sanitizedHtml,
      leadHeroUrl,
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
        const restricted = fetchResult.failureType === "restricted";
        if (restricted) {
          new Notice(RESTRICTED_ARTICLE_NOTICE);
          // Mark the item for inline banner
          item.restrictedReason = RESTRICTED_ARTICLE_REASON;
        } else {
          new Notice(FALLBACK_BEFORE_SAVE_NOTICE);
        }
        return await this.saveWithRssFallback(
          item,
          customFolder,
          customTemplate,
          savedTemplate,
          // The restriction notice already explains why, so that save reports
          // the version it wrote without a fallback suffix.
          restricted ? savedArticleNotice("rss") : SAVE_FALLBACK_NOTICE.fetch,
        );
      }

      // The fetched page's own image (#812): store it first-write-wins so this
      // card-save path builds the note's hero from it, the same hero the Reader
      // and the inline reader show.
      const pageImage = pageImageToStore(
        item,
        fetchResult.pageImage,
        this.getFeeds(),
      );
      if (pageImage) item.pageImage = pageImage;

      const markdownContent = this.convertFetchedHtmlToMarkdown(
        item,
        fetchResult.content,
        noteLeadsWithHero(this.settings, customTemplate, savedTemplate, item),
      );
      if (!markdownContent.trim()) {
        loadingNotice.hide();
        new Notice(FALLBACK_BEFORE_SAVE_NOTICE);
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
        fetchedSaveReport(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not save fetched content: ${message}`);
      return await this.saveArticle(
        item,
        customFolder,
        customTemplate,
        undefined,
        savedTemplate,
        rssSaveReport(SAVE_FALLBACK_NOTICE.save),
      );
    }
  }

  /**
   * A saved template owns the whole file, as does the cleared minimal template,
   * so only the remaining unsaved paths get plugin frontmatter (#1246).
   */
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
      !isMinimalArticleTemplate(template) &&
      !template.trim().startsWith("---")
    );
  }

  async saveArticle(
    item: FeedItem,
    customFolder?: string,
    customTemplate?: string,
    rawContent?: string,
    savedTemplate?: SavedTemplate,
    /**
     * The version this save wrote and the notice that names it. It defaults to
     * an RSS content save, which is what a caller with no report is saving.
     */
    report: SaveReport = rssSaveReport(),
  ): Promise<TFile | null> {
    try {
      const folder = await this.resolveSaveFolder(customFolder, savedTemplate);
      const template = this.resolveSaveTemplate(customTemplate, savedTemplate);
      const contentToWrite = this.buildArticleFileContent(
        item,
        template,
        rawContent,
        savedTemplate,
        report.writtenVersion,
      );
      const { filePath, existingSavedFile } = this.resolveSaveTarget(
        item,
        folder,
        savedTemplate,
      );
      const file = await this.writeArticleFile(
        folder,
        filePath,
        existingSavedFile,
        contentToWrite,
      );

      item.saved = true;
      item.savedFilePath = filePath;

      new Notice(report.notice);
      return file;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Error saving article: ${message}`);
      return null;
    }
  }

  /** Resolves the save folder from its custom, saved-template and settings sources, then creates it. */
  private async resolveSaveFolder(
    customFolder: string | undefined,
    savedTemplate: SavedTemplate | undefined,
  ): Promise<string> {
    let folder =
      customFolder !== undefined
        ? customFolder
        : savedTemplate?.defaultFolder || this.settings.defaultFolder || "";
    folder = this.normalizePath(folder);

    if (folder && folder.trim() !== "") {
      folder = await this.ensureFolderExists(folder);
    }

    return folder;
  }

  /** Picks the note template from a custom template, the saved one, settings, or the built-in fallback. */
  private resolveSaveTemplate(
    customTemplate: string | undefined,
    savedTemplate: SavedTemplate | undefined,
  ): string {
    return resolveNoteTemplate(this.settings, customTemplate, savedTemplate);
  }

  /** Assembles the note body: optional plugin frontmatter, then the rendered template. */
  private buildArticleFileContent(
    item: FeedItem,
    template: string,
    rawContent: string | undefined,
    savedTemplate: SavedTemplate | undefined,
    writtenVersion: SaveVersion,
  ): string {
    let contentToWrite = "";
    if (this.shouldAddFrontmatter(template, savedTemplate)) {
      contentToWrite += this.generateFrontmatter(item, writtenVersion);
    }

    contentToWrite += this.applyTemplate(
      item,
      template,
      rawContent,
      writtenVersion,
    );
    return contentToWrite;
  }

  /** Finds the saved note to update, or the free path a new note will take. */
  private resolveSaveTarget(
    item: FeedItem,
    folder: string,
    savedTemplate: SavedTemplate | undefined,
  ): { filePath: string; existingSavedFile: TFile | null } {
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

    return {
      filePath: existingSavedFile
        ? existingSavedFile.path
        : findAvailableArticlePath(this.app, folder, filename),
      existingSavedFile,
    };
  }

  /** Creates or modifies the note, restoring the folder if it vanished before the write. */
  private async writeArticleFile(
    folder: string,
    filePath: string,
    existingSavedFile: TFile | null,
    contentToWrite: string,
  ): Promise<TFile> {
    try {
      if (existingSavedFile) {
        // `contentToWrite` is fully computed above; `process` gives the write
        // atomic read-modify-write semantics, so the callback returns it as is.
        await this.app.vault.process(existingSavedFile, () => contentToWrite);
        return existingSavedFile;
      }

      return await this.app.vault.create(filePath, contentToWrite);
    } catch (error) {
      if (existingSavedFile || !(folder && this.isMissingPathError(error))) {
        throw error;
      }

      await this.ensureFolderExists(folder);
      return await this.app.vault.create(filePath, contentToWrite);
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
