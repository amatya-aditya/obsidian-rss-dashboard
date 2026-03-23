import { describe, it, expect } from "vitest";

describe("feed-manager-modal barrel exports", () => {
  it("exports AddFeedModal, EditFeedModal, and FeedManagerModal", async () => {
    const mod = await import("../../src/modals/feed-manager-modal");

    expect(mod.AddFeedModal).toBeDefined();
    expect(mod.EditFeedModal).toBeDefined();
    expect(mod.FeedManagerModal).toBeDefined();
  });
});

