import { Menu, type MenuItem } from "obsidian";

export const SAVE_DEFAULT_TITLE = "Save with default settings";
export const SAVE_CUSTOM_TITLE = "Save to custom folder...";

/** Lets a Custom save dialog drive the Save button's spinner while it saves. */
export interface CustomSaveHooks {
  onSavingChange: (saving: boolean) => void;
}

export interface SaveOptionHandlers {
  onDefaultSave: () => void;
  onCustomSave: () => void;
}

/** Adds the two save choices (Default save and Custom save) to a menu. */
export function addSaveOptionItems(
  menu: Menu,
  handlers: SaveOptionHandlers,
): void {
  menu.addItem((item: MenuItem) => {
    item
      .setTitle(SAVE_DEFAULT_TITLE)
      .setIcon("save")
      .onClick(() => handlers.onDefaultSave());
  });
  menu.addItem((item: MenuItem) => {
    item
      .setTitle(SAVE_CUSTOM_TITLE)
      .setIcon("folder")
      .onClick(() => handlers.onCustomSave());
  });
}

/** Opens a menu with the two save choices at the click, or below the anchor for a key press. */
export function showSaveOptionsMenu(
  event: Event,
  anchor: HTMLElement,
  handlers: SaveOptionHandlers,
): void {
  const menu = new Menu();
  addSaveOptionItems(menu, handlers);
  if (event instanceof MouseEvent) {
    menu.showAtMouseEvent(event);
    return;
  }
  const rect = anchor.getBoundingClientRect();
  menu.showAtPosition({ x: rect.left, y: rect.bottom });
}
