import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import * as obsidian from "obsidian";
import { AddFeedModal } from "../../../src/modals/feed-manager/add-feed-modal";
import { EditFeedModal } from "../../../src/modals/feed-manager/edit-feed-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { Feed } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

// The Folder field in Add Feed and Edit Feed (#1378): a folder icon at the
// start of the input, the clear button at its end, one shared structure.

type MockApp = ReturnType<(typeof obsidian.App)["createMock"]>;

function createMockApp(): MockApp {
  return (
    obsidian.App as typeof obsidian.App & { createMock(): MockApp }
  ).createMock();
}

function openAddModal(): AddFeedModal {
  const modal = new AddFeedModal(
    createMockApp(),
    [
      { name: "Tech", subfolders: [] },
      { name: "News", subfolders: [] },
    ],
    vi.fn(async () => true),
    vi.fn(),
  );
  modal.open();
  return modal;
}

function openEditModal(): EditFeedModal {
  const app = createMockApp();
  const feed: Feed = {
    title: "Example feed",
    url: "https://example.com/feed.xml",
    folder: "Tech",
    items: [],
    lastUpdated: 0,
  };
  const plugin = {
    app,
    settings: {
      feeds: [feed],
      folders: [],
      maxItems: 50,
      corsProxyEnabled: false,
      corsProxyUrl: "",
      articleSaving: { savedTemplates: [] },
    },
    ensureFolderExists: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => {}),
    notifyFiltersUpdated: vi.fn(),
  };
  const modal = new EditFeedModal(
    app,
    plugin as unknown as RssDashboardPlugin,
    feed,
    vi.fn(),
  );
  modal.open();
  return modal;
}

function getFolderCombobox(contentEl: HTMLElement): HTMLElement {
  const row = Array.from(
    contentEl.querySelectorAll<HTMLElement>(".setting-item"),
  ).find(
    (el) => el.querySelector(".setting-item-name")?.textContent === "Folder",
  );
  const combobox = row?.querySelector<HTMLElement>(
    ".rss-dashboard-folder-combobox",
  );
  if (!combobox) throw new Error("Folder combobox not found");
  return combobox;
}

// Class lists of the wrapper's children, in order: the structure both modals
// must share.
function structureOf(combobox: HTMLElement): string[] {
  return Array.from(combobox.children).map(
    (child) =>
      child.tagName.toLowerCase() + "." + Array.from(child.classList).join("."),
  );
}

const MODALS: Array<[string, () => AddFeedModal | EditFeedModal]> = [
  ["Add Feed", openAddModal],
  ["Edit Feed", openEditModal],
];

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", {
    value: 1400,
    configurable: true,
  });
});

describe.each(MODALS)("%s modal Folder field", (_name, open) => {
  it("shows a decorative folder icon before the input", () => {
    const combobox = getFolderCombobox(open().contentEl);

    const icon = combobox.querySelector<HTMLElement>(
      ".rss-dashboard-folder-combobox-icon",
    );
    expect(icon).not.toBeNull();
    expect(icon?.querySelector("svg.svg-icon")).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(combobox.firstElementChild).toBe(icon);
    expect(icon?.nextElementSibling?.tagName).toBe("INPUT");
  });

  it("clears the folder with an input event and no change event", () => {
    const combobox = getFolderCombobox(open().contentEl);
    const input = combobox.querySelector<HTMLInputElement>("input");
    const clear = combobox.querySelector<HTMLButtonElement>(
      "button.search-input-clear-button",
    );
    if (!input || !clear)
      throw new Error("Folder input or clear button missing");
    input.value = "Tech";
    const onInput = vi.fn();
    const onChange = vi.fn();
    input.addEventListener("input", onInput);
    input.addEventListener("change", onChange);

    clear.click();

    expect(input.value).toBe("");
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it("keeps the clear button after the input, labelled Clear folder", () => {
    const combobox = getFolderCombobox(open().contentEl);

    const clear = combobox.querySelector("button.search-input-clear-button");
    expect(clear?.getAttribute("aria-label")).toBe("Clear folder");
    expect(clear?.previousElementSibling?.tagName).toBe("INPUT");
  });
});

describe("Folder field structure", () => {
  it("renders the same markup in Add Feed and Edit Feed", () => {
    const add = getFolderCombobox(openAddModal().contentEl);
    document.body.empty();
    const edit = getFolderCombobox(openEditModal().contentEl);

    expect(structureOf(edit)).toEqual(structureOf(add));
    expect(add.className).toBe(edit.className);
  });
});

describe("Folder field stylesheet", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(
    path.resolve(testDir, "../../../src/styles/add-feed-modal.css"),
    "utf-8",
  );

  function declarationsFor(selector: string): Map<string, string> {
    const found = new Map<string, string>();
    postcss.parse(css).walkRules((rule) => {
      const selectors = rule.selectors.map((s) =>
        s.replace(/\s+/g, " ").trim(),
      );
      if (!selectors.includes(selector)) return;
      rule.walkDecls((decl) => {
        found.set(decl.prop, decl.value);
      });
    });
    return found;
  }

  it("lets a click on the icon reach the input and keeps it out of the text", () => {
    const icon = declarationsFor(
      ".rss-dashboard-folder-combobox > .rss-dashboard-folder-combobox-icon",
    );

    expect(icon.get("pointer-events")).toBe("none");
    expect(icon.get("position")).toBe("absolute");
  });

  it("pads the input start to clear the icon without touching the clear button padding", () => {
    const input = declarationsFor(
      ".rss-dashboard-folder-combobox > input.rss-dashboard-folder-combobox-input",
    );

    expect(input.get("padding-inline-start")).toContain("var(--icon-s");
    expect(input.has("padding-inline-end")).toBe(false);
    expect(input.has("padding-right")).toBe(false);
  });
});
