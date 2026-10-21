import { describe, expect, it } from "vitest";
import {
  OwnWriteRecord,
  comparableFromText,
  ownWriteKey,
} from "../../../src/services/own-write-record";

const read = (text: string) => async () => text;

describe("comparableFromText", () => {
  it("ignores key order, _syncNonce and _syncPad", () => {
    const a = JSON.stringify({ a: 1, b: { x: 1, y: 2 } });
    const b = JSON.stringify({
      _syncPad: "pad",
      b: { y: 2, x: 1 },
      _syncNonce: "n",
      a: 1,
    });
    expect(comparableFromText(a)).toBe(comparableFromText(b));
  });

  it("returns null for text that is not JSON or not an object", () => {
    expect(comparableFromText("{not json")).toBeNull();
    expect(comparableFromText("42")).toBeNull();
    expect(comparableFromText("null")).toBeNull();
  });
});

describe("ownWriteKey", () => {
  it("normalizes slashes and backslashes", () => {
    expect(ownWriteKey("/a\\b/c.json/")).toBe("a/b/c.json");
  });
});

describe("OwnWriteRecord", () => {
  it("matches a file that still holds the recorded read", async () => {
    const record = new OwnWriteRecord();
    record.recordRead("a/f.json", '{"a":1,"b":2}');
    expect(await record.matchesDisk("/a/f.json", read('{"b":2,"a":1}'))).toBe(
      true,
    );
    expect(await record.matchesDisk("a/f.json", read('{"a":2}'))).toBe(false);
  });

  it("does not match without a record, on a read error, or on bad text", async () => {
    const record = new OwnWriteRecord();
    expect(await record.matchesDisk("a/f.json", read("{}"))).toBe(false);
    record.recordRead("a/f.json", "{}");
    expect(
      await record.matchesDisk("a/f.json", async () => {
        throw new Error("gone");
      }),
    ).toBe(false);
    expect(await record.matchesDisk("a/f.json", read("{bad"))).toBe(false);
  });

  it("drops the record when a read is unparseable", async () => {
    const record = new OwnWriteRecord();
    record.recordRead("a/f.json", "{}");
    record.recordRead("a/f.json", "{bad");
    expect(record.comparableOf("a/f.json")).toBeUndefined();
  });

  it("records a write before it lands and restores the record when it fails", async () => {
    const record = new OwnWriteRecord();
    record.recordRead("a/f.json", '{"v":1}');
    let seenDuringWrite: string | undefined;
    await record.write("a/f.json", '{"v":2}', async () => {
      seenDuringWrite = record.comparableOf("a/f.json");
    });
    expect(seenDuringWrite).toBe('{"v":2}');

    await expect(
      record.write("a/f.json", '{"v":3}', async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(record.comparableOf("a/f.json")).toBe('{"v":2}');
  });

  it("keeps a later write's record when an earlier write fails", async () => {
    const record = new OwnWriteRecord();
    await expect(
      record.write("a/f.json", '{"v":1}', async () => {
        await record.write("a/f.json", '{"v":2}', async () => undefined);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(record.comparableOf("a/f.json")).toBe('{"v":2}');
  });

  it("reports an unseen change only for a parseable, different file", async () => {
    const record = new OwnWriteRecord();
    expect(await record.hasUnseenChange("a/f.json", read("{}"))).toBe(false);
    record.recordRead("a/f.json", '{"v":1}');
    expect(await record.hasUnseenChange("a/f.json", read('{"v":1}'))).toBe(
      false,
    );
    expect(await record.hasUnseenChange("a/f.json", read('{"v":2}'))).toBe(
      true,
    );
    expect(await record.hasUnseenChange("a/f.json", read("{bad"))).toBe(false);
  });

  it("forgets one path, and every path under a folder", () => {
    const record = new OwnWriteRecord();
    record.recordSnapshot("a.json", { v: 1 });
    record.recordSnapshot("b.json", { v: 1 });
    record.recordSnapshot("feeds/x.json", { v: 1 });
    record.recordSnapshot("feeds-other/y.json", { v: 1 });
    record.forget("a.json");
    expect(record.comparableOf("a.json")).toBeUndefined();
    expect(record.comparableOf("b.json")).toBe('{"v":1}');
    record.recordSnapshot("feeds/user-state.json", { v: 1 });
    record.recordSnapshot("feeds/sub/z.json", { v: 1 });
    record.forgetShardsIn("/feeds/");
    expect(record.comparableOf("feeds/x.json")).toBeUndefined();
    expect(record.comparableOf("feeds/user-state.json")).toBe('{"v":1}');
    expect(record.comparableOf("feeds/sub/z.json")).toBe('{"v":1}');
    expect(record.comparableOf("feeds-other/y.json")).toBe('{"v":1}');
    expect(record.comparableOf("b.json")).toBe('{"v":1}');
  });
});
