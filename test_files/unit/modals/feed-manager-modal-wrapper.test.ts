import { describe, expect, it, vi } from "vitest";

vi.unmock("../../../src/modals/feed-manager-modal");

describe("src/modals/feed-manager-modal (re-exports)", () => {
  it("re-exports feed manager modals from the feed-manager folder", async () => {
    vi.resetModules();

    const wrapper = await import("../../../src/modals/feed-manager-modal");
    const add = await import("../../../src/modals/feed-manager/add-feed-modal");
    const edit = await import("../../../src/modals/feed-manager/edit-feed-modal");
    const manager = await import("../../../src/modals/feed-manager/feed-manager-modal");

    expect(wrapper.AddFeedModal).toBe(add.AddFeedModal);
    expect(wrapper.EditFeedModal).toBe(edit.EditFeedModal);
    expect(wrapper.FeedManagerModal).toBe(manager.FeedManagerModal);
  });
});
