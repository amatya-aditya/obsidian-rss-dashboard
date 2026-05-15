import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const addFeedModalCtorSpy = vi.fn();
const addFeedModalOpenSpy = vi.fn();

type ObsidianHTMLElement = HTMLElement & {
  createDiv(opts?: string | { cls?: string; text?: string; attr?: Record<string, string> }): HTMLDivElement;
  empty(): void;
};

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  AddFeedModal: class AddFeedModalMock {
    constructor(...args: unknown[]) {
      const spy = addFeedModalCtorSpy as (...args: unknown[]) => void;
      spy(...args);
    }
    open(): void {
      addFeedModalOpenSpy();
    }
  },
}));

describe("Sidebar addFeed icon", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    (document.body as unknown as ObsidianHTMLElement).empty();
    addFeedModalCtorSpy.mockClear();
    addFeedModalOpenSpy.mockClear();
  });

  it("opens AddFeedModal via the feed-manager-modal barrel import", async () => {
    const { Sidebar } = await import("../../../src/components/sidebar");

    const app = new App();
    const container = (document.body as unknown as ObsidianHTMLElement).createDiv();

    const plugin = { manifest: { id: "rss-dashboard" } } as unknown;
    const settings = { folders: [], display: {} } as unknown;
    const options = {} as unknown;
    const callbacks = {
      onAddFeed: vi.fn(async () => {}),
    } as unknown;

    const sidebar = new Sidebar(
      app,
      container,
      plugin as never,
      settings as never,
      options as never,
      callbacks as never,
    );

    // showAddFeedModal is private; access for regression protection
    (sidebar as unknown as { showAddFeedModal: (folder?: string) => void }).showAddFeedModal(
      "Uncategorized",
    );

    expect(addFeedModalCtorSpy).toHaveBeenCalledTimes(1);
    expect(addFeedModalOpenSpy).toHaveBeenCalledTimes(1);

    const ctorArgs = addFeedModalCtorSpy.mock.calls[0] as unknown[];
    expect(ctorArgs).toHaveLength(6);
    expect(ctorArgs[0]).toBe(app);
    expect(ctorArgs[1]).toEqual([]);
    expect(typeof ctorArgs[2]).toBe("function"); // onAdd callback wrapper
    expect(typeof ctorArgs[3]).toBe("function"); // onSave callback
    expect(ctorArgs[4]).toBe("Uncategorized");
    expect(ctorArgs[5]).toBe(plugin);
  });
});

