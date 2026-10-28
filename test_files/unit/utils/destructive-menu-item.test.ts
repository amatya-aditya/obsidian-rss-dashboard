import { afterEach, describe, expect, it } from "vitest";
import { Menu, type MenuItem } from "obsidian";
import { markMenuItemDestructive } from "../../../src/utils/destructive-menu-item";
import * as ObsidianStubs from "../../stubs/obsidian";

function makeItem(): MenuItem {
  const menu = new Menu();
  let item!: MenuItem;
  menu.addItem((created) => {
    item = created;
  });
  return item;
}

describe("markMenuItemDestructive", () => {
  afterEach(() => {
    ObsidianStubs.__resetObsidianVersion();
  });

  it("turns the menu item's title and icon to the theme's warning colour", () => {
    const item = makeItem();

    markMenuItemDestructive(item);

    expect(ObsidianStubs.Menu.lastItems[0].isWarning).toBe(true);
  });

  it("keeps the item usable on Obsidian 1.8.7, where MenuItem has no setWarning", () => {
    ObsidianStubs.__setObsidianVersion("1.8.7");
    const item = makeItem();

    expect(() => markMenuItemDestructive(item)).not.toThrow();
    expect(ObsidianStubs.Menu.lastItems[0].isWarning).toBe(false);
  });

  it("tolerates an item without setWarning even when the app version reports support", () => {
    const item = makeItem();
    (
      item as unknown as { setWarning?: (warning: boolean) => unknown }
    ).setWarning = undefined;

    expect(() => markMenuItemDestructive(item)).not.toThrow();
  });
});
