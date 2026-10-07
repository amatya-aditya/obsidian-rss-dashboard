/**
 * The keyboard bindings, defined once. The dashboard keydown handler and the
 * Reader Scope registrations are both driven from this table, and a test
 * checks the shortcut help against it. This module is plain data plus a
 * matcher: it imports neither Obsidian nor any view.
 */

/** Which listener owns a binding. */
export type KeymapContext = "dashboard" | "reader";

/**
 * Sidebar focus a dashboard binding needs. Only the dashboard evaluates it;
 * the Reader has no sidebar focus.
 */
export type SidebarCondition = "sidebar-focused" | "sidebar-unfocused";

export interface KeyBinding {
  /** Names the action in each listener's action map. */
  id: string;
  /**
   * The Obsidian Scope key: a lower-case letter, or the key's name. The
   * dashboard derives the `KeyboardEvent.key` it compares against (see
   * `dashboardEventKey`).
   */
  key: string;
  shift: boolean;
  contexts: readonly KeymapContext[];
  when?: SidebarCondition;
  /** Whether holding the key repeats the action. Otherwise it acts once. */
  repeat: boolean;
  /** Shortcut help sections that list this binding. */
  help: readonly string[];
  /** The label the help uses, when it differs from the derived one. */
  label?: string;
}

export const HELP_GENERAL = "General navigation";
export const HELP_DASHBOARD = "Dashboard view";
export const HELP_READER = "Reader view";
export const HELP_ARTICLE = "Article manipulation";
export const HELP_SIDEBAR = "Sidebar navigation";

const D = ["dashboard"] as const;
const R = ["reader"] as const;
const DR = ["dashboard", "reader"] as const;

/**
 * Rows with the "reader" context appear in the order the Reader registers
 * them. Dashboard lookups do not depend on order.
 */
