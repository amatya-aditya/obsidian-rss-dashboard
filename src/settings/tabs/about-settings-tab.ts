/**
 * About Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderAboutTab(containerEl, plugin)
 */
import RssDashboardPlugin from "../../../main";

export function renderAboutTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
): void {
  const aboutContainer = containerEl.createDiv({
    cls: "rss-dashboard-about-tab",
  });

  aboutContainer.createDiv({
    cls: "rss-dashboard-about-title",
    text: plugin.manifest.name,
  });
  aboutContainer.createDiv({
    cls: "rss-dashboard-about-version",
    text: `v${plugin.manifest.version}`,
  });

  const createLinkButton = (
    parent: HTMLElement,
    label: string,
    href: string,
  ): void => {
    const link = parent.createEl("a", {
      text: label,
      href,
      cls: "rss-dashboard-about-btn",
    });
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  };

  const actionsRow = aboutContainer.createDiv({
    cls: "rss-dashboard-about-btn-row",
  });
  createLinkButton(
    actionsRow,
    "GitHub",
    "https://github.com/amatya-aditya/obsidian-rss-dashboard",
  );
  createLinkButton(
    actionsRow,
    "Report issue",
    "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues",
  );
  createLinkButton(actionsRow, "Discord", "https://discord.gg/9bu7V9BBbs");

  aboutContainer.createDiv({
    cls: "rss-dashboard-about-section-title",
    text: "Support development",
  });
  const supportRow = aboutContainer.createDiv({
    cls: "rss-dashboard-about-btn-row",
  });
  createLinkButton(
    supportRow,
    "Buy me a coffee",
    "https://www.buymeacoffee.com/amatya_aditya",
  );
  createLinkButton(supportRow, "Ko-fi", "https://ko-fi.com/Y8Y41FV4WI");

  aboutContainer.createDiv({
    cls: "rss-dashboard-about-section-title",
    text: "Other plugins",
  });
  const otherPluginsRow = aboutContainer.createDiv({
    cls: "rss-dashboard-about-btn-row",
  });
  createLinkButton(
    otherPluginsRow,
    "Advanced Multi Column",
    "https://github.com/amatya-aditya/advanced-multi-column",
  );
  createLinkButton(
    otherPluginsRow,
    "Media Slider",
    "https://github.com/amatya-aditya/obsidian-media-slider",
  );
  createLinkButton(
    otherPluginsRow,
    "Zen Space",
    "https://github.com/amatya-aditya/obsidian-zen-space",
  );
}
