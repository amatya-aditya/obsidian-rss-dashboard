import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  buildDefaultHighlights,
  isHighlightWordDuplicate,
  renderHighlightsSettingsTab,
} from "../../../src/settings/tabs/highlights-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { isToggleOn, setToggle } from "../test-toggle-helpers";
import type RssDashboardPlugin from "../../../main";

// The edit and delete modals resolve through these hoisted answers, so a test
// decides what the user typed or whether they confirmed.
const modalAnswers = vi.hoisted(() => ({
  edit: null as string | null,
  confirm: false,
  editOpened: [] as string[],
  confirmOpened: [] as string[],
}));

vi.mock("../../../src/settings/modals/settings-modals", () => ({
  HighlightWordEditModal: class {
    constructor(_app: unknown, initial: string) {
      modalAnswers.editOpened.push(initial);
    }
    open(): void {}
    waitForClose(): Promise<string | null> {
      return Promise.resolve(modalAnswers.edit);
    }
  },
  ConfirmDeleteModal: class {
    constructor(_app: unknown, label: string) {
      modalAnswers.confirmOpened.push(label);
    }
    open(): void {}
    waitForClose(): Promise<boolean> {
      return Promise.resolve(modalAnswers.confirm);
    }
  },
}));

type Word = {
  id: string;
  text: string;
  color: string;
  enabled: boolean;
  wholeWord: boolean;
  caseSensitive: boolean;
  createdAt: number;
};

function makeWord(text: string, extra: Partial<Word> = {}): Word {
  return {
    id: `hw-${text}`,
    text,
    color: "#112233",
    enabled: true,
    wholeWord: false,
    caseSensitive: false,
    createdAt: 1,
    ...extra,
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type FixtureOptions = {
  words?: Word[];
  highlights?: "default" | "missing";
  hasDashboard?: boolean;
  reader?: "none" | "ready" | "no-item" | "throws";
};

function createFixture(options: FixtureOptions = {}) {
  const containerEl = document.body.appendChild(createDiv());
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
  if (options.highlights === "missing") {
    (settings as unknown as { highlights?: unknown }).highlights = undefined;
  } else {
    settings.highlights.words = options.words ?? [];
  }
  const app = obsidian.App.createMock();
  const calls: string[] = [];
  const revealLeaf = vi.fn(async () => {
    calls.push("revealLeaf");
  });
  (app.workspace as unknown as { revealLeaf: unknown }).revealLeaf = revealLeaf;
  const dashboard = {
    leaf: { id: "leaf" },
    render: vi.fn(() => {
      calls.push("dashboard.render");
    }),
    refreshFilterStatusBarOnly: vi.fn(() => {
      calls.push("statusBar");
    }),
  };
  const displayItem = vi.fn(async () => {
    calls.push("reader.displayItem");
    if (options.reader === "throws") throw new Error("reader boom");
  });
  const readerState =
    options.reader === "no-item"
      ? { relatedItems: [1], displayItem }
      : { currentItem: { guid: "g" }, relatedItems: [1, 2], displayItem };
  const saveSettings = vi.fn(async () => {
    calls.push("save");
  });
  const plugin = {
    app,
    settings,
    saveSettings,
    getActiveDashboardView: vi.fn(async () =>
      options.hasDashboard === false ? null : dashboard,
    ),
    getActiveReaderView: vi.fn(async () =>
      options.reader === undefined || options.reader === "none"
        ? null
        : readerState,
    ),
  } as unknown as RssDashboardPlugin;
  const onRefresh = vi.fn(() => {
    calls.push("onRefresh");
  });
  return {
    containerEl,
    plugin,
    settings,
    dashboard,
    displayItem,
    saveSettings,
    onRefresh,
    calls,
  };
}

function settingNames(containerEl: HTMLElement): string[] {
  return Array.from(containerEl.querySelectorAll(".setting-item-name")).map(
    (el) => el.textContent ?? "",
  );
}

function getSetting(containerEl: HTMLElement, name: string): HTMLElement {
  const match = Array.from(containerEl.querySelectorAll(".setting-item")).find(
    (el) => el.querySelector(".setting-item-name")?.textContent === name,
  );
  if (!match) throw new Error(`Setting not found: ${name}`);
  return match as HTMLElement;
}

function getToggle(root: HTMLElement): HTMLInputElement {
  const toggle = root.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!toggle) throw new Error("Toggle not found");
  return toggle;
}

function getWordRow(containerEl: HTMLElement, text: string): HTMLElement {
  const match = Array.from(
    containerEl.querySelectorAll<HTMLElement>(
      ".rss-dashboard-highlight-word-setting",
    ),
  ).find((el) => el.querySelector(".setting-item-name")?.textContent === text);
  if (!match) throw new Error(`Word row not found: ${text}`);
  return match;
}

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  );
  if (!match) throw new Error(`Button not found: ${text}`);
  return match;
}

