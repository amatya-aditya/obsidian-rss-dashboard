import { App, Notice, TFile, setIcon, moment, setTooltip } from "obsidian";
import { FeedItem, ArticleSavingSettings } from "../types/types";
import { sanitizeFilename } from "./article-saver";
import { normalizeSubstackImageUrl } from "../utils/substack-image-url";
import { escapeYamlDoubleQuoted } from "../utils/yaml-escape";
import { resolveDisplayDate } from "./feed-parser/feed-retention";
import { ensureVaultFolder } from "../utils/vault-files";

interface WebViewerPlugin {
  openWebpage?(url: string, title: string): Promise<void>;
  currentTitle?: string;
  currentUrl?: string;
  cleanedHtml?: string;
}

interface ObsidianPlugins {
  plugins: {
    [key: string]: unknown;
    "webpage-html-export"?: WebViewerPlugin;
  };
}

interface ObsidianApp extends App {
  plugins: ObsidianPlugins;
}

export interface WebViewerSaveDialogOptions {
  defaultFolder: string;
  defaultTemplate: string;
  includeFrontmatter: boolean;
  /** Saves the page; the dialog closes once it resolves, and stays open if it throws. */
  onSave: (
    folder: string,
    template: string,
    includeFrontmatter: boolean,
  ) => Promise<unknown>;
}

/**
 * Opens the "Save with template" dialog. The view layer supplies it so this
 * service does not import a modal.
 */
export type OpenWebViewerSaveDialog = (
  options: WebViewerSaveDialogOptions,
) => void;

export class WebViewerIntegration {
  private app: ObsidianApp;
  private settingsProvider: () => ArticleSavingSettings;
  private getUseFirstSeenDateFallback: () => boolean;
  private openSaveDialog: OpenWebViewerSaveDialog | null;

  private get settings(): ArticleSavingSettings {
    return this.settingsProvider();
  }

