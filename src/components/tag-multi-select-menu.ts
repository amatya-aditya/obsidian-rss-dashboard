import { setIcon } from "obsidian";
import type { Tag } from "../types/types";
import { isDomNode } from "../utils/dom-node";
import { isNarrowViewport } from "../utils/platform-utils";

const CLS_WRAPPER = "rss-dashboard-tag-multi-select";
const CLS_TRIGGER = `${CLS_WRAPPER}-trigger`;
const CLS_MENU = `${CLS_WRAPPER}-menu`;
const CLS_MENU_LIST = `${CLS_MENU}-list`;
const CLS_MENU_OPTION = `${CLS_MENU}-option`;
const CLS_MENU_OPTION_SELECTED = `${CLS_MENU_OPTION}--selected`;
const CLS_MENU_SWATCH = `${CLS_MENU}-swatch`;
const CLS_MENU_CHECK = `${CLS_MENU}-check`;
const CLS_MENU_EMPTY = `${CLS_MENU}-empty`;
const CLS_BACKDROP = `${CLS_WRAPPER}-backdrop`;
const CLS_MOBILE_SHEET = `${CLS_WRAPPER}-mobile-sheet`;
const CLS_MOBILE_HEADER = `${CLS_WRAPPER}-mobile-header`;
const CLS_MOBILE_TITLE = `${CLS_WRAPPER}-mobile-title`;
const CLS_MOBILE_DONE = `${CLS_WRAPPER}-mobile-done`;
const ATTR_PORTAL = "data-rss-dashboard-tag-multi-select-portal";

interface TagMultiSelectMenuOptions {
  trigger: HTMLButtonElement;
  availableTags: ReadonlyArray<Tag>;
  selectedSet: ReadonlySet<string>;
  emptySummary: string;
  mobileSheetTitle: string;
  onSelectionChange: (selectedTagNames: string[]) => void;
  onChange: (selectedTagNames: string[]) => void | Promise<void>;
}

interface TagMultiSelectMenuController {
  toggle: () => void;
}

export function createTagMultiSelectMenuController(
  opts: TagMultiSelectMenuOptions,
): TagMultiSelectMenuController {
  let closeMenu: (() => void) | null = null;

  const openMenu = () => {
    closeOtherOpenPortals(opts.trigger.ownerDocument);
    closeMenu?.();

    const targetDocument = opts.trigger.ownerDocument;
    const targetWindow = targetDocument.defaultView ?? window;
    const targetBody = targetDocument.body;
    const isMobile = isNarrowViewport(targetWindow);

    const backdrop = isMobile
      ? targetBody.createDiv({ cls: CLS_BACKDROP })
      : null;

    const portal = targetBody.createDiv({
      cls: `${CLS_MENU}${isMobile ? ` ${CLS_MOBILE_SHEET}` : ""}`,
      attr: { [ATTR_PORTAL]: "true" },
    });

    if (isMobile) {
      const header = portal.createDiv({ cls: CLS_MOBILE_HEADER });
      header.createSpan({
        cls: CLS_MOBILE_TITLE,
        text: opts.mobileSheetTitle,
      });
      const doneButton = header.createEl("button", {
        cls: CLS_MOBILE_DONE,
        text: "Done",
        attr: { type: "button" },
      });
      doneButton.addEventListener("click", () => {
        closeMenu?.();
      });
    }

    const menuList = portal.createDiv({ cls: CLS_MENU_LIST });
    renderMenuList(menuList, opts);

    opts.trigger.setAttr("aria-expanded", "true");

    const removeDesktopListener = () => {
      targetDocument.removeEventListener("mousedown", onDocumentPointerDown);
      targetDocument.removeEventListener("keydown", onDocumentKeyDown);
    };

    const onDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!isDomNode(target)) return;
      if (portal.contains(target) || opts.trigger.contains(target)) return;
      closeMenu?.();
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu?.();
      }
    };

    const syncMobileViewportHeight = () => {
      if (!isMobile) return;
      const viewportHeight =
        targetWindow.visualViewport?.height ?? targetWindow.innerHeight;
      portal.style.setProperty("max-height", `${viewportHeight - 16}px`);
    };

    const positionDesktopPortal = () => {
      if (isMobile) return;
      const rect = opts.trigger.getBoundingClientRect();
      const portalRect = portal.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + 6;

      if (left + portalRect.width > targetWindow.innerWidth - 8) {
        left = Math.max(8, rect.right - portalRect.width);
      }
      if (top + portalRect.height > targetWindow.innerHeight - 8) {
        top = Math.max(8, rect.top - portalRect.height - 6);
      }

      portal.style.left = `${left}px`;
      portal.style.top = `${top}px`;
    };

    closeMenu = () => {
      portal.remove();
      backdrop?.remove();
      opts.trigger.setAttr("aria-expanded", "false");
      removeDesktopListener();
      targetWindow.removeEventListener("resize", positionDesktopPortal);
      targetWindow.removeEventListener("resize", syncMobileViewportHeight);
      targetWindow.visualViewport?.removeEventListener(
        "resize",
        syncMobileViewportHeight,
      );
      targetWindow.visualViewport?.removeEventListener(
        "scroll",
        syncMobileViewportHeight,
      );
      closeMenu = null;
    };

    if (isMobile) {
      // Clear any inline positions so the CSS mobile-sheet rules win via cascade (no !important needed)
      portal.style.removeProperty("left");
      portal.style.removeProperty("top");
      portal.style.removeProperty("width");
      portal.style.removeProperty("min-width");
      portal.style.removeProperty("max-width");
      syncMobileViewportHeight();
      backdrop?.addEventListener("click", () => closeMenu?.());
      targetWindow.addEventListener("resize", syncMobileViewportHeight);
      targetWindow.visualViewport?.addEventListener(
        "resize",
        syncMobileViewportHeight,
      );
      targetWindow.visualViewport?.addEventListener(
        "scroll",
        syncMobileViewportHeight,
      );
    } else {
      positionDesktopPortal();
      targetWindow.addEventListener("resize", positionDesktopPortal);
      targetWindow.setTimeout(() => {
        targetDocument.addEventListener("mousedown", onDocumentPointerDown);
      }, 0);
    }

    targetDocument.addEventListener("keydown", onDocumentKeyDown);
  };

  return {
    toggle: () => {
      if (closeMenu) {
        closeMenu();
        return;
      }
      openMenu();
    },
  };
}

