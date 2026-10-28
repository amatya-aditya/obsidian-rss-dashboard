import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { DiscoverSidebar } from "../../../src/components/discover-sidebar";
import type {
  DiscoverFilters,
  FeedMetadata,
} from "../../../src/types/discover-types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { lucideIconId } from "../test-icon-helpers";

type TestPlugin = ConstructorParameters<typeof DiscoverSidebar>[2];

function createFeed(overrides: Partial<FeedMetadata> = {}): FeedMetadata {
  return {
    id: overrides.id ?? "f1",
    title: overrides.title ?? "Feed 1",
    url: overrides.url ?? "https://example.com/rss",
    imageUrl: overrides.imageUrl ?? "",
    domain: overrides.domain ?? [],
    subdomain: overrides.subdomain ?? [],
    area: overrides.area ?? [],
    topic: overrides.topic ?? [],
    tags: overrides.tags ?? [],
    type: overrides.type ?? "News",
    summary: overrides.summary,
    createdAt: overrides.createdAt,
  };
}

function createFilters(
  overrides: Partial<DiscoverFilters> = {},
): DiscoverFilters {
  return {
    query: "",
    selectedTypes: [],
    selectedPaths: [],
    selectedTags: [],
    followStatus: "all",
    ...overrides,
  };
}

