import { describe, expect, it } from "vitest";
import { auditTagOpacity } from "../../scripts/check-settings-layout.mjs";

function opacityRow(sliderWidth: number, rowWidth: number) {
  const parent = createDiv();
  const disclosure = createEl("details");
  const row = createDiv();
  const slider = createEl("input");
  const number = createEl("input");
  const suffix = createSpan();
  disclosure.className = "rss-dashboard-tag-opacity";
  row.className = "rss-dashboard-tag-opacity-row";
  slider.type = "range";
  number.type = "number";
  suffix.className = "rss-dashboard-tag-opacity-percent";
  row.append(slider, number, suffix);
  disclosure.append(row);
  parent.append(disclosure);

  // jsdom supplies the DOM and styles but does not lay out the controls.
  Object.defineProperty(parent, "clientWidth", { value: 300 });
  Object.defineProperty(row, "clientWidth", { value: rowWidth });
  const setBox = (element: HTMLElement, left: number, width: number) => {
    element.getBoundingClientRect = () =>
      new DOMRect(left, 0, disclosure.open ? width : 0, 20);
  };
  setBox(row, 0, rowWidth);
  setBox(slider, 0, sliderWidth);
  setBox(number, sliderWidth, 50);
  setBox(suffix, sliderWidth + 50, 10);
  return { parent, disclosure, number };
}

describe("tag opacity layout audit", () => {
  it("opens disclosures to measure controls and restores their open state", () => {
    const pane = createDiv();
    const background = opacityRow(240, 300);
    const text = opacityRow(240, 300);
    text.disclosure.open = true;
    pane.append(background.parent, text.parent);

    expect(auditTagOpacity(pane)).toEqual([]);
    expect(background.disclosure.open).toBe(false);
    expect(text.disclosure.open).toBe(true);
  });

  it("reports a slider constrained by a narrow parent grid cell", () => {
    const pane = createDiv();
    const background = opacityRow(30, 90);
    pane.append(background.parent, opacityRow(240, 300).parent);

    expect(auditTagOpacity(pane)).toEqual([
      "Opacity: slider is 30px (expected 30px), row is 90px (expected 300px)",
    ]);
    expect(background.disclosure.open).toBe(false);
  });

  it("reports missing disclosures or controls", () => {
    const pane = createDiv();
    expect(auditTagOpacity(pane)).toEqual([
      "expected at least two opacity disclosures",
    ]);
    const background = opacityRow(240, 300);
    background.number.remove();
    pane.append(background.parent, opacityRow(240, 300).parent);
    expect(auditTagOpacity(pane)).toEqual([
      "Opacity: slider, number field, or percent suffix missing",
    ]);
  });
});
