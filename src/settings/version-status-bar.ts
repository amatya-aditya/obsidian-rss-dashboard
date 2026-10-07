import { Setting, type Plugin as ObsidianPlugin } from "obsidian";
import { formatBuildLabel, getBuildInfo } from "../utils/build-info";

type Command = Parameters<ObsidianPlugin["addCommand"]>[0];

export interface VersionStatusBarFeatureOptions {
  version: string;
  enabled: boolean;
  addStatusBarItem?: () => HTMLElement;
  /** Opens the dashboard, or reveals it when it is already open. */
  openDashboard: () => void | Promise<void>;
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

    const item = this.options.addStatusBarItem();
    this.statusItem = item;
    // The label never changes after creation, so assistive tech announces it
    // once. The "Open dashboard" command is the keyboard route to the click.
    item.setText(formatBuildLabel(this.options.version, getBuildInfo()));
    item.setAttr("role", "status");
    item.setAttr("aria-label", `RSS Dashboard version ${this.options.version}`);
    item.addClass("mod-clickable");
    item.addEventListener("click", () => {
      if (this.statusItem !== item) return;
      void this.options.openDashboard();
    });
  }
}