function setupSidebar(opts?: {
  activeSection?: "types" | "categories" | "tags";
  filters?: DiscoverFilters;
  feeds?: FeedMetadata[];
}) {
  const app = new App();
  const container = createDiv();

  const callbacks = {
    onFilterChange: vi.fn(),
    onActivateView: vi.fn(),
    onActivateDiscoverView: vi.fn(),
    onActivateSmallwebView: vi.fn(),
  };

  const filters = opts?.filters ?? createFilters();
  const feeds = opts?.feeds ?? [];

  const sidebar = new DiscoverSidebar(
    app,
    container,
    {} as unknown as TestPlugin,
    filters,
    feeds,
    opts?.activeSection ?? "types",
    callbacks,
  );

  sidebar.render();

  return { container, filters, callbacks };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("DiscoverSidebar", () => {
  it("renders nav and switches sections (types/categories/tags)", () => {
    const { container } = setupSidebar({
      activeSection: "types",
      feeds: [
        createFeed({ type: "News" }),
        createFeed({ id: "f2", type: "Podcast" }),
      ],
    });

    const nav = container.querySelector(
      ".rss-discover-sidebar-nav",
    ) as HTMLElement;
    const getNavButton = (text: string) =>
      Array.from(nav.querySelectorAll("button")).find(
        (b) => b.textContent === text,
      );

    const typesBtn = getNavButton("Types")!;
    const categoriesBtn = getNavButton("Categories")!;
    const tagsBtn = getNavButton("Tags")!;

    expect(typesBtn.classList.contains("active")).toBe(true);
    expect(container.querySelector(".rss-discover-type-list")).toBeTruthy();

    categoriesBtn.click();
    expect(categoriesBtn.classList.contains("active")).toBe(true);
    expect(container.querySelector(".rss-discover-category-tree")).toBeTruthy();

    tagsBtn.click();
    expect(tagsBtn.classList.contains("active")).toBe(true);
    expect(container.querySelector(".rss-discover-tag-list")).toBeTruthy();
  });

  it("wires up search input + clear button to filters.query + onFilterChange()", () => {
    const filters = createFilters({ query: "initial" });
    const { container, callbacks } = setupSidebar({ filters });

    const input = container.querySelector(
      ".rss-discover-search-input",
    ) as HTMLInputElement;
    expect(input.value).toBe("initial");

    input.value = "next";
    input.dispatchEvent(new Event("input"));
    expect(filters.query).toBe("next");
    expect(callbacks.onFilterChange).toHaveBeenCalledTimes(1);

    const clearBtn = container.querySelector<HTMLButtonElement>(
      "button.search-input-clear-button",
    );
    expect(clearBtn?.getAttribute("aria-label")).toBe("Clear search");
    clearBtn?.click();
    expect(input.value).toBe("");
    expect(filters.query).toBe("");
    expect(callbacks.onFilterChange).toHaveBeenCalledTimes(2);
  });

  it("fires header callbacks for Return Home and Kagi Smallweb from native buttons", () => {
    const { container, callbacks } = setupSidebar();

    const returnHome = container.querySelector(
      ".rss-discover-return-home",
    ) as HTMLElement;
    expect(returnHome).toBeTruthy();
    expect(lucideIconId(returnHome)).toBe("arrow-left");
    // Native button: the browser supplies role, focus and Enter/Space.
    expect(returnHome.tagName).toBe("BUTTON");
    expect(returnHome.getAttribute("type")).toBe("button");
    expect(returnHome.hasAttribute("role")).toBe(false);
    expect(returnHome.hasAttribute("tabindex")).toBe(false);

    returnHome.click();
    expect(callbacks.onActivateView).toHaveBeenCalledTimes(1);

    const smallweb = container.querySelector(
      ".rss-discover-smallweb-button",
    ) as HTMLElement;
    expect(smallweb).toBeTruthy();
    expect(lucideIconId(smallweb)).toBe("sparkles");
    expect(smallweb.textContent).toContain("Kagi");
    expect(smallweb.tagName).toBe("BUTTON");
    expect(smallweb.getAttribute("type")).toBe("button");
    expect(smallweb.hasAttribute("role")).toBe(false);
    expect(smallweb.hasAttribute("tabindex")).toBe(false);

    smallweb.click();
    expect(callbacks.onActivateSmallwebView).toHaveBeenCalledTimes(1);

    expect(
      container.querySelector(".rss-dashboard-header-close-button"),
    ).toBeNull();
  });

  it("toggles type and tag selections and calls onFilterChange()", () => {
    const filters = createFilters({
      selectedTypes: ["News"],
      selectedTags: ["tag-b"],
    });
    const feeds = [
      createFeed({ id: "n", type: "News", tags: ["tag-a", "tag-b"] }),
      createFeed({ id: "p", type: "Podcast", tags: ["tag-b"] }),
      createFeed({
        id: "e",
        type: "" as unknown as FeedMetadata["type"],
        tags: [],
      }), // empty type should be skipped
    ];

    const { container, callbacks } = setupSidebar({
      filters,
      feeds,
      activeSection: "types",
    });

    const findTypeRow = (type: string) =>
      Array.from(container.querySelectorAll(".rss-discover-type-item")).find(
        (el) => {
          const label = el.querySelector("label");
          return label?.textContent === type;
        },
      ) as HTMLElement | undefined;

    expect(findTypeRow("")).toBeFalsy();

    const newsCheckbox = findTypeRow("News")!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    const podcastCheckbox = findTypeRow("Podcast")!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    expect(newsCheckbox.checked).toBe(true);
    expect(podcastCheckbox.checked).toBe(false);

    podcastCheckbox.checked = true;
    podcastCheckbox.dispatchEvent(new Event("change"));
    expect(filters.selectedTypes).toContain("Podcast");

    newsCheckbox.checked = false;
    newsCheckbox.dispatchEvent(new Event("change"));
    expect(filters.selectedTypes).not.toContain("News");

    // Switch to Tags and toggle one
    const tagsButtons = Array.from(
      container.querySelectorAll(".rss-discover-sidebar-nav button"),
    );
    tagsButtons
      .find((b): b is HTMLButtonElement => b.textContent === "Tags")!
      .click();

    const findTagRow = (tag: string) =>
      Array.from(container.querySelectorAll(".rss-discover-tag-item")).find(
        (el) => {
          const label = el.querySelector("label");
          return label?.textContent === tag;
        },
      ) as HTMLElement | undefined;

    const tagB = findTagRow("tag-b")!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    const tagA = findTagRow("tag-a")!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    expect(tagB.checked).toBe(true);
    expect(tagA.checked).toBe(false);

    tagA.checked = true;
    tagA.dispatchEvent(new Event("change"));
    expect(filters.selectedTags).toContain("tag-a");

    expect(callbacks.onFilterChange).toHaveBeenCalled();
  });

  it("renders category tree; supports selection and expand/collapse", () => {
    const filters = createFilters({
      selectedPaths: [{ domain: "Tech", subdomain: "AI" }],
    });
    const feeds = [
      createFeed({
        id: "u",
        domain: [],
        subdomain: [],
        area: [],
        topic: [],
        type: "News",
      }),
      createFeed({
        id: "t1",
        domain: ["Tech"],
        subdomain: ["AI"],
        area: ["ML"],
        topic: ["LLM"],
        type: "News",
      }),
    ];

    const { container, callbacks } = setupSidebar({
      filters,
      feeds,
      activeSection: "categories",
    });

    const findCategoryItem = (labelText: string) =>
      Array.from(
        container.querySelectorAll(".rss-discover-category-item"),
      ).find((item) => {
        const label = item.querySelector(".rss-discover-category-main label");
        return label?.textContent === labelText;
      }) as HTMLElement | undefined;

    const techItem = findCategoryItem("Tech")!;
    const techExpand = techItem.querySelector(
      ".rss-discover-category-expand",
    ) as HTMLElement;
    expect(lucideIconId(techExpand)).toBe("chevron-right");

    const techChildren = techItem.querySelector(
      ".rss-discover-category-children",
    ) as HTMLElement;
    expect(techChildren.classList.contains("rss-collapsed")).toBe(true);

    techExpand.click();
    expect(techChildren.classList.contains("rss-collapsed")).toBe(false);
    expect(lucideIconId(techExpand)).toBe("chevron-down");

    techExpand.click();
    expect(techChildren.classList.contains("rss-collapsed")).toBe(true);
    expect(lucideIconId(techExpand)).toBe("chevron-right");

    const aiItem = findCategoryItem("AI")!;
    const aiCheckbox = aiItem.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(aiCheckbox.checked).toBe(true);

    const uncategorizedItem = findCategoryItem("Uncategorized")!;
    const uncategorizedCheckbox = uncategorizedItem.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(uncategorizedCheckbox.checked).toBe(false);

    uncategorizedCheckbox.checked = true;
    uncategorizedCheckbox.dispatchEvent(new Event("change"));
    expect(filters.selectedPaths).toContainEqual({ domain: "Uncategorized" });

    uncategorizedCheckbox.checked = false;
    uncategorizedCheckbox.dispatchEvent(new Event("change"));
    expect(filters.selectedPaths).not.toContainEqual({
      domain: "Uncategorized",
    });

    expect(callbacks.onFilterChange).toHaveBeenCalled();
  });

  it("toggles a type filter when the row's text is clicked", () => {
    const filters = createFilters();
    const feeds = [
      createFeed({ id: "n", type: "News" }),
      createFeed({ id: "p", type: "Podcast" }),
    ];

    const { container, callbacks } = setupSidebar({
      filters,
      feeds,
      activeSection: "types",
    });

    const findTypeRow = (type: string) =>
      Array.from(container.querySelectorAll(".rss-discover-type-item")).find(
        (el) => el.querySelector("label")?.textContent === type,
      ) as HTMLElement | undefined;

    const newsRow = findTypeRow("News")!;
    const newsLabel = newsRow.querySelector("label") as HTMLLabelElement;
    const newsCheckbox = newsRow.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    newsLabel.click();

    expect(filters.selectedTypes).toEqual(["News"]);
    expect(newsCheckbox.checked).toBe(true);
    expect(callbacks.onFilterChange).toHaveBeenCalledTimes(1);

    newsLabel.click();

    expect(filters.selectedTypes).toEqual([]);
    expect(newsCheckbox.checked).toBe(false);
  });

  it("toggles a tag filter when the row's text is clicked", () => {
    const filters = createFilters();
    const feeds = [
      createFeed({ id: "a", tags: ["ai"] }),
      createFeed({ id: "b", tags: ["web"] }),
    ];

    const { container } = setupSidebar({
      filters,
      feeds,
      activeSection: "tags",
    });

    const findTagRow = (tag: string) =>
      Array.from(container.querySelectorAll(".rss-discover-tag-item")).find(
        (el) => el.querySelector("label")?.textContent === tag,
      ) as HTMLElement | undefined;

    const aiLabel = findTagRow("ai")!.querySelector(
      "label",
    ) as HTMLLabelElement;

    aiLabel.click();

    expect(filters.selectedTags).toEqual(["ai"]);
  });

  it("toggles a leaf category when the row's text is clicked", () => {
    const filters = createFilters();
    const feeds = [
      createFeed({ id: "u", domain: [] }),
      createFeed({ id: "t", domain: ["Tech"], subdomain: ["AI"] }),
    ];

    const { container } = setupSidebar({
      filters,
      feeds,
      activeSection: "categories",
    });

    const findCategoryItem = (labelText: string) =>
      Array.from(
        container.querySelectorAll(".rss-discover-category-item"),
      ).find(
        (item) =>
          item.querySelector(".rss-discover-category-main label")
            ?.textContent === labelText,
      ) as HTMLElement | undefined;

    const aiItem = findCategoryItem("AI")!;
    expect(aiItem.querySelector(".rss-discover-category-children")).toBeNull();
    const aiLabel = aiItem.querySelector(
      ".rss-discover-category-main label",
    ) as HTMLLabelElement;

    aiLabel.click();

    expect(filters.selectedPaths).toContainEqual({
      domain: "Tech",
      subdomain: "AI",
    });
  });

  it("expands a parent category when the row's text is clicked, without selecting it", () => {
    const filters = createFilters();
    const feeds = [
      createFeed({ id: "t", domain: ["Tech"], subdomain: ["AI"] }),
    ];

    const { container } = setupSidebar({
      filters,
      feeds,
      activeSection: "categories",
    });

    const techItem = container.querySelector(
      ".rss-discover-category-item",
    ) as HTMLElement;
    const techLabel = techItem.querySelector(
      ".rss-discover-category-main label",
    ) as HTMLLabelElement;
    const techChildren = techItem.querySelector(
      ".rss-discover-category-children",
    ) as HTMLElement;
    const techCheckbox = techItem.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    expect(techLabel.textContent).toBe("Tech");
    expect(techChildren.classList.contains("rss-collapsed")).toBe(true);

    techLabel.click();

    expect(techChildren.classList.contains("rss-collapsed")).toBe(false);
    expect(filters.selectedPaths).toEqual([]);
    expect(techCheckbox.checked).toBe(false);
  });

  it("expands a parent category when its count badge is clicked", () => {
    const filters = createFilters();
    const feeds = [
      createFeed({ id: "t", domain: ["Tech"], subdomain: ["AI"] }),
    ];

    const { container } = setupSidebar({
      filters,
      feeds,
      activeSection: "categories",
    });

    const techItem = container.querySelector(
      ".rss-discover-category-item",
    ) as HTMLElement;
    const techCount = techItem.querySelector(
      ".rss-discover-category-count",
    ) as HTMLElement;
    const techChildren = techItem.querySelector(
      ".rss-discover-category-children",
    ) as HTMLElement;

    techCount.click();

    expect(techChildren.classList.contains("rss-collapsed")).toBe(false);
    expect(filters.selectedPaths).toEqual([]);
  });

  it("selects a parent category from its checkbox without expanding it", () => {
    const filters = createFilters();
    const feeds = [
      createFeed({ id: "t", domain: ["Tech"], subdomain: ["AI"] }),
    ];

    const { container, callbacks } = setupSidebar({
      filters,
      feeds,
      activeSection: "categories",
    });

    const techItem = container.querySelector(
      ".rss-discover-category-item",
    ) as HTMLElement;
    const techCheckbox = techItem.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    const techChildren = techItem.querySelector(
      ".rss-discover-category-children",
    ) as HTMLElement;

    techCheckbox.click();
    techCheckbox.dispatchEvent(new Event("change"));

    expect(filters.selectedPaths).toEqual([{ domain: "Tech" }]);
    expect(techCheckbox.checked).toBe(true);
    expect(techChildren.classList.contains("rss-collapsed")).toBe(true);
    expect(callbacks.onFilterChange).toHaveBeenCalledTimes(1);
  });

  it("toggles a filter exactly once when the checkbox itself is clicked", () => {
    const filters = createFilters();
    const feeds = [createFeed({ id: "n", type: "News" })];

    const { container, callbacks } = setupSidebar({
      filters,
      feeds,
      activeSection: "types",
    });

    const newsCheckbox = container.querySelector(
      '.rss-discover-type-item input[type="checkbox"]',
    ) as HTMLInputElement;

    // jsdom toggles `checked` on click but fires no `change`; a browser fires
    // both, so send both to model the real activation and prove the row's
    // checkbox guard does not toggle a second time.
    newsCheckbox.click();
    newsCheckbox.dispatchEvent(new Event("change"));

    expect(filters.selectedTypes).toEqual(["News"]);
    expect(newsCheckbox.checked).toBe(true);
    expect(callbacks.onFilterChange).toHaveBeenCalledTimes(1);
  });

  it("toggles a type filter when the row's count badge is clicked", () => {
    const filters = createFilters();
    const feeds = [createFeed({ id: "n", type: "News" })];

    const { container } = setupSidebar({
      filters,
      feeds,
      activeSection: "types",
    });

    const newsRow = container.querySelector(
      ".rss-discover-type-item",
    ) as HTMLElement;
    const newsCount = newsRow.querySelector(
      ".rss-discover-type-count",
    ) as HTMLElement;

    newsCount.click();

    expect(filters.selectedTypes).toEqual(["News"]);
  });

  it("toggles a leaf category when its count badge is clicked", () => {
    const filters = createFilters();
    const feeds = [createFeed({ id: "u", domain: [] })];

    const { container } = setupSidebar({
      filters,
      feeds,
      activeSection: "categories",
    });

    const uncategorized = container.querySelector(
      ".rss-discover-category-item",
    ) as HTMLElement;
    expect(uncategorized.querySelector("label")?.textContent).toBe(
      "Uncategorized",
    );
    const count = uncategorized.querySelector(
      ".rss-discover-category-count",
    ) as HTMLElement;

    count.click();

    expect(filters.selectedPaths).toContainEqual({ domain: "Uncategorized" });
  });
});
