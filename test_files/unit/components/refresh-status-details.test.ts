import { afterEach, describe, expect, it, vi } from "vitest";
import { attachRefreshStatusDetails } from "../../../src/components/refresh-status-details";

afterEach(() => {
  vi.useRealTimers();
  document.body.empty();
});

describe("refresh status details", () => {
  it("opens after hover delay, exposes a screen-reader description, and closes with Escape", async () => {
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
    expect(row.getAttribute("aria-describedby")).toBe(popup?.id);
    expect(row.getAttribute("aria-label")).toContain("Refresh details");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".rss-dashboard-refresh-details")).toBeNull();

    cleanup();
  });
});
