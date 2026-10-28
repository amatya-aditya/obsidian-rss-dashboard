import type { App } from "obsidian";
import { Notice } from "obsidian";
import type {
  Feed,
  FeedEncoding,
  FeedKeywordRulesSettings,
} from "../../types/types";
import type { EditFeedPlugin } from "./edit-feed-plugin";
import { TagApplicationConfirmModal } from "./tag-application-confirm-modal";
import {
  applyTagsToItems,
  removeTagsFromItemsByName,
} from "../../services/tag-applier";
import { resolveTagObjects } from "../../utils/tag-resolver";
import { getEffectiveDateMs } from "../../services/feed-parser/feed-retention.js";

/**
 * The modal state the Save action reads. The modal builds it per call with
 * getters, so each read sees the modal's current field, even across awaits.
 */
export interface EditFeedSaveHost {
  readonly app: App;
  readonly plugin: EditFeedPlugin;
  readonly feed: Feed;
  readonly url: string;
  readonly title: string;
  readonly folder: string;
  readonly folderInput?: HTMLInputElement;
  readonly customTags: string[];
  readonly originalCustomTags: string[];
  readonly autoDeleteDuration: number;
  readonly maxItemsLimit: number;
  readonly scanInterval: number;
  readonly excludeFromRefresh: boolean;
  readonly feedEncoding: FeedEncoding;
  readonly customTemplate: string;
  readonly feedKeywordRules: FeedKeywordRulesSettings;
  close(): void;
  onSave(): void;
}

interface PreviousFeedValues {
  oldTitle: string;
  previousAutoDeleteDuration: number;
  previousFeedEncoding: FeedEncoding;
  finalFolder: string;
}

export async function saveEditedFeed(host: EditFeedSaveHost): Promise<void> {
  // --- Determine if customTags changed ---
  const tagsChanged =
    host.customTags.length !== host.originalCustomTags.length ||
    host.customTags.some((t, i) => t !== host.originalCustomTags[i]);

  if (tagsChanged) {
    const proceed = await confirmCustomTagChange(host);
    if (!proceed) return;
  }

  const previous = applyIdentityFields(host);

  if (previous.finalFolder) {
    await host.plugin.ensureFolderExists(previous.finalFolder);
  }

  const newMaxItemsLimit = applyOptionFields(host, previous.oldTitle);
  const didAutoDeleteDurationChange =
    previous.previousAutoDeleteDuration !== host.autoDeleteDuration;
  const didFeedEncodingChange =
    previous.previousFeedEncoding !== host.feedEncoding;

  trimItemsToLimit(host, newMaxItemsLimit);
  await host.plugin.saveSettings();
  if (didAutoDeleteDurationChange || didFeedEncodingChange) {
    await host.plugin.refreshSelectedFeed?.(host.feed);
  }
  host.plugin.notifyFiltersUpdated({
    source: "edit-feed-modal",
    feedUrl: host.feed.url,
    timestamp: Date.now(),
  });
  host.close();
  host.onSave();
}

/** Asks how to apply the tag change; false means the user cancelled the save. */
async function confirmCustomTagChange(
  host: EditFeedSaveHost,
): Promise<boolean> {
  const confirmModal = new TagApplicationConfirmModal(host.app);
  const choice = confirmModal.waitForClose();
  confirmModal.open();
  const result = await choice;

  if (result === "cancel_save") {
    return false;
  }

  if (result === "apply_existing") {
    const oldSet = new Set(host.originalCustomTags);
    const newSet = new Set(host.customTags);
    const removedNames = host.originalCustomTags.filter((n) => !newSet.has(n));
    const addedNames = host.customTags.filter((n) => !oldSet.has(n));
    removeTagsFromItemsByName(host.feed.items, removedNames);
    const availableTags = host.plugin.settings.availableTags ?? [];
    const addedTags = resolveTagObjects(addedNames, availableTags);
    applyTagsToItems(host.feed.items, addedTags);
  }

  host.feed.customTags = host.customTags;
  return true;
}

function applyIdentityFields(host: EditFeedSaveHost): PreviousFeedValues {
  const oldTitle = host.feed.title;
  const oldUrl = host.feed.url;
  const previousAutoDeleteDuration =
    typeof host.feed.autoDeleteDuration === "number"
      ? host.feed.autoDeleteDuration
      : 0;
  const previousFeedEncoding = host.feed.feedEncoding ?? "auto";
  host.feed.title = host.title;
  host.feed.url = host.url;
  if (oldUrl !== host.url) {
    host.feed.lastRefreshAttemptCompletedAt = 0;
    host.feed.lastFetchError = undefined;
  }
  const finalFolder = host.folderInput?.value || host.folder;
  host.feed.folder = finalFolder;

  return {
    oldTitle,
    previousAutoDeleteDuration,
    previousFeedEncoding,
    finalFolder,
  };
}

/** Copies the option fields onto the feed; returns the max items limit it set. */
function applyOptionFields(host: EditFeedSaveHost, oldTitle: string): number {
  host.feed.autoDeleteDuration = host.autoDeleteDuration;

  // Update feedTitle for all articles in this feed when the title changes
  if (oldTitle !== host.title) {
    for (const item of host.feed.items) {
      item.feedTitle = host.title;
    }
  }

  const newMaxItemsLimit = Number.isFinite(host.maxItemsLimit)
    ? host.maxItemsLimit
    : host.plugin.settings.maxItems;

  host.feed.maxItemsLimit = newMaxItemsLimit;
  host.feed.scanInterval = host.scanInterval;
  host.feed.excludeFromRefresh = host.excludeFromRefresh;
  host.feed.feedEncoding =
    host.feedEncoding === "windows-1251" ? host.feedEncoding : undefined;
  host.feed.customTemplate = host.customTemplate || undefined;
  host.feed.keywordRules = {
    overrideGlobalRules: host.feedKeywordRules.overrideGlobalRules,
    includeLogic: host.feedKeywordRules.includeLogic,
    rules: host.feedKeywordRules.rules,
  };

  return newMaxItemsLimit;
}

function trimItemsToLimit(
  host: EditFeedSaveHost,
  newMaxItemsLimit: number,
): void {
  if (newMaxItemsLimit > 0 && host.feed.items.length > newMaxItemsLimit) {
    host.feed.items.sort(
      (a, b) =>
        getEffectiveDateMs(b, host.plugin.settings.useFirstSeenDateFallback) -
        getEffectiveDateMs(a, host.plugin.settings.useFirstSeenDateFallback),
    );
    host.feed.items = host.feed.items.slice(0, newMaxItemsLimit);
    new Notice(`Feed updated and trimmed to ${newMaxItemsLimit} articles`);
  } else {
    new Notice("Feed updated");
  }
}
