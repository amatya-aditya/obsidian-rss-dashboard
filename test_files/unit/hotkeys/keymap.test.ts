import { describe, expect, it, vi } from "vitest";
import {
  KEYMAP,
  HELP_DASHBOARD,
  bindingHint,
  bindingLabel,
  dashboardCandidates,
  dashboardEventKey,
  findDashboardBinding,
  readerBindings,
  withBindingHint,
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

  it("binds Shift+F to toggle video focus mode in the dashboard and the Reader", () => {
    expect(
      findDashboardBinding({ key: "F", shiftKey: true }, () => false)?.id,
    ).toBe("toggle-video-focus-mode");
    expect(
      readerBindings().find((binding) => binding.key === "f" && binding.shift)
        ?.id,
    ).toBe("toggle-video-focus-mode");
  });

  it("binds Shift+C to the selected article's cover-image action", () => {
    expect(
      findDashboardBinding({ key: "C", shiftKey: true }, () => false)?.id,
    ).toBe("cover-image-action");
  });

  it("leaves the header's fetch-all-covers button without a shortcut (#1702)", () => {
    // Shift+C belongs to the selected article's cover action alone.
    expect(
      KEYMAP.filter((binding) => /cover/i.test(binding.id)).map(
        (binding) => binding.id,
      ),
    ).toEqual(["cover-image-action"]);
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

  describe("Caps Lock (#881)", () => {
    it.each([
      ["J", false, "article-previous"],
      ["j", false, "article-previous"],
      ["J", true, "sidebar-move-previous"],
      ["j", true, "sidebar-move-previous"],
      ["S", false, "save-article"],
      ["s", true, "focus-sidebar"],
    ])("reads %s (shift %s) as the %s binding", (key, shiftKey, id) => {
      expect(findDashboardBinding({ key, shiftKey }, () => false)?.id).toBe(id);
    });

    it.each([
      ["!", true],
      ["@", true],
      ["#", true],
      ["1", false],
      ["Enter", true],
      ["ArrowUp", false],
    ])("still matches %s (shift %s) literally", (key, shiftKey) => {
      expect(
        dashboardCandidates({ key, shiftKey }).length,
        `${key}|${shiftKey}`,
      ).toBeGreaterThan(0);
    });

    it("does not read a shifted digit's base key as the symbol", () => {
      expect(dashboardCandidates({ key: "1", shiftKey: true })).toEqual([]);
    });
  });

  it("binds backquote to selecting the first article in the dashboard only", () => {
    const binding = findDashboardBinding(
      { key: "`", shiftKey: false },
      () => false,
    );

    expect(binding?.id).toBe("select-first");
    // A held backquote acts once, and the help names it in the Dashboard view
    // section, as the issue asks.
    expect(binding?.repeat).toBe(false);
    expect(binding?.help).toEqual([HELP_DASHBOARD]);
    // The Reader has no article scope to return to.
    expect(readerBindings().some((b) => b.key === "`")).toBe(false);
  });

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

  describe("tooltip hints (#1467)", () => {
    // The footer controls and the cover control each route to one of these
    // bindings, so their tooltip hint is derived from that row.
    const HINTED_CONTROLS = [
      ["read", "toggle-read"],
      ["star", "toggle-star"],
      ["tags", "toggle-tags"],
      ["save", "save-article"],
      ["cover", "cover-image-action"],
    ] as const;

    it.each([
      ["toggle-read", "(m)"],
      ["toggle-star", "(f)"],
      ["toggle-tags", "(t)"],
      ["save-article", "(s)"],
      ["cover-image-action", "(Shift + c)"],
    ])("names %s as %s", (id, expected) => {
      expect(bindingHint(id)).toBe(expected);
    });

    it.each(HINTED_CONTROLS)(
      "derives the %s hint from the %s binding row",
      (_control, id) => {
        const binding = KEYMAP.find((row) => row.id === id);
        expect(binding).toBeDefined();
        const key = binding?.shift ? `Shift + ${binding?.key}` : binding?.key;
        expect(bindingHint(id)).toBe(`(${key})`);
      },
    );

    it("follows a changed binding key with no second edit", () => {
      const binding = KEYMAP.find((row) => row.id === "toggle-star");
      if (!binding) throw new Error("Expected the toggle-star binding");
      const original = binding.key;
      try {
        binding.key = "v";
        expect(bindingHint("toggle-star")).toBe("(v)");
      } finally {
        binding.key = original;
      }
    });

    it("appends the hint after the control's own sentence", () => {
      expect(withBindingHint("Mark as read", "toggle-read")).toBe(
        "Mark as read (m)",
      );
      expect(withBindingHint("Add to starred items", "toggle-star")).toBe(
        "Add to starred items (f)",
      );
    });

    it("rejects an id with no binding, so a renamed id cannot drift unnoticed", () => {
      expect(() => bindingHint("no-such-binding")).toThrow(/no-such-binding/);
    });
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

    it("names every dashboard binding in Dashboard view, General navigation, or Sidebar navigation", () => {
      const where = [
        "Dashboard view",
        "General navigation",
        "Sidebar navigation",
      ];
      const slot = (b: (typeof KEYMAP)[number]) => `${b.key}|${b.shift}`;
      const named = new Set(
        KEYMAP.filter(
          (b) =>
            b.contexts.includes("dashboard") &&
            b.help.some((h) => where.includes(h)),
        ).map(slot),
      );
      const unnamed = KEYMAP.filter(
        (b) => b.contexts.includes("dashboard") && !named.has(slot(b)),
      ).map((b) => `${b.id} (${bindingLabel(b)})`);
      expect(unnamed).toEqual([]);
    });

    it("lists only bindings that also work in the Reader under Article manipulation", () => {
      const offenders = KEYMAP.filter(
        (b) =>
          b.help.includes("Article manipulation") &&
          !(b.contexts.includes("dashboard") && b.contexts.includes("reader")),
      ).map((b) => `${b.id} (${bindingLabel(b)})`);
      expect(offenders).toEqual([]);
    });

    it("lists every shared article binding in Dashboard view as well", () => {
      const missing = KEYMAP.filter(
        (b) =>
          b.help.includes("Article manipulation") &&
          !b.help.includes("Dashboard view"),
      ).map((b) => `${b.id} (${bindingLabel(b)})`);
      expect(missing).toEqual([]);
    });

    it.each(SHORTCUT_SECTIONS.map((s) => [s.section, s] as const))(
      "lists no key twice in %s",
      (_name, section) => {
        const keys = section.items.flatMap((item) => item.key.split(" / "));
        expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
      },
    );

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
