import { beforeEach, describe, expect, it, vi } from "vitest";
import { addTagOpacityControl } from "../../../src/components/tag-opacity-control";

describe("tag opacity control", () => {
  beforeEach(() => document.body.replaceChildren());

  it("starts collapsed and exposes an accessible integer percentage slider", () => {
    const control = addTagOpacityControl(document.body, "#123456");
    const disclosure = document.querySelector<HTMLDetailsElement>(
      ".rss-dashboard-tag-opacity",
    )!;
    const slider =
      disclosure.querySelector<HTMLInputElement>("input[type=range]")!;

    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector("summary")?.textContent).toBe(
      "Opacity · 100%",
    );
    expect(slider.getAttribute("aria-label")).toBe("Opacity");
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("100");
    expect(slider.step).toBe("1");
    const entry =
      disclosure.querySelector<HTMLInputElement>("input[type=number]")!;
    expect(entry.getAttribute("aria-label")).toBe("Opacity percentage");
    expect(entry.min).toBe("0");
    expect(entry.max).toBe("100");
    expect(entry.step).toBe("1");
    expect(entry.value).toBe("100");
    expect(
      disclosure.querySelector(".rss-dashboard-tag-opacity-percent")
        ?.textContent,
    ).toBe("%");
    expect(control.value()).toBe("#123456");
  });

  it("updates the live percentage and keeps RGB when opacity changes", () => {
    const onChange = vi.fn();
    const control = addTagOpacityControl(
      document.body,
      "#123456",
      "Opacity",
      onChange,
    );
    const slider =
      document.querySelector<HTMLInputElement>("input[type=range]")!;
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    expect(control.value()).toBe("rgba(18, 52, 86, 0)");
    expect(document.querySelector("summary")?.textContent).toBe("Opacity · 0%");
    expect(
      document.querySelector<HTMLInputElement>("input[type=number]")?.value,
    ).toBe("0");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("syncs a valid typed percentage with the slider, preview, and color value", () => {
    const onChange = vi.fn();
    const control = addTagOpacityControl(
      document.body,
      "#123456",
      "Background opacity",
      onChange,
    );
    const entry =
      document.querySelector<HTMLInputElement>("input[type=number]")!;

    entry.value = "42";
    entry.dispatchEvent(new Event("input", { bubbles: true }));

    expect(
      document.querySelector<HTMLInputElement>("input[type=range]")?.value,
    ).toBe("42");
    expect(document.querySelector("summary")?.textContent).toBe(
      "Opacity · 42%",
    );
    expect(control.value()).toBe("rgba(18, 52, 86, 0.42)");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("keeps the last valid value during incomplete entry and restores it on blur", () => {
    const control = addTagOpacityControl(
      document.body,
      "rgba(18, 52, 86, 0.4)",
    );
    const entry =
      document.querySelector<HTMLInputElement>("input[type=number]")!;

    entry.value = "";
    entry.dispatchEvent(new Event("input", { bubbles: true }));
    expect(control.value()).toBe("rgba(18, 52, 86, 0.4)");

    entry.dispatchEvent(new Event("blur"));
    expect(entry.value).toBe("40");
  });

  it("clamps out-of-range values and rounds decimals on blur", () => {
    const control = addTagOpacityControl(document.body, "#123456");
    const entry =
      document.querySelector<HTMLInputElement>("input[type=number]")!;
    const slider =
      document.querySelector<HTMLInputElement>("input[type=range]")!;

    entry.value = "0";
    entry.dispatchEvent(new Event("input", { bubbles: true }));
    expect(control.value()).toBe("rgba(18, 52, 86, 0)");
    expect(slider.value).toBe("0");

    entry.value = "100";
    entry.dispatchEvent(new Event("input", { bubbles: true }));
    expect(control.value()).toBe("#123456");
    expect(slider.value).toBe("100");

    entry.value = "140";
    entry.dispatchEvent(new Event("input", { bubbles: true }));
    expect(control.value()).toBe("#123456");
    entry.dispatchEvent(new Event("blur"));
    expect(entry.value).toBe("100");
    expect(slider.value).toBe("100");

    entry.value = "42.6";
    entry.dispatchEvent(new Event("input", { bubbles: true }));
    expect(control.value()).toBe("#123456");
    entry.dispatchEvent(new Event("blur"));
    expect(entry.value).toBe("43");
    expect(slider.value).toBe("43");
    expect(control.value()).toBe("rgba(18, 52, 86, 0.43)");
  });

  it("keeps the value field in sync when another control changes the color", () => {
    const control = addTagOpacityControl(
      document.body,
      "rgba(18, 52, 86, 0.4)",
    );
    const entry =
      document.querySelector<HTMLInputElement>("input[type=number]")!;

    control.setColor("#abcdef");
    expect(entry.value).toBe("40");
    expect(control.value()).toBe("rgba(171, 205, 239, 0.4)");

    control.setValue("rgba(1, 2, 3, 0.75)");
    expect(entry.value).toBe("75");
    expect(control.value()).toBe("rgba(1, 2, 3, 0.75)");
  });

  it("keeps the collapsed label compact while naming the specific slider", () => {
    addTagOpacityControl(document.body, "#123456", "Background opacity");
    const summary = document.querySelector("summary");
    const slider =
      document.querySelector<HTMLInputElement>("input[type=range]");

    expect(summary?.textContent).toBe("Opacity · 100%");
    expect(slider?.getAttribute("aria-label")).toBe("Background opacity");
  });
});
