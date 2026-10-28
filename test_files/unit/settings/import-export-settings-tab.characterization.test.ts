import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  FactoryResetConfirmModal,
  renderImportExportSettingsTab,
} from "../../../src/settings/tabs/import-export-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { isToggleOn, setToggle } from "../test-toggle-helpers";
import type RssDashboardPlugin from "../../../main";
import type { ImportResult } from "../../../src/services/import-confirmation-model";

// The OPML and starred modals are opened with the plugin; record how.
const opened = vi.hoisted(() => ({
  opml: [] as unknown[][],
  starred: [] as unknown[][],
}));

vi.mock("../../../src/modals/import-opml-modal", () => ({
  ImportOpmlModal: class {
    constructor(...args: unknown[]) {
      opened.opml.push(args);
    }
    open(): void {
      opened.opml.push(["open"]);
    }
  },
}));

vi.mock("../../../src/modals/import-starred-modal", () => ({
  ImportStarredModal: class {
    constructor(...args: unknown[]) {
      opened.starred.push(args);
    }
    open(): void {
      opened.starred.push(["open"]);
    }
  },
}));

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type FixtureOptions = {
  hasDashboard?: boolean;
  saveThrows?: boolean;
};

function createFixture(options: FixtureOptions = {}) {
  const containerEl = document.body.appendChild(createDiv());
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
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
  };
  const saved: Array<{ args: unknown[]; settings: unknown }> = [];
  const method = (name: string, result?: unknown) =>
    vi.fn(async () => {
      calls.push(name);
      return result;
    });
  const plugin = {
    app,
    settings,
    saveSettings: vi.fn(async (...args: unknown[]) => {
      calls.push("save");
      saved.push({
        args,
        settings: JSON.parse(JSON.stringify(plugin.settings)),
      });
      if (options.saveThrows) throw new Error("save boom");
    }),
    getActiveDashboardView: vi.fn(async () => {
      calls.push("getActiveDashboardView");
      return options.hasDashboard === false ? null : dashboard;
    }),
    exportDataJson: method("exportDataJson"),
    copyDataJsonToClipboard: method("copyDataJsonToClipboard"),
    exportPortableDataBundle: method("exportPortableDataBundle"),
    copyPortableDataBundleToClipboard: method(
      "copyPortableDataBundleToClipboard",
    ),
    importPortableDataBundleFromFile: method(
      "importPortableDataBundleFromFile",
      "committed" satisfies ImportResult,
    ),
    exportFeedBundle: method("exportFeedBundle"),
    copyFeedBundleToClipboard: method("copyFeedBundleToClipboard"),
    importFeedBundleFromFile: method(
      "importFeedBundleFromFile",
      "committed" satisfies ImportResult,
    ),
    exportSettingsBundle: method("exportSettingsBundle"),
    copySettingsBundleToClipboard: method("copySettingsBundleToClipboard"),
    importSettingsBundleFromFile: method(
      "importSettingsBundleFromFile",
      "committed" satisfies ImportResult,
    ),
    exportUserSettingsJson: method("exportUserSettingsJson"),
    copyUserSettingsJsonToClipboard: method("copyUserSettingsJsonToClipboard"),
    importUserSettingsJsonFromFile: method(
      "importUserSettingsJsonFromFile",
      "committed" satisfies ImportResult,
    ),
    exportOpml: vi.fn(() => {
      calls.push("exportOpml");
    }),
    copyOpmlToClipboard: method("copyOpmlToClipboard"),
    performFactoryReset: method("performFactoryReset"),
  };
  renderImportExportSettingsTab(
    containerEl,
    plugin as unknown as RssDashboardPlugin,
  );
  return { containerEl, plugin, settings, dashboard, calls, saved, app };
}

type Fixture = ReturnType<typeof createFixture>;

function buttons(containerEl: HTMLElement): HTMLButtonElement[] {
  return Array.from(containerEl.querySelectorAll<HTMLButtonElement>("button"));
}

function buttonByText(containerEl: HTMLElement, text: string) {
  const match = buttons(containerEl).find((b) => b.textContent === text);
  if (!match) throw new Error(`Button not found: ${text}`);
  return match;
}

