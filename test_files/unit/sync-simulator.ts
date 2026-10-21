import type { MockApp } from "obsidian";

/**
 * Joins two mock vaults and delivers files from one to the other the way
 * Obsidian Sync does, through the mock vault's external-write API, so the
 * receiving vault fires the events the probe ledger lists ("External writes
 * and vault events" in `test_files/stubs/obsidian-console-probes.md`).
 *
 * Models only what was observed or documented (DEC-005 of #1401):
 * - Sync's path rules: a path with a dot segment is skipped. The config
 *   folder's exception is modeled for the bootstrap `data.json` alone
 *   (`<configDir>/plugins/<id>/data.json`), which the receiver sees through
 *   `onExternalSettingsChange` and no `vault.on` event.
 * - Delivery order: source order, reversed, an explicit list, or one file per
 *   `deliverNext()` call.
 * - Delays between files under fake timers, and partial arrival.
 * - Last writer wins: a delivered file replaces the receiver's copy.
 *
 * Ledger row b1 (a dot-folder: `raw` only) is unreachable here: every
 * dot-path but the bootstrap file is skipped, so the receiver never sees one.
 *
 * It has no merge policy and no conflict-copy policy on purpose. DEC-008
 * excludes Sync's real merge algorithm from the mocks, and DEC-011 bars
 * conflict files and their naming until a Real Sync pass has observed them.
 */

export interface SyncSimulatorOptions {
  /** Plugin folder name under `<configDir>/plugins/`. Defaults to the plugin's id. */
  pluginId?: string;
}

export interface DeliverOptions {
  /**
   * `"in-order"` (the source's file order, the default), `"reverse"`, or the
   * paths to deliver, first to last. Listed paths Sync would skip are ignored.
   */
  order?: "in-order" | "reverse" | readonly string[];
  /** Partial arrival: only these paths land; the others never arrive. */
  only?: readonly string[];
  /** Milliseconds to wait between files. Advance fake timers to release them. */
  delayMs?: number;
}

export class SyncSimulator {
  private readonly pluginId: string;

  constructor(
    private readonly from: MockApp,
    private readonly to: MockApp,
    options: SyncSimulatorOptions = {},
  ) {
    this.pluginId = options.pluginId ?? "rss-dashboard";
  }

  /** The bootstrap pointer, the one config-folder file Sync carries. */
  private bootstrapPath(): string {
    return `${this.to.vault.configDir}/plugins/${this.pluginId}/data.json`;
  }

  /** Whether Sync would carry `path` to the other vault. */
  private isSynced(path: string): boolean {
    if (path === this.bootstrapPath()) return true;
    return path.split("/").every((segment) => !segment.startsWith("."));
  }

  /** The paths a delivery would carry now, in the order it would send them. */
  private plannedPaths(
    options: Pick<DeliverOptions, "order" | "only"> = {},
  ): string[] {
    const available = [...this.from.vault.filesOnDisk.keys()].filter((path) =>
      this.isSynced(path),
    );
    const order = options.order ?? "in-order";
    let ordered: string[];
    if (order === "in-order") {
      ordered = available;
    } else if (order === "reverse") {
      ordered = [...available].reverse();
    } else {
      ordered = order.filter((path) => available.includes(path));
    }
    const only = options.only;
    return only ? ordered.filter((path) => only.includes(path)) : ordered;
  }

  /**
   * Delivers the planned files to the receiver, one `externalWrite` each.
   * With `delayMs` it waits between files, so fake timers decide when each
   * one lands. Returns the paths delivered.
   */
  async deliver(options: DeliverOptions = {}): Promise<string[]> {
    const delivered: string[] = [];
    const paths = this.plannedPaths(options);
    for (const [index, path] of paths.entries()) {
      if (index > 0 && options.delayMs) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, options.delayMs),
        );
      }
      if (this.deliverFile(path)) delivered.push(path);
    }
    return delivered;
  }

  /**
   * Starts a delivery that lands one file per `next()` call, in the planned
   * order. The files are read when `next()` runs, so an edit on the source
   * between calls arrives as the newer copy.
   */
  startDelivery(options: Pick<DeliverOptions, "order" | "only"> = {}): {
    next(): string | undefined;
  } {
    const queue = this.plannedPaths(options);
    return {
      next: () => {
        for (let path = queue.shift(); path; path = queue.shift()) {
          if (this.deliverFile(path)) return path;
        }
        return undefined;
      },
    };
  }

  private deliverFile(path: string): boolean {
    const content = this.from.vault.filesOnDisk.get(path);
    if (content === undefined) return false;
    const destination = this.to.vault;
    const parent = path.slice(0, Math.max(path.lastIndexOf("/"), 0));
    if (parent) destination.addFolderOnDisk(parent);
    destination.externalWrite(path, content);
    return true;
  }
}
