import { setIcon, setTooltip } from "obsidian";
import type {
  TagColorPalette,
  TagColorPaletteEntry,
} from "../utils/tag-color-palettes";
import { TAG_COLOR_PALETTES } from "../utils/tag-color-palettes";

export interface TagColorPaletteControlOptions {
  container: HTMLElement;
  input: HTMLInputElement;
  fieldName: string;
  onBeforePresetSelect?: () => void;
  onValueChange?: () => void;
  /**
   * Show the small "Palette" and "Color" captions above each field. Rows that
   * already sit under a heading or beside their own label turn them off; the
   * select and trigger keep their `aria-label`s either way.
   */
  showFieldLabels?: boolean;
  /**
   * Show the hex value beside the native picker. Rows whose trigger already
   * names the color turn it off; the readout is then never attached.
   */
  showValueReadout?: boolean;
}

const CLS_CONTROL = "rss-dashboard-tag-color-palette-control";
const CLS_MENU = `${CLS_CONTROL}-menu`;
const CLS_OPTION = `${CLS_MENU}-option`;

interface PaletteControlElements {
  control: HTMLElement;
  colorField: HTMLElement;
  colorButton: HTMLButtonElement;
  paletteSelect: HTMLSelectElement;
  selectedSwatch: HTMLElement;
  selectedLabel: HTMLElement;
  valueReadout: HTMLElement;
}

function createPaletteControlElements(
  container: HTMLElement,
  fieldName: string,
  showFieldLabels: boolean,
): PaletteControlElements {
  const control = container.createDiv({ cls: CLS_CONTROL });
  const paletteField = control.createDiv({
    cls: `${CLS_CONTROL}-field ${CLS_CONTROL}-palette-field`,
  });
  if (showFieldLabels) {
    paletteField.createSpan({ cls: `${CLS_CONTROL}-label`, text: "Palette" });
  }
  // The native select's own arrow is reset so every dropdown in the plugin
  // shows the same up/down chevron as Obsidian's core dropdowns.
  const selectWrap = paletteField.createDiv({ cls: `${CLS_CONTROL}-select` });
  const paletteSelect = selectWrap.createEl("select", {
    attr: { "aria-label": `Palette for ${fieldName}` },
  });
  const selectChevron = selectWrap.createSpan({
    cls: `${CLS_CONTROL}-chevron ${CLS_CONTROL}-select-chevron`,
    attr: { "aria-hidden": "true" },
  });
  setIcon(selectChevron, "chevrons-up-down");
  TAG_COLOR_PALETTES.forEach((palette) => {
    paletteSelect.createEl("option", {
      text: palette.name,
      attr: { value: palette.name },
    });
  });

  const colorField = control.createDiv({
    cls: `${CLS_CONTROL}-field ${CLS_CONTROL}-color-field`,
  });
  if (showFieldLabels) {
    colorField.createSpan({ cls: `${CLS_CONTROL}-label`, text: "Color" });
  }
  const colorButton = colorField.createEl("button", {
    cls: `${CLS_CONTROL}-color-trigger`,
    attr: {
      type: "button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
    },
  });
  const selectedSwatch = colorButton.createSpan({
    cls: `${CLS_CONTROL}-swatch`,
    attr: { "aria-hidden": "true" },
  });
  const selectedLabel = colorButton.createSpan({
    cls: `${CLS_CONTROL}-selected-label`,
  });
  const chevron = colorButton.createSpan({
    cls: `${CLS_CONTROL}-chevron`,
    attr: { "aria-hidden": "true" },
  });
  setIcon(chevron, "chevrons-up-down");
  const valueReadout = container.createSpan({
    cls: `${CLS_CONTROL}-value-readout`,
    attr: { "aria-live": "off" },
  });
  return {
    control,
    colorField,
    colorButton,
    paletteSelect,
    selectedSwatch,
    selectedLabel,
    valueReadout,
  };
}

function moveOptionFocus(
  event: KeyboardEvent,
  option: HTMLButtonElement,
  menu: HTMLElement,
  closeMenu: (restoreFocus?: boolean) => void,
): void {
  const options = Array.from(
    menu.querySelectorAll<HTMLButtonElement>(`button[role="option"]`),
  );
  const currentIndex = options.indexOf(option);
  let nextIndex: number | null = null;
  if (event.key === "ArrowDown") nextIndex = currentIndex + 1;
  if (event.key === "ArrowUp") nextIndex = currentIndex - 1;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = options.length - 1;
  if (nextIndex !== null) {
    event.preventDefault();
    options[Math.max(0, Math.min(options.length - 1, nextIndex))]?.focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeMenu(true);
  }
}