function renderMenuList(
  menuList: HTMLElement,
  opts: TagMultiSelectMenuOptions,
): void {
  menuList.empty();

  if (opts.availableTags.length === 0) {
    menuList.createDiv({ cls: CLS_MENU_EMPTY, text: opts.emptySummary });
    return;
  }

  for (const tag of opts.availableTags) {
    const isSelected = opts.selectedSet.has(tag.name);
    const option = menuList.createEl("button", {
      cls: `${CLS_MENU_OPTION}${isSelected ? ` ${CLS_MENU_OPTION_SELECTED}` : ""}`,
      attr: {
        type: "button",
        "aria-pressed": isSelected ? "true" : "false",
        "data-tag-name": tag.name,
      },
    });

    const check = option.createSpan({ cls: CLS_MENU_CHECK });
    setIcon(check, isSelected ? "check" : "plus");

    const swatch = option.createSpan({ cls: CLS_MENU_SWATCH });
    swatch.style.setProperty("--tag-color", tag.color);

    option.createSpan({
      cls: `${CLS_MENU_OPTION}-label`,
      text: tag.name,
    });

    const toggleOption = () => {
      const next = recomputeSelected(
        tag.name,
        opts.selectedSet,
        opts.availableTags,
      );
      opts.onSelectionChange(next);
      renderMenuList(menuList, opts);
      void opts.onChange(next);
    };

    option.addEventListener("click", toggleOption);
    option.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleOption();
      }
    });
  }
}

function recomputeSelected(
  toggledName: string,
  currentSet: ReadonlySet<string>,
  availableTags: ReadonlyArray<Tag>,
): string[] {
  const next = new Set(currentSet);
  if (next.has(toggledName)) {
    next.delete(toggledName);
  } else {
    next.add(toggledName);
  }

  return availableTags
    .filter((tag) => next.has(tag.name))
    .map((tag) => tag.name);
}

function closeOtherOpenPortals(targetDocument: Document): void {
  targetDocument
    .querySelectorAll<HTMLElement>(`[${ATTR_PORTAL}="true"]`)
    .forEach((element) => {
      element.remove();
    });
  targetDocument
    .querySelectorAll<HTMLElement>(`.${CLS_BACKDROP}`)
    .forEach((element) => {
      element.remove();
    });
  targetDocument
    .querySelectorAll<HTMLElement>(`.${CLS_TRIGGER}[aria-expanded="true"]`)
    .forEach((trigger) => trigger.setAttr("aria-expanded", "false"));
}
