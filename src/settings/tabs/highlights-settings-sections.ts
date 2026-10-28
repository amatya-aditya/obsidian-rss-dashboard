/** Focused renderers and helpers for the Highlights settings tab. */
import { Notice, Setting, setTooltip } from "obsidian";
import {
  HighlightWordEditModal,
  ConfirmDeleteModal,
} from "../modals/settings-modals";
import { addInputClearButton } from "../../utils/input-clear-button";
import type { HighlightWord as StoredHighlightWord } from "../../types/types";
import type { HighlightsSettingsPlugin } from "./highlights-settings-plugin";

// ── Types (inline to avoid circular deps) ────────────────────────────────────

interface HighlightWord {
  id: string;
  text: string;
  color: string;
  enabled: boolean;
  wholeWord: boolean;
  caseSensitive: boolean;
  createdAt: number;
}

interface HighlightsConfig {
  enabled: boolean;
  defaultColor: string;
  highlightInContent: boolean;
  highlightInTitles: boolean;
  highlightInSummaries: boolean;
  words: HighlightWord[];
}

interface HighlightViewRefreshers {
  refreshHighlightStatusBarOnly: () => Promise<void>;
  rerenderHighlightViews: () => Promise<void>;
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Returns true if `text` already appears in `words`, optionally ignoring
 * the entry at `excludeIndex` (useful when editing an existing word).
 *
 * Comparison is case-sensitive (two different casings are allowed).
 */
export function isHighlightWordDuplicate(
  words: { text: string }[],
  text: string,
  excludeIndex?: number,
): boolean {
  return words.some((w, i) => i !== excludeIndex && w.text === text);
}

/**
 * Returns a fresh, default highlights configuration object.
 * Each call produces a new object — no shared references.
 */
export function buildDefaultHighlights(): HighlightsConfig {
  return {
    enabled: false,
    defaultColor: "#ffd700",
    highlightInContent: true,
    highlightInTitles: true,
    highlightInSummaries: true,
    words: [],
  };
}

/** Ensures plugin.settings.highlights is initialised. Returns the config. */
function ensureHighlights(plugin: HighlightsSettingsPlugin): HighlightsConfig {
  if (!plugin.settings.highlights) {
    plugin.settings.highlights = buildDefaultHighlights();
  }
  return plugin.settings.highlights as unknown as HighlightsConfig;
}

// ── Shared view-refresh helpers ───────────────────────────────────────────

function createHighlightViewRefreshers(
  plugin: HighlightsSettingsPlugin,
): HighlightViewRefreshers {
  const refreshHighlightStatusBarOnly = async (): Promise<void> => {
    const dashboardView = await plugin.getActiveDashboardView();
    dashboardView?.refreshFilterStatusBarOnly();
  };

  const rerenderHighlightViews = async (): Promise<void> => {
    const dashboardView = await plugin.getActiveDashboardView();
    if (dashboardView) {
      await plugin.app.workspace.revealLeaf(dashboardView.leaf);
      dashboardView.render();
    }

    const readerView = await plugin.getActiveReaderView();
    if (readerView) {
      try {
        const viewState = readerView as unknown as {
          currentItem?: unknown;
          relatedItems?: unknown[];
          displayItem?: (
            item: unknown,
            relatedItems?: unknown[],
          ) => Promise<void>;
        };

        if (
          viewState.currentItem &&
          typeof viewState.displayItem === "function"
        ) {
          await viewState.displayItem(
            viewState.currentItem,
            viewState.relatedItems ?? [],
          );
        }
      } catch {
        // Best-effort refresh: avoid surfacing non-critical reader rerender errors.
      }
    }
  };

  return { refreshHighlightStatusBarOnly, rerenderHighlightViews };
}

// ── Main toggle ───────────────────────────────────────────────────────────

function renderMainToggle(
  containerEl: HTMLElement,
  plugin: HighlightsSettingsPlugin,
  { rerenderHighlightViews }: HighlightViewRefreshers,
): void {
  new Setting(containerEl)
    .setName("Enable word highlighting")
    .setDesc(
      "Highlight specified words in article titles, summaries, and content",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.highlights?.enabled ?? false)
        .onChange(async (value) => {
          const h = ensureHighlights(plugin);
          h.enabled = value;
          await plugin.saveSettings();
          await rerenderHighlightViews();
        }),
    );
}

// ── Highlight locations ───────────────────────────────────────────────────

function renderLocationSection(
  containerEl: HTMLElement,
  plugin: HighlightsSettingsPlugin,
  { rerenderHighlightViews }: HighlightViewRefreshers,
): void {
  new Setting(containerEl).setName("Highlight locations").setHeading();
  containerEl.createEl("p", {
    text: "Choose where to apply highlights:",
    cls: "rss-dashboard-settings-description",
  });

  const renderLocationToggle = (
    name: string,
    desc: string,
    key: "highlightInTitles" | "highlightInSummaries" | "highlightInContent",
  ) => {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.highlights?.[key] ?? true)
          .onChange(async (value) => {
            const h = ensureHighlights(plugin);
            h[key] = value;
            await plugin.saveSettings();
            await rerenderHighlightViews();
          }),
      );
  };

  renderLocationToggle(
    "Highlight in titles",
    "Apply highlights to article titles in the list/card view",
    "highlightInTitles",
  );
  renderLocationToggle(
    "Highlight in summaries",
    "Apply highlights to article summaries in card view and feed view",
    "highlightInSummaries",
  );
  renderLocationToggle(
    "Highlight in content",
    "Apply highlights to article content in reader view",
    "highlightInContent",
  );
}

