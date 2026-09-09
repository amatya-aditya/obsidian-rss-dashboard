export class DataSyncLeaseCancelledError extends Error {
  constructor() {
    super("Data-sync ownership is no longer active");
    this.name = "DataSyncLeaseCancelledError";
  }
}

export interface DataSyncLeaseOwner {
  readonly signal: AbortSignal;
  isActive(): boolean;
  throwIfInactive(): void;
}

export type DataSyncOperationRunner = <T>(
  operation: (owner: DataSyncLeaseOwner) => Promise<T>,
) => Promise<T>;

export function isDataSyncLeaseCancelledError(
  error: unknown,
): error is DataSyncLeaseCancelledError {
  return error instanceof DataSyncLeaseCancelledError;
}

export class DataSyncLease {
  private queueTail: Promise<void> = Promise.resolve();
  private activeOwner: {
    controller: AbortController;
    release: () => void;
  } | null = null;
  private closed = false;

  public async runExclusive<T>(
    operation: (owner: DataSyncLeaseOwner) => Promise<T>,
  ): Promise<T> {
    const previousLeaseCompletion = this.queueTail;
    let releaseOwner = (): void => {};
    this.queueTail = new Promise<void>((resolve) => {
      releaseOwner = resolve;
    });

    await previousLeaseCompletion;

    if (this.closed) {
      releaseOwner();
      throw new DataSyncLeaseCancelledError();
    }

    const controller = new AbortController();
    let released = false;
    const activeOwner = {
      controller,
      release: (): void => {
        if (released) {
          return;
        }
        released = true;
        if (this.activeOwner === activeOwner) {
          this.activeOwner = null;
        }
        releaseOwner();
      },
    };
    this.activeOwner = activeOwner;
    const isActive = (): boolean =>
      !this.closed &&
      !controller.signal.aborted &&
      this.activeOwner === activeOwner;
    const owner: DataSyncLeaseOwner = {
      signal: controller.signal,
      isActive,
      throwIfInactive: () => {
        if (!isActive()) {
          throw new DataSyncLeaseCancelledError();
        }
      },
    };

    try {
      return await operation(owner);
    } finally {
      activeOwner.release();
    }
  }

  public cancelActive(): void {
    const activeOwner = this.activeOwner;
    if (!activeOwner) {
      return;
    }
    activeOwner.controller.abort();
  }

  public close(): void {
    this.closed = true;
    this.cancelActive();
  }
}
