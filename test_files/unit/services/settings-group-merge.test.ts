import { describe, expect, it } from "vitest";
import {
  digestSettings,
  groupsKeptFromMemory,
  mergeSettingsAgainstAncestor,
  mergeSettingsGroups,
} from "../../../src/services/settings-group-merge";

describe("mergeSettingsGroups", () => {
  const baseline = { a: 1, b: { x: 1, y: 2 }, feeds: [{ url: "u" }] };

  it("takes the disk value of a group this device left unchanged", () => {
    const result = mergeSettingsGroups(
      baseline,
      { ...baseline, a: 5 },
      { ...baseline, b: { x: 9, y: 2 } },
    );
    expect(result.merged).toEqual({
      a: 5,
      b: { x: 9, y: 2 },
      feeds: [{ url: "u" }],
    });
    expect(result.adopted).toEqual(["a"]);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps memory and names the group when both sides changed it", () => {
    const result = mergeSettingsGroups(
      baseline,
      { ...baseline, a: 5 },
      { ...baseline, a: 7 },
    );
    expect(result.merged.a).toBe(7);
    expect(result.adopted).toEqual([]);
    expect(result.conflicts).toEqual(["a"]);
  });

  it("is not a conflict when both sides made the same change", () => {
    const result = mergeSettingsGroups(
      baseline,
      { ...baseline, a: 5 },
      { ...baseline, a: 5 },
    );
    expect(result.adopted).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("ignores key order inside a group and the sync bookkeeping keys", () => {
    const result = mergeSettingsGroups(
      baseline,
      { ...baseline, b: { y: 2, x: 1 }, _syncNonce: "n", _syncPad: "p" },
      { ...baseline, _syncNonce: "m", _syncPad: "q" },
    );
    expect(result.adopted).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("removes a group the disk dropped when this device left it alone", () => {
    const { b: _dropped, ...withoutB } = baseline;
    void _dropped;
    const result = mergeSettingsGroups(baseline, withoutB, baseline);
    expect(result.merged).not.toHaveProperty("b");
    expect(result.adopted).toEqual(["b"]);
  });
});

/**
 * `feeds` and `folders` merge per entry, not as one group (#1439). Two devices
 * that each change a different entry have both changes kept.
 */
describe("mergeSettingsGroups per-entry feeds (#1439)", () => {
  const feed = (feedId: string, overrides: Record<string, unknown> = {}) => ({
    feedId,
    title: `Feed ${feedId}`,
    url: `https://${feedId}.test/feed.xml`,
    folder: "",
    lastUpdated: 1,
    ...overrides,
  });

  it("keeps a feed added on disk and a rename made in memory", () => {
    const result = mergeSettingsGroups(
      { feeds: [feed("f1")] },
      { feeds: [feed("f1"), feed("f2")] },
      { feeds: [feed("f1", { title: "Renamed" })] },
    );

    expect(
      (result.merged.feeds as { feedId: string; title: string }[]).map(
        (entry) => entry.feedId,
      ),
    ).toEqual(["f1", "f2"]);
    expect(
      (result.merged.feeds as { feedId: string; title: string }[])[0].title,
    ).toBe("Renamed");
    expect(result.conflicts).toEqual([]);
    expect(result.adoptedEntries).toEqual([{ group: "feeds", key: "f2" }]);
  });

  it("keeps memory's entry when both sides edited the same feed", () => {
    const result = mergeSettingsGroups(
      { feeds: [feed("f1")] },
      { feeds: [feed("f1", { folder: "Remote" })] },
      { feeds: [feed("f1", { title: "Local" })] },
    );

    const [merged] = result.merged.feeds as { title: string; folder: string }[];
    expect(merged.title).toBe("Local");
    expect(merged.folder).toBe("");
    expect(result.conflictEntries).toEqual([{ group: "feeds", key: "f1" }]);
  });

  it("does not count a refresh-only difference as an edit", () => {
    const result = mergeSettingsGroups(
      {
        feeds: [
          feed("f1"),
          feed("f2", { lastUpdated: 10, lastFetchError: "old" }),
        ],
      },
      {
        feeds: [
          feed("f1", { folder: "From disk" }),
          feed("f2", { lastUpdated: 20, lastFetchError: undefined }),
        ],
      },
      {
        feeds: [
          feed("f1"),
          feed("f2", { lastUpdated: 30, lastFetchError: "local" }),
        ],
      },
    );

    const merged = result.merged.feeds as {
      feedId: string;
      folder: string;
      lastUpdated: number;
      lastFetchError?: string;
    }[];
    // Disk's real edit to f1 is adopted; f2 only differs in bookkeeping.
    expect(merged[0].folder).toBe("From disk");
    expect(merged[1].lastUpdated).toBe(30);
    expect(merged[1].lastFetchError).toBe("local");
    expect(result.conflictEntries).toEqual([]);
  });

  it("keeps a feed edited on disk when this device removed it", () => {
    const result = mergeSettingsGroups(
      { feeds: [feed("f1"), feed("f2")] },
      { feeds: [feed("f1"), feed("f2", { title: "Edited remotely" })] },
      { feeds: [feed("f1")] },
    );

    expect(
      (result.merged.feeds as { feedId: string }[]).map(
        (entry) => entry.feedId,
      ),
    ).toEqual(["f1", "f2"]);
    expect(result.conflictEntries).toEqual([{ group: "feeds", key: "f2" }]);
  });

  it("inserts a feed added on disk at its disk position", () => {
    const result = mergeSettingsGroups(
      { feeds: [feed("f1"), feed("f3")] },
      { feeds: [feed("f1"), feed("f2"), feed("f3")] },
      { feeds: [feed("f1"), feed("f3", { title: "Renamed" })] },
    );

    expect(
      (result.merged.feeds as { feedId: string }[]).map(
        (entry) => entry.feedId,
      ),
    ).toEqual(["f1", "f2", "f3"]);
  });

  it("matches a disk entry without an id by its url and keeps the id", () => {
    const withoutId = {
      title: "Old",
      url: "https://f1.test/feed.xml",
      folder: "",
      lastUpdated: 1,
    };
    const result = mergeSettingsGroups(
      {
        feeds: [
          {
            feedId: "f1",
            title: "New",
            url: "https://f1.test/feed.xml",
            folder: "",
            lastUpdated: 1,
          },
        ],
      },
      { feeds: [withoutId] },
      {
        feeds: [
          {
            feedId: "f1",
            title: "New",
            url: "https://f1.test/feed.xml",
            folder: "",
            lastUpdated: 1,
          },
        ],
      },
    );

    const merged = result.merged.feeds as { feedId?: string }[];
    expect(merged).toHaveLength(1);
    expect(merged[0].feedId).toBe("f1");
    expect(result.conflictEntries).toEqual([]);
    expect(result.adoptedEntries).toEqual([]);
  });

  it("reports a key that appears twice on one side and keeps the first", () => {
    const result = mergeSettingsGroups(
      { feeds: [feed("f1")] },
      {
        feeds: [
          feed("f1", { title: "First" }),
          feed("f1", { title: "Second" }),
        ],
      },
      { feeds: [feed("f1", { title: "Local" })] },
    );

    expect(result.duplicateEntries).toEqual([{ group: "feeds", key: "f1" }]);
    expect((result.merged.feeds as { title: string }[])[0].title).toBe("Local");
  });

  it("does not compare article items carried in memory", () => {
    const result = mergeSettingsGroups(
      { feeds: [feed("f1")] },
      { feeds: [feed("f1")] },
      { feeds: [{ ...feed("f1"), items: [{ guid: "g1" }] }] },
    );

    expect(result.conflicts).not.toContain("feeds");
    expect(result.adoptedEntries).toEqual([]);
  });

  it("takes a feed both sides removed as removed, without a conflict", () => {
    const result = mergeSettingsGroups(
      { feeds: [feed("f1")] },
      { feeds: [] },
      { feeds: [] },
    );

    expect(result.merged.feeds).toEqual([]);
    expect(result.conflictEntries).toEqual([]);
  });
});

describe("mergeSettingsGroups per-entry folders (#1439)", () => {
  const folder = (name: string, overrides: Record<string, unknown> = {}) => ({
    name,
    subfolders: [],
    ...overrides,
  });
  const names = (result: { merged: Record<string, unknown> }) =>
    (result.merged.folders as { name: string }[]).map((entry) => entry.name);

  it("keeps a folder added on disk and a rename made in memory", () => {
    const result = mergeSettingsGroups(
      { folders: [folder("A")] },
      { folders: [folder("A"), folder("B")] },
      { folders: [folder("A2")] },
    );

    expect(names(result)).toEqual(["A2", "B"]);
    expect(result.conflictEntries).toEqual([]);
    expect(result.adoptedEntries).toEqual([{ group: "folders", key: "B" }]);
  });

  it("lets a rename win over an edit to the old name", () => {
    const result = mergeSettingsGroups(
      { folders: [folder("A", { pinned: false })] },
      { folders: [folder("A", { pinned: true })] },
      { folders: [folder("A2")] },
    );

    expect(names(result)).toEqual(["A2"]);
    expect(result.conflictEntries).toEqual([{ group: "folders", key: "A" }]);
  });

  it("merges a nested folder by its path", () => {
    const result = mergeSettingsGroups(
      { folders: [folder("A", { subfolders: [folder("B")] })] },
      {
        folders: [
          folder("A", {
            subfolders: [folder("B"), folder("C"), folder("D")],
          }),
        ],
      },
      {
        folders: [
          folder("A2", { subfolders: [folder("B", { pinned: true })] }),
        ],
      },
    );

    const [root] = result.merged.folders as {
      name: string;
      subfolders: { name: string; pinned?: boolean }[];
    }[];
    expect(root.name).toBe("A2");
    expect(root.subfolders.map((entry) => entry.name)).toEqual(["B"]);
    expect(root.subfolders[0].pinned).toBe(true);
    expect(result.adoptedEntries).toEqual([]);
    expect(result.droppedEntries).toEqual([
      { group: "folders", key: "A/C" },
      { group: "folders", key: "A/D" },
    ]);
  });

  it("drops a synced folder whose parent this device renamed away", () => {
    const result = mergeSettingsGroups(
      { folders: [folder("A", { subfolders: [] })] },
      {
        folders: [folder("A", { subfolders: [folder("B")] }), folder("Other")],
      },
      { folders: [folder("A2")] },
    );

    expect(names(result)).toEqual(["A2", "Other"]);
    expect(result.droppedEntries).toEqual([{ group: "folders", key: "A/B" }]);
  });

  it("keeps an adopted feed's folder path when the folder is gone", () => {
    const result = mergeSettingsGroups(
      {
        folders: [folder("A")],
        feeds: [],
      },
      {
        folders: [folder("A")],
        feeds: [
          {
            feedId: "f1",
            title: "F",
            url: "https://f1.test/feed.xml",
            folder: "A",
            lastUpdated: 1,
          },
        ],
      },
      { folders: [folder("A2")], feeds: [] },
    );

    expect((result.merged.feeds as { folder: string }[])[0].folder).toBe("A");
    expect(result.danglingEntries).toEqual([{ group: "feeds", key: "f1" }]);
  });
});

describe("merging a delivered file against an ancestor (ADR 0036)", () => {
  const feed = (id: string, title: string) => ({
    feedId: id,
    title,
    url: `https://${id}.test/feed.xml`,
  });
  const file = (feeds: unknown[], extra: Record<string, unknown> = {}) => ({
    refreshInterval: 30,
    feeds,
    folders: [{ name: "News", subfolders: [] }],
    ...extra,
  });
  const base = file([feed("a", "Alpha"), feed("b", "Beta")]);
  const ancestor = digestSettings(base);

  it("holds hashes only, never a feed title, url or folder name", () => {
    const stored = JSON.stringify(ancestor);
    expect(stored).not.toContain("Alpha");
    expect(stored).not.toContain("feed.xml");
    expect(stored).not.toContain("News");
  });

  it("ignores key order and the sync bookkeeping keys", () => {
    const reordered = { ...base, _syncNonce: "n", _syncPad: "p" };
    expect(digestSettings(reordered)).toEqual(ancestor);
  });

  it("keeps an entry changed here and takes one changed in the delivery", () => {
    const delivered = file([feed("a", "Alpha"), feed("b", "Beta on B")]);
    const memory = file([feed("a", "Alpha on A"), feed("b", "Beta")]);

    const result = mergeSettingsAgainstAncestor(ancestor, delivered, memory, {
      diskWinsConflicts: true,
    });

    expect(result.merged.feeds).toEqual([
      feed("a", "Alpha on A"),
      feed("b", "Beta on B"),
    ]);
    expect(result.conflictEntries).toEqual([]);
  });

  it("takes the delivered value of an entry both sides changed and reports it", () => {
    const delivered = file([feed("a", "Alpha on B"), feed("b", "Beta")]);
    const memory = file([feed("a", "Alpha on A"), feed("b", "Beta")]);

    const result = mergeSettingsAgainstAncestor(ancestor, delivered, memory, {
      diskWinsConflicts: true,
    });

    expect(result.merged.feeds).toEqual(delivered.feeds);
    expect(result.conflictEntries).toEqual([{ group: "feeds", key: "a" }]);
  });

  it("takes the delivered value of a group both sides changed and reports it", () => {
    const result = mergeSettingsAgainstAncestor(
      ancestor,
      { ...base, refreshInterval: 60 },
      { ...base, refreshInterval: 90 },
      { diskWinsConflicts: true },
    );

    expect(result.merged.refreshInterval).toBe(60);
    expect(result.conflicts).toEqual(["refreshInterval"]);
  });

  it("keeps memory's value of a conflict when the delivery does not win", () => {
    const result = mergeSettingsAgainstAncestor(
      ancestor,
      { ...base, refreshInterval: 60 },
      { ...base, refreshInterval: 90 },
    );

    expect(result.merged.refreshInterval).toBe(90);
  });

  it("is no conflict when both sides made the same change", () => {
    const same = file([feed("a", "Alpha both"), feed("b", "Beta")]);

    const result = mergeSettingsAgainstAncestor(ancestor, same, same, {
      diskWinsConflicts: true,
    });

    expect(result.conflictEntries).toEqual([]);
    expect(result.merged.feeds).toEqual(same.feeds);
  });

  it("keeps a feed edited here when the delivery deleted it", () => {
    const delivered = file([feed("b", "Beta")]);
    const memory = file([feed("a", "Alpha on A"), feed("b", "Beta")]);

    const result = mergeSettingsAgainstAncestor(ancestor, delivered, memory, {
      diskWinsConflicts: true,
    });

    // The edited feed returns beside the neighbour it had here.
    expect(result.merged.feeds).toEqual([
      feed("a", "Alpha on A"),
      feed("b", "Beta"),
    ]);
  });

  it("applies a delivered deletion of a feed not edited here", () => {
    const delivered = file([feed("b", "Beta")]);

    const result = mergeSettingsAgainstAncestor(ancestor, delivered, base, {
      diskWinsConflicts: true,
    });

    expect(result.merged.feeds).toEqual([feed("b", "Beta")]);
  });

  it("names the groups that hold an edit the delivery lacks", () => {
    const delivered = file([feed("a", "Alpha"), feed("b", "Beta on B")]);
    const memory = file([feed("a", "Alpha on A"), feed("b", "Beta")], {
      refreshInterval: 45,
    });
    const { merged } = mergeSettingsAgainstAncestor(
      ancestor,
      delivered,
      memory,
      { diskWinsConflicts: true },
    );

    expect(groupsKeptFromMemory(ancestor, delivered, merged).sort()).toEqual([
      "feeds",
      "refreshInterval",
    ]);
  });

  it("names nothing when the delivery already holds every edit", () => {
    const delivered = file([feed("a", "Alpha"), feed("b", "Beta on B")]);
    const { merged } = mergeSettingsAgainstAncestor(ancestor, delivered, base, {
      diskWinsConflicts: true,
    });

    expect(groupsKeptFromMemory(ancestor, delivered, merged)).toEqual([]);
  });

  it("ignores a key only memory holds, which is not part of the file", () => {
    const { merged } = mergeSettingsAgainstAncestor(
      ancestor,
      base,
      { ...base, memoryOnly: 1 },
      { diskWinsConflicts: true },
    );

    expect(groupsKeptFromMemory(ancestor, base, merged)).toEqual([]);
  });
});
