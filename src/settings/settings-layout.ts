/** A purpose-based section that retains the host's row presentation on desktop. */
export function createSettingsGroup(parent: HTMLElement): HTMLElement {
  return parent.createDiv({ cls: "rss-dashboard-settings-group" });
}
