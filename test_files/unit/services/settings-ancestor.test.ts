import { beforeEach, describe, expect, it } from "vitest";
import { App } from "obsidian";
import { SettingsAncestorStore } from "../../../src/services/settings-ancestor";
import { SETTINGS_ANCESTOR_STORAGE_KEY } from "../../../src/utils/settings-loader";

describe("SettingsAncestorStore", () => {
  let app: App;
  let store: SettingsAncestorStore;

  beforeEach(() => {
    app = App.createMock();
    store = new SettingsAncestorStore(app);
  });

  it("has no ancestor before one is recorded", () => {
    expect(store.load()).toBeNull();
  });

  it("returns what a recorded file hashes to", () => {
    store.record({ refreshInterval: 30, feeds: [{ feedId: "a", url: "u" }] });

    const loaded = store.load();

    expect(Object.keys(loaded?.groups ?? {}).sort()).toEqual([
      "feeds",
      "refreshInterval",
    ]);
    expect(Object.keys(loaded?.feeds ?? {})).toHaveLength(1);
  });

  it("does not move an ancestor that exists when it seeds", () => {
    store.record({ refreshInterval: 30 });
    const before = JSON.stringify(store.load());

    store.seedIfMissing({ refreshInterval: 99 });

    expect(JSON.stringify(store.load())).toBe(before);
  });

  it("seeds when there is none", () => {
    store.seedIfMissing({ refreshInterval: 30 });

    expect(store.load()).not.toBeNull();
  });

  it.each([
    ["a string", "nope"],
    ["an array", []],
    ["an object without groups", { feeds: {} }],
    ["groups holding a non-string", { groups: { a: 1 } }],
  ])("reads %s as no ancestor", (_label, value) => {
    app.saveLocalStorage(SETTINGS_ANCESTOR_STORAGE_KEY, value);

    expect(store.load()).toBeNull();
  });

  it("drops a malformed feeds map but keeps the groups", () => {
    app.saveLocalStorage(SETTINGS_ANCESTOR_STORAGE_KEY, {
      groups: { a: "h" },
      feeds: { x: 1 },
    });

    expect(store.load()).toEqual({ groups: { a: "h" } });
  });
});
