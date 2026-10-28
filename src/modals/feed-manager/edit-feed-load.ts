import type { FeedEncoding } from "../../types/types";
import type { EditFeedPlugin } from "./edit-feed-plugin";
import type { SupportedFeedType } from "./supported-format-badges";
import {
  formatLatestEntryLabel,
  getDefaultFolderForResolvedFeed,
  getPreviewConversionNotice,
  resolveAndLoadPreview,
  shouldAutoAssignFolder,
} from "./feed-preview-loader";
import type { FeedPreviewLoadResult } from "./feed-preview-loader";

const EMPTY_FEED_VALIDATION_WARNING =
  "Feed validation passed, however no content detected.";

/**
 * The modal state and DOM the Load action reads and writes. The modal builds
 * it per call with accessors, so each read sees the modal's current field.
 */
export interface EditFeedLoadHost {
  plugin: EditFeedPlugin;
  url: string;
  title: string;
  folder: string;
  status: string;
  latestEntry: string;
  readonly feedEncoding: FeedEncoding;
  readonly loadBtn: HTMLButtonElement;
  readonly urlInput?: HTMLInputElement;
  readonly titleInput?: HTMLInputElement;
  readonly folderInput?: HTMLInputElement;
  readonly statusDiv?: HTMLDivElement;
  readonly latestEntryDiv?: HTMLDivElement;
  setActiveBadge(type: SupportedFeedType | null): void;
  clearActiveBadge(): void;
}

export async function loadEditFeed(host: EditFeedLoadHost): Promise<void> {
  beginLoading(host);

  try {
    const preview = await resolveAndLoadPreview(host.url, {
      corsProxyEnabled: host.plugin?.settings?.corsProxyEnabled,
      corsProxyUrl: host.plugin?.settings?.corsProxyUrl,
      feedEncoding: host.feedEncoding,
    });

    const conversionNotice = getPreviewConversionNotice(preview);

    applyPreviewFields(host, preview);
    renderPreviewStatus(host, preview, conversionNotice);

    if (host.urlInput) {
      host.urlInput.addClass("loaded");
    }
    host.setActiveBadge(preview.detectedType);

    autoAssignFolderForPreview(host, preview);
  } catch (e) {
    showLoadError(host, e);
  } finally {
    // Reset loading state
    host.loadBtn.removeClass("loading");
    host.loadBtn.disabled = false;
  }
}

function beginLoading(host: EditFeedLoadHost): void {
  // Set loading state
  host.status = "⏳ Loading...";
  host.loadBtn.addClass("loading");
  host.loadBtn.disabled = true;
  host.clearActiveBadge();

  if (host.statusDiv) {
    host.statusDiv.textContent = host.status;
    host.statusDiv.removeClass("rss-dashboard-status-warning");
    host.statusDiv.removeClass("status-ok");
    host.statusDiv.removeClass("status-error");
    host.statusDiv.addClass("status-loading");
  }
}

function applyPreviewFields(
  host: EditFeedLoadHost,
  preview: FeedPreviewLoadResult,
): void {
  host.url = preview.finalUrl;
  if (host.urlInput) host.urlInput.value = host.url;

  host.title = preview.title;
  if (host.titleInput) host.titleInput.value = host.title;

  host.latestEntry = formatLatestEntryLabel(preview.latestPubDate);
  if (host.latestEntryDiv) {
    host.latestEntryDiv.textContent = host.latestEntry;
  }
}

function renderPreviewStatus(
  host: EditFeedLoadHost,
  preview: FeedPreviewLoadResult,
  conversionNotice: string,
): void {
  if (host.statusDiv) {
    host.statusDiv.removeClass("status-loading");
    host.statusDiv.removeClass("status-error");
    host.statusDiv.removeClass("status-ok");
    host.statusDiv.removeClass("rss-dashboard-status-warning");

    if (preview.hasEntries) {
      host.status = "OK";
      host.statusDiv.textContent = `✅ OK${conversionNotice}`;
      host.statusDiv.addClass("status-ok");
    } else {
      host.status = EMPTY_FEED_VALIDATION_WARNING;
      host.statusDiv.textContent = `⚠ ${EMPTY_FEED_VALIDATION_WARNING}${conversionNotice}`;
      host.statusDiv.addClass("rss-dashboard-status-warning");
    }
  }
}

function autoAssignFolderForPreview(
  host: EditFeedLoadHost,
  preview: FeedPreviewLoadResult,
): void {
  const currentFolder = host.folderInput?.value || "";
  if (
    host.folderInput &&
    shouldAutoAssignFolder(currentFolder, host.plugin?.settings?.media)
  ) {
    const nextFolder = getDefaultFolderForResolvedFeed(
      preview,
      host.plugin?.settings?.media,
    );
    host.folder = nextFolder;
    host.folderInput.value = nextFolder;
  }
}

function showLoadError(host: EditFeedLoadHost, e: unknown): void {
  const errorMsg = e instanceof Error ? e.message : String(e);
  host.status = "Error loading feed";
  host.latestEntry = "-";
  if (host.latestEntryDiv) {
    host.latestEntryDiv.textContent = host.latestEntry;
  }
  console.error("Feed load error:", e);
  // Error state
  if (host.statusDiv) {
    host.statusDiv.textContent = `❌ ${errorMsg}`;
    host.statusDiv.removeClass("status-loading");
    host.statusDiv.removeClass("status-ok");
    host.statusDiv.removeClass("rss-dashboard-status-warning");
    host.statusDiv.addClass("status-error");
  }
}
