import { describe, expect, it, vi } from "vitest";
import {
  KEYMAP,
  bindingLabel,
  dashboardCandidates,
  dashboardEventKey,
  findDashboardBinding,
  readerBindings,
} from "../../../src/hotkeys/keymap";
import { DASHBOARD_ACTIONS } from "../../../src/hotkeys/dashboard-hotkeys";
import { READER_ACTIONS } from "../../../src/hotkeys/reader-hotkeys";
import { SHORTCUT_SECTIONS } from "../../../src/modals/shortcut-help-modal";

// Esc is handled by Obsidian, not by a binding in this table (#880).
const HELP_ONLY_KEYS = new Set(["Esc"]);

describe("keymap table", () => {
  it("has no two dashboard bindings that can match the same press", () => {
    const seen = new Map<string, string>();
    for (const binding of KEYMAP) {
      if (!binding.contexts.includes("dashboard")) continue;
      for (const when of binding.when
        ? [binding.when]
        : (["sidebar-focused", "sidebar-unfocused"] as const)) {
        const slot = `${dashboardEventKey(binding)}|${binding.shift}|${when}`;
        expect(seen.get(slot), `duplicate ${slot}`).toBeUndefined();
        seen.set(slot, binding.id);
      }
    }
  });

  it("has no two Reader bindings on the same key and modifier", () => {
    const slots = readerBindings().map((b) => `${b.key}|${b.shift}`);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("gives every candidate for one key press the same repeat class", () => {
    for (const binding of KEYMAP) {
      if (!binding.contexts.includes("dashboard")) continue;
      const press = {
        key: dashboardEventKey(binding),
        shiftKey: binding.shift,
      };
      const repeats = dashboardCandidates(press).map((c) => c.repeat);
      expect(new Set(repeats).size, bindingLabel(binding)).toBe(1);
    }
  });

  it.each([
    ["j", false, "j"],
    ["j", true, "J"],
    ["1", true, "!"],
    ["2", true, "@"],
    ["3", true, "#"],
    ["?", true, "?"],
    ["Enter", true, "Enter"],
    [" ", true, " "],
    ["ArrowUp", false, "ArrowUp"],
  ])(
    "derives the event key for %s (shift %s) as %s",
    (key, shift, expected) => {
      const binding = { ...KEYMAP[0], key, shift };
      expect(dashboardEventKey(binding)).toBe(expected);
    },
  );

  describe("findDashboardBinding", () => {
    it("asks for sidebar focus only when a candidate depends on it", () => {
      const isSidebarFocused = vi.fn(() => false);

      findDashboardBinding({ key: "m", shiftKey: false }, isSidebarFocused);
      expect(isSidebarFocused).not.toHaveBeenCalled();

      findDashboardBinding(
        { key: "ArrowUp", shiftKey: false },
        isSidebarFocused,
      );
      expect(isSidebarFocused).toHaveBeenCalledTimes(1);
    });

    it("picks the sidebar or card binding by focus", () => {
      const press = { key: "ArrowUp", shiftKey: false };

      expect(findDashboardBinding(press, () => true)?.id).toBe(
        "sidebar-move-previous",
      );
      expect(findDashboardBinding(press, () => false)?.id).toBe("card-up");
    });

    it("finds nothing for an unbound key", () => {
      expect(
        findDashboardBinding({ key: "q", shiftKey: false }, () => false),
      ).toBeUndefined();
    });
  });

  describe("action maps", () => {
    it.each([
      ["dashboard", DASHBOARD_ACTIONS],
      ["reader", READER_ACTIONS],
    ] as const)(
      "%s has an action for every binding and no extras",
      (context, actions) => {
        const ids = new Set(
          KEYMAP.filter((b) => b.contexts.includes(context)).map((b) => b.id),
        );

        expect([...ids].filter((id) => !(id in actions))).toEqual([]);
        expect(Object.keys(actions).filter((id) => !ids.has(id))).toEqual([]);
      },
    );
  });

  describe("shortcut help", () => {
    it("names only sections the help dialog has", () => {
      const names = new Set(SHORTCUT_SECTIONS.map((s) => s.section));
      for (const binding of KEYMAP) {
        for (const section of binding.help) {
          expect(names.has(section), section).toBe(true);
        }
      }
    });

    it.each(SHORTCUT_SECTIONS.map((s) => [s.section, s] as const))(
      "lists the same keys as the table in %s",
      (name, section) => {
        const helpKeys = section.items
          .flatMap((item) => item.key.split(" / "))
          .filter((key) => !HELP_ONLY_KEYS.has(key));
        const tableKeys = KEYMAP.filter((b) => b.help.includes(name)).map(
          bindingLabel,
        );

        expect([...new Set(helpKeys)].sort()).toEqual(
          [...new Set(tableKeys)].sort(),
        );
      },
    );
  });
});
