import type { ReaderFormatSettings } from "../types/types";
import { createIconButton } from "./icon-button";
import { isNarrowViewport } from "./platform-utils";

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

type ReaderFormatPortalClose = (flushSave: boolean) => void;
type IconButtonOptions = { cls: string; label: string; icon: string };
type StepperSettingKey = "fontScalePct" | "lineHeightPct";
type StepperRowOptions = {
  controlsContainer: HTMLElement;
  format: ReaderFormatSettings;
  settingKey: StepperSettingKey;
  label: string;
  values: number[];
  onFormatMutated: () => void;
};
type DesktopDropdownOptions = {
  anchor: HTMLElement;
  portalDropdown: HTMLElement;
  targetDocument: Document;
  targetBody: HTMLElement;
  targetWindow: Window;
  close: ReaderFormatPortalClose;
  isClosed: () => boolean;
  setOutsideHandler: (handler: ((event: MouseEvent) => void) | null) => void;
};

type ReaderFormatPortalControlOptions = Pick<
  ReaderFormatPortalOptions,
  | "format"
  | "defaults"
  | "applyFormat"
  | "scheduleSave"
  | "openReaderDisplaySettings"
> & {
  controlsContainer: HTMLElement;
  isMobile: boolean;
  close: ReaderFormatPortalClose;
};

function runButtonAction(event: MouseEvent, action: () => void): void {
  event.preventDefault();
  event.stopPropagation();
  action();
}

function createFormatIconButton(
  parent: HTMLElement,
  options: IconButtonOptions,
  action: () => void,
): HTMLButtonElement {
  return createIconButton({
    parent,
    cls: `clickable-icon rss-reader-format-icon-button ${options.cls}`,
    label: options.label,
    icon: options.icon,
    onClick: (event) => {
      runButtonAction(event, action);
    },
  });
}

function createStepperRow(options: StepperRowOptions): { sync: () => void } {
  const {
    controlsContainer,
    format,
    settingKey,
    label,
    values,
    onFormatMutated,
  } = options;
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
    const nextValue = values[nextIndex] ?? values[0] ?? format[settingKey];
    if (nextValue === format[settingKey]) {
      return;
    }
    format[settingKey] = nextValue;
    updateValue();
    onFormatMutated();
  };

  createFormatIconButton(
    controls,
    {
      cls: "rss-reader-format-stepper-button rss-reader-format-stepper-decrease",
      label: `Decrease ${label.toLowerCase()}`,
      icon: "minus",
    },
    () => stepValue(-1),
  );

  controls.appendChild(valueEl);

  createFormatIconButton(
    controls,
    {
      cls: "rss-reader-format-stepper-button rss-reader-format-stepper-increase",
      label: `Increase ${label.toLowerCase()}`,
      icon: "plus",
    },
    () => stepValue(1),
  );

  updateValue();
  return { sync: updateValue };
}

