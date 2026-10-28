import { describe, expect, it } from "vitest";
import {
  OwnWriteRecord,
  comparableFromText,
} from "../../../src/services/own-write-record";
import { comparableSnapshotJson } from "../../../src/services/storage-json";
import { ShardBaselines } from "../../../src/services/shard-baselines";

function reorderKeys(value: unknown, seed: number): unknown {
  if (Array.isArray(value)) return value.map((v) => reorderKeys(v, seed));
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) =>
    seed % 2 === 0 ? (a < b ? 1 : -1) : a < b ? -1 : 1,
  );
  if (seed % 3 === 0) keys.reverse();
  return Object.fromEntries(keys.map((k) => [k, reorderKeys(record[k], seed)]));
}

function shard(extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    feedId: "f1",
    feedUrl: "https://example.com/feed.xml",
    updatedAt: 5,
    items: [
      { guid: "a", title: "A", tags: ["x"], nested: { b: 1, a: 2 } },
      { guid: "b", title: "B", tags: [], nested: { z: 1, y: 2 } },
    ],
    ...extra,
  };
}

describe("OwnWriteRecord lazy read record (AC-011)", () => {
  it("recognizes reordered keys, nonce and padding as the same content", async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const record = new OwnWriteRecord();
      record.recordRead("s/f1.json", JSON.stringify(shard()));
      const reordered = reorderKeys(
        { ...shard(), _syncNonce: `n${seed}`, _syncPad: "p".repeat(seed) },
        seed,
      );
      expect(
        await record.matchesDisk("s/f1.json", () =>
          Promise.resolve(JSON.stringify(reordered)),
        ),
      ).toBe(true);
      expect(record.comparableOf("s/f1.json")).toBe(
        comparableSnapshotJson(shard()),
      );
    }
  });

  it("detects every other difference", async () => {
    const mutations: Array<Record<string, unknown>> = [
      { feedUrl: "https://example.com/other.xml" },
      { updatedAt: 6 },
      { items: [] },
      { extra: true },
    ];
    for (const mutation of mutations) {
      const record = new OwnWriteRecord();
      record.recordRead("s/f1.json", JSON.stringify(shard()));
      expect(
        await record.hasUnseenChange("s/f1.json", () =>
          Promise.resolve(JSON.stringify(shard(mutation))),
        ),
      ).toBe(true);
    }
  });

  it("drops an unparseable read on first use, as the eager record did", () => {
    const record = new OwnWriteRecord();
    record.recordRead("s/f1.json", "{not json");
    expect(record.comparableOf("s/f1.json")).toBeUndefined();
  });

  it("restores a lazily recorded read when a failed write rolls back", () => {
    const record = new OwnWriteRecord();
    record.recordRead("s/f1.json", JSON.stringify(shard()));
    const rollback = record.recordPendingWrite(
      "s/f1.json",
      JSON.stringify(shard({ updatedAt: 9, items: [] })),
    );
    rollback();
    expect(record.comparableOf("s/f1.json")).toBe(
      comparableFromText(JSON.stringify(shard())),
    );
  });
});

describe("ShardBaselines", () => {
  it("builds a deferred baseline once, on first read", () => {
    const baselines = new ShardBaselines();
    let calls = 0;
    baselines.setDeferred("f1", () => `built-${++calls}`);
    expect(baselines.keys()).toEqual(["f1"]);
    expect(calls).toBe(0);
    expect(baselines.get("f1")).toBe("built-1");
    expect(baselines.get("f1")).toBe("built-1");
    expect(calls).toBe(1);
  });

  it("lets set and delete replace or drop a deferred baseline unbuilt", () => {
    const baselines = new ShardBaselines();
    let calls = 0;
    baselines.setDeferred("f1", () => `built-${++calls}`);
    baselines.set("f1", "written");
    expect(baselines.get("f1")).toBe("written");
    baselines.setDeferred("f2", () => `built-${++calls}`);
    baselines.delete("f2");
    expect(baselines.get("f2")).toBeUndefined();
    expect(calls).toBe(0);
  });
});
