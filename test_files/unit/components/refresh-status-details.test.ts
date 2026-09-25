import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachRefreshStatusDetails,
  showRefreshDetailsPopup,
} from "../../../src/components/refresh-status-details";

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

describe("refresh status details - one popup at a time", () => {
  const attachRow = (label: string) => {
    // Sidebar rows use tabindex -1, so a mouse click focuses them.
    const row = document.body.createDiv({ text: label });
    row.setAttribute("tabindex", "-1");
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => `Refresh details for ${label}`,
      render: (popup) => popup.createDiv({ text: `Details for ${label}` }),
    });
    return { row, cleanup };
  };
  const openPopups = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(".rss-dashboard-refresh-details"),
    ).map((popup) => popup.textContent);

  it("closes a clicked row's popup once the pointer moves to another row", async () => {
    vi.useFakeTimers();
    const first = attachRow("First feed");
    const second = attachRow("Second feed");

    first.row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);
    first.row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    first.row.focus();
    first.row.dispatchEvent(new MouseEvent("mouseleave"));
    second.row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(450);

    expect(openPopups()).toEqual(["Details for Second feed"]);
    first.cleanup();
    second.cleanup();
  });

  it("closes a clicked row's popup when the pointer leaves it", async () => {
    vi.useFakeTimers();
    const first = attachRow("First feed");

    first.row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);
    first.row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    first.row.focus();
    first.row.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.advanceTimersByTimeAsync(100);

    expect(openPopups()).toEqual([]);
    first.cleanup();
  });

  it("replaces a keyboard-focused row's popup when another row is hovered", async () => {
    vi.useFakeTimers();
    const first = attachRow("First feed");
    const second = attachRow("Second feed");

    first.row.focus();
    await vi.advanceTimersByTimeAsync(350);
    expect(openPopups()).toEqual(["Details for First feed"]);

    second.row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);

    expect(openPopups()).toEqual(["Details for Second feed"]);
    first.cleanup();
    second.cleanup();
  });

  it("keeps a keyboard-focused row's popup open when the pointer passes over and leaves", async () => {
    vi.useFakeTimers();
    const first = attachRow("First feed");

    first.row.focus();
    await vi.advanceTimersByTimeAsync(350);
    first.row.dispatchEvent(new MouseEvent("mouseenter"));
    first.row.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.advanceTimersByTimeAsync(200);

    expect(openPopups()).toEqual(["Details for First feed"]);
    first.cleanup();
  });

  it("closes a context-menu refresh details popup when a hover popup opens", async () => {
    vi.useFakeTimers();
    const anchor = document.body.createDiv({ text: "Folder" });
    const second = attachRow("Second feed");

    showRefreshDetailsPopup({
      anchor,
      render: (popup) => popup.createDiv({ text: "Details for Folder" }),
    });
    expect(openPopups()).toEqual(["Details for Folder"]);

    second.row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);

    expect(openPopups()).toEqual(["Details for Second feed"]);
    second.cleanup();
  });

  it("dismisses a context-menu refresh details popup after five seconds", async () => {
    vi.useFakeTimers();
    const anchor = document.body.createDiv({ text: "Folder" });

    showRefreshDetailsPopup({
      anchor,
      render: (popup) => popup.createDiv({ text: "Details for Folder" }),
    });
    await vi.advanceTimersByTimeAsync(5000);

    expect(openPopups()).toEqual([]);
  });
});
