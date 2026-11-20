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
): TagOpacityControl {
  let rgb = colorRgb(color);
  let opacity = colorOpacity(color);
  const disclosure = container.createEl("details", {
    cls: "rss-dashboard-tag-opacity",
  });
  const summary = disclosure.createEl("summary", {
    text: `${label} · ${opacity}%`,
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
  const readout = row.createSpan({
    text: `${opacity}%`,
    attr: { "aria-live": "polite" },
  });
  slider.addEventListener("input", () => {
    opacity = Number(slider.value);
    summary.textContent = `${label} · ${opacity}%`;
    readout.textContent = `${opacity}%`;
    onChange?.();
  });
  return {
    value: () => colorWithOpacity(rgb, opacity),
    setColor: (value) => {
      rgb = colorRgb(value);
      slider.value = String(opacity);
    },
    setValue: (value) => {
      rgb = colorRgb(value);
      opacity = colorOpacity(value);
      slider.value = String(opacity);
      summary.textContent = `${label} · ${opacity}%`;
      readout.textContent = `${opacity}%`;
    },
  };
}
