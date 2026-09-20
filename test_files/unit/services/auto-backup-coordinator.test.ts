import { describe, expect, it, vi } from "vitest";
import { AutoBackupCoordinator } from "../../../src/services/auto-backup-coordinator";

function createDeferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  const rejectingPromise = new Promise<void>((_resolvePromise, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, rejectingPromise, resolve, reject };
}

describe("AutoBackupCoordinator", () => {
  it("writes once after the first persisted change and once more when unload finds later changes", async () => {
    const writeSnapshot = vi.fn().mockResolvedValue(undefined);
    const coordinator = new AutoBackupCoordinator({ writeSnapshot });

    await coordinator.recordPersistedChange();
    await coordinator.recordPersistedChange();
    await coordinator.flushOnUnload();

    expect(writeSnapshot).toHaveBeenCalledTimes(2);
  });

  it("retries a failed initial snapshot after the next persisted change", async () => {
    const writeSnapshot = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const coordinator = new AutoBackupCoordinator({ writeSnapshot });

    await expect(coordinator.recordPersistedChange()).rejects.toThrow(
      "disk full",
    );
    await coordinator.recordPersistedChange();

    expect(writeSnapshot).toHaveBeenCalledTimes(2);
  });

  it("creates a first snapshot when automatic backups become enabled during a session", async () => {
    let backupsEnabled = false;
    const writeSnapshot = vi.fn().mockResolvedValue(undefined);
    const coordinator = new AutoBackupCoordinator({
      writeSnapshot,
      shouldWriteSnapshot: () => backupsEnabled,
    });

    await coordinator.recordPersistedChange();
    backupsEnabled = true;
    await coordinator.recordPersistedChange();

    expect(writeSnapshot).toHaveBeenCalledTimes(1);
  });

  it("waits for an in-flight snapshot before writing the stale unload snapshot", async () => {
    const firstSnapshot = createDeferred();
    const writeSnapshot = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstSnapshot.promise)
      .mockResolvedValueOnce(undefined);
    const coordinator = new AutoBackupCoordinator({ writeSnapshot });

    const firstChange = coordinator.recordPersistedChange();
    await vi.waitFor(() => expect(writeSnapshot).toHaveBeenCalledTimes(1));

    const laterChange = coordinator.recordPersistedChange();
    const unload = coordinator.flushOnUnload();
    expect(writeSnapshot).toHaveBeenCalledTimes(1);

    firstSnapshot.resolve();
    await Promise.all([firstChange, laterChange, unload]);

    expect(writeSnapshot).toHaveBeenCalledTimes(2);
  });

  it("uses a forced migration snapshot as the current session snapshot", async () => {
    const writeSnapshot = vi.fn().mockResolvedValue(undefined);
    const coordinator = new AutoBackupCoordinator({ writeSnapshot });

    await coordinator.recordPersistedChange();
    await coordinator.backupBeforeMigration();
    await coordinator.flushOnUnload();

    expect(writeSnapshot).toHaveBeenCalledTimes(2);
  });

  it("retries a failed forced migration snapshot during unload", async () => {
    const writeSnapshot = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const coordinator = new AutoBackupCoordinator({ writeSnapshot });

    await expect(coordinator.backupBeforeMigration()).rejects.toThrow(
      "disk full",
    );
    await coordinator.flushOnUnload();

    expect(writeSnapshot).toHaveBeenCalledTimes(2);
  });

  it("retries a failed in-flight snapshot when unload is already waiting", async () => {
    const firstSnapshot = createDeferred();
    const writeSnapshot = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstSnapshot.rejectingPromise)
      .mockResolvedValueOnce(undefined);
    const coordinator = new AutoBackupCoordinator({ writeSnapshot });

    const firstChange = coordinator.recordPersistedChange();
    const unload = coordinator.flushOnUnload();
    firstSnapshot.reject(new Error("disk full"));

    await expect(firstChange).rejects.toThrow("disk full");
    await expect(unload).resolves.toBeUndefined();

    expect(writeSnapshot).toHaveBeenCalledTimes(2);
  });
});