function createColorMenu(options: {
  container: HTMLElement;
  colorField: HTMLElement;
  colorButton: HTMLButtonElement;
  fieldName: string;
  palette: TagColorPalette;
  ownerWindow: NonNullable<Document["defaultView"]>;
  selectedHex: () => string;
  selectColor: (color: TagColorPaletteEntry) => void;
  closeMenu: (restoreFocus?: boolean) => void;
}): {
  menu: HTMLElement;
  removeOutsideListener: () => void;
  removalObserver: MutationObserver;
} {
  const {
    container,
    colorField,
    colorButton,
    fieldName,
    palette,
    ownerWindow,
    selectedHex,
    selectColor,
    closeMenu,
  } = options;
  const ownerDocument = container.ownerDocument;
  const menu = colorField.createDiv({
    cls: CLS_MENU,
    attr: {
      role: "listbox",
      "aria-label": `${palette.name} colors for ${fieldName}`,
    },
  });
  palette.colors.forEach((color) => {
    const option = menu.createEl("button", {
      cls: CLS_OPTION,
      attr: {
        type: "button",
        role: "option",
        "aria-label": `${color.name} ${color.hex}`,
        "aria-selected":
          color.hex.toUpperCase() === selectedHex() ? "true" : "false",
        tabindex: "-1",
      },
    });
    setTooltip(option, `${color.name} ${color.hex}`);
    const swatch = option.createSpan({
      cls: `${CLS_CONTROL}-swatch ${CLS_CONTROL}-option-swatch`,
      attr: { "aria-hidden": "true" },
    });
    swatch.style.setProperty("--tag-color-swatch", color.hex);
    option.createSpan({ text: color.name });
    option.createSpan({
      cls: `${CLS_CONTROL}-option-hex`,
      text: color.hex,
    });
    option.addEventListener("click", () => selectColor(color));
    option.addEventListener("keydown", (event) =>
      moveOptionFocus(event, option, menu, closeMenu),
    );
  });

  colorButton.setAttribute("aria-expanded", "true");
  const outsideListener = (event: Event) => {
    if (!container.contains(event.target as Node)) closeMenu();
  };
  ownerDocument.addEventListener("pointerdown", outsideListener, true);
  const observerWindow = ownerWindow as unknown as {
    MutationObserver: typeof MutationObserver;
  };
  const removalObserver = new observerWindow.MutationObserver(() => {
    if (!container.isConnected) closeMenu();
  });
  removalObserver.observe(ownerDocument.documentElement, {
    childList: true,
    subtree: true,
  });
  return {
    menu,
    removeOutsideListener: () =>
      ownerDocument.removeEventListener("pointerdown", outsideListener, true),
    removalObserver,
  };
}

function attachControlEvents(options: {
  paletteSelect: HTMLSelectElement;
  colorButton: HTMLButtonElement;
  getPalette: () => TagColorPalette;
  getSelectedHex: () => string;
  hasOpenMenu: () => boolean;
  renderMenu: (focusIndex?: number) => void;
  renderTrigger: () => void;
  closeMenu: (restoreFocus?: boolean) => void;
}): void {
  const {
    paletteSelect,
    colorButton,
    getPalette,
    getSelectedHex,
    hasOpenMenu,
    renderMenu,
    renderTrigger,
    closeMenu,
  } = options;
  paletteSelect.addEventListener("change", () => {
    renderTrigger();
  });
  colorButton.addEventListener("click", () => {
    if (hasOpenMenu()) closeMenu();
    else renderMenu();
  });
  colorButton.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!hasOpenMenu()) renderMenu();
      const colors = getPalette().colors;
      const matchIndex = colors.findIndex(
        (color) => color.hex.toUpperCase() === getSelectedHex(),
      );
      const target =
        matchIndex >= 0
          ? matchIndex
          : event.key === "ArrowUp"
            ? colors.length - 1
            : 0;
      colorButton
        .closest(`.${CLS_CONTROL}`)
        ?.querySelectorAll<HTMLButtonElement>(`button[role="option"]`)
        .item(target)
        ?.focus();
    } else if (event.key === "Escape" && hasOpenMenu()) {
      event.preventDefault();
      closeMenu(true);
    }
  });
}

