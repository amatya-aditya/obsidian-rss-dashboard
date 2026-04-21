# Obsidian Settings Reference

This file is a prompt-friendly companion to [`node_modules/obsidian/obsidian.d.ts`](../../node_modules/obsidian/obsidian.d.ts) for building settings tabs and settings-driven UI in this plugin.

Use this file when you need the common settings API surface quickly. Fall back to the full declaration file when you need methods not listed here, inheritance details, or adjacent UI APIs such as `Modal`, `Notice`, `SearchComponent`, or `ColorComponent`.

## Use This File For

- Building or editing a `PluginSettingTab`
- Adding standard `Setting` rows
- Wiring text, dropdown, toggle, and button controls to plugin settings
- Following the repo's current settings patterns without pasting the full `obsidian.d.ts`

## Source Of Truth

- Authoritative API: [`node_modules/obsidian/obsidian.d.ts`](../../node_modules/obsidian/obsidian.d.ts)
- Current repo examples:
  - [`src/settings/settings-tab.ts`](../../src/settings/settings-tab.ts)
  - [`src/components/auto-tag-rule-editor.ts`](../../src/components/auto-tag-rule-editor.ts)

This document is intentionally selective. It is not a complete Obsidian API reference.

## Relevant APIs

### `PluginSettingTab`

From `obsidian.d.ts`:

```ts
export abstract class PluginSettingTab extends SettingTab {
  constructor(app: App, plugin: Plugin);
}
```

What matters in practice:

- Extend `PluginSettingTab` for plugin settings screens.
- Register the tab from plugin `onload()` with `this.addSettingTab(...)`.
- Render the tab inside `display()`, usually after clearing `this.containerEl`.

### `Setting`

From `obsidian.d.ts`:

```ts
export class Setting {
  constructor(containerEl: HTMLElement);
  setName(name: string | DocumentFragment): this;
  setDesc(desc: string | DocumentFragment): this;
  setClass(cls: string): this;
  setTooltip(tooltip: string, options?: TooltipOptions): this;
  setHeading(): this;
  setDisabled(disabled: boolean): this;
  addButton(cb: (component: ButtonComponent) => any): this;
  addToggle(cb: (component: ToggleComponent) => any): this;
  addText(cb: (component: TextComponent) => any): this;
  addDropdown(cb: (component: DropdownComponent) => any): this;
}
```

What matters in practice:

- `new Setting(containerEl)` creates one settings row.
- Use `setName()` and `setDesc()` for the visible label and supporting text.
- Use `setHeading()` for section headers.
- Use `setClass()` for plugin-specific styling hooks.
- Use `setDisabled()` when the whole row should become inactive based on current state.

### `TextComponent`

`TextComponent` extends `AbstractTextComponent<HTMLInputElement>`.

Relevant methods:

```ts
export class AbstractTextComponent<
  T extends HTMLInputElement | HTMLTextAreaElement,
> extends ValueComponent<string> {
  inputEl: T;
  setDisabled(disabled: boolean): this;
  getValue(): string;
  setValue(value: string): this;
  setPlaceholder(placeholder: string): this;
  onChange(callback: (value: string) => any): this;
}

export class TextComponent extends AbstractTextComponent<HTMLInputElement> {
  constructor(containerEl: HTMLElement);
}
```

### `DropdownComponent`

```ts
export class DropdownComponent extends ValueComponent<string> {
  selectEl: HTMLSelectElement;
  constructor(containerEl: HTMLElement);
  setDisabled(disabled: boolean): this;
  addOption(value: string, display: string): this;
  addOptions(options: Record<string, string>): this;
  getValue(): string;
  setValue(value: string): this;
  onChange(callback: (value: string) => any): this;
}
```

### `ToggleComponent`

```ts
export class ToggleComponent extends ValueComponent<boolean> {
  toggleEl: HTMLElement;
  constructor(containerEl: HTMLElement);
  setDisabled(disabled: boolean): this;
  getValue(): boolean;
  setValue(on: boolean): this;
  setTooltip(tooltip: string, options?: TooltipOptions): this;
  onChange(callback: (value: boolean) => any): this;
}
```

### `ButtonComponent`

```ts
export class ButtonComponent extends BaseComponent {
  buttonEl: HTMLButtonElement;
  constructor(containerEl: HTMLElement);
  setDisabled(disabled: boolean): this;
  setCta(): this;
  removeCta(): this;
  setWarning(): this;
  setTooltip(tooltip: string, options?: TooltipOptions): this;
  setButtonText(name: string): this;
  setIcon(icon: IconName): this;
  setClass(cls: string): this;
  onClick(callback: (evt: MouseEvent) => any): this;
}
```

## Component Patterns

### Text Input

Use text inputs for string settings and lightweight inline edits.

```ts
new Setting(containerEl)
  .setName("Default RSS tag")
  .setDesc("Default tag for RSS articles")
  .addText((text) => {
    text
      .setPlaceholder("rss")
      .setValue(this.plugin.settings.defaultRssTag)
      .onChange(async (value) => {
        this.plugin.settings.defaultRssTag = value.trim();
        await this.plugin.saveSettings();
      });
  });
```