function buttonByLabel(containerEl: HTMLElement, label: string) {
  const match = containerEl.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

function settingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const match = Array.from(containerEl.querySelectorAll(".setting-item")).find(
    (el) => el.querySelector(".setting-item-name")?.textContent === name,
  );
  if (!match) throw new Error(`Setting not found: ${name}`);
  return match as HTMLElement;
}

/** Clicks an import button, then returns the file input it appended. */
function clickImport(containerEl: HTMLElement, label: string) {
  buttonByText(containerEl, label).click();
  const inputs =
    document.body.querySelectorAll<HTMLInputElement>('input[type="file"]');
  return inputs[inputs.length - 1];
}

async function pickFile(input: HTMLInputElement, text: string) {
  Object.defineProperty(input, "files", {
    value: [new File([text], "picked.json")],
  });
  input.onchange?.(new Event("change"));
  await flushPromises();
}

async function pickNothing(input: HTMLInputElement) {
  Object.defineProperty(input, "files", { value: [] });
  input.onchange?.(new Event("change"));
  await flushPromises();
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  opened.opml.length = 0;
  opened.starred.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderImportExportSettingsTab() layout", () => {
  it("renders the sections in order", () => {
    const { containerEl } = createFixture();
    const names = Array.from(
      containerEl.querySelectorAll<HTMLElement>(".setting-item-name"),
    )
      .map((el) => el.textContent)
      .filter((name) => name);
    expect(names).toEqual([
      "Backup & restore (data.json)",
      "Portable data bundle",
      "Feed bundle",
      "App preferences",
      "User preferences file",
      "OPML",
      "Starred imports",
      "Automatic backups",
      "Back up data.json",
      "Back up feeds (feeds.opml)",
      "Back up user preferences",
      "Factory reset",
    ]);
  });

  it("renders every button in order with its icon", () => {
    const { containerEl } = createFixture();
    const summary = buttons(containerEl).map((b) => [
      b.textContent,
      b.getAttribute("aria-label"),
    ]);
    expect(summary).toEqual([
      ["Import legacy data.json", null],
      ["Export legacy data.json", null],
      ["", "Copy legacy data.json to clipboard"],
      ["Import portable data bundle", null],
      ["Export portable data bundle", null],
      ["", "Copy portable data bundle to clipboard"],
      ["Import feed bundle", null],
      ["Export feed bundle", null],
      ["", "Copy feed bundle to clipboard"],
      ["Import settings bundle", null],
      ["Export settings bundle", null],
      ["", "Copy settings bundle to clipboard"],
      ["Import user preferences", null],
      ["Export user preferences", null],
      ["", "Copy user preferences to clipboard"],
      ["Import OPML/XML", null],
      ["Export OPML", null],
      ["", "Copy feeds.opml to clipboard"],
      ["Import starred articles", null],
      ["Factory reset", null],
    ]);
  });

  it("marks each action row with the shared actions class", () => {
    const { containerEl } = createFixture();
    expect(
      containerEl.querySelectorAll(".rss-dashboard-import-export-actions")
        .length,
    ).toBe(8);
  });

  it("renders the section descriptions", () => {
    const { containerEl } = createFixture();
    expect(
      settingByName(containerEl, "Backup & restore (data.json)").textContent,
    ).toContain("always the full legacy-format file");
    expect(settingByName(containerEl, "OPML").textContent).toContain(
      "update, which adds new feeds, and replace",
    );
    expect(
      settingByName(containerEl, "Automatic backups").textContent,
    ).toContain("before a storage migration to v2");
    expect(
      settingByName(containerEl, "Back up user preferences").textContent,
    ).toContain("rss-dashboard-user-preferences.json.backup");
  });
});

