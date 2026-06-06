import { setIcon } from "obsidian";
import type { Tag } from "../types/types";

export interface TagMultiSelectControlOptions {
  setting: import("obsidian").Setting;
  availableTags: ReadonlyArray<Tag>;
  selectedTagNames: ReadonlyArray<string>;
  noneLabel?: string;
  triggerEmptyLabel?: string;
  menuTitle?: string;
  mobileSheetTitle?: string;
  onChange: (selectedTagNames: string[]) => void | Promise<void>;
}

const CLS_WRAPPER = "rss-dashboard-tag-multi-select";
const CLS_EMPTY = `${CLS_WRAPPER}--empty`;
const CLS_TRIGGER = `${CLS_WRAPPER}-trigger`;
const CLS_TRIGGER_LABEL = `${CLS_TRIGGER}-label`;
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

export function addTagMultiSelectControl(
  opts: TagMultiSelectControlOptions,
): void {
  const {
    setting,
    availableTags,
    onChange,
    menuTitle = "Select tags",
    mobileSheetTitle = menuTitle,
  } = opts;

  const selectedSet = normalizeSelection(
    opts.selectedTagNames,
    availableTags,
  );
  const controlEl = setting.controlEl;
  const wrapper = controlEl.createDiv({ cls: CLS_WRAPPER });
  const trigger = wrapper.createEl("button", {
    cls: CLS_TRIGGER,
    attr: {
      type: "button",
      "aria-label": menuTitle,
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
    },
  });
  const triggerLabel = trigger.createSpan({ cls: CLS_TRIGGER_LABEL });
  const triggerIcon = trigger.createSpan();
  setIcon(triggerIcon, "chevron-down");

  let closeMenu: (() => void) | null = null;

  const syncWrapperState = () => {
    const isEmpty = availableTags.length === 0;
    wrapper.classList.toggle(CLS_EMPTY, isEmpty);
    trigger.disabled = isEmpty;
    trigger.setAttr("aria-disabled", isEmpty ? "true" : "false");
    triggerLabel.textContent = getSummaryLabel(selectedSet, availableTags, opts);
  };

  const rerenderOpenMenu = (menuList: HTMLElement) => {
    menuList.empty();

    if (availableTags.length === 0) {
      menuList.createDiv({
        cls: CLS_MENU_EMPTY,
        text: getSummaryLabel(selectedSet, availableTags, opts),
      });
      return;
    }

    for (const tag of availableTags) {
      const isSelected = selectedSet.has(tag.name);
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
        const next = recomputeSelected(tag.name, selectedSet, availableTags);
        selectedSet.clear();
        for (const name of next) {
          selectedSet.add(name);
        }
        syncWrapperState();
        rerenderOpenMenu(menuList);
        void onChange(next);
      };

      option.addEventListener("click", toggleOption);
      option.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleOption();
        }
      });
    }
  };

  const openMenu = () => {
    closeOtherOpenPortals(trigger.ownerDocument);
    closeMenu?.();

    const targetDocument = trigger.ownerDocument;
    const targetWindow = targetDocument.defaultView ?? window;
    const targetBody = targetDocument.body;
    const isMobile = targetWindow.matchMedia("(max-width: 768px)").matches;

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
        text: mobileSheetTitle,
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
    rerenderOpenMenu(menuList);

    trigger.setAttr("aria-expanded", "true");

    const removeDesktopListener = () => {
      targetDocument.removeEventListener("mousedown", onDocumentPointerDown);
      targetDocument.removeEventListener("keydown", onDocumentKeyDown);
    };

    const onDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (portal.contains(target) || trigger.contains(target)) return;
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
      const rect = trigger.getBoundingClientRect();
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
      trigger.setAttr("aria-expanded", "false");
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

  trigger.addEventListener("click", () => {
    if (trigger.disabled) return;
    if (closeMenu) {
      closeMenu();
      return;
    }
    openMenu();
  });

  syncWrapperState();
}

function normalizeSelection(
  selectedTagNames: ReadonlyArray<string>,
  availableTags: ReadonlyArray<Tag>,
): Set<string> {
  const availableNameSet = new Set(availableTags.map((tag) => tag.name));
  const selectedSet = new Set<string>();

  for (const rawName of selectedTagNames) {
    const trimmed = rawName.trim();
    if (trimmed && availableNameSet.has(trimmed)) {
      selectedSet.add(trimmed);
    }
  }

  return selectedSet;
}

function getSummaryLabel(
  selectedSet: ReadonlySet<string>,
  availableTags: ReadonlyArray<Tag>,
  opts: Pick<TagMultiSelectControlOptions, "noneLabel" | "triggerEmptyLabel">,
): string {
  const emptyLabel = opts.triggerEmptyLabel ?? opts.noneLabel ?? "None";
  const selectedNames = availableTags
    .filter((tag) => selectedSet.has(tag.name))
    .map((tag) => tag.name);

  if (selectedNames.length === 0) {
    return emptyLabel;
  }
  if (selectedNames.length === 1) {
    return selectedNames[0] ?? emptyLabel;
  }
  return `${selectedNames.length} tags selected`;
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
  targetDocument.querySelectorAll<HTMLElement>(`.${CLS_BACKDROP}`).forEach((el) => {
    el.remove();
  });
  targetDocument
    .querySelectorAll<HTMLElement>(`.${CLS_TRIGGER}[aria-expanded="true"]`)
    .forEach((trigger) => trigger.setAttr("aria-expanded", "false"));
}
