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
