import { colorOpacity, colorRgb, colorWithOpacity } from "../utils/tag-colors";

export interface TagOpacityControl {
  value: () => string;
  setColor: (color: string) => void;
  setValue: (color: string) => void;
}

export function addTagOpacityControl(
  container: HTMLElement,
  color: string,
  label = "Opacity",
  onChange?: () => void,
  summaryLabel = "Opacity",
  onApply?: () => void,
): TagOpacityControl {
  let rgb = colorRgb(color);
  let opacity = colorOpacity(color);
  const disclosure = container.createEl("details", {
    cls: "rss-dashboard-tag-opacity",
  });
  const summary = disclosure.createEl("summary", {
    text: `${summaryLabel} · ${opacity}%`,
  });
  const row = disclosure.createDiv({ cls: "rss-dashboard-tag-opacity-row" });
  const slider = row.createEl("input", {
    attr: {
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(opacity),
      "aria-label": label,
    },
  });
  const valueInput = row.createEl("input", {
    cls: "rss-dashboard-tag-opacity-value",
    attr: {
      type: "number",
      min: "0",
      max: "100",
      step: "1",
      inputmode: "numeric",
      value: String(opacity),
      "aria-label": `${label} percentage`,
    },
  });
  row.createSpan({
    cls: "rss-dashboard-tag-opacity-percent",
    text: "%",
    attr: { "aria-hidden": "true" },
  });
  if (onApply) {
    row
      .createEl("button", {
        text: "Set",
        attr: {
          type: "button",
          "aria-label": "Set background color and opacity for all new tags",
        },
      })
      .addEventListener("click", onApply);
  }
  const syncControls = (notify: boolean): void => {
    slider.value = String(opacity);
    valueInput.value = String(opacity);
    summary.textContent = `${summaryLabel} · ${opacity}%`;
    if (notify) onChange?.();
  };
  const setOpacity = (value: number): void => {
    const changed = value !== opacity;
    opacity = value;
    syncControls(changed);
  };
  slider.addEventListener("input", () => {
    setOpacity(Number(slider.value));
  });
  valueInput.addEventListener("input", () => {
    const value = valueInput.valueAsNumber;
    if (
      !Number.isInteger(value) ||
      value < Number(valueInput.min) ||
      value > Number(valueInput.max)
    ) {
      return;
    }
    setOpacity(value);
  });
  valueInput.addEventListener("blur", () => {
    if (valueInput.value === "" || !Number.isFinite(valueInput.valueAsNumber)) {
      syncControls(false);
      return;
    }
    setOpacity(
      Math.round(Math.min(100, Math.max(0, valueInput.valueAsNumber))),
    );
  });
  return {
    value: () => colorWithOpacity(rgb, opacity),
    setColor: (value) => {
      rgb = colorRgb(value);
      syncControls(false);
    },
    setValue: (value) => {
      rgb = colorRgb(value);
      opacity = colorOpacity(value);
      syncControls(false);
    },
  };
}