describe("legacy data.json", () => {
  it("opens a JSON file picker appended to the body", () => {
    const { containerEl } = createFixture();
    const input = clickImport(containerEl, "Import legacy data.json");
    expect(input.parentElement).toBe(document.body);
    expect(input.getAttribute("type")).toBe("file");
    expect(input.getAttribute("accept")).toBe(".json,.backup,application/json");
  });

  it("does nothing when no file is chosen", async () => {
    const { containerEl, plugin } = createFixture();
    const input = clickImport(containerEl, "Import legacy data.json");
    await pickNothing(input);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Import successful");
  });

  it("merges the file over the settings, saves, refreshes the dashboard, then confirms", async () => {
    const { containerEl, plugin, dashboard, calls, saved, app } =
      createFixture();
    const input = clickImport(containerEl, "Import legacy data.json");
    await pickFile(
      input,
      JSON.stringify({
        feeds: [{ title: "Imported", url: "https://example.test/feed" }],
        viewStyle: "card",
      }),
    );

    expect(calls).toEqual([
      "save",
      "getActiveDashboardView",
      "revealLeaf",
      "dashboard.render",
    ]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.args).toEqual([{ replacesFeedList: true }]);
    const persisted = saved[0]?.settings as typeof DEFAULT_SETTINGS;
    expect(persisted.feeds).toEqual([
      { title: "Imported", url: "https://example.test/feed" },
    ]);
    expect(persisted.viewStyle).toBe("card");
    // Keys the file lacks keep their current values (a shallow merge).
    expect(persisted.folders).toEqual(DEFAULT_SETTINGS.folders);
    expect(plugin.settings.feeds).toHaveLength(1);
    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(dashboard.leaf);
    expect(document.body.textContent).toContain("Import successful");
    expect(document.body.textContent).toContain(
      "Data imported successfully! Your dashboard has been updated.",
    );
  });

  it("replaces a whole top-level key rather than deep merging it", async () => {
    const { containerEl, saved } = createFixture();
    const input = clickImport(containerEl, "Import legacy data.json");
    await pickFile(
      input,
      JSON.stringify({ autoBackup: { backupDataJson: true } }),
    );
    const persisted = saved[0]?.settings as typeof DEFAULT_SETTINGS;
    expect(persisted.autoBackup).toEqual({ backupDataJson: true });
  });

  it("still confirms when no dashboard view is open", async () => {
    const { containerEl, calls } = createFixture({ hasDashboard: false });
    const input = clickImport(containerEl, "Import legacy data.json");
    await pickFile(input, "{}");
    expect(calls).toEqual(["save", "getActiveDashboardView"]);
    expect(document.body.textContent).toContain("Import successful");
  });

  it("shows a notice and saves nothing for invalid JSON", async () => {
    const notice = vi.spyOn(console, "debug");
    const { containerEl, plugin, settings } = createFixture();
    const before = JSON.stringify(settings);
    const input = clickImport(containerEl, "Import legacy data.json");
    await pickFile(input, "not json");
    expect(notice).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Import failed: invalid or corrupted data file.",
    );
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(JSON.stringify(plugin.settings)).toBe(before);
    expect(document.body.textContent).not.toContain("Import successful");
  });

  it("shows the same notice when the save fails", async () => {
    const notice = vi.spyOn(console, "debug");
    const { containerEl, calls } = createFixture({ saveThrows: true });
    const input = clickImport(containerEl, "Import legacy data.json");
    await pickFile(input, "{}");
    expect(notice).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Import failed: invalid or corrupted data file.",
    );
    expect(calls).toEqual(["save"]);
    expect(document.body.textContent).not.toContain("Import successful");
  });

  it("exports and copies through the plugin", () => {
    const { containerEl, plugin } = createFixture();
    buttonByText(containerEl, "Export legacy data.json").click();
    buttonByLabel(containerEl, "Copy legacy data.json to clipboard").click();
    expect(plugin.exportDataJson).toHaveBeenCalledTimes(1);
    expect(plugin.copyDataJsonToClipboard).toHaveBeenCalledTimes(1);
  });
});

