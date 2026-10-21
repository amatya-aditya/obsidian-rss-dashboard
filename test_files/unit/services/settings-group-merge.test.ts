import { describe, expect, it } from "vitest";
import { mergeSettingsGroups } from "../../../src/services/settings-group-merge";

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
