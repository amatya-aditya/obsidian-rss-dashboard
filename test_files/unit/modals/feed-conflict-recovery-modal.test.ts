import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedConflictRecoveryModal } from "../../../src/modals/feed-conflict-recovery-modal";
import type { FeedItemsShard } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
});

describe("feed conflict recovery", () => {
  it("saves a choice for an article with a prototype-named GUID", async () => {
    const item = {
      guid: "__proto__",
      title: "Original",
      link: "https://example.com/one",
      description: "",
      pubDate: "",
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
    const ancestor: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: item.feedUrl,
      updatedAt: 1,
      items: [item],
    };
    const context = {
      feedId: "feed",
      ancestor,
      local: { ...ancestor, items: [{ ...item, title: "Local" }] },
      incoming: { ...ancestor, items: [] },
    };
    const resolve = vi.fn(
      async (
        _name: string,
        choices: Readonly<Record<string, "local" | "synced">>,
      ) => {
        return (
          Object.prototype.hasOwnProperty.call(choices, "__proto__") &&
          choices["__proto__"] === "local"
        );
      },
    );
    const modal = new FeedConflictRecoveryModal(new App(), {
      list: async () => ["1-0.json"],
      read: async () => context,
      resolve,
    });
    modal.open();
    await vi.waitFor(() =>
      expect(modal.contentEl.querySelector("select")).not.toBeNull(),
    );
    const select = modal.contentEl.querySelector("select")!;
    select.value = "local";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const save = [...modal.contentEl.querySelectorAll("button")].find(
      (button) => button.textContent === "Save choices",
    )!;
    expect(save.disabled).toBe(false);
    save.click();
    await vi.waitFor(() => expect(resolve).toHaveBeenCalled());
    const choices = resolve.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(choices, "__proto__")).toBe(
      true,
    );
    expect(choices["__proto__"]).toBe("local");
    modal.close();
  });

  it("requires a choice and keeps the dialog open when the reviewed shard becomes stale", async () => {
    const item = {
      guid: "one",
      title: "Original",
      link: "https://example.com/one",
      description: "",
      pubDate: "",
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
    const ancestor: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: "https://example.com/feed",
      updatedAt: 1,
      items: [item],
    };
    const context = {
      feedId: "feed",
      ancestor,
      local: { ...ancestor, items: [{ ...item, title: "Local" }] },
      incoming: { ...ancestor, items: [] },
    };
    const resolve = vi.fn(async () => false);
    const modal = new FeedConflictRecoveryModal(new App(), {
      list: async () => ["1-0.json"],
      read: async () => context,
      resolve,
    });
    modal.open();
    await vi.waitFor(() =>
      expect(modal.contentEl.textContent).toContain("Local"),
    );
    expect(modal.contentEl.textContent).toContain("Deleted on synced device");
    const save = [...modal.contentEl.querySelectorAll("button")].find(
      (button) => button.textContent === "Save choices",
    )!;
    expect(save.disabled).toBe(true);
    const select = modal.contentEl.querySelector("select")!;
    select.value = "local";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(save.disabled).toBe(false);
    save.click();
    await vi.waitFor(() =>
      expect(resolve).toHaveBeenCalledWith(
        "1-0.json",
        { one: "local" },
        context,
      ),
    );
    expect(modal.contentEl.textContent).toContain(
      "changed while you reviewed it",
    );
    modal.close();
  });
});
