/**
 * Coordinates low-write automatic backup snapshots for one plugin session.
 *
 * The recovery baseline is taken once the session's settings have loaded, and
 * holds the state as loaded. Persisted changes after it only mark that
 * baseline stale until unload asks for one final best-effort snapshot.
 */
export class AutoBackupCoordinator {
  private persistedGeneration = 0;
  private hasSnapshot = false;
  private snapshotIsStale = false;
  private inFlightSnapshot: Promise<void> | null = null;
  private readonly writeSnapshot: () => Promise<void>;
  private readonly shouldWriteSnapshot: () => boolean;
  private backupsWereEnabled = false;

  constructor(options: {
    writeSnapshot: () => Promise<void>;
    shouldWriteSnapshot?: () => boolean;
  }) {
    this.writeSnapshot = options.writeSnapshot;
    this.shouldWriteSnapshot = options.shouldWriteSnapshot || (() => true);
  }

  /**
   * Records a successful settings persistence. It establishes the recovery
   * baseline when the session has none; later persistence only marks it stale.
   */
  public async recordPersistedChange(): Promise<void> {
    this.persistedGeneration += 1;
    this.snapshotIsStale = true;
    await this.ensureBaseline();
  }

  /**
   * Records that the session's settings loaded and nothing was persisted:
   * takes the recovery baseline of the loaded state when the session has none.
   * Unlike a persisted change it leaves the baseline current, since nothing
   * has changed since.
   */
  public async recordLoadedState(): Promise<void> {
    await this.ensureBaseline();
  }

  private async ensureBaseline(): Promise<void> {
    if (!this.shouldWriteSnapshot()) {
      this.backupsWereEnabled = false;
      return;
    }

    if (!this.backupsWereEnabled) {
      this.hasSnapshot = false;
      this.backupsWereEnabled = true;
    }

    if (this.hasSnapshot) {
      return;
    }

    await this.writeSnapshotNow();
  }

  /**
   * Creates a new snapshot before a storage migration, even when the session
   * already has a current recovery baseline.
   */
  public async backupBeforeMigration(): Promise<void> {
    if (!this.shouldWriteSnapshot()) {
      this.backupsWereEnabled = false;
      return;
    }

    this.backupsWereEnabled = true;
    this.snapshotIsStale = true;
    if (this.inFlightSnapshot) {
      await this.inFlightSnapshot;
    }

    await this.writeSnapshotNow();
  }

  /**
   * Writes a final snapshot only when persistence since the last successful
   * snapshot made it stale. An in-flight snapshot is reused before deciding
   * whether a second write is necessary.
   */
  public async flushOnUnload(): Promise<void> {
    if (!this.shouldWriteSnapshot()) {
      this.backupsWereEnabled = false;
      return;
    }

    if (!this.backupsWereEnabled) {
      this.hasSnapshot = false;
      this.backupsWereEnabled = true;
    }

    if (this.inFlightSnapshot) {
      try {
        await this.inFlightSnapshot;
      } catch {
        // The failed snapshot remains stale and is retried below.
      }
    }

    if (this.snapshotIsStale) {
      await this.writeSnapshotNow();
    }
  }

  private async writeSnapshotNow(): Promise<void> {
    if (this.inFlightSnapshot) {
      await this.inFlightSnapshot;
      return;
    }

    const generationAtStart = this.persistedGeneration;
    const snapshot = this.writeSnapshot();
    this.inFlightSnapshot = snapshot;

    try {
      await snapshot;
      this.hasSnapshot = true;
      this.snapshotIsStale = generationAtStart !== this.persistedGeneration;
    } finally {
      this.inFlightSnapshot = null;
    }
  }
}
