import { describe, it, expect, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { ShortcutHelpModal } from "../../../src/modals/shortcut-help-modal";

describe("ShortcutHelpModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  function createMockApp(): App {
    return {} as unknown as App;
  }

  it("renders the help modal with correct sections", () => {
    const app = createMockApp();
    const modal = new ShortcutHelpModal(app);
    
    // Simulate Obsidian Modal open behavior
    modal.onOpen();
    
    const content = modal.contentEl;
    expect(content.querySelector(".rss-dashboard-header")).toBeDefined();
    
    // Should have general navigation section
    const textContent = content.textContent;
    expect(textContent).toContain("General Navigation");
    expect(textContent).toContain("Open Help Dialog");
    expect(textContent).toContain("Focus dashboard view");
    expect(textContent).toContain("Focus sidebar");
    expect(textContent).toContain("Focus reader view");
    expect(textContent).toContain("Shift + l");
    expect(textContent).toContain("Shift + o / Shift + Enter");
    
    modal.onClose();
  });

  it("has a compliant clickable-icon for the close button", () => {
    const app = createMockApp();
    const modal = new ShortcutHelpModal(app);
    
    modal.onOpen();
    
    const closeBtn = modal.contentEl.querySelector(".rss-dashboard-header-close-button.clickable-icon");
    expect(closeBtn).not.toBeNull();
    if (closeBtn) {
      expect(closeBtn.getAttribute("role")).toBe("button");
      expect(closeBtn.getAttribute("tabindex")).toBe("0");
    }
    
    modal.onClose();
  });
});
