import { App, Notice, TFile, setIcon, setTooltip } from "obsidian";
import { FeedItem, ArticleSavingSettings } from "../types/types";
import {
  buildArticleFilename,
  findAvailableArticlePath,
} from "./article-saver";
import { normalizeSubstackImageUrl } from "../utils/substack-image-url";
import { ensureVaultFolder } from "../utils/vault-files";
import {
  buildArticleTemplateValues,
  itemTagNames,
  resolveSavedArticleDate,
  type ArticleTemplateValues,
} from "./article-template/template-values";
import { renderArticleTemplate } from "./article-template/render-template";
import {
  WEB_VIEWER_FRONTMATTER_STEPS,
  WEB_VIEWER_NOTE_STEPS,
} from "./article-template/call-site-steps";

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
  defaultFilenamePattern: string;
  includeFrontmatter: boolean;
  /** Saves the page; the dialog closes once it resolves, and stays open if it throws. */
  onSave: (
    folder: string,
    template: string,
    includeFrontmatter: boolean,
    filenamePattern?: string,
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
      const plugins = (
        app as unknown as { plugins?: { plugins?: Record<string, unknown> } }
      ).plugins?.plugins;
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
    const webViewerContainer =
      activeDocument.querySelector(".webpage-container");
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
    const globalDefault = this.settings.savedTemplates.find(
      (savedTemplate) =>
        savedTemplate.id === this.settings.globalDefaultTemplateId,
    );

    this.openSaveDialog?.({
      defaultFolder:
        globalDefault?.defaultFolder ||
        this.settings.defaultFolder ||
        "RSS articles/",
      defaultTemplate: globalDefault
        ? globalDefault.template
        : this.settings.defaultTemplate ||
          "---\ntitle: {{title}}\n---\n\n# {{title}}\n\n#rss #{{feedTitle}}\n\n{{content}}",
      defaultFilenamePattern: globalDefault?.filenamePattern || "",
      includeFrontmatter: this.settings.includeFrontmatter !== false,
      onSave: (folder, template, includeFrontmatter, filenamePattern) =>
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
          filenamePattern,
        ),
    });
  }

  protected async saveArticle(
    item: FeedItem,
    folder: string,
    template: string,
    includeFrontmatter: boolean,
    filenamePattern = "",
  ): Promise<TFile | null> {
    if (folder) {
      folder = await this.ensureFolderExists(folder);
    }

    const filename = buildArticleFilename(
      item,
      filenamePattern,
      this.settings.addSavedTag,
      this.getUseFirstSeenDateFallback(),
    );
    const filePath = findAvailableArticlePath(this.app, folder, filename);

    let content = "";

    if (includeFrontmatter) {
      content += this.generateFrontmatter(item);
    }

    content += this.applyTemplate(item, template);

    const file = await this.app.vault.create(filePath, content);

    new Notice(`Article saved: ${file.name.replace(/\.md$/i, "")}`);

    return file;
  }

  /** The values this integration's templates fill, built separately for each template render to preserve clock timing. */
  private buildTemplateValues(
    item: FeedItem,
    isNote = false,
  ): ArticleTemplateValues {
    const tagNames = itemTagNames(item);

    if (
      this.settings.addSavedTag &&
      !tagNames.some((t) => t.toLowerCase() === "saved")
    ) {
      tagNames.push("Saved");
    }

    return buildArticleTemplateValues(item, {
      articleDate: resolveSavedArticleDate(
        item,
        this.getUseFirstSeenDateFallback(),
      ),
      now: () => new Date(),
      // The legacy note chain reads its long save date separately from save times.
      saveDateLong: isNote ? () => new Date() : undefined,
      tagNames,
      image: () => this.getImage(item),
    });
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

    frontmatter = renderArticleTemplate(
      frontmatter,
      WEB_VIEWER_FRONTMATTER_STEPS,
      this.buildTemplateValues(item),
    );

    return frontmatter.endsWith("\n") ? frontmatter : `${frontmatter}\n`;
  }

  protected applyTemplate(item: FeedItem, template: string): string {
    return renderArticleTemplate(
      template,
      WEB_VIEWER_NOTE_STEPS,
      this.buildTemplateValues(item, true),
      item.description,
    );
  }

  private getImage(item: FeedItem): string {
    const enclosureImageUrl =
      item.enclosure?.type?.startsWith("image/") && item.enclosure.url
        ? item.enclosure.url
        : "";

    return normalizeSubstackImageUrl(
      (
        item.coverImage ||
        item.image ||
        item.itunes?.image?.href ||
        enclosureImageUrl ||
        ""
      ).trim(),
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
