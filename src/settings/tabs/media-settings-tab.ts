/**
 * Media Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderMediaSettingsTab(containerEl, plugin)
 */
import { App, Notice, Setting, normalizePath } from "obsidian";
import { FolderSuggest } from "../../components/folder-suggest";
import { Folder, PodcastTheme } from "../../types/types";

interface MediaTabSettings {
  folders: Folder[];
  media: {
    autoTagVideos?: boolean;
    rememberPlaybackProgress?: boolean;
    defaultTwitterFolder: string;
    defaultYouTubeFolder: string;
    defaultYouTubeTag: string;
    defaultPodcastFolder: string;
    defaultPodcastTag: string;
    defaultRssFolder: string;
    defaultRssTag: string;
    defaultSmallwebFolder: string;
    defaultSmallwebTag: string;
    podcastTheme: PodcastTheme;
  };
}

interface MediaSettingsPlugin {
  app: App;
  settings: MediaTabSettings;
  saveSettings(): Promise<void>;
  clearPlaybackProgress(): Promise<number>;
  getActiveReaderView?(): Promise<{
    updatePodcastTheme: (theme: PodcastTheme) => void;
  } | null>;
}

export function renderMediaSettingsTab(
  containerEl: HTMLElement,
  plugin: MediaSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Auto-tag videos")
    .setDesc(
      "Automatically apply the configured video tag to detected video items",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.autoTagVideos ?? true)
        .onChange(async (value) => {
          plugin.settings.media.autoTagVideos = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl).setName("Playback progress").setHeading();

  new Setting(containerEl)
    .setName("Remember playback progress")
    .setDesc(
      "Save and restore podcast and video playback position across reader and plugin restarts",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.rememberPlaybackProgress ?? true)
        .onChange(async (value) => {
          plugin.settings.media.rememberPlaybackProgress = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Clear saved playback progress")
    .setDesc(
      "Remove all remembered podcast and video resume positions stored by the plugin",
    )
    .addButton((button) => {
      button
        .setButtonText("Clear progress")
        .setWarning()
        .onClick(async () => {
          const clearedCount = await plugin.clearPlaybackProgress();
          new Notice(
            clearedCount > 0
              ? `Cleared saved playback progress for ${clearedCount} item${clearedCount === 1 ? "" : "s"}.`
              : "No saved playback progress was found.",
          );
        });
    });

  // ── YouTube ───────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Twitter/X/Nitter").setHeading();

  new Setting(containerEl)
    .setName("Default Twitter folder")
    .setDesc("Default folder for Twitter/X/Nitter feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultTwitterFolder || "Twitter")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultTwitterFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl).setName("YouTube").setHeading();

  new Setting(containerEl)
    .setName("Default YouTube folder")
    .setDesc("Default folder for YouTube feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultYouTubeFolder || "YouTube")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultYouTubeFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default YouTube tag")
    .setDesc("Tag used for auto-tagged video content")
    .addText((text) => {
      const currentTag = (
        plugin.settings.media as unknown as Record<string, unknown>
      ).defaultYouTubeTag;
      const initialValue =
        typeof currentTag === "string" && currentTag.trim().length > 0
          ? currentTag
          : "Video";

      text.setValue(initialValue).onChange(async (value) => {
        const nextValue =
          typeof value === "string" && value.trim().length > 0
            ? value.trim()
            : "Video";
        plugin.settings.media.defaultYouTubeTag = nextValue;
        await plugin.saveSettings();
      });
    });

  // Policy Compliance: YouTube TOS and Privacy disclosure
  const complianceInfo = containerEl.createDiv({
    cls: "rss-settings-compliance-info",
  });
  complianceInfo
    .createEl("p", {
      text: "This plugin uses the YouTube IFrame API for video playback. By using this feature, you agree to be bound by the ",
    })
    .createEl("a", {
      href: "https://www.youtube.com/t/terms",
      text: "YouTube Terms of Service",
    });
  complianceInfo.createEl("p", {
    cls: "setting-item-description",
    text: "Playback progress for videos and podcasts is stored locally in your vault's data.json file.",
  });

  // ── Podcast ───────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Podcast").setHeading();

  new Setting(containerEl)
    .setName("Default podcast folder")
    .setDesc("Default folder for podcast feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultPodcastFolder || "Podcast")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultPodcastFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default podcast tag")
    .setDesc("Default tag for podcast episodes")
    .addText((text) =>
      text
        .setValue(plugin.settings.media.defaultPodcastTag || "podcast")
        .onChange(async (value) => {
          plugin.settings.media.defaultPodcastTag = value;
          await plugin.saveSettings();
        }),
    );

  // ── RSS ───────────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("RSS").setHeading();

  new Setting(containerEl)
    .setName("Default RSS folder")
    .setDesc("Default folder for RSS feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultRssFolder || "RSS")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultRssFolder = normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default RSS tag")
    .setDesc("Default tag for RSS articles")
    .addText((text) =>
      text
        .setValue(plugin.settings.media.defaultRssTag || "rss")
        .onChange(async (value) => {
          plugin.settings.media.defaultRssTag = value;
          await plugin.saveSettings();
        }),
    );

  // ── Kagi smallweb ─────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Kagi smallweb").setHeading();

  new Setting(containerEl)
    .setName("Default smallweb folder")
    .setDesc("Default folder for smallweb feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultSmallwebFolder || "Smallweb")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultSmallwebFolder =
            normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default smallweb tag")
    .setDesc("Default tag for smallweb articles")
    .addText((text) =>
      text
        .setValue(plugin.settings.media.defaultSmallwebTag || "smallweb")
        .onChange(async (value) => {
          plugin.settings.media.defaultSmallwebTag = value;
          await plugin.saveSettings();
        }),
    );

  // ── Podcast player ────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Podcast player").setHeading();

  new Setting(containerEl)
    .setName("Player theme")
    .setDesc("Choose a visual theme for the podcast player")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("obsidian", "Default")
        .addOption("minimal", "Minimal")
        .addOption("gradient", "Gradient")
        .addOption("spotify", "Spotify")
        .addOption("nord", "Nord")
        .addOption("dracula", "Dracula")
        .addOption("solarized", "Solarized dark")
        .addOption("catppuccin", "Catppuccin mocha")
        .addOption("gruvbox", "Gruvbox")
        .addOption("tokyonight", "Tokyo night")
        .setValue(plugin.settings.media.podcastTheme)
        .onChange(async (value) => {
          const theme = value as PodcastTheme;
          plugin.settings.media.podcastTheme = theme;
          await plugin.saveSettings();
          const readerView = await plugin.getActiveReaderView?.();
          if (readerView) {
            readerView.updatePodcastTheme(theme);
          }
        }),
    );
}
