import { Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import type { Feed, SavedTemplate, Tag } from "../../types/types";
import type { EditFeedPlugin } from "./edit-feed-plugin";
import {
  renderAutoDeleteSetting,
  renderAutoTagsSetting,
  renderExcludeFromRefreshSetting,
  renderFeedEncodingSetting,
  renderMaxItemsSetting,
  renderScanIntervalSetting,
} from "./add-feed-options-section";
import type { AddFeedOptionsState } from "./add-feed-options-section";
import { MediaService } from "../../services/media-service";
import { copyTextToClipboard } from "../../utils/export-utils";
import { createIconButton } from "../../utils/icon-button";
import { ConfirmTemplateReplacementModal } from "../../settings/modals/settings-modals";
import { applyTagAppearance } from "../../utils/tag-colors";

const PER_FEED_HIGHLIGHT_DURATION_MS = 3000;

/**
 * What the Feed options section reads from the modal: the shared option state
 * plus the plugin, the edited feed, and which section to expand or highlight.
 */
export interface EditFeedOptionsHost extends AddFeedOptionsState {
  app: App;
  plugin: EditFeedPlugin;
  feed: Feed;
  readonly options?: {
    expandSection?: "per-feed" | "rules";
    highlightSection?: "per-feed" | "rules";
  };
}

function highlightElement(el: HTMLElement, className: string): void {
  el.addClass(className);
  window.setTimeout(() => {
    el.removeClass(className);
  }, PER_FEED_HIGHLIGHT_DURATION_MS);
}

export function renderEditFeedOptionsSection(
  contentEl: HTMLElement,
  host: EditFeedOptionsHost,
): void {
  const perFeedControlsDetails = contentEl.createEl("details", {
    cls: "rss-keyword-filter-details rss-per-feed-controls-details",
  });
  perFeedControlsDetails.createEl("summary", {
    cls: "rss-keyword-filter-summary",
    text: "Feed options",
  });
  const perFeedControlsBody = perFeedControlsDetails.createDiv({
    cls: "rss-keyword-filter-details-body",
  });

  renderFeedEncodingSetting(perFeedControlsBody, host);

  if (host.options?.expandSection === "per-feed") {
    perFeedControlsDetails.open = true;
  }
  if (host.options?.highlightSection === "per-feed") {
    highlightElement(perFeedControlsDetails, "rss-per-feed-controls-highlight");
    window.requestAnimationFrame(() => {
      perFeedControlsDetails.scrollIntoView({ block: "nearest" });
    });
  }

  const availableTags: Tag[] = host.plugin?.settings.availableTags ?? [];

  renderInheritedTagsSetting(perFeedControlsBody, host, availableTags);
  renderLocalStorageAddressSetting(perFeedControlsBody, host);
  renderPerFeedLimitSettings(perFeedControlsBody, host);
  renderExcludeFromRefreshSetting(perFeedControlsBody, host);
  renderEditArticleTemplateSetting(perFeedControlsBody, host);
  renderAutoTagsSetting(
    perFeedControlsBody,
    host,
    availableTags,
    host.plugin?.settings,
  );
}

function renderInheritedTagsSetting(
  perFeedControlsBody: HTMLElement,
  host: EditFeedOptionsHost,
  availableTags: Tag[],
): void {
  const inheritedTags = MediaService.getInheritedTagsAndCategory(
    host.feed,
    availableTags,
    host.plugin?.settings.media,
  ).tags;

  if (inheritedTags.length > 0) {
    const inheritedTagsSetting = new Setting(perFeedControlsBody)
      .setName("Inherited auto-tags")
      .setDesc(
        "Global tags applied automatically based on the feed type and settings. Configure these under auto tagging in the tags settings tab.",
      );

    const tagsList = inheritedTagsSetting.controlEl.createDiv({
      cls: "rss-dashboard-inherited-tags",
    });

    inheritedTags.forEach((tag) => {
      const tagEl = tagsList.createSpan({
        cls: "rss-dashboard-tag-badge",
        text: tag.name,
      });
      applyTagAppearance(tagEl, tag, host.plugin.settings);
    });
  }
}

function renderLocalStorageAddressSetting(
  perFeedControlsBody: HTMLElement,
  host: EditFeedOptionsHost,
): void {
  const localStorageAddressResult = host.plugin.getFeedLocalStorageAddress?.(
    host.feed,
  ) ?? {
    mode: host.plugin.settings.storageMode,
    address: "data.json",
  };
  const hasResolvedLocalAddress = localStorageAddressResult.address.length > 0;
  const storageDescription = "Shows where this feed is stored.";
  const feedIdText = host.feed.feedId?.trim()
    ? host.feed.feedId
    : "Not assigned";
  const storageStatusText =
    localStorageAddressResult.mode !== "legacy-json"
      ? hasResolvedLocalAddress
        ? "Stored in shard storage"
        : "Shard storage selected (address unavailable)"
      : "Stored in legacy data.json";

  const localAddressSetting = new Setting(perFeedControlsBody)
    .setName("Local storage address")
    .setDesc(storageDescription);
  const localAddressRow = localAddressSetting.controlEl.createDiv({
    cls: "rss-edit-feed-storage-address-row",
  });
  const localAddressTextGroup = localAddressRow.createDiv({
    cls: "rss-edit-feed-storage-address-text",
  });
  localAddressTextGroup.createDiv({
    cls: "rss-edit-feed-storage-status",
    text: storageStatusText,
  });
  localAddressTextGroup.createDiv({
    cls: "rss-edit-feed-storage-feed-id",
    text: `Feed ID: ${feedIdText}`,
  });

  const copyStorageAddressButton = createIconButton({
    parent: localAddressRow,
    cls: "clickable-icon rss-edit-feed-storage-copy-button",
    label: "Copy local storage address",
    icon: "copy",
  });

  const copyLocalAddress = () => {
    if (!hasResolvedLocalAddress) {
      new Notice("Storage address unavailable for this feed.");
      return;
    }

    void (async () => {
      const result = await copyTextToClipboard(
        localStorageAddressResult.address,
      );
      if (result === "copied") {
        new Notice("Copied local storage address.");
        return;
      }

      new Notice("Failed to copy local storage address.");
    })();
  };

  copyStorageAddressButton.addEventListener("click", copyLocalAddress);
}

function renderPerFeedLimitSettings(
  perFeedControlsBody: HTMLElement,
  host: EditFeedOptionsHost,
): void {
  const autoDeleteSetting = renderAutoDeleteSetting(perFeedControlsBody, host);

  if (host.options?.highlightSection === "per-feed") {
    highlightElement(
      autoDeleteSetting.settingEl,
      "rss-per-feed-auto-delete-highlight",
    );
    window.requestAnimationFrame(() => {
      autoDeleteSetting.settingEl.scrollIntoView({ block: "nearest" });
    });
  }

  renderMaxItemsSetting(perFeedControlsBody, host);
  renderScanIntervalSetting(perFeedControlsBody, host);
}

function renderEditArticleTemplateSetting(
  perFeedControlsBody: HTMLElement,
  host: EditFeedOptionsHost,
): void {
  // Template selection
  const savedTemplates =
    host.plugin.settings.articleSaving.savedTemplates || [];

  new Setting(perFeedControlsBody)
    .setName("Article template")
    .setDesc(
      "This feed's template takes precedence over the global default. Replacing an existing assignment requires confirmation.",
    )
    .addDropdown((dropdown) => {
      dropdown.addOption("", "Use global default template");
      savedTemplates.forEach((template: SavedTemplate) => {
        dropdown.addOption(template.id, template.name);
      });
      dropdown.setValue(host.getCustomTemplate());
      dropdown.onChange((value) => {
        const currentId = host.getCustomTemplate();
        if (currentId && value && currentId !== value) {
          const templates =
            host.plugin.settings.articleSaving.savedTemplates || [];
          const current = templates.find(
            (template) => template.id === currentId,
          );
          const next = templates.find((template) => template.id === value);
          const confirm = new ConfirmTemplateReplacementModal(
            host.app,
            host.feed.title,
            current?.name || "Current template",
            next?.name || "Selected template",
          );
          confirm.open();
          void confirm.waitForClose().then((accepted) => {
            if (accepted) host.setCustomTemplate(value);
            else dropdown.setValue(currentId);
          });
          return;
        }
        host.setCustomTemplate(value);
      });
    });
}
