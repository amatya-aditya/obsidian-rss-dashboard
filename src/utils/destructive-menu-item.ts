import { requireApiVersion, type MenuItem } from "obsidian";

/**
 * Marks a context-menu item as destructive, which turns its title and icon
 * red in the theme's warning colour.
 *
 * `MenuItem.setWarning` is missing from Obsidian 1.8.7 and arrives in 1.10.0.
 * On older apps the item keeps its normal menu colour but still performs the
 * action, so the menu keeps working.
 */
export function markMenuItemDestructive(item: MenuItem): MenuItem {
  if (requireApiVersion("1.10.0") && typeof item.setWarning === "function") {
    item.setWarning(true);
  }
  return item;
}