  static createIfAvailable(
    app: App,
    settings: () => ArticleSavingSettings,
    getUseFirstSeenDateFallback: () => boolean,
    openSaveDialog: OpenWebViewerSaveDialog | null = null,
  ): WebViewerIntegration | null {
    try {
      const plugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } })
        .plugins?.plugins;
      return plugins && "webpage-html-export" in plugins
        ? new WebViewerIntegration(
            app as unknown as ObsidianApp,
            settings,
            getUseFirstSeenDateFallback,
            openSaveDialog,
          )
        : null;
    } catch {
      return null;
    }
  }

  constructor(
    app: ObsidianApp,
    settings: ArticleSavingSettings | (() => ArticleSavingSettings),
    getUseFirstSeenDateFallback: () => boolean = () => false,
    openSaveDialog: OpenWebViewerSaveDialog | null = null,
  ) {
    this.app = app;
    this.settingsProvider =
      typeof settings === "function" ? settings : () => settings;
    this.getUseFirstSeenDateFallback = getUseFirstSeenDateFallback;
    this.openSaveDialog = openSaveDialog;
  }

  async openInWebViewer(url: string, title: string): Promise<boolean> {
    const webViewerPlugin = this.app.plugins.plugins["webpage-html-export"];

    if (webViewerPlugin?.openWebpage) {
      try {
        await webViewerPlugin.openWebpage(url, title);

        window.setTimeout(() => {
          this.addCustomSaveButton();
        }, 1000);

        return true;
      } catch (error) {
        new Notice(
          `Error opening URL in web viewer: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        return false;
      }
    }

    return false;
  }

  protected addCustomSaveButton(): void {
    const webViewerContainer = activeDocument.querySelector(".webpage-container");
    if (!webViewerContainer) return;

    if (webViewerContainer.querySelector(".rss-custom-save-button")) return;

    let controlBar = webViewerContainer.querySelector(".webpage-control-bar");
    if (!controlBar) {
      controlBar = webViewerContainer.createDiv({
        cls: "webpage-control-bar",
      });
      webViewerContainer.prepend(controlBar);
    }

    const saveButton = controlBar.createEl("button", {
      cls: "rss-custom-save-button",
    });
    const iconSpan = saveButton.createSpan({
      cls: "rss-custom-save-button-icon",
    });
    setIcon(iconSpan, "save");
    saveButton.createSpan({
      text: "Save with template",
    });

    setTooltip(saveButton, "Save with custom template");

    saveButton.addEventListener("click", () => {
      this.showSaveDialog();
    });

    controlBar.appendChild(saveButton);
  }

  protected showSaveDialog(): void {
    const webViewerPlugin = this.app.plugins.plugins["webpage-html-export"];
    if (!webViewerPlugin) return;

    const title = webViewerPlugin.currentTitle || "Untitled";
    const url = webViewerPlugin.currentUrl || "";
    const content = webViewerPlugin.cleanedHtml || "";

    this.openSaveDialog?.({
      defaultFolder: this.settings.defaultFolder || "RSS articles/",
      defaultTemplate:
        this.settings.defaultTemplate ||
        "---\ntitle: {{title}}\n---\n\n# {{title}}\n\n#rss #{{feedTitle}}\n\n{{content}}",
      includeFrontmatter: this.settings.includeFrontmatter !== false,
      onSave: (folder, template, includeFrontmatter) =>
        this.saveArticle(
          {
            title,
            link: url,
            description: content,
            pubDate: new Date().toUTCString(),
            guid: url,
            feedTitle: "Web viewer",
            feedUrl: "",
            coverImage: "",
            read: true,
            starred: false,
            tags: [],
            saved: false,
          },
          folder,
          template,
          includeFrontmatter,
        ),
    });
  }

  protected async saveArticle(
    item: FeedItem,
    folder: string,
    template: string,
    includeFrontmatter: boolean,
  ): Promise<TFile | null> {
    if (folder) {
      folder = await this.ensureFolderExists(folder);
    }

    const filename = sanitizeFilename(item.title);
    const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;

    if (this.app.vault.getAbstractFileByPath(filePath) !== null) {
      new Notice(`File already exists: ${filename}`);
      return null;
    }

    let content = "";

    if (includeFrontmatter) {
      content += this.generateFrontmatter(item);
    }

    content += this.applyTemplate(item, template);

    const file = await this.app.vault.create(filePath, content);

    new Notice(`Article saved: ${filename}`);

    return file;
  }

  /**
   * The date to stamp into saved-note frontmatter/templates: the real
   * `pubDate` when it resolves to an actual instant, falling back to
   * `firstSeenMs` (when `useFirstSeenDateFallback` is enabled) when there's
   * no real date, and only reaching for "now" when neither is available.
   */
  private resolveSavedArticleDate(item: FeedItem): Date {
    return (
      resolveDisplayDate(item, this.getUseFirstSeenDateFallback()) ??
      new Date()
    );
  }

  protected generateFrontmatter(item: FeedItem): string {
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
---
`;
    }

    const tagNames = (item.tags ?? [])
      .map((tag) => tag.name)
      .filter(
        (name): name is string =>
          typeof name === "string" && name.trim() !== "",
      );

    if (
      this.settings.addSavedTag &&
      !tagNames.some((t) => t.toLowerCase() === "saved")
    ) {
      tagNames.push("Saved");
    }

    const tagsString = tagNames.join(", ");

    const pubDate = this.resolveSavedArticleDate(item);
    const isoDateTime = pubDate.toISOString();
    const dateString = pubDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const now = new Date();
    const saveDate = this.formatMoment(now, "YYYY-MM-DD");
    const saveTime12 = this.formatMoment(now, "hh:mm A");
    const saveTime24 = this.formatMoment(now, "HH:mm");

    frontmatter = frontmatter
      .replace(/{{title}}/g, () => escapeYamlDoubleQuoted(item.title))
      .replace(/{{date}}/g, () => dateString)
      .replace(/{{isoDate}}/g, () => isoDateTime)
      .replace(/{{isoDateTime}}/g, () => isoDateTime)
      .replace(/{{saveDate}}/g, () => saveDate)
      .replace(/{{saveTime12}}/g, () => saveTime12)
      .replace(/{{saveTime24}}/g, () => saveTime24)
      .replace(/{{tags}}/g, () => tagsString)
      .replace(
        /{{source}}/g,
        () => escapeYamlDoubleQuoted(item.feedTitle || "Web viewer"),
      )
      .replace(/{{link}}/g, () => escapeYamlDoubleQuoted(item.link))
      .replace(/{{author}}/g, () => escapeYamlDoubleQuoted(item.author || ""))
      .replace(
        /{{feedTitle}}/g,
        () => escapeYamlDoubleQuoted(item.feedTitle || "Web viewer"),
      )
      .replace(/{{guid}}/g, () => escapeYamlDoubleQuoted(item.guid))
      .replace(/{{image}}/g, () => escapeYamlDoubleQuoted(this.getImage(item)));

    return frontmatter.endsWith("\n") ? frontmatter : `${frontmatter}\n`;
  }

  private formatMoment(date: Date, formatStr: string): string {
    type MomentFactory = (input: Date) => { format: (fmt: string) => string };
    return (moment as unknown as MomentFactory)(date).format(formatStr);
  }

  protected applyTemplate(item: FeedItem, template: string): string {
    const pubDate = this.resolveSavedArticleDate(item);
    const isoDateTime = pubDate.toISOString();

    const formattedDate = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const now = new Date();
    const saveDate = this.formatMoment(now, "YYYY-MM-DD");
    const saveTime12 = this.formatMoment(now, "hh:mm A");
    const saveTime24 = this.formatMoment(now, "HH:mm");

    const description = item.description;
    return template
      .replace(/{{title}}/g, () => item.title)
      .replace(/{{date}}/g, () => formattedDate)
      .replace(/{{isoDate}}/g, () => isoDateTime)
      .replace(/{{isoDateTime}}/g, () => isoDateTime)
      .replace(/{{saveDate}}/g, () => saveDate)
      .replace(/{{saveTime12}}/g, () => saveTime12)
      .replace(/{{saveTime24}}/g, () => saveTime24)
      .replace(/{{link}}/g, () => item.link)
      .replace(/{{author}}/g, () => item.author || "")
      .replace(/{{source}}/g, () => item.feedTitle || "Web viewer")
      .replace(/{{summary}}/g, () => item.summary || "")
      // Use a replacer function to prevent JS regex special patterns ($$, $&)
      // from collapsing display math delimiters like $$x^2$$ into $x^2$.
      .replace(/{{content}}/g, () => description)
      .replace(/{{image}}/g, () => this.getImage(item));
  }

  private getImage(item: FeedItem): string {
    const enclosureImageUrl =
      item.enclosure?.type?.startsWith("image/") && item.enclosure.url
        ? item.enclosure.url
        : "";

    return normalizeSubstackImageUrl(
      (item.coverImage || item.image || item.itunes?.image?.href || enclosureImageUrl || "")
        .trim(),
    );
  }

  /**
   * Makes sure the folder exists and returns its path as it is on disk, which
   * may differ in case from `folderPath` (see `ensureVaultFolder`).
   */
  protected async ensureFolderExists(folderPath: string): Promise<string> {
    if (!folderPath || folderPath.trim() === "") {
      return "";
    }

    return ensureVaultFolder(this.app, folderPath);
  }
}