Notes:

- `text.inputEl` is available for lower-level DOM access such as `spellcheck`, focus, or key handlers.
- Normalize user input before saving when the setting expects trimmed values.

### Dropdown

Use dropdowns for enum-like settings.

```ts
new Setting(containerEl)
  .setName("View style")
  .setDesc("Choose between list and card view for articles")
  .addDropdown((dropdown) =>
    dropdown
      .addOption("list", "List")
      .addOption("card", "Card")
      .setValue(this.plugin.settings.viewStyle)
      .onChange(async (value) => {
        this.plugin.settings.viewStyle = value as "list" | "card";
        await this.plugin.saveSettings();
      }),
  );
```

Notes:

- Add options before `setValue()` so the current value resolves correctly.
- Use a cast only when the saved type is narrower than the dropdown's string value.

### Toggle

Use toggles for booleans and enabled states.

```ts
new Setting(containerEl)
  .setName("Use web viewer")
  .setDesc("Use web viewer core plugin for articles when available")
  .addToggle((toggle) =>
    toggle
      .setValue(this.plugin.settings.useWebViewer)
      .onChange(async (value) => {
        this.plugin.settings.useWebViewer = value;
        await this.plugin.saveSettings();
      }),
  );
```

Notes:

- Prefer toggles over string or dropdown controls for plain on/off settings.
- `Setting#setDisabled()` is the usual way to disable the whole row from a parent condition.

### Button

Use buttons for explicit actions such as save, import, reapply, delete, or open modal flows.

```ts
new Setting(actionsSurface)
  .setName("Scan all and apply auto tagging")
  .setDesc("Scan every stored article and apply enabled auto-tagging rules.")
  .addButton((button) => {
    button
      .setButtonText("Scan and tag")
      .setCta()
      .onClick(() => {
        void onReapply();
      });
  });
```

Notes:

- Use `setCta()` for the primary action in a row.
- Use `setWarning()` for destructive actions such as delete/reset flows.
- `button.buttonEl` is available when custom classes or lower-level DOM access are needed.

## Repo Patterns

### Register The Settings Tab In `onload()`

This plugin's settings tab should be added from plugin `onload()` using `this.addSettingTab(...)`.

```ts
async onload() {
  await this.loadSettings();
  this.settingTab = new RssDashboardSettingTab(this.app, this);
  this.addSettingTab(this.settingTab);
}
```

### Extend `PluginSettingTab`

Settings tab classes should extend `PluginSettingTab`.

```ts
export class RssDashboardSettingTab extends PluginSettingTab {
  plugin: RssDashboardPlugin;

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
  }
}
```

### Use `Setting` Rows For Sections And Controls

Section heading:

```ts
new Setting(containerEl).setName("Dashboard").setHeading();
```

Row bound to saved settings:

```ts
new Setting(containerEl)
  .setName("Show summary")
  .setDesc("Display content summary in card view")
  .addToggle((toggle) =>
    toggle
      .setValue(this.plugin.settings.showSummary)
      .onChange(async (value) => {
        this.plugin.settings.showSummary = value;
        await this.plugin.saveSettings();
      }),
  );
```

### Persist Settings With `loadData()` / `saveData()`

Plugin data should be loaded and saved through the plugin wrapper methods that call Obsidian persistence APIs.

```ts
async loadSettings() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}

async saveSettings() {
  await this.saveData(this.settings);
}
```

### Rerender Or Refresh When A Setting Affects Nearby UI

For editors with dependent controls or summaries, save first and rerender only when the UI structure must change.

```ts
const commit = ({ rerender = false } = {}) => {
  void (async () => {
    await onChange();
    if (rerender) {
      renderAutoTagRuleEditor(options);
    }
  })();
};
```

Use rerenders for structural changes such as:

- adding or deleting rule cards
- changing condition type and needing different controls
- rebuilding dependent option groups

Prefer in-place updates when only text or enabled state changes.

## When To Use Full `obsidian.d.ts`

Open the full declaration file instead of relying on this doc when you need:

- methods not listed here, such as `addExtraButton()`, `addSearch()`, `addTextArea()`, or `addColorPicker()`
- adjacent UI APIs like `Modal`, `Notice`, `SearchComponent`, `ColorComponent`, or `SuggestModal`
- inheritance details for shared component behavior
- exact property names on component elements such as `inputEl`, `selectEl`, or `buttonEl`
- confirmation that a method exists before prompting an LLM to use it

## Prompt Snippet

Use this when asking an LLM to build or edit settings UI in this repo:

```text
Use docs/development/obsidian-settings-reference.md as the primary reference for settings UI patterns in this plugin. Fall back to node_modules/obsidian/obsidian.d.ts only if you need methods or component types not covered there. Follow this repo's conventions: extend PluginSettingTab, register with this.addSettingTab() in onload(), use Setting rows for controls, and persist settings with loadData()/saveData().
```

## Repo Rule Reminder

When changing plugin code:

- edit TypeScript source in `src/`, not `main.js`
- run `npm run build` before handing off
