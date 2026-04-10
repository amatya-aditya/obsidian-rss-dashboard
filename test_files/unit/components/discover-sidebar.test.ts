import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { DiscoverSidebar } from "../../../src/components/discover-sidebar";
import type {
  DiscoverFilters,
  FeedMetadata,
} from "../../../src/types/discover-types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

vi.mock("../../../src/utils/platform-utils", () => ({
  attachInputClearButton: (
    wrapper: HTMLElement,
    _input: HTMLInputElement,
    onClear: () => void,
  ) => {
    const button = wrapper.createEl("button", { text: "Clear" });
    button.addClass("rss-test-clear-button");
    button.addEventListener("click", () => onClear());
  },
}));

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
  onCloseMobileSidebar?: () => void;
}) {
  const app = new App();
  const container = document.body.createDiv();

  const callbacks = {
    onFilterChange: vi.fn(),
    onActivateView: vi.fn(),
    onActivateDiscoverView: vi.fn(),
    onActivateSmallwebView: vi.fn(),
    onCloseMobileSidebar: opts?.onCloseMobileSidebar,
  };

  const filters = opts?.filters ?? createFilters();
  const feeds = opts?.feeds ?? [];

  const sidebar = new DiscoverSidebar(
    app,
    container,
    {} as any,
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
      ) as HTMLButtonElement | undefined;

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

    const clearBtn = container.querySelector(
      ".rss-test-clear-button",
    ) as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    expect(filters.query).toBe("");
    expect(callbacks.onFilterChange).toHaveBeenCalledTimes(2);
  });

  it("fires header callbacks for Return Home and Kagi Smallweb with click + keyboard parity", () => {
    const onCloseMobileSidebar = vi.fn();
    const { container, callbacks } = setupSidebar({ onCloseMobileSidebar });

    const returnHome = container.querySelector(
      ".rss-discover-return-home",
    ) as HTMLElement;
    expect(returnHome).toBeTruthy();
    expect(returnHome.dataset.icon).toBe("arrow-left");
    expect(returnHome.getAttribute("role")).toBe("button");
    expect(returnHome.getAttribute("tabindex")).toBe("0");

    returnHome.click();
    expect(callbacks.onActivateView).toHaveBeenCalledTimes(1);

    returnHome.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(callbacks.onActivateView).toHaveBeenCalledTimes(2);

    returnHome.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(callbacks.onActivateView).toHaveBeenCalledTimes(3);

    const smallweb = container.querySelector(
      ".rss-discover-smallweb-button",
    ) as HTMLElement;
    expect(smallweb).toBeTruthy();
    expect(smallweb.dataset.icon).toBe("sparkles");
    expect(smallweb.textContent).toContain("Kagi");
    expect(smallweb.getAttribute("role")).toBe("button");
    expect(smallweb.getAttribute("tabindex")).toBe("0");

    smallweb.click();
    expect(callbacks.onActivateSmallwebView).toHaveBeenCalledTimes(1);

    smallweb.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(callbacks.onActivateSmallwebView).toHaveBeenCalledTimes(2);

    smallweb.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(callbacks.onActivateSmallwebView).toHaveBeenCalledTimes(3);

    const closeBtn = container.querySelector(
      ".rss-dashboard-header-close-button",
    ) as HTMLElement;
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.dataset.icon).toBe("panel-left-close");
    closeBtn.click();
    expect(onCloseMobileSidebar).toHaveBeenCalledTimes(1);

    // When callback is absent, close button should not render.
    document.body.empty();
    const noClose = setupSidebar();
    expect(
      noClose.container.querySelector(".rss-dashboard-header-close-button"),
    ).toBeFalsy();
  });

  it("toggles type and tag selections and calls onFilterChange()", () => {
    const filters = createFilters({
      selectedTypes: ["News"],
      selectedTags: ["tag-b"],
    });
    const feeds = [
      createFeed({ id: "n", type: "News", tags: ["tag-a", "tag-b"] }),
      createFeed({ id: "p", type: "Podcast", tags: ["tag-b"] }),
      createFeed({ id: "e", type: "" as any, tags: [] }), // empty type should be skipped
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
    (
      Array.from(
        container.querySelectorAll(".rss-discover-sidebar-nav button"),
      ) as HTMLButtonElement[]
    )
      .find((b) => b.textContent === "Tags")!
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
    expect(techExpand.dataset.icon).toBe("chevron-right");

    const techChildren = techItem.querySelector(
      ".rss-discover-category-children",
    ) as HTMLElement;
    expect(techChildren.classList.contains("rss-collapsed")).toBe(true);

    techExpand.click();
    expect(techChildren.classList.contains("rss-collapsed")).toBe(false);
    expect(techExpand.dataset.icon).toBe("chevron-down");

    techExpand.click();
    expect(techChildren.classList.contains("rss-collapsed")).toBe(true);
    expect(techExpand.dataset.icon).toBe("chevron-right");

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
});
