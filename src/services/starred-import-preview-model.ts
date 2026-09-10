import type { StarredImportCandidate } from "./starred-import-mapper";
import { isValidFolderName, type ValidationResult } from "../utils/validation";
import type { FeedItem } from "../types/types";

export type StarredImportGroupSelectionState = {
  checked: boolean;
  indeterminate: boolean;
};

export type StarredImportPreviewItemSnapshot = {
  guid: string;
  title: string;
  link: string;
  author?: string;
  pubDate: string;
  read: boolean;
  selected: boolean;
};

export type StarredImportPreviewGroupSnapshot = {
  feedUrl: string;
  feedTitle: string;
  isNewFeed: boolean;
  folder?: string;
  items: StarredImportPreviewItemSnapshot[];
};

export type StarredImportNewFeedSelection = {
  feedUrl: string;
  feedTitle: string;
  folder: string;
  siteUrl?: string;
};

interface CandidateState {
  candidate: StarredImportCandidate;
  selected: boolean;
}

export const DEFAULT_NEW_FEED_FOLDER = "Uncategorized";

/**
 * Article-shaped (not feed/folder-shaped) preview-selection model for the
 * starred.json importer. Parallel in shape to `OpmlImportPreviewModel`'s
 * public surface where the shared importer shell requires it (`getStats()`),
 * but groups candidate articles by their source feed rather than by folder.
 *
 * A group can now (234-02) represent a source feed the user does not
 * already subscribe to — `isNewFeed: true` — in which case it also carries
 * an editable target folder (`getNewFeedFolder`/`setNewFeedFolder`), mirroring
 * `OpmlImportPreviewModel`'s inline folder-rename interaction pattern.
 */
export class StarredImportPreviewModel {
  private readonly candidateByGuid = new Map<string, CandidateState>();
  private readonly groupOrder: string[] = [];
  private readonly guidsByFeedUrl = new Map<string, string[]>();
  private readonly feedTitleByUrl = new Map<string, string>();
  private readonly isNewFeedByUrl = new Map<string, boolean>();
  private readonly newFeedFolderByUrl = new Map<string, string>();
  private readonly newFeedSiteUrlByUrl = new Map<string, string | undefined>();

  constructor(args: { candidates: StarredImportCandidate[] }) {
    for (const candidate of args.candidates) {
      const guid = candidate.item.guid;
      this.candidateByGuid.set(guid, { candidate, selected: true });

      if (!this.guidsByFeedUrl.has(candidate.feedUrl)) {
        this.guidsByFeedUrl.set(candidate.feedUrl, []);
        this.groupOrder.push(candidate.feedUrl);
        this.feedTitleByUrl.set(candidate.feedUrl, candidate.feedTitle);
        this.isNewFeedByUrl.set(candidate.feedUrl, candidate.isNewFeed === true);
        if (candidate.isNewFeed) {
          this.newFeedFolderByUrl.set(candidate.feedUrl, DEFAULT_NEW_FEED_FOLDER);
          this.newFeedSiteUrlByUrl.set(candidate.feedUrl, candidate.feedSiteUrl);
        }
      }
      this.guidsByFeedUrl.get(candidate.feedUrl)?.push(guid);
    }
  }

  getGroups(): StarredImportPreviewGroupSnapshot[] {
    return this.groupOrder.map((feedUrl) => ({
      feedUrl,
      feedTitle: this.feedTitleByUrl.get(feedUrl) ?? feedUrl,
      isNewFeed: this.isNewFeedByUrl.get(feedUrl) === true,
      folder: this.isNewFeedByUrl.get(feedUrl)
        ? this.getNewFeedFolder(feedUrl)
        : undefined,
      items: (this.guidsByFeedUrl.get(feedUrl) ?? []).map((guid) =>
        this.snapshotItem(guid),
      ),
    }));
  }

  isNewFeedGroup(feedUrl: string): boolean {
    return this.isNewFeedByUrl.get(feedUrl) === true;
  }

  getNewFeedFolder(feedUrl: string): string {
    return this.newFeedFolderByUrl.get(feedUrl) ?? DEFAULT_NEW_FEED_FOLDER;
  }

  /**
   * Edits the target folder for a new-feed group, mirroring the OPML
   * importer's inline folder-rename interaction (validated the same way,
   * via `isValidFolderName`).
   */
  setNewFeedFolder(feedUrl: string, folder: string): ValidationResult {
    if (!this.isNewFeedGroup(feedUrl)) {
      return { valid: false, error: "Not a new-feed group." };
    }
    const trimmed = folder.trim();
    const validation = isValidFolderName(trimmed);
    if (!validation.valid) {
      return validation;
    }
    this.newFeedFolderByUrl.set(feedUrl, trimmed);
    return { valid: true };
  }