function createReaderFormatControls(
  options: ReaderFormatPortalControlOptions,
): void {
  const {
    controlsContainer,
    format,
    defaults,
    applyFormat,
    scheduleSave,
    openReaderDisplaySettings,
    isMobile,
    close,
  } = options;
  const onFormatMutated = () => {
    applyFormat();
    scheduleSave();
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
  const fontOptions: Array<{
    value: ReaderFormatSettings["fontFamily"];
    label: string;
  }> = [
    { value: "default", label: "Theme default" },
    { value: "serif", label: "Serif" },
    { value: "sans", label: "Sans" },
    { value: "mono", label: "Mono" },
  ];
  fontOptions.forEach((option) => {
    const button = fontButtons.createEl("button", {
      cls: `rss-reader-format-font-button rss-reader-format-font-button--${option.value}`,
      text: option.label,
    });
    button.type = "button";
    button.dataset.value = option.value;
    button.setAttribute(
      "aria-pressed",
      String(option.value === format.fontFamily),
    );
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

  const fontSizeRow = createStepperRow({
    controlsContainer,
    format,
    settingKey: "fontScalePct",
    label: "Font size",
    values: [80, 90, 100, 110, 120, 130, 150, 175, 200],
    onFormatMutated,
  });
  const lineHeightRow = createStepperRow({
    controlsContainer,
    format,
    settingKey: "lineHeightPct",
    label: "Line height",
    values: [100, 110, 120, 130, 140, 150, 160, 180, 200],
    onFormatMutated,
  });

  const footer = controlsContainer.createDiv({
    cls: "rss-reader-format-footer",
  });
  createFormatIconButton(
    footer,
    {
      cls: "rss-reader-format-reset-button",
      label: "Reset reader format",
      icon: "rotate-ccw",
    },
    () => {
      Object.assign(format, defaults);
      fontSizeRow.sync();
      lineHeightRow.sync();
      syncFontButtons();
      fontButtonsByValue.forEach((button, value) => {
        button.setAttribute(
          "aria-pressed",
          String(value === format.fontFamily),
        );
      });
      onFormatMutated();
    },
  );
  createFormatIconButton(
    footer,
    {
      cls: "rss-reader-format-settings-button",
      label: "Open reader display settings",
      icon: "settings-2",
    },
    () => {
      openReaderDisplaySettings();
      close(true);
    },
  );

  if (isMobile) {
    const doneButton = controlsContainer.createEl("button", {
      cls: "mod-cta rss-reader-format-done-cta",
      text: "Done",
    });
    doneButton.type = "button";
    doneButton.addEventListener("click", (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    });
  }
}

function configureMobileViewport(
  portalDropdown: HTMLElement,
  targetWindow: Window,
): () => void {
  const syncMobileViewportHeight = () => {
    const visualViewport = targetWindow.visualViewport;
    const viewportHeight = visualViewport?.height ?? targetWindow.innerHeight;
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
    return () => {
      visualViewport.removeEventListener("resize", syncMobileViewportHeight);
      visualViewport.removeEventListener("scroll", syncMobileViewportHeight);
    };
  }

  targetWindow.addEventListener("resize", syncMobileViewportHeight);
  return () => {
    targetWindow.removeEventListener("resize", syncMobileViewportHeight);
  };
}

function positionDesktopDropdown(options: DesktopDropdownOptions): void {
  const {
    anchor,
    portalDropdown,
    targetDocument,
    targetBody,
    targetWindow,
    close,
    isClosed,
    setOutsideHandler,
  } = options;
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
    if (isClosed()) return;

    const outsideHandler = (event: MouseEvent) => {
      if (isClosed()) return;
      if (
        !portalDropdown.contains(event.target as Node) &&
        !anchor.contains(event.target as Node)
      ) {
        close(true);
      }
    };
    setOutsideHandler(outsideHandler);
    targetDocument.addEventListener("mousedown", outsideHandler);
  }, 0);
}

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
  const isMobile = isNarrowViewport(targetWindow);

  targetDocument
    .querySelectorAll(
      ".rss-reader-format-dropdown-portal, .rss-reader-format-sheet-backdrop",
    )
    .forEach((element) => {
      (element as HTMLElement).parentNode?.removeChild(element);
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

  createReaderFormatControls({
    controlsContainer,
    format,
    defaults,
    applyFormat,
    scheduleSave,
    openReaderDisplaySettings,
    isMobile,
    close,
  });
  if (isMobile) {
    viewportCleanup = configureMobileViewport(portalDropdown, targetWindow);
    backdrop?.addEventListener("click", () => close(true));
    return { close };
  }

  positionDesktopDropdown({
    anchor,
    portalDropdown,
    targetDocument,
    targetBody,
    targetWindow,
    close,
    isClosed: () => closed,
    setOutsideHandler: (handler) => {
      outsideHandler = handler;
    },
  });
  return { close };
}