// ── Existing words list ───────────────────────────────────────────────────

function editHighlightWord(
  plugin: HighlightsSettingsPlugin,
  word: StoredHighlightWord,
  index: number,
  onRefresh: () => void,
  { rerenderHighlightViews }: HighlightViewRefreshers,
): void {
  void (async () => {
    const modal = new HighlightWordEditModal(plugin.app, word.text);
    modal.open();
    const nextTextRaw = await modal.waitForClose();
    if (nextTextRaw === null) return;
    const nextText = nextTextRaw.trim();
    if (!nextText) {
      new Notice("Please enter a word to highlight");
      return;
    }
    if (
      isHighlightWordDuplicate(
        plugin.settings.highlights?.words ?? [],
        nextText,
        index,
      )
    ) {
      new Notice("This word is already in the list");
      return;
    }
    const h = ensureHighlights(plugin);
    const highlightWord = h.words[index];
    if (!highlightWord) return;
    highlightWord.text = nextText;
    await plugin.saveSettings();
    onRefresh();
    await rerenderHighlightViews();
  })();
}

async function deleteHighlightWord(
  plugin: HighlightsSettingsPlugin,
  word: StoredHighlightWord,
  index: number,
  onRefresh: () => void,
  { refreshHighlightStatusBarOnly }: HighlightViewRefreshers,
): Promise<void> {
  const confirmModal = new ConfirmDeleteModal(plugin.app, word.text);
  confirmModal.open();
  const shouldDelete = await confirmModal.waitForClose();
  if (!shouldDelete) return;
  const h = ensureHighlights(plugin);
  h.words.splice(index, 1);
  await plugin.saveSettings();
  new Notice(
    `Deleted highlight word "${word.text}". Refresh the dashboard to apply highlight changes.`,
  );
  onRefresh();
  await refreshHighlightStatusBarOnly();
}

function renderHighlightWordRow(
  wordsContainer: HTMLElement,
  plugin: HighlightsSettingsPlugin,
  word: StoredHighlightWord,
  index: number,
  onRefresh: () => void,
  refreshers: HighlightViewRefreshers,
): void {
  const { rerenderHighlightViews } = refreshers;
  const matchMode = word.wholeWord ? "Whole word" : "Partial match";
  const enabledState = word.enabled ? "Enabled" : "Disabled";
  const statusParts = [matchMode, enabledState];
  if (word.caseSensitive) statusParts.push("Case sensitive");

  const openEditModal = () => {
    editHighlightWord(plugin, word, index, onRefresh, refreshers);
  };

  const wordSetting = new Setting(wordsContainer)
    .setName(word.text)
    .setClass("rss-dashboard-highlight-word-setting")
    .setDesc(statusParts.join(" | "))
    .addColorPicker((colorPicker) =>
      colorPicker
        .setValue(
          word.color || plugin.settings.highlights?.defaultColor || "#ffd700",
        )
        .onChange(async (value) => {
          const h = ensureHighlights(plugin);
          const highlightWord = h.words[index];
          if (!highlightWord) return;
          highlightWord.color = value;
          await plugin.saveSettings();
          await rerenderHighlightViews();
        }),
    )
    .addToggle((toggle) =>
      toggle.setValue(word.enabled).onChange(async (value) => {
        const h = ensureHighlights(plugin);
        const highlightWord = h.words[index];
        if (!highlightWord) return;
        highlightWord.enabled = value;
        await plugin.saveSettings();
        onRefresh();
        await rerenderHighlightViews();
      }),
    )
    .addButton((button) =>
      button
        .setButtonText(word.wholeWord ? "Whole word" : "Partial")
        .setTooltip("Toggle whole-word matching")
        .onClick(async () => {
          const h = ensureHighlights(plugin);
          const highlightWord = h.words[index];
          if (!highlightWord) return;
          highlightWord.wholeWord = !highlightWord.wholeWord;
          await plugin.saveSettings();
          onRefresh();
          await rerenderHighlightViews();
        }),
    )
    .addButton((button) => {
      button
        .setButtonText(word.caseSensitive ? "Case: on" : "Case: off")
        .setTooltip("Toggle case sensitivity");
      button.buttonEl.setAttribute(
        "aria-pressed",
        word.caseSensitive ? "true" : "false",
      );
      if (word.caseSensitive) button.setCta();
      return button.onClick(async () => {
        const h = ensureHighlights(plugin);
        const highlightWord = h.words[index];
        if (!highlightWord) return;
        highlightWord.caseSensitive = !highlightWord.caseSensitive;
        await plugin.saveSettings();
        onRefresh();
        await rerenderHighlightViews();
      });
    })
    .addExtraButton((button) =>
      button
        .setIcon("pencil")
        .setTooltip(`Edit "${word.text}"`)
        .onClick(openEditModal),
    )
    .addExtraButton((button) =>
      button
        .setIcon("trash")
        .setTooltip(`Delete "${word.text}"`)
        .onClick(async () => {
          await deleteHighlightWord(plugin, word, index, onRefresh, refreshers);
        }),
    );

  wordSetting.nameEl.addClass("rss-dashboard-highlight-word-name-click");
  setTooltip(wordSetting.nameEl, `Edit "${word.text}"`);
  wordSetting.nameEl.addEventListener("click", openEditModal);
}

