import type { Setting, SliderComponent, TextComponent } from "obsidian";
import { settingsUiCompatibility } from "./settings-ui-compat";

interface SettingsSliderOptions {
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  exactInput?: "clamp" | { getSavedValue: () => number };
  disabled?: boolean;
  format: (value: number) => string;
  apply: (value: number) => Promise<void>;
}

export function addSettingsSlider(
  setting: Setting,
  options: SettingsSliderOptions,
): void {
  const {
    min,
    max,
    step = 1,
    defaultValue,
    format,
    disabled = false,
    exactInput,
  } = options;
  const label = setting.nameEl.textContent ?? "";
  let slider: SliderComponent;
  let exact: TextComponent | undefined;
  let updateReset = () => {};
  let syncing = false;

  const sync = (value: number) => {
    syncing = true;
    slider.setValue(value);
    if (exact?.getValue() !== String(value)) exact?.setValue(String(value));
    slider.sliderEl.setAttribute("aria-valuetext", format(value));
    updateReset();
    syncing = false;
  };

  const commit = async (value: number) => {
    if (syncing || disabled) return;
    sync(value);
    await options.apply(value);
  };

  setting.setClass("rss-dashboard-settings-slider");
  setting.setClass("rss-dashboard-settings-two-row");
  setting.addSlider((control) => {
    slider = control;
    control.setLimits(min, max, step).setValue(options.value).onChange(commit);
    control.sliderEl.setAttribute("aria-label", label);
    control.sliderEl.disabled = disabled;
    settingsUiCompatibility.presentSliderValue(control, format);
  });

  if (exactInput) {
    setting.addText((control) => {
      exact = control;
      const input = control.inputEl;
      input.type = "number";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.disabled = disabled;
      input.setAttribute("aria-label", `${label}, exact value`);
      input.addClass("rss-dashboard-settings-number-input");
      if (exactInput !== "clamp") {
        control.setPlaceholder(String(defaultValue));
        input.addEventListener("blur", () => {
          if (disabled) return;
          const value = Number(control.getValue());
          if (!Number.isInteger(value) || value < min || value > max) {
            control.setValue(String(exactInput.getSavedValue()));
            return;
          }
          void commit(value);
        });
      } else {
        control.onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed)) {
            await commit(Math.max(min, Math.min(max, parsed)));
          }
        });
      }
    });
  }

  setting.addButton((button) => {
    button
      .setIcon("rotate-ccw")
      .setTooltip(`Reset ${label} to ${format(defaultValue)}`)
      .onClick(() => {
        if (disabled || slider.getValue() === defaultValue) return;
        if (button.buttonEl.ownerDocument.activeElement === button.buttonEl) {
          slider.sliderEl.focus();
        }
        void commit(defaultValue);
      });
    button.buttonEl.addClass("rss-dashboard-settings-slider-reset");
    updateReset = () => {
      button.setDisabled(disabled || slider.getValue() === defaultValue);
    };
    sync(slider.getValue());
  });
}
