import { getIconButtonAction } from "./icon-button";

/**
 * Roving tabindex for a toolbar of native buttons (WCAG 2.2 2.1.1 Keyboard and
 * 2.4.3 Focus Order). The toolbar is one Tab stop: exactly one button has
 * `tabindex="0"`, the rest have `-1`. Left and Right Arrow, Home and End move
 * focus between the buttons; Tab and Shift+Tab are left alone so focus leaves
 * the toolbar. A click or tap still activates any button, because every button
 * stays focusable and clickable.
 */
export interface RovingToolbar {
  /** Re-reads the buttons and repairs the Tab stop after a manual DOM change. */
  refresh: () => void;
  /** Stops managing the toolbar. Existing tabindex values are left as they are. */
  destroy: () => void;
}

const controllers = new WeakMap<HTMLElement, RovingToolbar>();

function isRoving(button: HTMLButtonElement, toolbar: HTMLElement): boolean {
  if (button.disabled) return false;
  for (
    let node: HTMLElement | null = button;
    node && node !== toolbar;
    node = node.parentElement
  ) {
    if (node.hidden) return false;
  }
  return !toolbar.hidden;
}

const itemKey = getIconButtonAction;

/**
 * Makes `toolbar` a roving-tabindex toolbar. Attaching again to the same
 * element replaces the earlier attachment, so a re-render cannot stack
 * handlers. The toolbar repairs itself when buttons are added, removed,
 * disabled or hidden: the Tab stop moves to a valid button, and focus follows
 * it when focus was inside the toolbar so it is never left on `body`.
 */
export function attachRovingToolbar(toolbar: HTMLElement): RovingToolbar {
  controllers.get(toolbar)?.destroy();

  let current: HTMLButtonElement | null = null;
  let lastKey: string | null = null;
  let lastIndex = 0;
  let focusWithin = false;

  const allButtons = (): HTMLButtonElement[] =>
    Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button"));
  const items = (): HTMLButtonElement[] =>
    allButtons().filter((button) => isRoving(button, toolbar));

  const setStop = (active: HTMLButtonElement, list: HTMLButtonElement[]) => {
    for (const button of allButtons()) {
      const wanted = button === active ? "0" : "-1";
      if (button.getAttribute("tabindex") !== wanted) {
        button.setAttribute("tabindex", wanted);
      }
    }
    current = active;
    lastKey = itemKey(active);
    lastIndex = Math.max(0, list.indexOf(active));
  };

  /** Picks the Tab stop: the current button if still valid, else its heir. */
  const sync = (): HTMLButtonElement | null => {
    const list = items();
    const first = list[0];
    if (!first) {
      current = null;
      return null;
    }
    let active: HTMLButtonElement | undefined =
      current && list.includes(current) ? current : undefined;
    if (!active && lastKey !== null) {
      active = list.find((button) => itemKey(button) === lastKey);
    }
    active ??= list[Math.min(lastIndex, list.length - 1)] ?? first;
    setStop(active, list);
    return active;
  };

  const doc = (): Document => toolbar.ownerDocument;

  /** True when focus was in the toolbar but is no longer on a usable button. */
  const isStranded = (): boolean => {
    const focused = doc().activeElement;
    if (!focused || focused === doc().body) return true;
    return (
      toolbar.contains(focused) &&
      !items().includes(focused as HTMLButtonElement)
    );
  };

  const repair = () => {
    const active = sync();
    if (active && focusWithin && isStranded()) {
      active.focus({ preventScroll: true });
    }
  };

  const onFocusIn = (event: FocusEvent) => {
    focusWithin = true;
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button");
    const list = items();
    if (button && list.includes(button)) setStop(button, list);
  };

  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next) {
      focusWithin = toolbar.contains(next);
      return;
    }
    // No destination: either the user clicked empty space or the window lost
    // focus (the button is still a usable item), or the focused button went
    // away (it is not). Keep claiming focus only in the second case.
    const target = event.target as HTMLButtonElement;
    window.setTimeout(() => {
      if (items().includes(target)) focusWithin = false;
    }, 0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      return;
    }
    const key = event.key;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const from = target?.closest("button");
    const list = items();
    const index = from ? list.indexOf(from) : -1;
    if (index < 0) return;

    const rtl =
      doc().defaultView?.getComputedStyle(toolbar).direction === "rtl";
    const step = key === "ArrowRight" ? (rtl ? -1 : 1) : rtl ? 1 : -1;
    let nextIndex: number;
    if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = list.length - 1;
    else nextIndex = (index + step + list.length) % list.length;

    const next = list[nextIndex];
    if (!next) return;
    event.preventDefault();
    setStop(next, list);
    next.focus({ preventScroll: true });
  };

  toolbar.addEventListener("keydown", onKeyDown);
  toolbar.addEventListener("focusin", onFocusIn);
  toolbar.addEventListener("focusout", onFocusOut);

  const observer = new MutationObserver(repair);
  observer.observe(toolbar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden"],
  });

  sync();

  const controller: RovingToolbar = {
    refresh: repair,
    destroy: () => {
      toolbar.removeEventListener("keydown", onKeyDown);
      toolbar.removeEventListener("focusin", onFocusIn);
      toolbar.removeEventListener("focusout", onFocusOut);
      observer.disconnect();
      if (controllers.get(toolbar) === controller) controllers.delete(toolbar);
    },
  };
  controllers.set(toolbar, controller);
  return controller;
}
