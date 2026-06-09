/**
 * Media Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderMediaSettingsTab(containerEl, plugin)
 */
import { App, Notice, Setting, normalizePath, WorkspaceLeaf } from "obsidian";
import { FolderSuggest } from "../../components/folder-suggest";
import { Folder, PodcastTheme, DEFAULT_SETTINGS } from "../../types/types";
import type { MediaSettings } from "../../types/types";

interface MediaTabSettings {
  folders: Folder[];
  media: MediaSettings;
}

interface MediaSettingsPlugin {
  app: App;
  settings: MediaTabSettings;
  saveSettings(): Promise<void>;
  clearPlaybackProgress(): Promise<number>;
  getActiveReaderView?(): Promise<{
    updatePodcastTheme: (theme: PodcastTheme) => void;
  } | null>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
  } | null>;
}

export function renderMediaSettingsTab(
  containerEl: HTMLElement,
  plugin: MediaSettingsPlugin,
): void {
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

  // ── Twitter/X/Nitter ───────────────────────────────────────────────────────
  new Setting(containerEl).setName("Default folders").setHeading();

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

  // ── Mastodon ────────────────────────────────────────────────────────────────

  new Setting(containerEl)
    .setName("Default Mastodon folder")
    .setDesc("Default folder for Mastodon feeds")
    .addText((text) => {
      text
        .setValue(plugin.settings.media.defaultMastodonFolder || "Mastodon")
        .onChange(async (value) => {
          const nextValue = typeof value === "string" ? value : "";
          plugin.settings.media.defaultMastodonFolder =
            normalizePath(nextValue);
          await plugin.saveSettings();
        });
      new FolderSuggest(plugin.app, text.inputEl, plugin.settings.folders);
    });

  // ── YouTube ────────────────────────────────────────────────────────────────

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

  // ── Podcast ────────────────────────────────────────────────────────────────

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

  // ── RSS ───────────────────────────────────────────────────────────────────

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

  // ── Kagi smallweb ─────────────────────────────────────────────────────────

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

  // ── Podcast player ────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Podcast player").setHeading();

  new Setting(containerEl)
    .setName("Default play speed")
    .setDesc("Default playback speed for podcast episodes")
    .addDropdown((dropdown) =>
      dropdown
        .addOption("0.75", "0.75x")
        .addOption("1", "1x")
        .addOption("1.25", "1.25x")
        .addOption("1.5", "1.5x")
        .addOption("1.75", "1.75x")
        .addOption("2", "2x")
        .addOption("2.5", "2.5x")
        .addOption("3", "3x")
        .setValue(String(plugin.settings.media.defaultPlaySpeed ?? 1))
        .onChange(async (value) => {
          plugin.settings.media.defaultPlaySpeed = parseFloat(value);
          await plugin.saveSettings();
        }),
    );

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

  new Setting(containerEl).setName("Third-party services").setHeading();

  const youtubeTosSetting = new Setting(containerEl).setName(
    "YouTube Terms of Service",
  );

  youtubeTosSetting.descEl.createSpan({
    text: "This plugin uses the YouTube IFrame API for video playback. By using this feature, you agree to be bound by the ",
  });

  youtubeTosSetting.descEl.createEl("a", {
    text: "YouTube Terms of Service",
    href: "https://www.youtube.com/t/terms",
    attr: { target: "_blank", rel: "noopener noreferrer" },
  });

  // ── Reset folder names ────────────────────────────────────────────────────
  new Setting(containerEl)
    .setName("Reset folder names")
    .setDesc("Restore all folder names to their out-of-the-box defaults.")
    .addButton((button) => {
      button.setButtonText("Default folder names").onClick(async () => {
        const d = DEFAULT_SETTINGS.media;
        plugin.settings.media.defaultTwitterFolder = d.defaultTwitterFolder;
        plugin.settings.media.defaultMastodonFolder = d.defaultMastodonFolder;
        plugin.settings.media.defaultYouTubeFolder = d.defaultYouTubeFolder;
        plugin.settings.media.defaultPodcastFolder = d.defaultPodcastFolder;
        plugin.settings.media.defaultRssFolder = d.defaultRssFolder;
        plugin.settings.media.defaultSmallwebFolder = d.defaultSmallwebFolder;
        await plugin.saveSettings();
        new Notice("Folder names restored to defaults.");
        // Re-render the settings tab so the text inputs reflect the reset values.
        const view = await plugin.getActiveDashboardView();
        if (view) view.render();
        containerEl.empty();
        renderMediaSettingsTab(containerEl, plugin);
      });
    });

  // ── Reset tag names ────────────────────────────────────────────────────────
}