function renderWordsSection(
  containerEl: HTMLElement,
  plugin: HighlightsSettingsPlugin,
  onRefresh: () => void,
  refreshers: HighlightViewRefreshers,
): void {
  new Setting(containerEl).setName("Highlight words").setHeading();
  containerEl.createEl("p", {
    text: "Words and phrases to highlight in articles:",
    cls: "rss-dashboard-settings-description",
  });

  const wordsContainer = containerEl.createDiv({
    cls: "rss-dashboard-highlights-words-container",
  });

  const words = plugin.settings.highlights?.words ?? [];
  if (words.length === 0) {
    wordsContainer.createEl("p", {
      text: "No highlight words configured. Add words below to highlight them in articles.",
      cls: "rss-dashboard-settings-note",
    });
  } else {
    words.forEach((word, index) => {
      renderHighlightWordRow(
        wordsContainer,
        plugin,
        word,
        index,
        onRefresh,
        refreshers,
      );
    });
  }
}

// ── Add new word ──────────────────────────────────────────────────────────

function renderAddWordSection(
  containerEl: HTMLElement,
  plugin: HighlightsSettingsPlugin,
  onRefresh: () => void,
  { refreshHighlightStatusBarOnly }: HighlightViewRefreshers,
): void {
  new Setting(containerEl).setName("Add new word").setHeading();

  const newWordContainer = containerEl.createDiv();

  const wordInputSetting = new Setting(newWordContainer)
    .setName("Word or phrase")
    .addText((text) => {
      text.setPlaceholder("Enter word to highlight");
      addInputClearButton(text.inputEl);
    });

  const wholeWordSetting = new Setting(newWordContainer)
    .setName("Whole word only")
    .setDesc("Only highlight complete words (not partial matches)")
    .addToggle((toggle) => toggle.setValue(false));

  const caseSensitiveSetting = new Setting(newWordContainer)
    .setName("Case sensitive")
    .setDesc("Only match this word/phrase with exact letter case")
    .addToggle((toggle) => toggle.setValue(false));

  const colorSetting = new Setting(newWordContainer)
    .setName("Highlight color")
    .addColorPicker((colorPicker) =>
      colorPicker.setValue(
        plugin.settings.highlights?.defaultColor ?? "#ffd700",
      ),
    );

  new Setting(newWordContainer).addButton((button) =>
    button.setButtonText("Add word").onClick(async () => {
      const textInput = wordInputSetting.components[0] as unknown as {
        inputEl: HTMLInputElement;
      };
      const colorPicker = colorSetting.components[0] as unknown as {
        getValue: () => string;
      };
      const wholeWordToggle = wholeWordSetting.components[0] as unknown as {
        getValue: () => boolean;
      };
      const caseSensitiveToggle = caseSensitiveSetting
        .components[0] as unknown as {
        getValue: () => boolean;
      };

      const text = textInput.inputEl.value.trim();
      const color = colorPicker.getValue();
      const wholeWord = wholeWordToggle.getValue();
      const caseSensitive = caseSensitiveToggle.getValue();

      if (!text) {
        new Notice("Please enter a word to highlight");
        return;
      }

      const h = ensureHighlights(plugin);

      if (isHighlightWordDuplicate(h.words, text)) {
        new Notice("This word is already in the list");
        return;
      }

      h.words.push({
        id: `highlight-${Date.now()}`,
        text,
        color,
        enabled: true,
        wholeWord,
        caseSensitive,
        createdAt: Date.now(),
      });

      await plugin.saveSettings();
      onRefresh();
      await refreshHighlightStatusBarOnly();
    }),
  );
}

// ── Section composition ───────────────────────────────────────────────────

export function renderHighlightsSettingsSections(
  containerEl: HTMLElement,
  plugin: HighlightsSettingsPlugin,
  onRefresh: () => void,
): void {
  const refreshers = createHighlightViewRefreshers(plugin);
  renderMainToggle(containerEl, plugin, refreshers);
  renderLocationSection(containerEl, plugin, refreshers);
  renderWordsSection(containerEl, plugin, onRefresh, refreshers);
  renderAddWordSection(containerEl, plugin, onRefresh, refreshers);
}
