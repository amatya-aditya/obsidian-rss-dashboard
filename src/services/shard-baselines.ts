/**
 * The comparable form of each feed's shard as this device last wrote or read
 * it (#1521). A save compares a feed's current shard against it to decide
 * whether to write.
 *
 * A hydrated shard registers a deferred baseline: the comparable form is built
 * from the shard text only when a save asks for it, so a start that never
 * saves does not canonicalize every shard. A deferred baseline is built from
 * what the shard held at load, never from the live articles, which a refresh
 * changes after load.
 */
export class ShardBaselines {
  private readonly resolved = new Map<string, string>();
  private readonly deferred = new Map<string, () => string>();

  /** The baseline for a feed, built on first use, if it has one. */
  get(feedId: string): string | undefined {
    const compute = this.deferred.get(feedId);
    if (compute !== undefined) {
      this.deferred.delete(feedId);
      this.resolved.set(feedId, compute());
    }
    return this.resolved.get(feedId);
  }

  set(feedId: string, comparable: string): void {
    this.deferred.delete(feedId);
    this.resolved.set(feedId, comparable);
  }

  /** Registers a baseline that `compute` builds the first time it is read. */
  setDeferred(feedId: string, compute: () => string): void {
    this.resolved.delete(feedId);
    this.deferred.set(feedId, compute);
  }

  delete(feedId: string): void {
    this.resolved.delete(feedId);
    this.deferred.delete(feedId);
  }

  clear(): void {
    this.resolved.clear();
    this.deferred.clear();
  }

  keys(): string[] {
    return [...this.resolved.keys(), ...this.deferred.keys()];
  }
}
