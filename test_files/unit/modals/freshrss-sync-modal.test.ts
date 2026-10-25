import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import {
  FreshRssSyncModal,
  type FreshRssSyncModalHost,
} from "../../../src/modals/freshrss-sync-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function host(mode: "two-way" | "receive-only"): FreshRssSyncModalHost {
  return {
    getFreshRssPendingMutations: vi.fn(async () => []),
    syncFreshRssNow: vi.fn(async () => {}),
    cancelFreshRssSyncNow: vi.fn(),
    retryFreshRssMutation: vi.fn(async () => {}),
    cancelFreshRssMutation: vi.fn(async () => {}),
    getFreshRssStateSyncMode: () => mode,
  };
}

describe("FreshRSS sync preview modal", () => {
  it("shows incoming and outgoing article changes in two-way mode", async () => {
    installObsidianDomPolyfills();
    const modal = new FreshRssSyncModal({} as App, host("two-way"));

    modal.onOpen();
    await vi.waitFor(() => {
      expect(modal.contentEl.querySelector('[role="status"]')).not.toBeNull();
    });

    expect(modal.contentEl.textContent).toContain("Incoming");
    expect(modal.contentEl.textContent).toContain(
      "Subscriptions and recent articles",
    );
    expect(modal.contentEl.textContent).toContain(
      "Read, starred, and normalized-label changes",
    );
    expect(modal.contentEl.querySelector('[role="status"]')).not.toBeNull();
    modal.onClose();
  });

  it("explains that Receive-only pauses outgoing changes", async () => {
    installObsidianDomPolyfills();
    const modal = new FreshRssSyncModal({} as App, host("receive-only"));

    modal.onOpen();
    await vi.waitFor(() => {
      expect(modal.contentEl.textContent).toContain("Receive-only is active");
    });

    expect(modal.contentEl.textContent).toContain("Receive-only is active");
    modal.onClose();
  });

  it("offers individual retry and cancel for terminal failures", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.getFreshRssPendingMutations).mockResolvedValue([
      {
        operationId: "failed-read",
        remoteArticleId: "article/1",
        facet: "read",
        desiredState: true,
        createdAtMs: 1,
        attemptCount: 1,
        retryDisposition: "manual",
        lastError: "rejected",
      },
    ]);
    const modal = new FreshRssSyncModal({} as App, api);

    modal.onOpen();
    await vi.waitFor(() => {
      expect(modal.contentEl.querySelector("button")).not.toBeNull();
    });

    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    buttons.find((button) => button.textContent === "Retry")?.click();
    buttons.find((button) => button.textContent === "Cancel mutation")?.click();
    expect(api.retryFreshRssMutation).toHaveBeenCalledWith("failed-read");
    expect(api.cancelFreshRssMutation).toHaveBeenCalledWith("failed-read");
    modal.onClose();
  });

  it("shows running status and requests cancellation from the operation tracker", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.syncFreshRssNow).mockImplementation(
      () => new Promise<void>(() => {}),
    );
    const modal = new FreshRssSyncModal({} as App, api);
    const close = vi.spyOn(modal, "close");

    modal.onOpen();
    await vi.waitFor(() => {
      expect(modal.contentEl.querySelector("button")).not.toBeNull();
    });
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    buttons.find((button) => button.textContent === "Start sync")?.click();
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).toBe(
      "Sync in progress.",
    );
    buttons.find((button) => button.textContent === "Cancel")?.click();

    expect(api.cancelFreshRssSyncNow).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    modal.onClose();
  });
});
