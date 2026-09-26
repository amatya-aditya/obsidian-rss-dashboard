import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { App } from "obsidian";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";
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

  describe("saving the shortcuts to a vault note", () => {
    function createSettings(defaultFolder: string): RssDashboardSettings {
      const settings = JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS),
      ) as RssDashboardSettings;
      settings.articleSaving.defaultFolder = defaultFolder;
      return settings;
    }

    async function clickSaveLink(modal: ShortcutHelpModal): Promise<void> {
      const link = modal.contentEl.querySelector(
        ".rss-dashboard-save-shortcuts-link",
      ) as HTMLElement;
      link.click();
      await vi.waitFor(() => {
        expect(debugSpy).toHaveBeenCalledWith(
          "[Stub Notice]",
          expect.any(String),
        );
      });
    }

    let debugSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("saves into an existing folder whose name differs only in case", async () => {
      const app = App.createMock();
      await app.vault.createFolder("RSS Articles");
      const modal = new ShortcutHelpModal(app, createSettings("rss articles"));
      modal.onOpen();

      await clickSaveLink(modal);

      expect(
        app.vault.getAbstractFileByPath("RSS Articles/keyboard-shortcuts.md"),
      ).not.toBeNull();
      expect(debugSpy).toHaveBeenCalledWith(
        "[Stub Notice]",
        expect.stringContaining(
          'Keyboard shortcuts saved to "RSS Articles/keyboard-shortcuts.md"',
        ),
      );
      modal.onClose();
    });

    it("creates the save folder when it doesn't exist", async () => {
      const app = App.createMock();
      const modal = new ShortcutHelpModal(app, createSettings("Notes/RSS"));
      modal.onOpen();

      await clickSaveLink(modal);

      expect(
        app.vault.getAbstractFileByPath("Notes/RSS/keyboard-shortcuts.md"),
      ).not.toBeNull();
      modal.onClose();
    });
  });
});
