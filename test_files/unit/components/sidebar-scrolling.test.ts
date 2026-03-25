import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sidebar } from "../../../src/components/sidebar";
import { App } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import type { RssDashboardSettings } from "../../../src/types/types";

describe("Sidebar Horizontal Scrolling", () => {
  let iconRow: HTMLDivElement;
  let mockSidebar: any;

  beforeEach(() => {
    iconRow = document.createElement("div");
    iconRow.classList.add("rss-dashboard-header-icon-row");
    
    // jsdom doesn't implement layout calculations well, mock them
    Object.defineProperty(iconRow, 'scrollLeft', {
      value: 0,
      writable: true
    });
    Object.defineProperty(iconRow, 'offsetLeft', {
      value: 10,
      writable: true
    });

    mockSidebar = {
      app: { loadLocalStorage: vi.fn(), saveLocalStorage: vi.fn() } as unknown as App,
      container: document.createElement("div"),
      plugin: {} as RssDashboardPlugin,
      settings: {} as RssDashboardSettings,
      options: {},
      callbacks: {},
    };

    // Extract the scrolling behavior application logic
    const addHorizontalScrollBehavior = Sidebar.prototype['addHorizontalScrollBehavior'];
    addHorizontalScrollBehavior.call(mockSidebar, iconRow);
  });

  it("should scroll horizontally on mouse wheel", () => {
    const wheelEvent = new WheelEvent("wheel", { deltaY: 50 });
    Object.defineProperty(wheelEvent, 'preventDefault', { value: vi.fn() });
    
    iconRow.dispatchEvent(wheelEvent);
    
    expect(wheelEvent.preventDefault).toHaveBeenCalled();
    expect(iconRow.scrollLeft).toBe(50);
  });

  it("should support mouse drag scrolling", () => {
    // 1. Mouse down
    const mouseDown = new MouseEvent("mousedown", { clientX: 100 });
    iconRow.dispatchEvent(mouseDown);
    expect(iconRow.classList.contains("dragging")).toBe(true);

    // 2. Mouse move (walk = (50 - 10) - (100 - 10) * 2 = 40 - 90 = -50 * 2 = -100)
    // Wait, let's trace: startX = clientX - offsetLeft = 100 - 10 = 90
    // newX = clientX - offsetLeft = 50 - 10 = 40
    // x - startX = 40 - 90 = -50
    // walk = -50 * 2 = -100
    // scrollLeft = 0 - (-100) = 100
    const mouseMove = new MouseEvent("mousemove", { clientX: 50 });
    Object.defineProperty(mouseMove, 'preventDefault', { value: vi.fn() });
    iconRow.dispatchEvent(mouseMove);
    
    expect(mouseMove.preventDefault).toHaveBeenCalled();
    expect(iconRow.scrollLeft).toBe(100);

    // 3. Mouse up
    const mouseUp = new MouseEvent("mouseup");
    iconRow.dispatchEvent(mouseUp);
    expect(iconRow.classList.contains("dragging")).toBe(false);
  });

  it("should prevent click after a long drag", () => {
    // Start drag
    iconRow.dispatchEvent(new MouseEvent("mousedown", { clientX: 100 }));
    
    // Move enough to set isDragging to true (walk > 5 or walk < -5)
    // walk = (90 - 100) * 2 = -20. abs(-20) > 5.
    iconRow.dispatchEvent(new MouseEvent("mousemove", { clientX: 90 }));
    iconRow.dispatchEvent(new MouseEvent("mouseup"));

    // Fire click
    const clickEvent = new MouseEvent("click");
    Object.defineProperty(clickEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(clickEvent, 'stopPropagation', { value: vi.fn() });
    
    iconRow.dispatchEvent(clickEvent);
    
    expect(clickEvent.preventDefault).toHaveBeenCalled();
    expect(clickEvent.stopPropagation).toHaveBeenCalled();
  });

  it("should not prevent click on a regular click (no drag)", () => {
    // Start drag
    iconRow.dispatchEvent(new MouseEvent("mousedown", { clientX: 100 }));
    
    // Don't move or move just a tiny bit (walk < 5)
    // walk = (100 - 100) * 2 = 0
    iconRow.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }));
    iconRow.dispatchEvent(new MouseEvent("mouseup"));

    // Fire click
    const clickEvent = new MouseEvent("click");
    Object.defineProperty(clickEvent, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(clickEvent, 'stopPropagation', { value: vi.fn() });
    
    iconRow.dispatchEvent(clickEvent);
    
    expect(clickEvent.preventDefault).not.toHaveBeenCalled();
    expect(clickEvent.stopPropagation).not.toHaveBeenCalled();
  });
});
