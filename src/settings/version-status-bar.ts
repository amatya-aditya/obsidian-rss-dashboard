import { Setting, type Plugin as ObsidianPlugin } from "obsidian";
import { formatBuildLabel, getBuildInfo } from "../utils/build-info";

type Command = Parameters<ObsidianPlugin["addCommand"]>[0];

export interface VersionStatusBarFeatureOptions {
  version: string;
  enabled: boolean;
  addStatusBarItem?: () => HTMLElement;
  addCommand: (command: Command) => unknown;
  saveEnabled: (enabled: boolean) => Promise<void>;
}

/** Owns the optional version readout and its user-facing enable controls. */
export class VersionStatusBarFeature {
  private readonly options: VersionStatusBarFeatureOptions;
  private enabled: boolean;
  private statusItem: HTMLElement | null = null;

  constructor(options: VersionStatusBarFeatureOptions) {
    this.options = options;
    this.enabled = options.enabled;
    this.renderStatusItem();
  }

  renderSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Show version in status bar")
      .setDesc(
        "Display the plugin version, build identifier, and build timestamp in Obsidian's status bar.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.enabled).onChange((enabled) => {
          void this.setEnabled(enabled);
        }),
      );
  }

  registerCommand(): void {
    this.options.addCommand({
      id: "show-version-in-status-bar",
      name: "Toggle version in status bar",
      callback: () => {
        void this.setEnabled(!this.enabled);
      },
    });
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.options.saveEnabled(enabled);
    this.enabled = enabled;
    this.renderStatusItem();
  }

  dispose(): void {
    this.statusItem?.remove();
    this.statusItem = null;
  }

  private renderStatusItem(): void {
    if (!this.enabled) {
      this.statusItem?.remove();
      this.statusItem = null;
      return;
    }

    if (this.statusItem || !this.options.addStatusBarItem) return;

    this.statusItem = this.options.addStatusBarItem();
    this.statusItem.setText(
      formatBuildLabel(this.options.version, getBuildInfo()),
    );
  }
}