export const KEYMAP: readonly KeyBinding[] = [
  // Reader scrolling
  {
    id: "scroll-up",
    key: "ArrowUp",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "scroll-down",
    key: "ArrowDown",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "scroll-left",
    key: "ArrowLeft",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "scroll-right",
    key: "ArrowRight",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "page-up",
    key: "PageUp",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "page-down",
    key: "PageDown",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "scroll-start",
    key: "Home",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "scroll-end",
    key: "End",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  // Reader zoom
  {
    id: "zoom-in",
    key: "=",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "zoom-in",
    key: "=",
    shift: true,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
    label: "+",
  },
  {
    id: "zoom-out",
    key: "-",
    shift: false,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
  },
  {
    id: "zoom-out",
    key: "-",
    shift: true,
    contexts: R,
    repeat: true,
    help: [HELP_READER],
    label: "_",
  },
  {
    id: "zoom-reset",
    key: "0",
    shift: false,
    contexts: R,
    repeat: false,
    help: [HELP_READER],
  },
  // Shared by the dashboard and the Reader
  {
    id: "close-reader",
    key: "k",
    shift: false,
    contexts: DR,
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "focus-dashboard",
    key: "d",
    shift: true,
    contexts: R,
    repeat: false,
    help: [HELP_READER],
  },
  {
    id: "focus-sidebar",
    key: "s",
    shift: true,
    contexts: DR,
    repeat: false,
    help: [HELP_DASHBOARD, HELP_READER],
  },
  {
    id: "focus-reader",
    key: "r",
    shift: true,
    contexts: DR,
    when: "sidebar-unfocused",
    repeat: false,
    help: [HELP_DASHBOARD, HELP_READER],
  },
  {
    id: "article-previous",
    key: "j",
    shift: false,
    contexts: DR,
    repeat: true,
    help: [HELP_ARTICLE],
  },
  {
    id: "article-next",
    key: "l",
    shift: false,
    contexts: DR,
    repeat: true,
    help: [HELP_ARTICLE],
  },
  {
    id: "toggle-read",
    key: "m",
    shift: false,
    contexts: DR,
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "mark-all-read",
    key: "a",
    shift: true,
    contexts: DR,
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "toggle-star",
    key: "f",
    shift: false,
    contexts: DR,
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "toggle-tags",
    key: "t",
    shift: false,
    contexts: DR,
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "save-article",
    key: "s",
    shift: false,
    contexts: DR,
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "mark-read-next",
    key: ",",
    shift: false,
    contexts: DR,
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "open-help",
    key: "?",
    shift: true,
    contexts: DR,
    repeat: false,
    help: [HELP_GENERAL],
    label: "?",
  },
  // Dashboard only
  {
    id: "refresh-feeds",
    key: "r",
    shift: false,
    contexts: D,
    repeat: false,
    help: [HELP_GENERAL],
  },
  {
    id: "select-next",
    key: " ",
    shift: false,
    contexts: D,
    repeat: true,
    help: [HELP_ARTICLE],
  },
  {
    id: "select-previous",
    key: " ",
    shift: true,
    contexts: D,
    repeat: true,
    help: [HELP_ARTICLE],
  },
  {
    id: "toggle-article-open",
    key: "o",
    shift: false,
    contexts: D,
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "toggle-article-open",
    key: "Enter",
    shift: false,
    contexts: D,
    when: "sidebar-unfocused",
    repeat: false,
    help: [HELP_ARTICLE],
  },
  {
    id: "sidebar-open",
    key: "Enter",
    shift: false,
    contexts: D,
    when: "sidebar-focused",
    repeat: false,
    help: [],
  },
  {
    id: "view-list",
    key: "1",
    shift: false,
    contexts: D,
    repeat: false,
    help: [HELP_DASHBOARD],
  },
  {
    id: "view-card",
    key: "2",
    shift: false,
    contexts: D,
    repeat: false,
    help: [HELP_DASHBOARD],
  },
  {
    id: "view-feed",
    key: "3",
    shift: false,
    contexts: D,
    repeat: false,
    help: [HELP_DASHBOARD],
  },
  {
    id: "filter-all",
    key: "1",
    shift: true,
    contexts: D,
    repeat: false,
    help: [HELP_DASHBOARD],
  },
  {
    id: "filter-unread",
    key: "2",
    shift: true,
    contexts: D,
    repeat: false,
    help: [HELP_DASHBOARD],
  },
  {
    id: "filter-read",
    key: "3",
    shift: true,
    contexts: D,
    repeat: false,
    help: [HELP_DASHBOARD],
  },
  {
    id: "card-left",
    key: "ArrowLeft",
    shift: false,
    contexts: D,
    when: "sidebar-unfocused",
    repeat: true,
    help: [HELP_ARTICLE],
  },
  {
    id: "card-right",
    key: "ArrowRight",
    shift: false,
    contexts: D,
    when: "sidebar-unfocused",
    repeat: true,
    help: [HELP_ARTICLE],
  },
  {
    id: "card-up",
    key: "ArrowUp",
    shift: false,
    contexts: D,
    when: "sidebar-unfocused",
    repeat: true,
    help: [HELP_ARTICLE],
  },
  {
    id: "card-down",
    key: "ArrowDown",
    shift: false,
    contexts: D,
    when: "sidebar-unfocused",
    repeat: true,
    help: [HELP_ARTICLE],
  },
  {
    id: "sidebar-previous-folder",
    key: "ArrowLeft",
    shift: false,
    contexts: D,
    when: "sidebar-focused",
    repeat: true,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-next-folder",
    key: "ArrowRight",
    shift: false,
    contexts: D,
    when: "sidebar-focused",
    repeat: true,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-move-previous",
    key: "ArrowUp",
    shift: false,
    contexts: D,
    when: "sidebar-focused",
    repeat: true,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-move-next",
    key: "ArrowDown",
    shift: false,
    contexts: D,
    when: "sidebar-focused",
    repeat: true,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-move-previous",
    key: "j",
    shift: true,
    contexts: D,
    repeat: true,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-move-next",
    key: "l",
    shift: true,
    contexts: D,
    repeat: true,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-open",
    key: "o",
    shift: true,
    contexts: D,
    repeat: false,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-open",
    key: "Enter",
    shift: true,
    contexts: D,
    repeat: false,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-toggle-folder",
    key: "x",
    shift: true,
    contexts: D,
    repeat: false,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-delete",
    key: "d",
    shift: true,
    contexts: D,
    repeat: false,
    help: [HELP_SIDEBAR],
  },
  {
    id: "sidebar-rename",
    key: "r",
    shift: true,
    contexts: D,
    when: "sidebar-focused",
    repeat: false,
    help: [HELP_SIDEBAR],
  },
];

// Shift turns the digit row into these characters on a US layout.
const SHIFTED_DIGITS: Readonly<Record<string, string>> = {
  "1": "!",
  "2": "@",
  "3": "#",
};

/** The `KeyboardEvent.key` the dashboard compares against for a binding. */
export function dashboardEventKey(binding: KeyBinding): string {
  if (!binding.shift) return binding.key;
  if (/^[a-z]$/.test(binding.key)) return binding.key.toUpperCase();
  return SHIFTED_DIGITS[binding.key] ?? binding.key;
}

const LETTER = /^[a-z]$/;

/**
 * Whether a key press is this binding's key. A letter is matched without
 * regard to case, because Caps Lock flips the case of `KeyboardEvent.key`;
 * Shift is read from `shiftKey` alone. Every other key is matched literally.
 */
function matchesDashboardKey(
  binding: KeyBinding,
  event: Pick<KeyboardEvent, "key" | "shiftKey">,
): boolean {
  if (binding.shift !== event.shiftKey) return false;
  if (LETTER.test(binding.key)) return event.key.toLowerCase() === binding.key;
  return dashboardEventKey(binding) === event.key;
}

/**
 * The dashboard bindings for a key press, before sidebar focus is applied.
 * Callers that only need the repeat class can use this without asking the
 * view whether the sidebar has focus.
 */
export function dashboardCandidates(
  event: Pick<KeyboardEvent, "key" | "shiftKey">,
): KeyBinding[] {
  return KEYMAP.filter(
    (binding) =>
      binding.contexts.includes("dashboard") &&
      matchesDashboardKey(binding, event),
  );
}

/**
 * Picks the dashboard binding for a key press. `isSidebarFocused` is called
 * only when a candidate depends on it.
 */
export function findDashboardBinding(
  event: Pick<KeyboardEvent, "key" | "shiftKey">,
  isSidebarFocused: () => boolean,
): KeyBinding | undefined {
  let focused: boolean | undefined;
  return dashboardCandidates(event).find((binding) => {
    if (!binding.when) return true;
    focused ??= isSidebarFocused();
    return binding.when === "sidebar-focused" ? focused : !focused;
  });
}

/** The Reader bindings, in registration order. */
export function readerBindings(): KeyBinding[] {
  return KEYMAP.filter((binding) => binding.contexts.includes("reader"));
}

const KEY_NAMES: Readonly<Record<string, string>> = { " ": "Space" };

/** The label the shortcut help uses for a binding. */
export function bindingLabel(binding: KeyBinding): string {
  if (binding.label) return binding.label;
  const name = KEY_NAMES[binding.key] ?? binding.key;
  return binding.shift ? `Shift + ${name}` : name;
}