function extraButton(root: HTMLElement, tooltip: string): HTMLElement {
  const match = Array.from(
    root.querySelectorAll<HTMLElement>(".extra-setting-button"),
  ).find((el) => el.getAttribute("aria-label") === tooltip);
  if (!match) throw new Error(`Extra button not found: ${tooltip}`);
  return match;
}

function colorInput(root: HTMLElement): HTMLInputElement {
  const el = root.querySelector<HTMLInputElement>('input[type="color"]');
  if (!el) throw new Error("Color input not found");
  return el;
}

function setColor(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.clearAllMocks();
  modalAnswers.edit = null;
  modalAnswers.confirm = false;
  modalAnswers.editOpened.length = 0;
  modalAnswers.confirmOpened.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.empty();
});

describe("Highlights settings tab characterization: pure helpers", () => {
  it("treats a word as a duplicate by exact text, skipping the edited index", () => {
    const words = [{ text: "a" }, { text: "B" }];
    expect(isHighlightWordDuplicate(words, "a")).toBe(true);
    expect(isHighlightWordDuplicate(words, "b")).toBe(false);
    expect(isHighlightWordDuplicate(words, "a", 0)).toBe(false);
    expect(isHighlightWordDuplicate(words, "B", 0)).toBe(true);
  });

  it("builds a fresh default configuration on each call", () => {
    const a = buildDefaultHighlights();
    expect(a).toEqual({
      enabled: false,
      defaultColor: "#ffd700",
      highlightInContent: true,
      highlightInTitles: true,
      highlightInSummaries: true,
      words: [],
    });
    expect(buildDefaultHighlights().words).not.toBe(a.words);
  });
});

