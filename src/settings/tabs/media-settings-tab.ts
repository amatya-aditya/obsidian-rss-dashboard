/**
 * Media Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderMediaSettingsTab(containerEl, plugin)
 */
import { Setting, normalizePath } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { FolderSuggest } from "../../components/folder-suggest";
import { PodcastTheme } from "../../types/types";

export function renderMediaSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
): void {
  // ── YouTube ───────────────────────────────────────────────────────────────
  new Setting(containerEl).setName("YouTube").setHeading();

  new Setting(containerEl)
    .setName("Default YouTube folder")
    .setDesc("Default folder for YouTube feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultYouTubeFolder || "YouTube")
        .onChange(async (value) => {
          plugin.settings.media.defaultYouTubeFolder = normalizePath(value);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  new Setting(containerEl)
    .setName("Default YouTube tag")
    .setDesc("Default tag for YouTube videos")
    .addText((text) =>
      text
        .setValue(plugin.settings.media.defaultYouTubeTag || "youtube")
        .onChange(async (value) => {
          plugin.settings.media.defaultYouTubeTag = value;
          await plugin.saveSettings();
        }),
    );
  
  // Policy Compliance: YouTube TOS and Privacy disclosure
  const complianceInfo = containerEl.createDiv({
    cls: "rss-settings-compliance-info",
  });
  complianceInfo.createEl("p", {
    text: "This plugin uses the YouTube IFrame API for video playback. By using this feature, you agree to be bound by the ",
  }).createEl("a", {
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
          plugin.settings.media.defaultPodcastFolder = normalizePath(value);
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
          plugin.settings.media.defaultRssFolder = normalizePath(value);
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
          plugin.settings.media.defaultSmallwebFolder = normalizePath(value);
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
          plugin.settings.media.podcastTheme = value as PodcastTheme;
          await plugin.saveSettings();
          const readerView = await plugin.getActiveReaderView();
          if (readerView) {
            readerView.updatePodcastTheme(value);
          }
        }),
    );
}
