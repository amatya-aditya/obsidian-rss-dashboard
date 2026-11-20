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
    expect(document.querySelector("[aria-live=polite]")?.textContent).toBe(
      "0%",
    );
    expect(onChange).toHaveBeenCalledOnce();
  });
});