describe("bundle and preference files", () => {
  const sections = [
    {
      label: "Import portable data bundle",
      exportLabel: "Export portable data bundle",
      copyLabel: "Copy portable data bundle to clipboard",
      importer: "importPortableDataBundleFromFile",
      exporter: "exportPortableDataBundle",
      copier: "copyPortableDataBundleToClipboard",
      success: "Portable data bundle imported successfully!",
      failure: "Portable data bundle import failed: ",
    },
    {
      label: "Import feed bundle",
      exportLabel: "Export feed bundle",
      copyLabel: "Copy feed bundle to clipboard",
      importer: "importFeedBundleFromFile",
      exporter: "exportFeedBundle",
      copier: "copyFeedBundleToClipboard",
      success: "Feed bundle imported successfully!",
      failure: "Feed bundle import failed: ",
    },
    {
      label: "Import settings bundle",
      exportLabel: "Export settings bundle",
      copyLabel: "Copy settings bundle to clipboard",
      importer: "importSettingsBundleFromFile",
      exporter: "exportSettingsBundle",
      copier: "copySettingsBundleToClipboard",
      success: "Settings bundle imported successfully!",
      failure: "Settings bundle import failed: ",
    },
    {
      label: "Import user preferences",
      exportLabel: "Export user preferences",
      copyLabel: "Copy user preferences to clipboard",
      importer: "importUserSettingsJsonFromFile",
      exporter: "exportUserSettingsJson",
      copier: "copyUserSettingsJsonToClipboard",
      success: "User preferences imported successfully!",
      failure: "Import failed: ",
    },
  ] as const;

  describe.each(sections)("$label", (section) => {
    function run(fixture: Fixture) {
      return clickImport(fixture.containerEl, section.label);
    }

    it("opens a JSON file picker appended to the body", () => {
      const input = run(createFixture());
      expect(input.parentElement).toBe(document.body);
      expect(input.getAttribute("accept")).toBe(
        ".json,.backup,application/json",
      );
    });

    it("does nothing when no file is chosen", async () => {
      const fixture = createFixture();
      await pickNothing(run(fixture));
      expect(fixture.plugin[section.importer]).not.toHaveBeenCalled();
    });

    it("passes the chosen file to the plugin and confirms a commit", async () => {
      const fixture = createFixture();
      await pickFile(run(fixture), "{}");
      expect(fixture.plugin[section.importer]).toHaveBeenCalledTimes(1);
      const [file] = (
        fixture.plugin[section.importer].mock.calls as unknown as [File][]
      )[0];
      expect(file.name).toBe("picked.json");
      expect(document.body.textContent).toContain("Import successful");
      expect(document.body.textContent).toContain(section.success);
    });

    it("stays silent when the import is canceled", async () => {
      const fixture = createFixture();
      fixture.plugin[section.importer].mockResolvedValue("canceled");
      await pickFile(run(fixture), "{}");
      expect(document.body.textContent).not.toContain("Import successful");
    });

    it("shows the error message in a notice when the import throws", async () => {
      const notice = vi.spyOn(console, "debug");
      const fixture = createFixture();
      fixture.plugin[section.importer].mockRejectedValue(new Error("bad"));
      await pickFile(run(fixture), "{}");
      expect(notice).toHaveBeenCalledWith(
        "[Stub Notice]",
        `${section.failure}bad`,
      );
      expect(document.body.textContent).not.toContain("Import successful");
    });

    it("says 'invalid file' when the thrown value is not an Error", async () => {
      const notice = vi.spyOn(console, "debug");
      const fixture = createFixture();
      fixture.plugin[section.importer].mockRejectedValue("oops");
      await pickFile(run(fixture), "{}");
      expect(notice).toHaveBeenCalledWith(
        "[Stub Notice]",
        `${section.failure}invalid file`,
      );
    });

    it("exports and copies through the plugin", () => {
      const fixture = createFixture();
      buttonByText(fixture.containerEl, section.exportLabel).click();
      buttonByLabel(fixture.containerEl, section.copyLabel).click();
      expect(fixture.plugin[section.exporter]).toHaveBeenCalledTimes(1);
      expect(fixture.plugin[section.copier]).toHaveBeenCalledTimes(1);
    });
  });
});

describe("OPML and starred imports", () => {
  it("opens the OPML import modal with the app and plugin", () => {
    const { containerEl, plugin, app } = createFixture();
    buttonByText(containerEl, "Import OPML/XML").click();
    expect(opened.opml).toEqual([[app, plugin], ["open"]]);
  });

  it("exports OPML and copies feeds.opml through the plugin", () => {
    const { containerEl, plugin } = createFixture();
    buttonByText(containerEl, "Export OPML").click();
    buttonByLabel(containerEl, "Copy feeds.opml to clipboard").click();
    expect(plugin.exportOpml).toHaveBeenCalledTimes(1);
    expect(plugin.copyOpmlToClipboard).toHaveBeenCalledTimes(1);
  });

  it("opens the starred import modal with the app and plugin", () => {
    const { containerEl, plugin, app } = createFixture();
    buttonByText(containerEl, "Import starred articles").click();
    expect(opened.starred).toEqual([[app, plugin], ["open"]]);
  });
});

