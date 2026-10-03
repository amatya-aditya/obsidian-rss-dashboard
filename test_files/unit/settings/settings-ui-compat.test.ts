import { afterEach, describe, expect, it } from "vitest";
import {
  createSettingsUiCompatibility,
  type SettingsButtonControl,
  type SettingsSliderControl,
} from "../../../src/settings/settings-ui-compat";

function createButton(): SettingsButtonControl & { calls: string[] } {
  const buttonEl = document.body.createEl("button");
  const calls: string[] = [];

  return {
    buttonEl,
    calls,
    setDestructive() {
      calls.push("destructive");
      buttonEl.classList.add("mod-destructive");
      return this;
    },
  };
}

function createSlider(initialValue: number): SettingsSliderControl & {
  displayFormats: Array<(value: number) => string>;
} {
  const sliderEl = document.body.createEl("input");
  sliderEl.type = "range";
  sliderEl.value = String(initialValue);
  const displayFormats: Array<(value: number) => string> = [];

  return {
    sliderEl,
    displayFormats,
    getValue: () => Number(sliderEl.value),
    setValue(value) {
      sliderEl.value = String(value);
      return this;
    },
    setDisplayFormat(format) {
      displayFormats.push(format);
      return this;
    },
  };
}

describe("settings UI compatibility", () => {
  afterEach(() => {
    document.body.empty();
  });

  it("uses the native destructive treatment and formatted slider display on current clients", () => {
    const compatibility = createSettingsUiCompatibility(() => true);
    const button = createButton();
    const slider = createSlider(5);
    const settingControl = document.body.createDiv();
    settingControl.append(slider.sliderEl);

    compatibility.markDestructive(button);
    compatibility.presentSliderValue(slider, (value) => `${value} MiB`);

    expect(button.calls).toEqual(["destructive"]);
    expect(button.buttonEl.classList.contains("mod-warning")).toBe(false);
    expect(slider.displayFormats).toHaveLength(1);
    expect(slider.displayFormats[0](5)).toBe("5 MiB");
    expect(
      settingControl.querySelector(".rss-dashboard-slider-value"),
    ).toBeNull();
  });

  it("uses legacy warning styling and keeps the inline slider value current on older clients", () => {
    const compatibility = createSettingsUiCompatibility(() => false);
    const button = createButton();
    const slider = createSlider(5);
    const settingControl = document.body.createDiv();
    settingControl.append(slider.sliderEl);

    compatibility.markDestructive(button);
    compatibility.presentSliderValue(slider, (value) => `${value} MiB`);

    const valueEl = settingControl.querySelector(".rss-dashboard-slider-value");
    expect(button.calls).toEqual([]);
    expect(button.buttonEl.classList.contains("mod-warning")).toBe(true);
    expect(valueEl?.textContent).toBe("5 MiB");

    slider.sliderEl.value = "12";
    slider.sliderEl.dispatchEvent(new Event("input"));
    expect(valueEl?.textContent).toBe("12 MiB");

    slider.setValue(24);
    expect(valueEl?.textContent).toBe("24 MiB");
  });
});