  /**
   * New-feed groups (candidate `Feed` records for source feeds not already
   * subscribed to locally) that have at least one selected article, along
   * with the folder the user assigned. Used at execute time to know which
   * new feeds must actually be created.
   */
  getSelectedNewFeedGroups(): StarredImportNewFeedSelection[] {
    const result: StarredImportNewFeedSelection[] = [];
    for (const feedUrl of this.groupOrder) {
      if (!this.isNewFeedGroup(feedUrl)) continue;
      const guids = this.guidsByFeedUrl.get(feedUrl) ?? [];
      const hasSelectedItem = guids.some(
        (guid) => this.candidateByGuid.get(guid)?.selected,
      );
      if (!hasSelectedItem) continue;

      result.push({
        feedUrl,
        feedTitle: this.feedTitleByUrl.get(feedUrl) ?? feedUrl,
        folder: this.getNewFeedFolder(feedUrl),
        siteUrl: this.newFeedSiteUrlByUrl.get(feedUrl),
      });
    }
    return result;
  }

  getGroupSelectionState(feedUrl: string): StarredImportGroupSelectionState {
    const guids = this.guidsByFeedUrl.get(feedUrl) ?? [];
    if (guids.length === 0) return { checked: false, indeterminate: false };

    const selectedCount = guids.filter(
      (guid) => this.candidateByGuid.get(guid)?.selected,
    ).length;

    return {
      checked: selectedCount === guids.length,
      indeterminate: selectedCount > 0 && selectedCount < guids.length,
    };
  }

  toggleItem(guid: string, selected: boolean): void {
    const state = this.candidateByGuid.get(guid);
    if (!state) return;
    state.selected = selected;
  }

  toggleGroup(feedUrl: string, selected: boolean): void {
    const guids = this.guidsByFeedUrl.get(feedUrl) ?? [];
    for (const guid of guids) {
      const state = this.candidateByGuid.get(guid);
      if (state) state.selected = selected;
    }
  }

  selectAll(): void {
    for (const state of this.candidateByGuid.values()) {
      state.selected = true;
    }
  }

  selectNone(): void {
    for (const state of this.candidateByGuid.values()) {
      state.selected = false;
    }
  }

  /**
   * The live `FeedItem` reference backing a candidate row (234-12) — not a
   * copy of it, unlike `snapshotItem`/`getGroups`. The per-article tag chip
   * mutates the object returned here directly, so an edit made in the
   * preview (add/remove/create a tag) is already present on the same object
   * `performImport` later reads from `getSelectedCandidates`, with no
   * separate sync step required.
   */
  getCandidateItem(guid: string): FeedItem | undefined {
    return this.candidateByGuid.get(guid)?.candidate.item;
  }

  /**
   * The full candidate backing a row, including its `labelDerivedTagNames`
   * provenance — unlike `getCandidateItem`, which only exposes the live
   * `FeedItem` for direct mutation by the tag chip's portal.
   */
  getCandidate(guid: string): StarredImportCandidate | undefined {
    return this.candidateByGuid.get(guid)?.candidate;
  }

  getSelectedCandidates(): StarredImportCandidate[] {
    return Array.from(this.candidateByGuid.values())
      .filter((state) => state.selected)
      .map((state) => state.candidate);
  }

  getStats(): {
    totalGroups: number;
    totalItems: number;
    selectedItems: number;
    newFeedGroups: number;
  } {
    const all = Array.from(this.candidateByGuid.values());
    return {
      totalGroups: this.groupOrder.length,
      totalItems: all.length,
      selectedItems: all.filter((state) => state.selected).length,
      newFeedGroups: this.groupOrder.filter((feedUrl) =>
        this.isNewFeedGroup(feedUrl),
      ).length,
    };
  }

  private snapshotItem(guid: string): StarredImportPreviewItemSnapshot {
    const state = this.candidateByGuid.get(guid);
    if (!state) {
      throw new Error(`Unknown starred import candidate guid: ${guid}`);
    }
    return {
      guid,
      title: state.candidate.item.title,
      link: state.candidate.item.link,
      author: state.candidate.item.author,
      pubDate: state.candidate.item.pubDate,
      read: state.candidate.item.read === true,
      selected: state.selected,
    };
  }
}