describe("Highlights settings tab characterization: layout", () => {
  it("renders the sections in a fixed order with an empty-state note", () => {
    const { containerEl, plugin, onRefresh } = createFixture();
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    expect(settingNames(containerEl)).toEqual([
      "Enable word highlighting",
      "Highlight locations",
      "Highlight in titles",
      "Highlight in summaries",
      "Highlight in content",
      "Highlight words",
      "Add new word",
      "Word or phrase",
      "Whole word only",
      "Case sensitive",
      "Highlight color",
      "",
    ]);
    const paragraphs = Array.from(
      containerEl.querySelectorAll<HTMLElement>("p"),
    ).map((p) => [p.textContent, p.className]);
    expect(paragraphs).toEqual([
      [
        "Choose where to apply highlights:",
        "rss-dashboard-settings-description",
      ],
      [
        "Words and phrases to highlight in articles:",
        "rss-dashboard-settings-description",
      ],
      [
        "No highlight words configured. Add words below to highlight them in articles.",
        "rss-dashboard-settings-note",
      ],
    ]);
    expect(
      containerEl.querySelector(".rss-dashboard-highlights-words-container"),
    ).not.toBeNull();
  });

  it("describes each setting", () => {
    const { containerEl, plugin, onRefresh } = createFixture();
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);
    const desc = (name: string) =>
      getSetting(containerEl, name).querySelector(".setting-item-description")
        ?.textContent;

    expect(desc("Enable word highlighting")).toBe(
      "Highlight specified words in article titles, summaries, and content",
    );
    expect(desc("Highlight in titles")).toBe(
      "Apply highlights to article titles in the list/card view",
    );
    expect(desc("Highlight in summaries")).toBe(
      "Apply highlights to article summaries in card view and feed view",
    );
    expect(desc("Highlight in content")).toBe(
      "Apply highlights to article content in reader view",
    );
    expect(desc("Whole word only")).toBe(
      "Only highlight complete words (not partial matches)",
    );
    expect(desc("Case sensitive")).toBe(
      "Only match this word/phrase with exact letter case",
    );
  });

  it("starts the add form blank with the default color and a clear button", () => {
    const { containerEl, plugin, onRefresh, settings } = createFixture();
    settings.highlights.defaultColor = "#abcdef";
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    const text = getSetting(containerEl, "Word or phrase").querySelector(
      "input",
    ) as HTMLInputElement;
    expect(text.placeholder).toBe("Enter word to highlight");
    expect(text.value).toBe("");
    expect(
      getSetting(containerEl, "Word or phrase").querySelector(
        ".rss-input-clear-button",
      ),
    ).not.toBeNull();
    expect(isToggleOn(getSetting(containerEl, "Whole word only"))).toBe(false);
    expect(isToggleOn(getSetting(containerEl, "Case sensitive"))).toBe(false);
    expect(colorInput(getSetting(containerEl, "Highlight color")).value).toBe(
      "#abcdef",
    );
    expect(buttonByText(containerEl, "Add word")).toBeTruthy();
  });

  it("falls back to defaults when highlights settings are missing", () => {
    const { containerEl, plugin, onRefresh } = createFixture({
      highlights: "missing",
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    expect(
      isToggleOn(getSetting(containerEl, "Enable word highlighting")),
    ).toBe(false);
    for (const name of [
      "Highlight in titles",
      "Highlight in summaries",
      "Highlight in content",
    ]) {
      expect(isToggleOn(getSetting(containerEl, name))).toBe(true);
    }
    expect(colorInput(getSetting(containerEl, "Highlight color")).value).toBe(
      "#ffd700",
    );
  });
});

describe("Highlights settings tab characterization: toggles", () => {
  it("saves the master toggle, then reveals and rerenders the views", async () => {
    const { containerEl, plugin, onRefresh, settings, calls, dashboard } =
      createFixture({ reader: "ready" });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(getSetting(containerEl, "Enable word highlighting")),
      true,
    );
    await flushPromises();

    expect(settings.highlights.enabled).toBe(true);
    expect(calls).toEqual([
      "save",
      "revealLeaf",
      "dashboard.render",
      "reader.displayItem",
    ]);
    expect(dashboard.render).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("hands the reader its current item and related items", async () => {
    const { containerEl, plugin, onRefresh, displayItem } = createFixture({
      reader: "ready",
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(getSetting(containerEl, "Enable word highlighting")),
      true,
    );
    await flushPromises();

    expect(displayItem).toHaveBeenCalledWith({ guid: "g" }, [1, 2]);
  });

  it("skips the reader when it has no current item", async () => {
    const { containerEl, plugin, onRefresh, displayItem, calls } =
      createFixture({ reader: "no-item" });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(getSetting(containerEl, "Enable word highlighting")),
      true,
    );
    await flushPromises();

    expect(displayItem).not.toHaveBeenCalled();
    expect(calls).toEqual(["save", "revealLeaf", "dashboard.render"]);
  });

  it("swallows a reader rerender failure", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture({
      reader: "throws",
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(getSetting(containerEl, "Enable word highlighting")),
      true,
    );
    await flushPromises();

    expect(settings.highlights.enabled).toBe(true);
    expect(calls).toEqual([
      "save",
      "revealLeaf",
      "dashboard.render",
      "reader.displayItem",
    ]);
  });

  it("still saves and rerenders the reader when no dashboard is open", async () => {
    const { containerEl, plugin, onRefresh, calls, displayItem } =
      createFixture({ hasDashboard: false, reader: "ready" });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(getSetting(containerEl, "Enable word highlighting")),
      true,
    );
    await flushPromises();

    expect(calls).toEqual(["save", "reader.displayItem"]);
    expect(displayItem).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Highlight in titles", "highlightInTitles"],
    ["Highlight in summaries", "highlightInSummaries"],
    ["Highlight in content", "highlightInContent"],
  ] as const)("%s toggles its flag and rerenders", async (name, key) => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture();
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setToggle(getToggle(getSetting(containerEl, name)), false);
    await flushPromises();

    expect(settings.highlights[key]).toBe(false);
    expect(calls).toEqual(["save", "revealLeaf", "dashboard.render"]);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("creates the default configuration before applying a toggle", async () => {
    const { containerEl, plugin, onRefresh, settings } = createFixture({
      highlights: "missing",
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setToggle(getToggle(getSetting(containerEl, "Highlight in titles")), false);
    await flushPromises();

    expect(settings.highlights).toEqual({
      ...buildDefaultHighlights(),
      highlightInTitles: false,
    });
  });
});

describe("Highlights settings tab characterization: word rows", () => {
  it("renders one row per word with status, controls and tooltips", () => {
    const { containerEl, plugin, onRefresh } = createFixture({
      words: [
        makeWord("alpha"),
        makeWord("beta", {
          enabled: false,
          wholeWord: true,
          caseSensitive: true,
          color: "",
        }),
      ],
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    expect(
      containerEl.querySelector(".rss-dashboard-settings-note"),
    ).toBeNull();
    const alpha = getWordRow(containerEl, "alpha");
    const beta = getWordRow(containerEl, "beta");
    expect(alpha.querySelector(".setting-item-description")?.textContent).toBe(
      "Partial match | Enabled",
    );
    expect(beta.querySelector(".setting-item-description")?.textContent).toBe(
      "Whole word | Disabled | Case sensitive",
    );
    expect(colorInput(alpha).value).toBe("#112233");
    // An empty word color falls back to the default color.
    expect(colorInput(beta).value).toBe("#ffd700");
    expect(isToggleOn(alpha)).toBe(true);
    expect(isToggleOn(beta)).toBe(false);

    const alphaWhole = buttonByText(alpha, "Partial");
    expect(alphaWhole.getAttribute("aria-label")).toBe(
      "Toggle whole-word matching",
    );
    expect(buttonByText(beta, "Whole word")).toBeTruthy();

    const alphaCase = buttonByText(alpha, "Case: off");
    expect(alphaCase.getAttribute("aria-label")).toBe(
      "Toggle case sensitivity",
    );
    expect(alphaCase.getAttribute("aria-pressed")).toBe("false");
    expect(alphaCase.classList.contains("mod-cta")).toBe(false);
    const betaCase = buttonByText(beta, "Case: on");
    expect(betaCase.getAttribute("aria-pressed")).toBe("true");
    expect(betaCase.classList.contains("mod-cta")).toBe(true);

    expect(extraButton(alpha, 'Edit "alpha"')).toBeTruthy();
    expect(extraButton(alpha, 'Delete "alpha"')).toBeTruthy();
    const name = alpha.querySelector<HTMLElement>(".setting-item-name");
    expect(
      name?.classList.contains("rss-dashboard-highlight-word-name-click"),
    ).toBe(true);
    expect(name?.getAttribute("aria-label")).toBe('Edit "alpha"');
  });

  it("saves a color change and rerenders without rebuilding the tab", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture({
      words: [makeWord("alpha")],
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setColor(colorInput(getWordRow(containerEl, "alpha")), "#445566");
    await flushPromises();

    expect(settings.highlights.words[0]?.color).toBe("#445566");
    expect(calls).toEqual(["save", "revealLeaf", "dashboard.render"]);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("saves the enabled toggle, rebuilds the tab, then rerenders", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture({
      words: [makeWord("alpha")],
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    setToggle(getToggle(getWordRow(containerEl, "alpha")), false);
    await flushPromises();

    expect(settings.highlights.words[0]?.enabled).toBe(false);
    expect(calls).toEqual([
      "save",
      "onRefresh",
      "revealLeaf",
      "dashboard.render",
    ]);
  });

  it("flips whole-word matching", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture({
      words: [makeWord("alpha")],
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    buttonByText(getWordRow(containerEl, "alpha"), "Partial").click();
    await flushPromises();

    expect(settings.highlights.words[0]?.wholeWord).toBe(true);
    expect(calls).toEqual([
      "save",
      "onRefresh",
      "revealLeaf",
      "dashboard.render",
    ]);
  });

  it("flips case sensitivity", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture({
      words: [makeWord("alpha")],
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    buttonByText(getWordRow(containerEl, "alpha"), "Case: off").click();
    await flushPromises();

    expect(settings.highlights.words[0]?.caseSensitive).toBe(true);
    expect(calls).toEqual([
      "save",
      "onRefresh",
      "revealLeaf",
      "dashboard.render",
    ]);
  });

  it("changes nothing when the row's word is gone from settings", async () => {
    const { containerEl, plugin, onRefresh, settings, saveSettings } =
      createFixture({ words: [makeWord("alpha")] });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);
    const row = getWordRow(containerEl, "alpha");
    settings.highlights.words = [];

    setColor(colorInput(row), "#445566");
    setToggle(getToggle(row), false);
    buttonByText(row, "Partial").click();
    buttonByText(row, "Case: off").click();
    await flushPromises();

    expect(saveSettings).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe("Highlights settings tab characterization: editing a word", () => {
  const edit = async (via: "pencil" | "name") => {
    const fixture = createFixture({
      words: [makeWord("alpha"), makeWord("beta")],
    });
    renderHighlightsSettingsTab(
      fixture.containerEl,
      fixture.plugin,
      fixture.onRefresh,
    );
    const row = getWordRow(fixture.containerEl, "alpha");
    if (via === "pencil") {
      extraButton(row, 'Edit "alpha"').click();
    } else {
      row.querySelector<HTMLElement>(".setting-item-name")?.click();
    }
    await flushPromises();
    return fixture;
  };

  it.each(["pencil", "name"] as const)(
    "opens the modal with the current text from the %s",
    async (via) => {
      modalAnswers.edit = null;
      await edit(via);
      expect(modalAnswers.editOpened).toEqual(["alpha"]);
    },
  );

  it("does nothing when the modal is cancelled", async () => {
    modalAnswers.edit = null;
    const { saveSettings, onRefresh } = await edit("pencil");
    expect(saveSettings).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("rejects blank text with a notice", async () => {
    modalAnswers.edit = "   ";
    const notice = vi.spyOn(console, "debug");
    const { saveSettings, settings } = await edit("pencil");

    expect(notice).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Please enter a word to highlight",
    );
    expect(saveSettings).not.toHaveBeenCalled();
    expect(settings.highlights.words[0]?.text).toBe("alpha");
  });

  it("rejects a duplicate of another word with a notice", async () => {
    modalAnswers.edit = "beta";
    const notice = vi.spyOn(console, "debug");
    const { saveSettings, settings } = await edit("pencil");

    expect(notice).toHaveBeenCalledWith(
      "[Stub Notice]",
      "This word is already in the list",
    );
    expect(saveSettings).not.toHaveBeenCalled();
    expect(settings.highlights.words[0]?.text).toBe("alpha");
  });

  it("saves the trimmed text, rebuilds the tab, then rerenders", async () => {
    modalAnswers.edit = "  gamma  ";
    const { settings, calls } = await edit("pencil");

    expect(settings.highlights.words[0]?.text).toBe("gamma");
    expect(calls).toEqual([
      "save",
      "onRefresh",
      "revealLeaf",
      "dashboard.render",
    ]);
  });

  it("allows re-saving the same text for the edited word", async () => {
    modalAnswers.edit = "alpha";
    const { saveSettings } = await edit("pencil");
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe("Highlights settings tab characterization: deleting a word", () => {
  const remove = async (confirm: boolean) => {
    modalAnswers.confirm = confirm;
    const notice = vi.spyOn(console, "debug");
    const fixture = createFixture({
      words: [makeWord("alpha"), makeWord("beta")],
    });
    renderHighlightsSettingsTab(
      fixture.containerEl,
      fixture.plugin,
      fixture.onRefresh,
    );
    extraButton(
      getWordRow(fixture.containerEl, "alpha"),
      'Delete "alpha"',
    ).click();
    await flushPromises();
    return { ...fixture, notice };
  };

  it("keeps the word when the confirmation is declined", async () => {
    const { settings, saveSettings, notice, calls } = await remove(false);

    expect(modalAnswers.confirmOpened).toEqual(["alpha"]);
    expect(settings.highlights.words.map((w) => w.text)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("removes the word, notifies, rebuilds the tab and refreshes only the status bar", async () => {
    const { settings, notice, calls, dashboard } = await remove(true);

    expect(settings.highlights.words.map((w) => w.text)).toEqual(["beta"]);
    expect(notice).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Deleted highlight word "alpha". Refresh the dashboard to apply highlight changes.',
    );
    expect(calls).toEqual(["save", "onRefresh", "statusBar"]);
    expect(dashboard.render).not.toHaveBeenCalled();
  });

  it("ignores the status bar refresh when no dashboard is open", async () => {
    modalAnswers.confirm = true;
    const { containerEl, plugin, onRefresh, calls } = createFixture({
      words: [makeWord("alpha")],
      hasDashboard: false,
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    extraButton(getWordRow(containerEl, "alpha"), 'Delete "alpha"').click();
    await flushPromises();

    expect(calls).toEqual(["save", "onRefresh"]);
  });
});

describe("Highlights settings tab characterization: adding a word", () => {
  const addButton = (containerEl: HTMLElement) =>
    buttonByText(containerEl, "Add word");

  const fill = (containerEl: HTMLElement, text: string) => {
    const input = getSetting(containerEl, "Word or phrase").querySelector(
      "input",
    ) as HTMLInputElement;
    input.value = text;
  };

  it("rejects blank text with a notice", async () => {
    const notice = vi.spyOn(console, "debug");
    const { containerEl, plugin, onRefresh, saveSettings } = createFixture();
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    fill(containerEl, "   ");
    addButton(containerEl).click();
    await flushPromises();

    expect(notice).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Please enter a word to highlight",
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("rejects an exact duplicate but allows a different casing", async () => {
    const notice = vi.spyOn(console, "debug");
    const { containerEl, plugin, onRefresh, settings } = createFixture({
      words: [makeWord("alpha")],
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    fill(containerEl, "alpha");
    addButton(containerEl).click();
    await flushPromises();
    expect(notice).toHaveBeenCalledWith(
      "[Stub Notice]",
      "This word is already in the list",
    );
    expect(settings.highlights.words).toHaveLength(1);

    fill(containerEl, "ALPHA");
    addButton(containerEl).click();
    await flushPromises();
    expect(settings.highlights.words.map((w) => w.text)).toEqual([
      "alpha",
      "ALPHA",
    ]);
  });

  it("appends a trimmed word with the form's options, then refreshes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    const now = Date.now();
    const { containerEl, plugin, onRefresh, settings, calls, dashboard } =
      createFixture();
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    fill(containerEl, "  gamma  ");
    setToggle(getToggle(getSetting(containerEl, "Whole word only")), true);
    setToggle(getToggle(getSetting(containerEl, "Case sensitive")), true);
    setColor(colorInput(getSetting(containerEl, "Highlight color")), "#102030");
    addButton(containerEl).click();
    await vi.advanceTimersByTimeAsync(0);

    expect(settings.highlights.words).toEqual([
      {
        id: `highlight-${now}`,
        text: "gamma",
        color: "#102030",
        enabled: true,
        wholeWord: true,
        caseSensitive: true,
        createdAt: now,
      },
    ]);
    expect(calls).toEqual(["save", "onRefresh", "statusBar"]);
    expect(dashboard.render).not.toHaveBeenCalled();
  });

  it("uses the default color and creates highlights settings when missing", async () => {
    const { containerEl, plugin, onRefresh, settings } = createFixture({
      highlights: "missing",
    });
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    fill(containerEl, "delta");
    addButton(containerEl).click();
    await flushPromises();

    expect(settings.highlights.words).toHaveLength(1);
    expect(settings.highlights.words[0]).toMatchObject({
      text: "delta",
      color: "#ffd700",
      enabled: true,
      wholeWord: false,
      caseSensitive: false,
    });
    expect(settings.highlights.enabled).toBe(false);
  });

  it("leaves the form values in place after adding", async () => {
    const { containerEl, plugin, onRefresh } = createFixture();
    renderHighlightsSettingsTab(containerEl, plugin, onRefresh);

    fill(containerEl, "epsilon");
    addButton(containerEl).click();
    await flushPromises();

    // The mock onRefresh does not rebuild the tab, so the typed text stays.
    expect(
      (
        getSetting(containerEl, "Word or phrase").querySelector(
          "input",
        ) as HTMLInputElement
      ).value,
    ).toBe("epsilon");
  });
});
