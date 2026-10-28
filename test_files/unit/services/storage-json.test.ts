import { describe, expect, it } from "vitest";
import {
  comparableSnapshotJson,
  withSyncNonce,
} from "../../../src/services/storage-json";

describe("comparableSnapshotJson (#1411)", () => {
  it("treats two stamps of the same content as equal", () => {
    const content = { version: 5, states: { a: { read: true } } };

    expect(comparableSnapshotJson(withSyncNonce(content))).toBe(
      comparableSnapshotJson(withSyncNonce(content)),
    );
  });

  it("ignores key order at every depth", () => {
    const first = { version: 5, states: { a: { read: true, starred: false } } };
    const second = {
      states: { a: { starred: false, read: true } },
      version: 5,
    };

    expect(comparableSnapshotJson(first)).toBe(comparableSnapshotJson(second));
  });

  it("tells apart content that differs, including inside arrays", () => {
    const first = { states: { a: { tags: [{ name: "x" }] } } };
    const second = { states: { a: { tags: [{ name: "y" }] } } };

    expect(comparableSnapshotJson(first)).not.toBe(
      comparableSnapshotJson(second),
    );
  });

  it("keeps array order significant", () => {
    expect(comparableSnapshotJson({ list: [1, 2] })).not.toBe(
      comparableSnapshotJson({ list: [2, 1] }),
    );
  });
});
