import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import {
  FreshRssSyncModal,
  type FreshRssSyncModalHost,
} from "../../../src/modals/freshrss-sync-modal";
import type { FreshRssSyncPreviewOutcome } from "../../../src/services/freshrss-sync-coordinator";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function host(mode: "two-way" | "receive-only"): FreshRssSyncModalHost {
  return {
    getFreshRssSyncPreview: vi.fn(
      async (): Promise<FreshRssSyncPreviewOutcome> => ({
        outcome: "ready",
        pendingMutations: [],
        labelConflicts: [],
        subscriptions: [
          {
            remoteSubscriptionId: "feed/6",
            title: "Preview feed",
            url: "https://feed.example.test/rss.xml",
            articles: [
              {
                remoteArticleId: "article/1",
                title: "Preview article",
                link: "https://article.example.test/1",
              },
            ],
            articleLoadStatus: "complete",
          },
        ],
      }),
    ),
    getFreshRssPendingMutations: vi.fn(async () => []),
    syncFreshRssNow: vi.fn(async () => "completed" as const),
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
      expect(modal.contentEl.textContent).toContain("Preview feed");
    });

    expect(modal.contentEl.textContent).toContain("Incoming");
    expect(modal.contentEl.textContent).toContain("Preview feed");
    expect(modal.contentEl.textContent).toContain("Preview article");
    expect(modal.contentEl.textContent).toContain(
      "Read, starred, and normalized-label changes",
    );
    expect(modal.contentEl.querySelector('[role="status"]')).not.toBeNull();
    modal.onClose();
  });

  it("explains that a continuation cursor means more articles are available", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.getFreshRssSyncPreview).mockResolvedValue({
      outcome: "ready",
      pendingMutations: [],
      labelConflicts: [],
      subscriptions: [
        {
          remoteSubscriptionId: "feed/6",
          title: "Preview feed",
          url: "https://feed.example.test/rss.xml",
          articles: Array.from({ length: 50 }, (_, index) => ({
            remoteArticleId: `article/${index + 1}`,
            title: `Article ${index + 1}`,
            link: `https://article.example.test/${index + 1}`,
          })),
          articleLoadStatus: "has-more",
        },
      ],
    });
    const modal = new FreshRssSyncModal({} as App, api);

    modal.onOpen();
    await vi.waitFor(() => {
      expect(modal.contentEl.textContent).toContain(
        "First 50 recent articles loaded; more are available.",
      );
    });

    expect(modal.contentEl.textContent).not.toContain(
      "some recent articles could not be loaded",
    );
    modal.onClose();
  });

  it("keeps an actual preview request failure distinct from a continuation", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.getFreshRssSyncPreview).mockResolvedValue({
      outcome: "ready",
      pendingMutations: [],
      labelConflicts: [],
      subscriptions: [
        {
          remoteSubscriptionId: "feed/6",
          title: "Unavailable feed",
          url: "https://feed.example.test/rss.xml",
          articles: [],
          articleLoadStatus: "failed",
        },
      ],
    });
    const modal = new FreshRssSyncModal({} as App, api);

    modal.onOpen();
    await vi.waitFor(() => {
      expect(modal.contentEl.textContent).toContain(
        "Recent articles could not be loaded.",
      );
    });

    expect(modal.contentEl.textContent).not.toContain("more are available");
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

  it("shows one local-only warning for each FreshRSS category name collision", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.getFreshRssSyncPreview).mockResolvedValue({
      outcome: "ready",
      pendingMutations: [],
      labelConflicts: ["Computing", "News"],
      subscriptions: [],
    });
    const modal = new FreshRssSyncModal({} as App, api);

    modal.onOpen();
    await vi.waitFor(() => {
      expect(
        modal.contentEl.querySelectorAll(".rss-freshrss-category-conflict"),
      ).toHaveLength(2);
    });

    expect(modal.contentEl.textContent).toContain(
      'FreshRSS category "Computing" cannot sync as an article label.',
    );
    expect(modal.contentEl.textContent).toContain(
      'FreshRSS category "News" cannot sync as an article label.',
    );
    expect(modal.contentEl.textContent).toContain("kept locally");
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
      expect(
        Array.from(modal.contentEl.querySelectorAll("button")).some(
          (button) => button.textContent === "Retry",
        ),
      ).toBe(true);
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
      () => new Promise<"completed">(() => {}),
    );
    const modal = new FreshRssSyncModal({} as App, api);
    const close = vi.spyOn(modal, "close");

    modal.onOpen();
    await vi.waitFor(() => {
      expect(
        modal.contentEl.querySelector('[role="status"]')?.textContent,
      ).toBe("Preview ready.");
    });
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    buttons.find((button) => button.textContent === "Start sync")?.click();
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).toBe(
      "Sync in progress.",
    );
    buttons.find((button) => button.textContent === "Cancel")?.click();

    expect(api.cancelFreshRssSyncNow).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    modal.onClose();
  });

  it("shows an error and keeps the dialog controls when saved sync state cannot be read", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.getFreshRssSyncPreview).mockResolvedValue({
      outcome: "server-unavailable",
    });
    vi.mocked(api.getFreshRssPendingMutations).mockRejectedValue(
      new Error("vault read failed"),
    );
    const modal = new FreshRssSyncModal({} as App, api);

    modal.onOpen();
    await vi.waitFor(() => {
      expect(modal.contentEl.querySelector('[role="alert"]')).not.toBeNull();
    });

    expect(modal.contentEl.textContent).toContain("could not be read");
    expect(modal.contentEl.querySelector("button")?.textContent).toBe("Cancel");
    modal.onClose();
  });

  it("announces a failed sync as failed instead of finished", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.syncFreshRssNow).mockResolvedValue("failed");
    const modal = new FreshRssSyncModal({} as App, api);

    modal.onOpen();
    await vi.waitFor(() => {
      expect(
        modal.contentEl.querySelector('[role="status"]')?.textContent,
      ).toBe("Preview ready.");
    });
    modal.contentEl
      .querySelector<HTMLButtonElement>("button:last-child")
      ?.click();
    await vi.waitFor(() => {
      expect(
        modal.contentEl.querySelector('[role="status"]')?.textContent,
      ).toBe("FreshRSS sync failed.");
    });
    modal.onClose();
  });

  it("shows newly failed mutations after a sync finishes without reopening", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.getFreshRssPendingMutations)
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          operationId: "failed-starred",
          remoteArticleId: "article/1",
          facet: "starred",
          desiredState: true,
          createdAtMs: 1,
          attemptCount: 1,
          retryDisposition: "manual",
          lastError: "FreshRSS rejected the update",
        },
      ]);
    vi.mocked(api.syncFreshRssNow).mockResolvedValue("failed");
    const modal = new FreshRssSyncModal({} as App, api);

    modal.onOpen();
    await vi.waitFor(() => {
      expect(
        modal.contentEl.querySelector('[role="status"]')?.textContent,
      ).toBe("Preview ready.");
    });
    modal.contentEl
      .querySelector<HTMLButtonElement>("button:last-child")
      ?.click();

    await vi.waitFor(() => {
      expect(
        Array.from(modal.contentEl.querySelectorAll("button")).map(
          (button) => button.textContent,
        ),
      ).toContain("Retry");
      expect(
        Array.from(modal.contentEl.querySelectorAll("button")).map(
          (button) => button.textContent,
        ),
      ).toContain("Cancel mutation");
    });
    expect(api.getFreshRssPendingMutations).toHaveBeenCalledTimes(2);
    modal.onClose();
  });

  it("announces an incomplete article-state reconciliation", async () => {
    installObsidianDomPolyfills();
    const api = host("two-way");
    vi.mocked(api.syncFreshRssNow).mockResolvedValue("incomplete");
    const modal = new FreshRssSyncModal({} as App, api);

    modal.onOpen();
    await vi.waitFor(() => {
      expect(
        modal.contentEl.querySelector('[role="status"]')?.textContent,
      ).toBe("Preview ready.");
    });
    modal.contentEl
      .querySelector<HTMLButtonElement>("button:last-child")
      ?.click();
    await vi.waitFor(() => {
      expect(
        modal.contentEl.querySelector('[role="status"]')?.textContent,
      ).toBe(
        "FreshRSS sync incomplete. Article-state reconciliation could not be confirmed.",
      );
    });
    modal.onClose();
  });

  it("keeps the status line and the Cancel and Start sync buttons in one footer after the preview", async () => {
    installObsidianDomPolyfills();
    const modal = new FreshRssSyncModal({} as App, host("two-way"));

    modal.onOpen();
    await vi.waitFor(() => {
      expect(modal.contentEl.textContent).toContain("Preview feed");
    });

    expect(modal.modalEl.classList.contains("rss-freshrss-sync-modal")).toBe(
      true,
    );
    const footer = modal.contentEl.querySelector(".rss-freshrss-sync-footer");
    expect(footer).not.toBeNull();
    expect(footer?.parentElement).toBe(modal.contentEl);
    expect(modal.contentEl.lastElementChild).toBe(footer);
    expect(footer?.querySelector('[role="status"]')).not.toBeNull();
    expect(
      Array.from(footer?.querySelectorAll("button") ?? []).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Cancel", "Start sync"]);
    modal.onClose();
  });
});
