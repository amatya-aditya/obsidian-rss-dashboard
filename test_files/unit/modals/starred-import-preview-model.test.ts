import { describe, it, expect } from "vitest";
import type { StarredImportCandidate } from "../../../src/services/starred-import-mapper";
import { StarredImportPreviewModel } from "../../../src/services/starred-import-preview-model";
import type { FeedItem } from "../../../src/types/types";

function makeCandidate(args: {
  guid: string;
  feedUrl: string;
  feedTitle: string;
  title?: string;
  read?: boolean;
  isNewFeed?: boolean;
  feedSiteUrl?: string;
}): StarredImportCandidate {
  const item: FeedItem = {
    title: args.title ?? args.guid,
    link: `https://example.test/${args.guid}`,
    description: "",
    pubDate: "2026-01-01T00:00:00.000Z",
    guid: args.guid,
    feedTitle: args.feedTitle,
    feedUrl: args.feedUrl,
    coverImage: "",
    starred: true,
    read: args.read ?? false,
  };
  return {
    feedUrl: args.feedUrl,
    feedTitle: args.feedTitle,
    item,
    isNewFeed: args.isNewFeed,
    feedSiteUrl: args.feedSiteUrl,
  };
}

describe("StarredImportPreviewModel", () => {
  it("groups candidates by source feed and defaults every item to selected", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({ guid: "g1", feedUrl: "u1", feedTitle: "Feed One" }),
        makeCandidate({ guid: "g2", feedUrl: "u1", feedTitle: "Feed One" }),
        makeCandidate({ guid: "g3", feedUrl: "u2", feedTitle: "Feed Two" }),
      ],
    });

    const groups = model.getGroups();
    expect(groups).toHaveLength(2);
    expect(groups[0].feedUrl).toBe("u1");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].items.every((i) => i.selected)).toBe(true);
    expect(groups[1].feedUrl).toBe("u2");
    expect(groups[1].items).toHaveLength(1);

    const stats = model.getStats();
    expect(stats.totalGroups).toBe(2);
    expect(stats.totalItems).toBe(3);
    expect(stats.selectedItems).toBe(3);
  });

  it("toggles a single item's selection without affecting siblings", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({ guid: "g1", feedUrl: "u1", feedTitle: "Feed One" }),
        makeCandidate({ guid: "g2", feedUrl: "u1", feedTitle: "Feed One" }),
      ],
    });

    model.toggleItem("g1", false);

    expect(model.getStats().selectedItems).toBe(1);
    const groupState = model.getGroupSelectionState("u1");
    expect(groupState.checked).toBe(false);
    expect(groupState.indeterminate).toBe(true);

    model.toggleItem("g1", true);
    expect(model.getGroupSelectionState("u1").checked).toBe(true);
  });

  it("toggles an entire group (per-feed select all/none)", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({ guid: "g1", feedUrl: "u1", feedTitle: "Feed One" }),
        makeCandidate({ guid: "g2", feedUrl: "u1", feedTitle: "Feed One" }),
        makeCandidate({ guid: "g3", feedUrl: "u2", feedTitle: "Feed Two" }),
      ],
    });

    model.toggleGroup("u1", false);

    expect(model.getStats().selectedItems).toBe(1);
    expect(model.getGroupSelectionState("u1").checked).toBe(false);
    expect(model.getGroupSelectionState("u1").indeterminate).toBe(false);
    expect(model.getGroupSelectionState("u2").checked).toBe(true);
  });

  it("supports global select all and select none", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({ guid: "g1", feedUrl: "u1", feedTitle: "Feed One" }),
        makeCandidate({ guid: "g2", feedUrl: "u2", feedTitle: "Feed Two" }),
      ],
    });

    model.selectNone();
    expect(model.getStats().selectedItems).toBe(0);

    model.selectAll();
    expect(model.getStats().selectedItems).toBe(2);
  });

  it("returns only the selected candidates from getSelectedCandidates()", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({ guid: "g1", feedUrl: "u1", feedTitle: "Feed One" }),
        makeCandidate({ guid: "g2", feedUrl: "u1", feedTitle: "Feed One" }),
      ],
    });

    model.toggleItem("g2", false);

    const selected = model.getSelectedCandidates();
    expect(selected).toHaveLength(1);
    expect(selected[0].item.guid).toBe("g1");
  });

  it("preserves each item's read state in the group snapshot", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({ guid: "g1", feedUrl: "u1", feedTitle: "Feed One", read: true }),
        makeCandidate({ guid: "g2", feedUrl: "u1", feedTitle: "Feed One", read: false }),
      ],
    });

    const [group] = model.getGroups();
    expect(group.items.find((i) => i.guid === "g1")?.read).toBe(true);
    expect(group.items.find((i) => i.guid === "g2")?.read).toBe(false);
  });

  it("marks a group built from isNewFeed candidates as a new feed", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({
          guid: "g1",
          feedUrl: "new-url",
          feedTitle: "New Feed",
          isNewFeed: true,
          feedSiteUrl: "https://new-feed.test/",
        }),
      ],
    });

    const [group] = model.getGroups();
    expect(group.isNewFeed).toBe(true);
    expect(model.isNewFeedGroup("new-url")).toBe(true);
  });

  it("does not mark an existing-feed group (isNewFeed false/undefined) as new", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({ guid: "g1", feedUrl: "u1", feedTitle: "Feed One" }),
      ],
    });

    const [group] = model.getGroups();
    expect(group.isNewFeed).toBe(false);
    expect(model.isNewFeedGroup("u1")).toBe(false);
  });

  it("only returns new-feed groups with at least one selected item from getSelectedNewFeedGroups()", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({
          guid: "g1",
          feedUrl: "new-url-1",
          feedTitle: "New Feed One",
          isNewFeed: true,
          feedSiteUrl: "https://new-feed-one.test/",
        }),
        makeCandidate({
          guid: "g2",
          feedUrl: "new-url-2",
          feedTitle: "New Feed Two",
          isNewFeed: true,
        }),
        makeCandidate({ guid: "g3", feedUrl: "u1", feedTitle: "Feed One" }),
      ],
    });

    model.toggleGroup("new-url-2", false);

    const selectedNewFeeds = model.getSelectedNewFeedGroups();
    expect(selectedNewFeeds).toHaveLength(1);
    expect(selectedNewFeeds[0]).toMatchObject({
      feedUrl: "new-url-1",
      feedTitle: "New Feed One",
      siteUrl: "https://new-feed-one.test/",
    });
  });

  it("reports newFeedGroups in getStats()", () => {
    const model = new StarredImportPreviewModel({
      candidates: [
        makeCandidate({
          guid: "g1",
          feedUrl: "new-url",
          feedTitle: "New Feed",
          isNewFeed: true,
        }),
        makeCandidate({ guid: "g2", feedUrl: "u1", feedTitle: "Feed One" }),
      ],
    });

    expect(model.getStats().newFeedGroups).toBe(1);
  });
});
