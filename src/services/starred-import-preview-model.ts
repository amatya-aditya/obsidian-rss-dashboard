import type { StarredImportCandidate } from "./starred-import-mapper";

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
  items: StarredImportPreviewItemSnapshot[];
};

interface CandidateState {
  candidate: StarredImportCandidate;
  selected: boolean;
}

/**
 * Article-shaped (not feed/folder-shaped) preview-selection model for the
 * starred.json importer. Parallel in shape to `OpmlImportPreviewModel`'s
 * public surface where the shared importer shell requires it (`getStats()`),
 * but groups candidate articles by their already-existing source feed
 * instead of by folder, since 234-01 never creates new feeds or folders.
 */
export class StarredImportPreviewModel {
  private readonly candidateByGuid = new Map<string, CandidateState>();
  private readonly groupOrder: string[] = [];
  private readonly guidsByFeedUrl = new Map<string, string[]>();
  private readonly feedTitleByUrl = new Map<string, string>();

  constructor(args: { candidates: StarredImportCandidate[] }) {
    for (const candidate of args.candidates) {
      const guid = candidate.item.guid;
      this.candidateByGuid.set(guid, { candidate, selected: true });

      if (!this.guidsByFeedUrl.has(candidate.feedUrl)) {
        this.guidsByFeedUrl.set(candidate.feedUrl, []);
        this.groupOrder.push(candidate.feedUrl);
        this.feedTitleByUrl.set(candidate.feedUrl, candidate.feedTitle);
      }
      this.guidsByFeedUrl.get(candidate.feedUrl)?.push(guid);
    }
  }

  getGroups(): StarredImportPreviewGroupSnapshot[] {
    return this.groupOrder.map((feedUrl) => ({
      feedUrl,
      feedTitle: this.feedTitleByUrl.get(feedUrl) ?? feedUrl,
      items: (this.guidsByFeedUrl.get(feedUrl) ?? []).map((guid) =>
        this.snapshotItem(guid),
      ),
    }));
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

  getSelectedCandidates(): StarredImportCandidate[] {
    return Array.from(this.candidateByGuid.values())
      .filter((state) => state.selected)
      .map((state) => state.candidate);
  }

  getStats(): {
    totalGroups: number;
    totalItems: number;
    selectedItems: number;
  } {
    const all = Array.from(this.candidateByGuid.values());
    return {
      totalGroups: this.groupOrder.length,
      totalItems: all.length,
      selectedItems: all.filter((state) => state.selected).length,
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
