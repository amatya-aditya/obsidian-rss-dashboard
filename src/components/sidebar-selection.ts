import {
  resolveBatchMovedFolder,
  type BatchMoveResult,
} from "../services/sidebar-batch-move";

/**
 * Clears the sidebar's multi-selection after the sidebar moved it. The
 * dashboard view owns the selection and hands the sidebar its arrays, so
 * replacing them here leaves the view's own selection as it was. The clear is
 * therefore reported through `onSelectionCleared`: the view clears its
 * selection and redraws the article area, and keeps its tag filter, open
 * folder and open feed. Nothing is reported when nothing was selected.
 */
export function clearMovedSelection(
  selection: { selectedFolders?: string[]; selectedFeeds?: string[] },
  onSelectionCleared: (() => void) | undefined,
): void {
  const hadSelection =
    (selection.selectedFolders?.length ?? 0) > 0 ||
    (selection.selectedFeeds?.length ?? 0) > 0;
  selection.selectedFeeds = [];
  selection.selectedFolders = [];
  if (hadSelection) onSelectionCleared?.();
}

/**
 * Tells the dashboard what a batch move changed. The selection is cleared as
 * above, then, when the batch moved the open folder or a folder it sits in,
 * the folder is reopened at its new path through `onFolderClick`, as a
 * single-folder drop does. The open folder is read before the selection is
 * cleared, which redraws the sidebar, and reopened after it, so it stays open.
 */
export function reportBatchMove(
  options: {
    currentFolder: string | null;
    selectedFolders?: string[];
    selectedFeeds?: string[];
  },
  callbacks: {
    onFolderClick: (folder: string | null) => void;
    onSelectionCleared?: () => void;
  },
  result: Pick<BatchMoveResult, "folders">,
): void {
  const movedOpenFolder = resolveBatchMovedFolder(
    options.currentFolder,
    result,
  );
  clearMovedSelection(options, callbacks.onSelectionCleared);
  if (movedOpenFolder !== null) callbacks.onFolderClick(movedOpenFolder);
}
