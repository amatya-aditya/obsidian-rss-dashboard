/**
 * Clears the sidebar's multi-selection after the sidebar moved it. The
 * dashboard view owns the selection and hands the sidebar its arrays, so
 * replacing them here leaves the view's own selection as it was. An empty
 * folder selection is therefore reported through `onFolderMultiSelect`, the
 * report a Ctrl/Cmd+click on the last selected folder makes: the view clears
 * its selection and redraws the article area. Nothing is reported when nothing
 * was selected, so a plain drag keeps the open folder or feed.
 */
export function clearMovedSelection(
  selection: { selectedFolders?: string[]; selectedFeeds?: string[] },
  onFolderMultiSelect: ((folders: string[]) => void) | undefined,
): void {
  const hadSelection =
    (selection.selectedFolders?.length ?? 0) > 0 ||
    (selection.selectedFeeds?.length ?? 0) > 0;
  selection.selectedFeeds = [];
  selection.selectedFolders = [];
  if (hadSelection) onFolderMultiSelect?.([]);
}
