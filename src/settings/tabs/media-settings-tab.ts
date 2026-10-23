/**
 * Media Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderMediaSettingsTab(containerEl, plugin)
 */
import { App, Notice, Setting } from "obsidian";
import { PodcastTheme } from "../../types/types";
import type { MediaSettings } from "../../types/types";
import { ConfirmActionModal } from "../modals/settings-modals";
import { settingsUiCompatibility } from "../settings-ui-compat";

interface MediaTabSettings {
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
  applyVideoFocusMode(hide: boolean): Promise<void>;
  applyPodcastChapterMarkers(enabled: boolean): Promise<void>;
  applyPodcastSleepTimerBand(enabled: boolean): Promise<void>;
}

/**
 * The two seek-bar toggles. Extracted so the media tab stays inside the
 * function-length limit as settings are added (#1374, #1447).
 */
function renderPodcastSeekBarSettings(
  containerEl: HTMLElement,
  plugin: MediaSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Show chapter markers on the seek bar")
    .setDesc(
      "Markers appear for episodes whose description lists timestamps in a recognized form. Many shows list none, so most episodes have no markers.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.showPodcastChapterMarkers ?? true)
        .onChange(async (value) => {
          plugin.settings.media.showPodcastChapterMarkers = value;
          await plugin.applyPodcastChapterMarkers(value);
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Show the sleep timer band on the seek bar")
    .setDesc(
      "While a sleep timer is running, the band previews the audio that will play before it stops. Turning this off leaves the timer itself unchanged.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.showPodcastSleepTimerBand ?? true)
        .onChange(async (value) => {
          plugin.settings.media.showPodcastSleepTimerBand = value;
          await plugin.applyPodcastSleepTimerBand(value);
          await plugin.saveSettings();
        }),
    );
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
      button.setButtonText("Clear progress").onClick(() => {
        void (async () => {
          const confirm = new ConfirmActionModal(plugin.app, {
            title: "Clear saved playback progress?",
            message:
              "Remove every remembered podcast and video resume position. This cannot be undone.",
            confirmLabel: "Clear progress",
          });
          confirm.open();
          const shouldClear = await confirm.waitForClose();
          if (!shouldClear) return;
          const clearedCount = await plugin.clearPlaybackProgress();
          new Notice(
            clearedCount > 0
              ? `Cleared saved playback progress for ${clearedCount} item${clearedCount === 1 ? "" : "s"}.`
              : "No saved playback progress was found.",
          );
        })();
      });
      settingsUiCompatibility.markDestructive(button);
    });

  // ── Video player ──────────────────────────────────────────────────────────
  new Setting(containerEl).setName("Video player").setHeading();

  new Setting(containerEl)
    .setName("Video focus mode")
    .setDesc(
      "Show only the video for YouTube videos and Twitch VODs: hide the description, related videos, watch link and source line. The stored description is kept for search and saved notes.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.youtubeFocusMode ?? false)
        .onChange(async (value) => {
          plugin.settings.media.youtubeFocusMode = value;
          await plugin.applyVideoFocusMode(value);
          await plugin.saveSettings();
        }),
    );

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

  renderPodcastSeekBarSettings(containerEl, plugin);

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

  new Setting(containerEl)
    .setName("Apple podcast links")
    .setDesc(
      "Apple podcast links show in a podcast's open menu. Off by default.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.media.enableApplePodcastsOpen ?? false)
        .onChange(async (value) => {
          plugin.settings.media.enableApplePodcastsOpen = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl).setName("Third-party services").setHeading();

  const youtubeTosSetting = new Setting(containerEl).setName(
    "YouTube terms of service",
  );

  youtubeTosSetting.descEl.createSpan({
    text: "This plugin uses the YouTube IFrame API for video playback. By using this feature, you agree to be bound by the ",
  });

  youtubeTosSetting.descEl.createEl("a", {
    text: "YouTube terms of service",
    href: "https://www.youtube.com/t/terms",
    attr: { target: "_blank", rel: "noopener noreferrer" },
  });

  youtubeTosSetting.descEl.createSpan({
    text: ". Playing a video in the Reader also contacts Obsidian's embed host (releases.obsidian.md) with the video ID.",
  });
}
