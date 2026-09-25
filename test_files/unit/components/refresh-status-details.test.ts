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

  it("lifts the popup above the modal layer only for rows inside a modal such as the sidebar drawer", async () => {
    vi.useFakeTimers();
    const inlineRow = document.body.createDiv({ text: "Inline feed" });
    const drawerRow = document.body
      .createDiv({ cls: "modal-container mod-dim" })
      .createDiv({ cls: "modal" })
      .createDiv({ text: "Drawer feed" });
    const cleanups = [inlineRow, drawerRow].map((row) =>
      attachRefreshStatusDetails({
        row,
        description: () => "Refresh details",
        render: (popup) => popup.createDiv({ text: row.textContent ?? "" }),
      }),
    );

    const hoverAndReadPopup = async (row: HTMLElement) => {
      row.dispatchEvent(new MouseEvent("mouseenter"));
      await vi.advanceTimersByTimeAsync(350);
      const popup = document.querySelector<HTMLElement>(
        ".rss-dashboard-refresh-details",
      );
      row.dispatchEvent(new MouseEvent("mouseleave"));
      await vi.advanceTimersByTimeAsync(100);
      return popup;
    };

    const inlinePopup = await hoverAndReadPopup(inlineRow);
    const drawerPopup = await hoverAndReadPopup(drawerRow);

    expect(inlinePopup?.textContent).toBe("Inline feed");
    expect(
      inlinePopup?.classList.contains(
        "rss-dashboard-refresh-details-over-modal",
      ),
    ).toBe(false);
    expect(drawerPopup?.textContent).toBe("Drawer feed");
    expect(
      drawerPopup?.classList.contains(
        "rss-dashboard-refresh-details-over-modal",
      ),
    ).toBe(true);
    cleanups.forEach((cleanup) => cleanup());
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

  it("lifts the context-menu popup above the modal layer when its row is in the sidebar drawer", () => {
    const anchor = document.body
      .createDiv({ cls: "modal-container mod-dim" })
      .createDiv({ cls: "modal" })
      .createDiv({ text: "Drawer feed" });

    showRefreshDetailsPopup({
      anchor,
      render: (popup) => popup.createDiv({ text: "Last checked: Not yet" }),
    });

    expect(
      document
        .querySelector(".rss-dashboard-refresh-details-manual")
        ?.classList.contains("rss-dashboard-refresh-details-over-modal"),
    ).toBe(true);
  });
});

// Obsidian moves a leaf's DOM into a popout window's document without
// rebuilding the view, so rows attached in the main window end up in another
// document. jsdom documents from createHTMLDocument have no window, so give
// this one a window whose timers run on the (possibly faked) test clock.
function createPopoutDocument(): Document {
  const popoutDocument = document.implementation.createHTMLDocument("Popout");
  const popoutWindow = {
    document: popoutDocument,
    innerWidth: 1400,
    setTimeout: (handler: () => void, delay?: number) =>
      window.setTimeout(handler, delay),
    clearTimeout: (id?: number) => window.clearTimeout(id),
  };
  Object.defineProperty(popoutDocument, "defaultView", {
    configurable: true,
    value: popoutWindow,
  });
  return popoutDocument;
}

describe("refresh status details after the sidebar moves to a popout window", () => {
  it("opens the hover popup in the popout window the row was moved to", async () => {
    vi.useFakeTimers();
    const popoutDocument = createPopoutDocument();
    const row = document.body.createDiv({ text: "Feed" });
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => "Refresh details",
      render: (popup) => popup.createDiv({ text: "Last checked: Not yet" }),
    });

    popoutDocument.body.appendChild(row);
    row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);

    expect(
      popoutDocument.querySelector(".rss-dashboard-refresh-details")
        ?.textContent,
    ).toContain("Last checked: Not yet");
    expect(document.querySelector(".rss-dashboard-refresh-details")).toBeNull();

    popoutDocument.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" }),
    );
    expect(
      popoutDocument.querySelector(".rss-dashboard-refresh-details"),
    ).toBeNull();
    cleanup();
  });

  it("closes the popout's popup once the pointer leaves the moved row", async () => {
    vi.useFakeTimers();
    const popoutDocument = createPopoutDocument();
    const row = document.body.createDiv({ text: "Feed" });
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => "Refresh details",
      render: (popup) => popup.createDiv({ text: "Last checked: Not yet" }),
    });

    popoutDocument.body.appendChild(row);
    row.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(350);
    expect(
      popoutDocument.querySelector(".rss-dashboard-refresh-details"),
    ).not.toBeNull();
    row.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.advanceTimersByTimeAsync(100);

    expect(
      popoutDocument.querySelector(".rss-dashboard-refresh-details"),
    ).toBeNull();
    cleanup();
  });

  it("keeps the row's screen-reader description in the popout window's document", () => {
    const popoutDocument = createPopoutDocument();
    const row = document.body.createDiv({ text: "Feed" });
    const cleanup = attachRefreshStatusDetails({
      row,
      description: () => "Refresh details. Last checked: Not yet",
      render: () => undefined,
    });

    popoutDocument.body.appendChild(row);
    row.dispatchEvent(new FocusEvent("focusin"));

    const descriptionId = row.getAttribute("aria-describedby") ?? "";
    expect(popoutDocument.getElementById(descriptionId)?.textContent).toBe(
      "Refresh details. Last checked: Not yet",
    );
    expect(document.getElementById(descriptionId)).toBeNull();

    cleanup();
    expect(popoutDocument.getElementById(descriptionId)).toBeNull();
  });
});
