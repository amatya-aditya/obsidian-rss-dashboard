/**
 * Tags Settings Tab renderer.
 *
 * Extracted from the monolithic settings-tab.ts.
 * Exports:
 *   - renderTagsSettingsTab(containerEl, plugin, onRefresh)
 */
import { Setting } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { updateTagInSettings } from "../../utils/tag-utils";

export function renderTagsSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
  onRefresh: () => void,
): void {
  const tagsContainer = containerEl.createDiv({
    cls: "rss-dashboard-tags-container",
  });

  for (let i = 0; i < plugin.settings.availableTags.length; i++) {
    const tag = plugin.settings.availableTags[i];

    new Setting(tagsContainer)
      .setName(tag.name)
      .addColorPicker((colorPicker) =>
        colorPicker.setValue(tag.color).onChange(async (value) => {
          updateTagInSettings(plugin.settings, tag, { color: value });
          await plugin.saveSettings();
          await plugin.refreshOpenTagColorViews();
          plugin.app.workspace.trigger("rss-dashboard:tags-mutated");
        }),
      )
      .addButton((button) =>
        button
          .setIcon("trash")
          .setTooltip("Delete tag")
          .onClick(async () => {
            plugin.settings.availableTags.splice(i, 1);
            await plugin.saveSettings();
            onRefresh();
          }),
      );
  }

  new Setting(containerEl).setName("Add new tag").setHeading();

  const newTagContainer = containerEl.createDiv();

  const tagNameSetting = new Setting(newTagContainer)
    .setName("Tag name")
    .addText((text) => text.setPlaceholder("Enter tag name"));

  const tagColorSetting = new Setting(newTagContainer)
    .setName("Tag color")
    .addColorPicker((colorPicker) => colorPicker.setValue("#3498db"));

  new Setting(newTagContainer).addButton((button) =>
    button.setButtonText("Add tag").onClick(async () => {
      const nameInput = tagNameSetting.components[0] as unknown as {
        inputEl: HTMLInputElement;
      };
      const name = nameInput.inputEl.value;
      const colorPicker = tagColorSetting.components[0] as unknown as {
        getValue: () => string;
      };
      const color = colorPicker.getValue();

      if (!name) return;

      plugin.settings.availableTags.push({ name, color });
      await plugin.saveSettings();
      onRefresh();
    }),
  );
}
