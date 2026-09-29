import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { KagiSmallwebView } from "../../../src/views/kagi-smallweb-view";

function renderNavigation() {
  const activateDiscoverView = vi.fn().mockResolvedValue(undefined);
  const leaf = { app: {} } as unknown as WorkspaceLeaf;
  const plugin = { activateDiscoverView } as unknown as RssDashboardPlugin;
  const view = new KagiSmallwebView(leaf, plugin);

  // Render the initial empty view without onOpen's external feed request.
  document.body.appendChild(view.containerEl);
  view.render();

  const backControl = view.containerEl.querySelector<HTMLElement>(
    ".rss-dashboard-nav-button",
  );
  if (!backControl) {
    throw new Error("The Small Web view did not render its Discover control");
  }

  return { backControl, activateDiscoverView };
}

afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
});

describe("Kagi Small Web navigation", () => {
  it("offers a focusable native button for returning to Discover", () => {
    const { backControl } = renderNavigation();

    backControl.focus();

    expect(document.activeElement).toBe(backControl);
    expect(backControl.tabIndex).toBe(0);
    expect(backControl.tagName).toBe("BUTTON");
    expect(backControl.getAttribute("type")).toBe("button");
    expect(backControl.textContent).toBe("← Discover");
  });

  it("returns to Discover when the back control is activated", () => {
    const { backControl, activateDiscoverView } = renderNavigation();

    backControl.click();

    expect(activateDiscoverView).toHaveBeenCalledOnce();
  });
});
