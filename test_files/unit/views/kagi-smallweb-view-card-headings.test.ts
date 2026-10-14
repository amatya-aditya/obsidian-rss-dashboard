import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { KagiSmallwebView } from "../../../src/views/kagi-smallweb-view";

interface SmallwebEntry {
  postTitle: string;
  postUrl: string;
  blogName: string;
  blogUrl: string;
  updatedAt: Date;
  excerpt: string;
  domain: string;
}

type KagiSmallwebViewInternals = {
  smallwebEntries: SmallwebEntry[];
  smallwebFilteredEntries: SmallwebEntry[];
  smallwebIsLoading: boolean;
};

const ENTRIES: SmallwebEntry[] = [
  {
    blogName: "Alpha Notes",
    postTitle: "A post about alphas",
    postUrl: "https://alpha.example/post",
    blogUrl: "https://alpha.example",
    updatedAt: new Date("2026-01-14T08:00:00Z"),
    excerpt: "First excerpt.",
    domain: "alpha.example",
  },
  {
    blogName: "Beta Journal",
    // Same as the blog name, so the card renders no separate post title.
    postTitle: "Beta Journal",
    postUrl: "https://beta.example/post",
    blogUrl: "https://beta.example",
    updatedAt: new Date("2026-01-13T08:00:00Z"),
    excerpt: "",
    domain: "beta.example",
  },
  {
    blogName: "Gamma Log",
    postTitle: "Gamma's latest",
    postUrl: "https://gamma.example/post",
    blogUrl: "https://gamma.example",
    updatedAt: new Date("2026-01-12T08:00:00Z"),
    excerpt: "Third excerpt.",
    domain: "gamma.example",
  },
];

function createView(): KagiSmallwebView {
  const leaf = { app: {} } as unknown as WorkspaceLeaf;
  // Cards read the followed feeds and the default folder for their follow button.
  const plugin = {
    settings: { feeds: [], media: { defaultSmallwebFolder: "Smallweb" } },
  } as unknown as RssDashboardPlugin;
  return new KagiSmallwebView(leaf, plugin);
}

function renderCards(): KagiSmallwebView {
  const view = createView();
  const internals = view as unknown as KagiSmallwebViewInternals;

  // Seed entries directly so the test never makes onOpen's Kagi request.
  internals.smallwebEntries = ENTRIES;
  internals.smallwebFilteredEntries = [...ENTRIES];
  internals.smallwebIsLoading = false;

  document.body.appendChild(view.containerEl);
  view.render();
  return view;
}

afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
});

describe("Kagi Smallweb card headings", () => {
  it("exposes every card title as a level 3 heading named with the blog name", () => {
    const view = renderCards();

    const cards = Array.from(
      view.containerEl.querySelectorAll<HTMLElement>(".rss-discover-card"),
    );
    expect(cards).toHaveLength(ENTRIES.length);

    // WCAG 1.3.1: one heading per card, at the level the dashboard cards use.
    cards.forEach((card, index) => {
      const headings = card.querySelectorAll('[role="heading"]');
      expect(headings).toHaveLength(1);
      expect(headings[0].getAttribute("aria-level")).toBe("3");
      expect(headings[0].textContent).toBe(ENTRIES[index].blogName);
    });
  });

  it("keeps the card title out of the tab order and unchanged in text", () => {
    const view = renderCards();

    const title = view.containerEl.querySelector<HTMLElement>(
      ".rss-discover-card-title",
    );
    expect(title).not.toBeNull();
    expect(title?.hasAttribute("tabindex")).toBe(false);
    expect(title?.children).toHaveLength(0);
    expect(title?.textContent).toBe("Alpha Notes");
  });

  it("leaves the secondary post title as plain text, not a heading", () => {
    const view = renderCards();

    const postTitle = view.containerEl.querySelector<HTMLElement>(
      ".rss-smallweb-post-title",
    );
    expect(postTitle?.textContent).toBe("A post about alphas");
    expect(postTitle?.hasAttribute("role")).toBe(false);
  });

  it("renders the loading skeleton cards without headings", () => {
    const view = createView();
    (view as unknown as KagiSmallwebViewInternals).smallwebIsLoading = true;
    document.body.appendChild(view.containerEl);

    view.render();

    expect(
      view.containerEl.querySelectorAll(".rss-smallweb-skeleton"),
    ).toHaveLength(6);
    expect(view.containerEl.querySelectorAll('[role="heading"]')).toHaveLength(
      0,
    );
  });
});
