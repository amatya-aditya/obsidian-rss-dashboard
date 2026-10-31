import { requireApiVersion } from "obsidian";

const MODERN_SETTINGS_API_VERSION = "1.13.0";

export interface SettingsButtonControl {
  buttonEl: HTMLElement;
  setDestructive(): SettingsButtonControl;
}

export interface SettingsSliderControl {
  sliderEl: HTMLInputElement;
  getValue(): number;
  setValue(value: number): SettingsSliderControl;
  setDisplayFormat(format: (value: number) => string): SettingsSliderControl;
}

export interface SettingsUiCompatibility {
  markDestructive(button: SettingsButtonControl): void;
  presentSliderValue(
    slider: SettingsSliderControl,
    format: (value: number) => string,
  ): void;
}

type ApiVersionChecker = (version: string) => boolean;

/**
 * Provides the settings-control behavior shared by supported Obsidian versions.
 *
 * Obsidian 1.11.5 through 1.12.x need the legacy DOM presentation. This branch
 * can be removed when the plugin minimum version increases to 1.13.0.
 *
 * The API version is read on every call, not once at creation: the running
 * version never changes, but reading it live lets a test switch the stub's
 * version to exercise the 1.11.5 support-floor path (#431).
 */
export function createSettingsUiCompatibility(
  hasApiVersion: ApiVersionChecker = requireApiVersion,
): SettingsUiCompatibility {
  const supportsModernControls = (): boolean =>
    hasApiVersion(MODERN_SETTINGS_API_VERSION);

  return {
    markDestructive(button): void {
      if (supportsModernControls()) {
        button.setDestructive();
        return;
      }

      button.buttonEl.addClass("mod-warning");
    },

    presentSliderValue(slider, format): void {
      if (supportsModernControls()) {
        slider.setDisplayFormat(format);
        return;
      }

      const controlEl = slider.sliderEl.parentElement;
      if (!controlEl) return;

      const valueEl = controlEl.createSpan({
        cls: "rss-dashboard-slider-value",
      });
      const updateValue = (value: number): void => {
        valueEl.setText(format(value));
      };
      const originalSetValue = slider.setValue.bind(slider);

      slider.setValue = (value: number): SettingsSliderControl => {
        originalSetValue(value);
        updateValue(value);
        return slider;
      };
      slider.sliderEl.addEventListener("input", () => {
        updateValue(slider.getValue());
      });
      updateValue(slider.getValue());
    },
  };
}

export const settingsUiCompatibility = createSettingsUiCompatibility();
