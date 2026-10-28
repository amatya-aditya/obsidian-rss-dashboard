export interface FolderSelectorKeyboardActions {
  isDestroyed: () => boolean;
  listEl: HTMLElement;
  inputEl: () => HTMLInputElement | undefined;
  isListOnly: () => boolean;
  clearSelection: () => void;
  scrollSelectedItemIntoView: () => void;
  selectFolder: (folderName: string) => void;
  selectRoot: () => void;
  openCreateFolderModal: () => void;
  close: () => void;
}

export function createFolderSelectorKeydownHandler(
  actions: FolderSelectorKeyboardActions,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (actions.isDestroyed()) return;

    const items = actions.listEl.querySelectorAll(".rss-folder-selector-item");
    const currentIndex = getCurrentSelectedIndex(items);

    switch (e.key) {
      case "ArrowDown":
        handleArrowDown(e, items, currentIndex, actions);
        break;

      case "ArrowUp":
        handleArrowUp(e, items, currentIndex, actions);
        break;

      case "Enter":
        handleEnter(e, actions);
        break;

      case "Escape":
        e.preventDefault();
        actions.close();
        break;

      case "Tab":
        actions.close();
        break;
    }
  };
}

function getCurrentSelectedIndex(items: NodeListOf<Element>): number {
  let currentIndex = -1;
  items.forEach((item, index) => {
    if (item.hasClass("is-selected")) {
      currentIndex = index;
    }
  });
  return currentIndex;
}

function handleArrowDown(
  e: KeyboardEvent,
  items: NodeListOf<Element>,
  currentIndex: number,
  actions: FolderSelectorKeyboardActions,
): void {
  e.preventDefault();
  const itemCount = items.length;
  if (itemCount > 0) {
    const newIndex = currentIndex < itemCount - 1 ? currentIndex + 1 : 0;
    actions.clearSelection();
    items[newIndex]?.addClass("is-selected");
    actions.scrollSelectedItemIntoView();
  }
}

function handleArrowUp(
  e: KeyboardEvent,
  items: NodeListOf<Element>,
  currentIndex: number,
  actions: FolderSelectorKeyboardActions,
): void {
  e.preventDefault();
  const itemCount = items.length;
  if (itemCount > 0) {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : itemCount - 1;
    actions.clearSelection();
    items[newIndex]?.addClass("is-selected");
    actions.scrollSelectedItemIntoView();
  }
}

function handleEnter(
  e: KeyboardEvent,
  actions: FolderSelectorKeyboardActions,
): void {
  e.preventDefault();
  const selectedItem = actions.listEl.querySelector(
    ".rss-folder-selector-item.is-selected",
  );
  const query = actions.inputEl()?.value.trim() || "";

  if (selectedItem) {
    if (
      !actions.isListOnly() &&
      selectedItem.hasClass("rss-folder-selector-create")
    ) {
      // Create new folder with the typed text (only if not in list-only mode)
      actions.selectFolder(query);
    } else if (selectedItem.hasClass("rss-folder-selector-root")) {
      actions.selectRoot();
    } else if (selectedItem.hasClass("rss-folder-selector-add-new")) {
      actions.openCreateFolderModal();
    } else {
      // Select existing folder
      const textEl = selectedItem.querySelector(".rss-folder-selector-text");
      if (textEl) {
        actions.selectFolder(textEl.textContent || "");
      }
    }
  } else if (!actions.isListOnly() && query.length > 0) {
    // No item selected but there's text - create new folder (only if not in list-only mode)
    actions.selectFolder(query);
  }
}
