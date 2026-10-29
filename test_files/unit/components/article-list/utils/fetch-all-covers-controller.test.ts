// The run behind the header's fetch-all-covers button (#1702): what state it
// reports, how a press starts or stops it, and the one Notice that ends it.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { FetchAllCoversController } from "../../../../../src/components/article-list/utils/fetch-all-covers-controller";
import type { FeedItem } from "../../../../../src/types/types";

function article(guid: string): FeedItem {
  return {
    guid,
    title: guid,
    link: `https://example.com/${guid}`,
    pubDate: "2026-01-01T00:00:00.000Z",
    description: "",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed",
    coverImage: "",
  };
}

function articles(count: number): FeedItem[] {
  return Array.from({ length: count }, (_, index) => article(`g${index}`));
}

describe("FetchAllCoversController", () => {
  let noticeLog: MockInstance;

  beforeEach(() => {
    noticeLog = vi.spyOn(console, "debug");
    noticeLog.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function notices(): unknown[] {
    return noticeLog.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => call[1]);
  }

  function build(
    targets: FeedItem[],
    fetchOne: (article: FeedItem) => Promise<boolean> = async () => true,
  ) {
    const host = {
      getTargets: vi.fn(() => targets),
      fetchOne: vi.fn(fetchOne),
      onStateChange: vi.fn(),
    };
    return { host, controller: new FetchAllCoversController(host) };
  }

  it("reports idle while the page has cards to fetch and disabled when it has none", () => {
    expect(build(articles(2)).controller.getState()).toBe("idle");
    expect(build([]).controller.getState()).toBe("disabled");
  });

  it("runs the fetch on a press, moves the button through its states and reports once", async () => {
    const targets = articles(3);
    const { host, controller } = build(targets);

    controller.toggle();
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    expect(host.fetchOne).toHaveBeenCalledTimes(3);
    expect(host.onStateChange.mock.calls.map(([state]) => state)).toEqual([
      "running",
      "idle",
    ]);
    expect(notices()).toEqual(["Fetched 3 of 3 cover images."]);
  });

  it("reports running for the whole run", async () => {
    const finish: Array<() => void> = [];
    const { controller } = build(
      articles(2),
      () => new Promise<boolean>((resolve) => finish.push(() => resolve(true))),
    );

    controller.toggle();
    expect(controller.getState()).toBe("running");

    finish.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(notices()).toHaveLength(1));
    expect(controller.getState()).toBe("idle");
  });

  it("shows that a cancel registered while the fetches already started finish", async () => {
    const finish: Array<() => void> = [];
    const { host, controller } = build(
      articles(8),
      () => new Promise<boolean>((resolve) => finish.push(() => resolve(true))),
    );

    controller.toggle();
    controller.toggle();

    expect(controller.getState()).toBe("stopping");
    expect(host.onStateChange.mock.calls.map(([state]) => state)).toEqual([
      "running",
      "stopping",
    ]);

    finish.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    expect(host.fetchOne).toHaveBeenCalledTimes(3);
    expect(notices()).toEqual([
      "Stopped. Fetched 3 of 3 cover images. 5 not started.",
    ]);
    expect(controller.getState()).toBe("idle");
  });

  it("starts nothing and says so when a press finds no card that needs a cover", () => {
    const { host, controller } = build([]);

    controller.toggle();

    expect(host.fetchOne).not.toHaveBeenCalled();
    expect(host.onStateChange).not.toHaveBeenCalled();
    expect(notices()).toEqual(["No cards on this page need a cover image."]);
  });

  it("stops new fetches when it is cancelled from outside", async () => {
    const finish: Array<() => void> = [];
    const { host, controller } = build(
      articles(8),
      () => new Promise<boolean>((resolve) => finish.push(() => resolve(true))),
    );

    controller.toggle();
    controller.cancel();
    finish.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(notices()).toHaveLength(1));

    expect(host.fetchOne).toHaveBeenCalledTimes(3);
  });
});