/** Adds transient palette and named-color controls beside an existing input. */
export function addTagColorPaletteControl(
  opts: TagColorPaletteControlOptions,
): () => void {
  const {
    container,
    input,
    fieldName,
    onBeforePresetSelect,
    onValueChange,
    showFieldLabels = true,
    showValueReadout = true,
  } = opts;
  const ownerDocument = container.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const elements = createPaletteControlElements(
    container,
    fieldName,
    showFieldLabels,
  );
  const {
    control,
    colorField,
    colorButton,
    paletteSelect,
    selectedSwatch,
    selectedLabel,
    valueReadout,
  } = elements;
  if (showValueReadout) {
    container.insertBefore(valueReadout, control);
  } else {
    valueReadout.remove();
  }

  let menu: HTMLElement | null = null;
  let removeOutsideListener: (() => void) | null = null;
  let paletteForMenu: TagColorPalette | null = null;
  let removalObserver: MutationObserver | null = null;

  const selectedHex = () => input.value.toUpperCase();
  const getPalette = (): TagColorPalette =>
    TAG_COLOR_PALETTES.find(
      (palette) => palette.name === paletteSelect.value,
    ) ?? TAG_COLOR_PALETTES[0]!;
  const matchingColor = (
    palette: TagColorPalette,
  ): TagColorPaletteEntry | null =>
    palette.colors.find((color) => color.hex.toUpperCase() === selectedHex()) ??
    null;

  const renderTrigger = () => {
    const hex = selectedHex();
    const color = matchingColor(getPalette());
    selectedSwatch.style.setProperty(
      "--tag-color-swatch",
      hex || "transparent",
    );
    selectedLabel.textContent = color
      ? `${color.name} ${color.hex}`
      : hex
        ? `Custom ${hex}`
        : "Choose color";
    colorButton.setAttribute(
      "aria-label",
      `Color for ${fieldName}: ${selectedLabel.textContent}`,
    );
    valueReadout.textContent = hex;
    if (menu) renderMenu();
  };

  const closeMenu = (restoreFocus = false) => {
    menu?.remove();
    menu = null;
    paletteForMenu = null;
    removeOutsideListener?.();
    removeOutsideListener = null;
    removalObserver?.disconnect();
    removalObserver = null;
    colorButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) colorButton.focus();
  };

  const selectColor = (color: TagColorPaletteEntry) => {
    onBeforePresetSelect?.();
    input.value = color.hex.toLowerCase();
    input.dispatchEvent(new ownerWindow!.Event("input", { bubbles: true }));
    input.dispatchEvent(new ownerWindow!.Event("change", { bubbles: true }));
    onValueChange?.();
    renderTrigger();
    closeMenu(true);
  };

  const renderMenu = (focusIndex?: number) => {
    const palette = getPalette();
    if (menu && paletteForMenu !== palette) {
      menu.remove();
      menu = null;
      paletteForMenu = null;
      removeOutsideListener?.();
      removeOutsideListener = null;
      removalObserver?.disconnect();
      removalObserver = null;
    }
    if (!menu) {
      const created = createColorMenu({
        container: control,
        colorField,
        colorButton,
        fieldName,
        palette,
        ownerWindow: ownerWindow!,
        selectedHex,
        selectColor,
        closeMenu,
      });
      menu = created.menu;
      paletteForMenu = palette;
      removeOutsideListener = created.removeOutsideListener;
      removalObserver = created.removalObserver;
    }

    menu.querySelectorAll<HTMLElement>(`[role="option"]`).forEach((option) => {
      const selected =
        option.getAttribute("aria-label")?.endsWith(selectedHex()) ?? false;
      option.setAttribute("aria-selected", selected ? "true" : "false");
    });
    if (focusIndex !== undefined) {
      menu
        .querySelectorAll<HTMLButtonElement>(`button[role="option"]`)
        .item(focusIndex)
        ?.focus();
    }
  };

  attachControlEvents({
    paletteSelect,
    colorButton,
    getPalette,
    getSelectedHex: selectedHex,
    hasOpenMenu: () => menu !== null,
    renderMenu,
    renderTrigger,
    closeMenu,
  });
  input.addEventListener("input", renderTrigger);
  input.addEventListener("change", renderTrigger);
  renderTrigger();
  return () => closeMenu();
}
