import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { DiscoverSidebar } from "../../../src/components/discover-sidebar";
import type {
  DiscoverFilters,
  FeedMetadata,
} from "../../../src/types/discover-types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// WCAG 2.2 4.1.2 / 1.3.1 (audit V-001): every Discover filter checkbox must be
// announced by its visible label, not as an unnamed "checkbox".

type TestPlugin = ConstructorParameters<typeof DiscoverSidebar>[2];
type Section = "types" | "categories" | "tags";

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
  };
}

const FEEDS: FeedMetadata[] = [
  createFeed({
    id: "a",
    type: "News",
    tags: ["AI", "Open source"],
    domain: ["Tech"],
    subdomain: ["AI"],
    area: ["ML"],
    topic: ["LLM"],
  }),
  createFeed({ id: "b", type: "Podcast", tags: ["AI"], domain: ["Science"] }),
  createFeed({ id: "c", type: "Blog", tags: [] }),
];

function renderSidebar(activeSection: Section): HTMLElement {
  const container = createDiv();
  const filters: DiscoverFilters = {
    query: "",
    selectedTypes: [],
    selectedPaths: [],
    selectedTags: [],
    followStatus: "all",
  };
  const sidebar = new DiscoverSidebar(
    new App(),
    container,
    {} as unknown as TestPlugin,
    filters,
    FEEDS,
    activeSection,
    {
      onFilterChange: vi.fn(),
      onActivateView: vi.fn(),
      onActivateDiscoverView: vi.fn(),
      onActivateSmallwebView: vi.fn(),
    },
  );
  sidebar.render();
  return container;
}

/**
 * Minimal accessible-name computation for a checkbox, following the order
 * assistive technology uses: aria-labelledby, then aria-label, then an
 * associated <label>. jsdom ships no accessibility tree, so this stands in
 * for the browser's.
 */
function accessibleName(input: HTMLInputElement): string {
  const root = input.ownerDocument;
  const labelledBy = input.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => root.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  const ariaLabel = input.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  return Array.from(input.labels ?? [])
    .map((label) => label.textContent ?? "")
    .join(" ")
    .trim();
}

function checkboxes(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
}

/** The <label> shown beside a checkbox in the same row. */
function rowLabel(
  input: HTMLInputElement,
): HTMLLabelElement | null | undefined {
  return input.parentElement?.querySelector("label");
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
});

describe("DiscoverSidebar filter checkbox accessible names", () => {
  it.each<[Section, string[]]>([
    ["types", ["News", "Podcast", "Blog"]],
    ["tags", ["AI", "Open source"]],
    ["categories", ["AI", "LLM", "ML", "Science", "Tech", "Uncategorized"]],
  ])("names every %s checkbox from its visible label", (section, expected) => {
    const container = renderSidebar(section);
    document.body.appendChild(container);

    const inputs = checkboxes(container);
    expect(inputs.map(accessibleName).sort()).toEqual([...expected].sort());
    for (const input of inputs) {
      expect(accessibleName(input)).toBe(rowLabel(input)?.textContent);
    }
  });

  it("keeps each name pointed at its own row when two sidebars share a document", () => {
    // The Discover view and the mobile filters dialog can be open together.
    const first = renderSidebar("tags");
    const second = renderSidebar("tags");
    document.body.append(first, second);

    for (const container of [first, second]) {
      for (const input of checkboxes(container)) {
        const target = document.getElementById(
          input.getAttribute("aria-labelledby") ?? "",
        );
        expect(target).toBe(rowLabel(input));
      }
    }
  });

  it("leaves each checkbox and its label as siblings in the same row", () => {
    const container = renderSidebar("types");

    for (const input of checkboxes(container)) {
      expect(input.closest("label")).toBeNull();
      expect(input.nextElementSibling).toBe(rowLabel(input));
    }
  });
});
