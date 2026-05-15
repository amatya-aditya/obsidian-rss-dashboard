import { setIcon } from "obsidian";
import type { ReaderFormatSettings } from "../types/types";

export type ReaderFormatPortalOptions = {
  anchor: HTMLElement;
  format: ReaderFormatSettings;
  defaults: ReaderFormatSettings;
  applyFormat: () => void;
  scheduleSave: () => void;
  flushSave: () => Promise<void> | void;
  openReaderDisplaySettings: () => void;
  onClosed?: () => void;
};

export function createReaderFormatPortal(options: ReaderFormatPortalOptions): {
  close: (flushSave: boolean) => void;
} {
  const {
    anchor,
    format,
    defaults,
    applyFormat,
    scheduleSave,
    flushSave,
    openReaderDisplaySettings,
    onClosed,
  } = options;

  const targetDocument = anchor.ownerDocument;
  const targetBody = targetDocument.body;
  const targetWindow = targetDocument.defaultView || activeWindow;
  const isMobile = targetWindow.matchMedia("(max-width: 768px)").matches;

  targetDocument
    .querySelectorAll(
      ".rss-reader-format-dropdown-portal, .rss-reader-format-sheet-backdrop",
    )
    .forEach((el) => {
      (el as HTMLElement).parentNode?.removeChild(el);
    });

  let backdrop: HTMLElement | null = null;
  if (isMobile) {
    backdrop = targetBody.createDiv({
      cls: "rss-reader-format-sheet-backdrop",
    });
  }

  const portalDropdown = targetBody.createDiv({
    cls: "rss-dashboard-tags-dropdown-content-portal rss-reader-format-dropdown-portal",
  });
  if (isMobile) {
    portalDropdown.addClass("rss-reader-format-mobile-sheet");
  }

  const controlsContainer = portalDropdown.createDiv({
    cls: "rss-reader-format-controls",
  });

  const onFormatMutated = () => {
    applyFormat();
    scheduleSave();
  };

  const FONT_SCALE_STEPS = [80, 90, 100, 110, 120, 130, 150, 175, 200];
  const LINE_HEIGHT_STEPS = [100, 110, 120, 130, 140, 150, 160, 180, 200];
  const FONT_OPTIONS: Array<{
    value: ReaderFormatSettings["fontFamily"];
    label: string;
  }> = [
    { value: "default", label: "Theme default" },
    { value: "serif", label: "Serif" },
    { value: "sans", label: "Sans" },
    { value: "mono", label: "Mono" },
  ];

  const runButtonAction = (
    event: MouseEvent | KeyboardEvent,
    action: () => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  const bindClickableIcon = (
    element: HTMLElement,
    action: () => void,
  ): HTMLElement => {
    element.addClass("clickable-icon");
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.addEventListener("click", (event) => {
      runButtonAction(event, action);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        runButtonAction(event, action);
      }
    });
    return element;
  };

  const createStepperRow = (
    settingKey: "fontScalePct" | "lineHeightPct",
    label: string,
    values: number[],
  ): { sync: () => void } => {
    const row = controlsContainer.createDiv({
      cls: "rss-reader-format-row",
      attr: { "data-setting": settingKey },
    });
    row.createDiv({
      cls: "rss-reader-format-label",
      text: label,
    });

    const controls = row.createDiv({
      cls: "rss-reader-format-stepper",
    });

    const valueEl = controls.createDiv({
      cls: "rss-reader-format-value",
    });

    const updateValue = () => {
      valueEl.setText(`${format[settingKey]}%`);
    };

    const stepValue = (direction: -1 | 1) => {
      const currentIndex = values.indexOf(format[settingKey]);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = Math.max(
        0,
        Math.min(values.length - 1, safeIndex + direction),
      );
      const nextValue = values[nextIndex];
      if (nextValue === format[settingKey]) {
        return;
      }
      format[settingKey] = nextValue;
      updateValue();
      onFormatMutated();
    };

    const decreaseButton = bindClickableIcon(
      controls.createDiv({
        cls:
          "rss-reader-format-icon-button rss-reader-format-stepper-button rss-reader-format-stepper-decrease",
        attr: {
          "aria-label": `Decrease ${label.toLowerCase()}`,
          title: `Decrease ${label.toLowerCase()}`,
        },
      }),
      () => stepValue(-1),
    );
    setIcon(decreaseButton, "minus");

    controls.appendChild(valueEl);

    const increaseButton = bindClickableIcon(
      controls.createDiv({
        cls:
          "rss-reader-format-icon-button rss-reader-format-stepper-button rss-reader-format-stepper-increase",
        attr: {
          "aria-label": `Increase ${label.toLowerCase()}`,
          title: `Increase ${label.toLowerCase()}`,
        },
      }),
      () => stepValue(1),
    );
    setIcon(increaseButton, "plus");

    updateValue();
    return { sync: updateValue };
  };

  const fontRow = controlsContainer.createDiv({
    cls: "rss-reader-format-row rss-reader-format-row--font",
  });
  fontRow.createDiv({
    cls: "rss-reader-format-label",
    text: "Font",
  });

  const fontButtons = fontRow.createDiv({
    cls: "rss-reader-format-font-buttons",
  });

  const fontButtonsByValue = new Map<
    ReaderFormatSettings["fontFamily"],
    HTMLButtonElement
  >();
  const syncFontButtons = () => {
    fontButtonsByValue.forEach((button, value) => {
      button.classList.toggle("is-active", value === format.fontFamily);
    });
  };

  FONT_OPTIONS.forEach((option) => {
    const button = fontButtons.createEl("button", {
      cls: `rss-reader-format-font-button rss-reader-format-font-button--${option.value}`,
      text: option.label,
    });
    button.type = "button";
    button.dataset.value = option.value;
    button.setAttribute("aria-pressed", String(option.value === format.fontFamily));
    button.addEventListener("click", (event) => {
      runButtonAction(event, () => {
        if (format.fontFamily === option.value) {
          return;
        }
        format.fontFamily = option.value;
        syncFontButtons();
        fontButtonsByValue.forEach((btn, value) => {
          btn.setAttribute("aria-pressed", String(value === format.fontFamily));
        });
        onFormatMutated();
      });
    });
    fontButtonsByValue.set(option.value, button);
  });
  syncFontButtons();

  const fontSizeRow = createStepperRow(
    "fontScalePct",
    "Font size",
    FONT_SCALE_STEPS,
  );
  const lineHeightRow = createStepperRow(
    "lineHeightPct",
    "Line height",
    LINE_HEIGHT_STEPS,
  );

  let closed = false;
  let outsideHandler: ((event: MouseEvent) => void) | null = null;
  let viewportCleanup: (() => void) | null = null;

  const close = (shouldFlushSave: boolean) => {
    if (closed) return;
    closed = true;

    backdrop?.remove();
    portalDropdown.remove();

    if (outsideHandler) {
      targetDocument.removeEventListener("mousedown", outsideHandler);
      outsideHandler = null;
    }

    if (viewportCleanup) {
      viewportCleanup();
      viewportCleanup = null;
    }

    if (shouldFlushSave) {
      const result = flushSave();
      if (result instanceof Promise) {
        void result;
      }
    }

    onClosed?.();
  };

  const footer = controlsContainer.createDiv({
    cls: "rss-reader-format-footer",
  });

  const resetButton = bindClickableIcon(
    footer.createDiv({
      cls: "rss-reader-format-icon-button rss-reader-format-reset-button",
      attr: {
        "aria-label": "Reset reader format",
        title: "Reset reader format",
      },
    }),
    () => {
      Object.assign(format, defaults);
      fontSizeRow.sync();
      lineHeightRow.sync();
      syncFontButtons();
      fontButtonsByValue.forEach((button, value) => {
        button.setAttribute("aria-pressed", String(value === format.fontFamily));
      });
      onFormatMutated();
    },
  );
  setIcon(resetButton, "rotate-ccw");

  const settingsButton = bindClickableIcon(
    footer.createDiv({
      cls: "rss-reader-format-icon-button rss-reader-format-settings-button",
      attr: {
        "aria-label": "Open reader display settings",
        title: "Open reader display settings",
      },
    }),
    () => {
      openReaderDisplaySettings();
      close(true);
    },
  );
  setIcon(settingsButton, "settings-2");

  if (isMobile) {
    const doneButton = controlsContainer.createEl("button", {
      cls: "mod-cta rss-reader-format-done-cta",
      text: "Done",
    });
    doneButton.type = "button";
    doneButton.addEventListener("click", (evt: MouseEvent) => {
      evt.preventDefault();
      evt.stopPropagation();
      close(true);
    });
  }

  if (isMobile) {
    const syncMobileViewportHeight = () => {
      const vvp = targetWindow.visualViewport;
      const viewportHeight = vvp?.height ?? targetWindow.innerHeight;
      const computed = targetWindow.getComputedStyle(portalDropdown);
      const bottomOffset = Number.parseFloat(computed.bottom || "0") || 0;
      const maxHeight = Math.min(
        Math.floor(viewportHeight * 0.8),
        Math.max(220, Math.floor(viewportHeight - bottomOffset - 8)),
      );
      portalDropdown.style.setProperty(
        "max-height",
        `${maxHeight}px`,
        "important",
      );
    };

    syncMobileViewportHeight();

    const visualViewport = targetWindow.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener("resize", syncMobileViewportHeight);
      visualViewport.addEventListener("scroll", syncMobileViewportHeight);
      viewportCleanup = () => {
        visualViewport.removeEventListener("resize", syncMobileViewportHeight);
        visualViewport.removeEventListener("scroll", syncMobileViewportHeight);
      };
    } else {
      targetWindow.addEventListener("resize", syncMobileViewportHeight);
      viewportCleanup = () => {
        targetWindow.removeEventListener("resize", syncMobileViewportHeight);
      };
    }

    backdrop?.addEventListener("click", () => close(true));
    return { close };
  }

  const rect = anchor.getBoundingClientRect();
  const dropdownRect = portalDropdown.getBoundingClientRect();
  const appContainer = anchor.closest(".workspace-leaf-content") || targetBody;
  const appContainerRect = (
    appContainer as HTMLElement
  ).getBoundingClientRect();

  let left = rect.right;
  let top = rect.top;

  if (left + dropdownRect.width > appContainerRect.right) {
    left = rect.left - dropdownRect.width;
  }

  if (left < appContainerRect.left) {
    left = appContainerRect.left;
  }

  if (top + dropdownRect.height > targetWindow.innerHeight) {
    top = targetWindow.innerHeight - dropdownRect.height - 5;
  }

  portalDropdown.style.left = `${left}px`;
  portalDropdown.style.top = `${top}px`;

  targetWindow.setTimeout(() => {
    outsideHandler = (ev: MouseEvent) => {
      if (closed) return;
      if (
        !portalDropdown.contains(ev.target as Node) &&
        !anchor.contains(ev.target as Node)
      ) {
        close(true);
      }
    };
    targetDocument.addEventListener("mousedown", outsideHandler);
  }, 0);

  return { close };
}
