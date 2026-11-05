// A link to a file is remembered per item and explained, without a retry that
// would only skip it again (#1766).
import { afterEach, describe, expect, it } from "vitest";
import {
  FETCH_FAILURE_TTL_MS,
  FETCH_FAILURE_UNSUPPORTED_TEXT,
  applyFetchOutcome,
  hasActiveFetchFailure,
  renderFetchFailureBanner,
} from "../../../src/utils/full-article-fetch-failure";
import type { FeedItem } from "../../../src/types/types";

const UNSUPPORTED = {
  content: "",
  failureType: "network" as const,
  failureReason: "unsupported" as const,
};

function makeItem(): FeedItem {
  return {
    title: "How to lie with statistics",
    link: "https://example.com/how-to-lie.pdf",
  } as FeedItem;
}

describe("a remembered unsupported link (#1766)", () => {
  afterEach(() => {
    activeDocument.body.empty();
  });

  it("records the item so the next open does not fetch it again", () => {
    const item = makeItem();
    const persisted: Array<Partial<FeedItem>> = [];

    applyFetchOutcome(item, UNSUPPORTED, (patch) => persisted.push(patch));

    expect(item.fullContentFetchFailure?.reason).toBe("unsupported");
    expect(hasActiveFetchFailure(item)).toBe(true);
    expect(persisted).toHaveLength(1);
  });

  it("explains the link and offers Open in browser, with no Try again", () => {
    const item = makeItem();
    applyFetchOutcome(item, UNSUPPORTED, () => undefined);
    const container = activeDocument.body.createDiv();

    renderFetchFailureBanner(container, item, () => undefined);

    const banner = container.querySelector(".rss-reader-fetch-failure-banner");
    expect(banner?.textContent).toContain(FETCH_FAILURE_UNSUPPORTED_TEXT);
    expect(
      container.querySelector(".rss-reader-fetch-failure-try-again"),
    ).toBeNull();
    expect(
      container
        .querySelector<HTMLAnchorElement>(".rss-reader-fetch-failure-open-link")
        ?.getAttribute("href"),
    ).toBe(item.link);
  });

  it("keeps Try again for an ordinary network failure", () => {
    const item = makeItem();
    applyFetchOutcome(
      item,
      { content: "", failureType: "network" },
      () => undefined,
    );
    const container = activeDocument.body.createDiv();

    renderFetchFailureBanner(container, item, () => undefined);

    expect(
      container.querySelector(".rss-reader-fetch-failure-try-again"),
    ).not.toBeNull();
  });

  it("never expires, since a retry would only skip the file again", () => {
    const item = makeItem();
    applyFetchOutcome(item, UNSUPPORTED, () => undefined);
    const wellPastTtl = Date.now() + FETCH_FAILURE_TTL_MS * 30;

    expect(hasActiveFetchFailure(item, wellPastTtl)).toBe(true);
  });

  it("lets an ordinary network failure expire after a day", () => {
    const item = makeItem();
    applyFetchOutcome(
      item,
      { content: "", failureType: "network" },
      () => undefined,
    );

    expect(
      hasActiveFetchFailure(item, Date.now() + FETCH_FAILURE_TTL_MS + 1000),
    ).toBe(false);
  });
});
