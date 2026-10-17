import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { RefreshDetailsModal } from "../../../src/modals/refresh-details-modal";
import type { FeedErrorDetail } from "../../../src/utils/feed-error";
import { copyTextToClipboard } from "../../../src/utils/export-utils";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

vi.mock("../../../src/utils/export-utils", () => ({
  copyTextToClipboard: vi.fn(),
}));

const copyMock = vi.mocked(copyTextToClipboard);

function detail(overrides: Partial<FeedErrorDetail> = {}): FeedErrorDetail {
  return {
    feedTitle: "Broken feed",
    feedUrl: "https://broken.test/rss",
    refreshError: null,
    importError: null,
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function openModal(input: {
  lines?: string[];
  errors: FeedErrorDetail[];
}): RefreshDetailsModal {
  const modal = new RefreshDetailsModal(new obsidian.App(), {
    title: input.errors.length > 1 ? "Refresh details" : "Feed error",
    lines: input.lines ?? [],
    errors: input.errors,
  });
  modal.open();
  return modal;
}

function copyButtons(modal: RefreshDetailsModal): HTMLButtonElement[] {
  return Array.from(
    modal.contentEl.querySelectorAll<HTMLButtonElement>(
      ".rss-dashboard-feed-error-copy",
    ),
  );
}

describe("RefreshDetailsModal feed errors", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    copyMock.mockReset();
  });

  afterEach(() => {
    document.body.empty();
  });

  it("shows the refresh failure before the import failure, each labelled", () => {
    const modal = openModal({
      errors: [
        detail({ refreshError: "HTTP 500", importError: "merge failed" }),
      ],
    });

    const messages = Array.from(
      modal.contentEl.querySelectorAll(
        ".rss-dashboard-feed-error-kind-message",
      ),
    ).map((el) => el.textContent);

    expect(messages).toEqual(["HTTP 500", "merge failed"]);
    const labels = Array.from(
      modal.contentEl.querySelectorAll(".rss-dashboard-feed-error-kind-label"),
    ).map((el) => el.textContent);
    expect(labels).toEqual(["Refresh failed", "Import failed"]);
  });

  it("names each kind with a heading that labels its read-only group", () => {
    const modal = openModal({
      errors: [detail({ refreshError: "HTTP 500" })],
    });

    const group = modal.contentEl.querySelector<HTMLElement>(
      '.rss-dashboard-feed-error-kind[role="group"]',
    );
    expect(group).not.toBeNull();

    const labelId = group?.getAttribute("aria-labelledby") ?? "";
    expect(labelId).not.toBe("");
    // The group is named by a real heading, not unlabelled prose.
    const heading = modal.contentEl.querySelector<HTMLElement>(`h4#${labelId}`);
    expect(heading?.textContent).toBe("Refresh failed");
  });

  it("shows a stored message in full, however long", () => {
    const longMessage = "A".repeat(300);
    const modal = openModal({
      errors: [detail({ refreshError: longMessage })],
    });

    expect(
      modal.contentEl.querySelector(".rss-dashboard-feed-error-kind-message")
        ?.textContent,
    ).toBe(longMessage);
  });

  it("keeps the non-error detail lines above the error area", () => {
    const modal = openModal({
      lines: ["Last checked: Not yet", "Effective interval: 30 minutes"],
      errors: [detail({ refreshError: "HTTP 500" })],
    });

    const lines = Array.from(
      modal.contentEl.querySelectorAll(".rss-dashboard-refresh-details-line"),
    ).map((el) => el.textContent);

    expect(lines).toEqual([
      "Last checked: Not yet",
      "Effective interval: 30 minutes",
    ]);
  });

  it("offers one Copy error action for a single feed", () => {
    const modal = openModal({ errors: [detail({ refreshError: "HTTP 500" })] });

    expect(copyButtons(modal).map((button) => button.textContent)).toEqual([
      "Copy error",
    ]);
  });

  it("writes the diagnostic block and confirms inline after the copy resolves", async () => {
    copyMock.mockResolvedValue("copied");
    const modal = openModal({
      errors: [
        detail({
          refreshError: "HTTP 500",
          importError: "merge failed",
        }),
      ],
    });

    const status =
      modal.contentEl.querySelector<HTMLElement>('[role="status"]');
    // Created empty, so inserting it already holding text cannot swallow the
    // announcement (#1119).
    expect(status?.textContent).toBe("");

    copyButtons(modal)[0].click();
    await flushPromises();

    expect(copyMock).toHaveBeenCalledWith(
      [
        "Feed: Broken feed",
        "URL: https://broken.test/rss",
        "Refresh failed: HTTP 500",
        "Import failed: merge failed",
      ].join("\n"),
    );
    expect(status?.textContent).toBe("Copied");
  });

  it("reports a failed copy inline rather than claiming success", async () => {
    copyMock.mockResolvedValue("failed");
    const modal = openModal({ errors: [detail({ refreshError: "HTTP 500" })] });

    copyButtons(modal)[0].click();
    await flushPromises();

    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).toBe(
      "Copy failed",
    );
  });

  it("lists every failing feed with its own Copy plus a Copy all", async () => {
    copyMock.mockResolvedValue("copied");
    const modal = openModal({
      errors: [
        detail({ feedTitle: "First", refreshError: "HTTP 500" }),
        detail({
          feedTitle: "Second",
          feedUrl: "https://second.test/rss",
          importError: "boom",
        }),
      ],
    });

    const buttons = copyButtons(modal);
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Copy",
      "Copy",
      "Copy all",
    ]);

    buttons[2].click();
    await flushPromises();

    expect(copyMock).toHaveBeenCalledWith(
      [
        "Feed: First",
        "URL: https://broken.test/rss",
        "Refresh failed: HTTP 500",
        "",
        "Feed: Second",
        "URL: https://second.test/rss",
        "Import failed: boom",
      ].join("\n"),
    );
  });

  it("names each feed in a multi-feed listing", () => {
    const modal = openModal({
      errors: [
        detail({ feedTitle: "First", refreshError: "HTTP 500" }),
        detail({ feedTitle: "Second", refreshError: "boom" }),
      ],
    });

    const titles = Array.from(
      modal.contentEl.querySelectorAll(".rss-dashboard-feed-error-feed-title"),
    ).map((el) => el.textContent);

    expect(titles).toEqual(["First", "Second"]);
  });

  it("shows no error area for a details dialog with nothing failing", () => {
    const modal = openModal({
      lines: ["Last checked: Not yet"],
      errors: [],
    });

    expect(
      modal.contentEl.querySelector(".rss-dashboard-feed-error-section"),
    ).toBeNull();
    expect(copyButtons(modal)).toEqual([]);
  });
});
