import { afterEach, describe, expect, it, vi } from "vitest";
import { attachRefreshStatusDetails } from "../../../src/components/refresh-status-details";

afterEach(() => {
  vi.useRealTimers();
  document.body.empty();
});

describe("refresh status details", () => {
  it("opens after hover delay, exposes a description without a native tooltip trigger, and closes with Escape", async () => {
    vi.useFakeTimers();
    const row = document.body.createDiv({ text: "Feed" });
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => "Refresh details. Last checked: Not yet",
      render: (popup) => popup.createDiv({ text: "Last checked: Not yet" }),
    });

    row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(350);

    const popup = document.querySelector<HTMLElement>(
      ".rss-dashboard-refresh-details",
    );
    expect(popup?.textContent).toContain("Last checked: Not yet");
    const descriptionId = row.getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId ?? "")?.textContent).toContain(
      "Refresh details",
    );
    expect(row.hasAttribute("aria-label")).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".rss-dashboard-refresh-details")).toBeNull();

    cleanup();
  });

  it("places the popup below the row across the window when there is no readable room beside it", async () => {
    vi.useFakeTimers();
    const row = document.body.createDiv({ text: "Feed" });
    // A sidebar that fills most of a phone-width window leaves only a sliver.
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 40, 360, 20),
    );
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => "Refresh details",
      render: (popup) => popup.createDiv({ text: "Last checked: Not yet" }),
    });

    row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);

    const popup = document.querySelector<HTMLElement>(
      ".rss-dashboard-refresh-details",
    );
    expect(popup?.style.getPropertyValue("left")).toBe("8px");
    expect(popup?.style.getPropertyValue("right")).toBe("8px");
    expect(popup?.style.getPropertyValue("top")).toBe("64px");
    cleanup();
    vi.restoreAllMocks();
  });

  it("places the popup beside the row when there is room", async () => {
    vi.useFakeTimers();
    const row = document.body.createDiv({ text: "Feed" });
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1400);
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 40, 300, 20),
    );
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => "Refresh details",
      render: (popup) => popup.createDiv({ text: "Last checked: Not yet" }),
    });

    row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);

    const popup = document.querySelector<HTMLElement>(
      ".rss-dashboard-refresh-details",
    );
    expect(popup?.style.getPropertyValue("left")).toBe("308px");
    expect(popup?.style.getPropertyValue("top")).toBe("40px");
    expect(popup?.style.getPropertyValue("right")).toBe("");
    cleanup();
    vi.restoreAllMocks();
  });

  it("cancels a pending popup when the pointer leaves before the hover delay", async () => {
    vi.useFakeTimers();
    const row = document.body.createDiv({ text: "Feed" });
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => "Refresh details. Last checked: Not yet",
      render: (popup) => popup.createDiv({ text: "Last checked: Not yet" }),
    });

    row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(100);
    row.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.advanceTimersByTimeAsync(400);

    expect(document.querySelector(".rss-dashboard-refresh-details")).toBeNull();
    cleanup();
  });

  it("closes an opened popup after the pointer leaves the row", async () => {
    vi.useFakeTimers();
    const row = document.body.createDiv({ text: "Feed" });
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => "Refresh details. Last checked: Not yet",
      render: (popup) => popup.createDiv({ text: "Last checked: Not yet" }),
    });

    row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);
    expect(document.querySelector(".rss-dashboard-refresh-details")).not.toBeNull();

    row.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector(".rss-dashboard-refresh-details")).toBeNull();
    cleanup();
  });
});