describe("automatic backups", () => {
  const toggles = [
    ["Back up data.json", "backupDataJson", false],
    ["Back up feeds (feeds.opml)", "backupOpml", true],
    ["Back up user preferences", "backupUserdata", true],
  ] as const;

  it.each(toggles)("%s starts from the saved value", (name, key, initial) => {
    const { containerEl, settings } = createFixture();
    expect(settings.autoBackup[key]).toBe(initial);
    expect(isToggleOn(settingByName(containerEl, name))).toBe(initial);
  });

  it.each(toggles)("%s writes the new value and saves", async (name, key) => {
    const { containerEl, plugin, settings, saved } = createFixture();
    const input = settingByName(containerEl, name).querySelector(
      "input",
    ) as HTMLInputElement;
    const before = settings.autoBackup[key];

    setToggle(input, !before);
    await flushPromises();

    expect(plugin.settings.autoBackup[key]).toBe(!before);
    expect(saved).toHaveLength(1);
    expect(
      (saved[0]?.settings as typeof DEFAULT_SETTINGS).autoBackup[key],
    ).toBe(!before);
    expect(saved[0]?.args).toEqual([]);
  });

  it("leaves the other two toggles unchanged", async () => {
    const { containerEl, settings } = createFixture();
    const input = settingByName(containerEl, "Back up data.json").querySelector(
      "input",
    ) as HTMLInputElement;
    setToggle(input, true);
    await flushPromises();
    expect(settings.autoBackup).toEqual({
      backupDataJson: true,
      backupOpml: true,
      backupUserdata: true,
    });
  });
});

describe("factory reset", () => {
  it("opens the confirmation modal and resets only after it confirms", async () => {
    const { containerEl, plugin, calls } = createFixture();
    const order: string[] = [];
    vi.spyOn(FactoryResetConfirmModal.prototype, "open").mockImplementation(
      () => {
        order.push("open");
      },
    );
    vi.spyOn(
      FactoryResetConfirmModal.prototype,
      "waitForClose",
    ).mockImplementation(() => {
      order.push("waitForClose");
      return Promise.resolve(true);
    });

    buttonByText(containerEl, "Factory reset").click();
    await flushPromises();

    expect(order).toEqual(["open", "waitForClose"]);
    expect(calls).toEqual(["performFactoryReset"]);
    expect(plugin.performFactoryReset).toHaveBeenCalledTimes(1);
  });

  it("does not reset when the modal is dismissed", async () => {
    const { containerEl, plugin } = createFixture();
    vi.spyOn(FactoryResetConfirmModal.prototype, "open").mockImplementation(
      () => {},
    );
    vi.spyOn(
      FactoryResetConfirmModal.prototype,
      "waitForClose",
    ).mockResolvedValue(false);

    buttonByText(containerEl, "Factory reset").click();
    await flushPromises();

    expect(plugin.performFactoryReset).not.toHaveBeenCalled();
  });

  it("explains what is removed and what stays", () => {
    const app = obsidian.App.createMock();
    const modal = new FactoryResetConfirmModal(app);
    modal.onOpen();
    const text = modal.contentEl.textContent ?? "";
    expect(text).toContain("Factory reset?");
    expect(text).toContain("removes your feeds");
    expect(text).toContain("will not be deleted");
    expect(modal.modalEl.classList.contains("rss-dashboard-modal")).toBe(true);
  });

  it("resolves true from the Factory reset button and false from Cancel", async () => {
    const app = obsidian.App.createMock();

    const confirm = new FactoryResetConfirmModal(app);
    const confirmed = confirm.waitForClose();
    confirm.onOpen();
    buttonByText(confirm.contentEl, "Factory reset").click();
    confirm.onClose();
    await expect(confirmed).resolves.toBe(true);

    const cancel = new FactoryResetConfirmModal(app);
    const canceled = cancel.waitForClose();
    cancel.onOpen();
    buttonByText(cancel.contentEl, "Cancel").click();
    cancel.onClose();
    await expect(canceled).resolves.toBe(false);
  });

  it("resolves false when the modal closes without a choice", async () => {
    const modal = new FactoryResetConfirmModal(obsidian.App.createMock());
    const result = modal.waitForClose();
    modal.onOpen();
    modal.onClose();
    await expect(result).resolves.toBe(false);
  });
});
