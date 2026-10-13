import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEMPLATE_VARIABLES } from "../../../src/services/article-template/template-variables";
import {
  TEMPLATE_VARIABLE_HELP_GROUPS,
  renderTemplateVariableHelp,
} from "../../../src/settings/template-variable-help";

const EXPECTED_GROUPS: Record<string, string[]> = {
  "Article dates": [
    "date",
    "dateShort",
    "date:YYYY/MM/DD",
    "isoDate",
    "isoDateTime",
  ],
  "First-seen dates": ["firstSeen", "firstSeenISO"],
  "Save date and time": ["saveDate", "saveTime12", "saveTime24"],
  "Article and feed details": [
    "title",
    "author",
    "feedTitle",
    "source",
    "guid",
    "tags",
    "language",
  ],
  Content: ["summary", "description", "excerpt", "content"],
  "Links and media": ["link", "image"],
};

const DATE_EXAMPLES = [
  "{{date:DD/MM/YYYY}}",
  "{{date:MM-DD-YYYY}}",
  "{{date:YYYY-MM-DD HH:mm}}",
  "{{date:D MMMM YYYY}}",
];

describe("renderTemplateVariableHelp", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
    renderTemplateVariableHelp(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("shows the six groups in order, each an h4 followed by a list", () => {
    const headings = Array.from(container.querySelectorAll("h4"));
    expect(headings.map((h) => h.textContent)).toEqual(
      Object.keys(EXPECTED_GROUPS),
    );
    for (const heading of headings) {
      expect(heading.nextElementSibling?.tagName).toBe("UL");
    }
  });

  it("places each variable in its group, in code", () => {
    for (const heading of Array.from(container.querySelectorAll("h4"))) {
      const names = Array.from(
        heading.nextElementSibling?.querySelectorAll(
          "li > button:first-child > code",
        ) ?? [],
      ).map((code) => code.textContent);
      expect(names).toEqual(
        EXPECTED_GROUPS[heading.textContent ?? ""]?.map((n) => `{{${n}}}`),
      );
    }
  });

  it("documents every supported variable exactly once", () => {
    const names = Array.from(
      container.querySelectorAll("li > button:first-child > code"),
    ).map((code) => code.textContent);
    const expected = [
      ...Object.keys(TEMPLATE_VARIABLES),
      "content",
      "date:YYYY/MM/DD",
    ].map((n) => `{{${n}}}`);
    expect([...names].sort()).toEqual([...expected].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it("distinguishes similar variables", () => {
    const text = (name: string) =>
      Array.from(container.querySelectorAll("li")).find(
        (li) => li.querySelector("code")?.textContent === `{{${name}}}`,
      )?.textContent ?? "";
    expect(text("isoDateTime")).toContain(
      "same full ISO 8601 timestamp as {{isoDate}}",
    );
    expect(text("author")).toContain("joined with a comma and a space");
    expect(text("date")).toContain(
      "other formats of this same article timestamp",
    );
    expect(text("date")).toContain("is the save date instead");
    expect(text("isoDate")).not.toContain("this one timestamp");
    expect(text("dateShort")).not.toContain("Derived");
    expect(text("firstSeen")).toContain(
      "Not derived from the article timestamp",
    );
    expect(text("saveDate")).toContain("independent of the article timestamp");
    expect(text("source")).toContain("same value as {{feedTitle}}");
    expect(text("tags")).toContain("tags: [{{tags}}]");
    expect(text("language")).toContain("left out when the language is unknown");
    expect(text("content")).toContain("Save full content");
  });

  describe("copy chips", () => {
    const leading = (): HTMLButtonElement[] =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>("li > button"),
      ).filter((b) => b.parentElement?.firstElementChild === b);
    const allChips = (): HTMLButtonElement[] =>
      Array.from(container.querySelectorAll<HTMLButtonElement>("li button"));
    const chipFor = (label: string, index = 0): HTMLButtonElement =>
      allChips().filter((b) => b.textContent === label)[index];

    let writeText: ReturnType<typeof vi.fn>;
    let debug: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    });

    afterEach(() => {
      debug.mockRestore();
    });

    const flush = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    it("renders each leading placeholder as a button wrapping a code, named Copy <value>", () => {
      const buttons = leading();
      expect(buttons).toHaveLength(23);
      for (const button of buttons) {
        expect(button.tagName).toBe("BUTTON");
        expect(button.getAttribute("type")).toBe("button");
        expect(button.firstElementChild?.tagName).toBe("CODE");
        expect(button.getAttribute("aria-label")).toBe(
          `Copy ${button.textContent}`,
        );
      }
    });

    it("copies each leading placeholder, including the {{date:YYYY/MM/DD}} entry", async () => {
      leading()
        .find((b) => b.textContent === "{{title}}")
        ?.click();
      await flush();
      expect(writeText).toHaveBeenLastCalledWith("{{title}}");
      leading()
        .find((b) => b.textContent === "{{date:YYYY/MM/DD}}")
        ?.click();
      await flush();
      expect(writeText).toHaveBeenLastCalledWith("{{date:YYYY/MM/DD}}");
    });

    it("turns every {{...}} in every description into exactly one chip", () => {
      for (const group of TEMPLATE_VARIABLE_HELP_GROUPS) {
        for (const variable of group.variables) {
          const li = Array.from(container.querySelectorAll("li")).find(
            (item) =>
              item.firstElementChild?.textContent === `{{${variable.name}}}`,
          );
          const inline = Array.from(li?.querySelectorAll("button") ?? []).slice(
            1,
          );
          const tokens = variable.description.match(/\{\{[^{}]+\}\}/g) ?? [];
          expect(inline).toHaveLength(tokens.length);
          expect(li?.textContent).toBe(
            `{{${variable.name}}} — ${variable.description}`,
          );
        }
      }
    });

    it("copies the tags example whole and other inline chips as their own token", async () => {
      const tagsExample = chipFor("tags: [{{tags}}]");
      expect(tagsExample).toBeDefined();
      expect(tagsExample.querySelector("code")?.textContent).toBe(
        "tags: [{{tags}}]",
      );
      tagsExample.click();
      await flush();
      expect(writeText).toHaveBeenLastCalledWith("tags: [{{tags}}]");

      for (const example of DATE_EXAMPLES) {
        const chip = chipFor(example);
        expect(chip.hasAttribute("tabindex")).toBe(false);
        chip.click();
        await flush();
        expect(writeText).toHaveBeenLastCalledWith(example);
      }

      const dupe = chipFor("{{isoDate}}", 1);
      dupe.click();
      await flush();
      expect(writeText).toHaveBeenLastCalledWith("{{isoDate}}");
    });

    it("keeps the 12 repeated inline chips out of the tab order only", () => {
      const skipped = allChips().filter(
        (b) => b.getAttribute("tabindex") === "-1",
      );
      expect(skipped).toHaveLength(12);
      for (const button of skipped) {
        expect(leading()).not.toContain(button);
      }
      for (const button of leading()) {
        expect(button.hasAttribute("tabindex")).toBe(false);
      }
      expect(chipFor("tags: [{{tags}}]").hasAttribute("tabindex")).toBe(false);
      for (const example of DATE_EXAMPLES) {
        expect(chipFor(example).hasAttribute("tabindex")).toBe(false);
      }
      expect(allChips().filter((b) => b.tabIndex !== -1)).toHaveLength(28);
    });

    it("makes the inline {{date:YYYY/MM/DD}} in the {{date}} description a skipped duplicate", () => {
      const dateItem = Array.from(container.querySelectorAll("li")).find(
        (item) => item.firstElementChild?.textContent === "{{date}}",
      );
      const inline = Array.from(dateItem?.querySelectorAll("button") ?? [])
        .slice(1)
        .find((b) => b.textContent === "{{date:YYYY/MM/DD}}");
      expect(inline?.getAttribute("tabindex")).toBe("-1");
      expect(inline?.classList.contains("is-inline")).toBe(true);
    });

    it("never mentions {{date:FORMAT}}", () => {
      expect(container.textContent).not.toContain("date:FORMAT");
    });

    it("announces Copied <value> on success", async () => {
      chipFor("{{link}}").click();
      await flush();
      expect(debug).toHaveBeenCalledWith("[Stub Notice]", "Copied {{link}}");
    });

    it("announces Couldn't copy <value> on failure", async () => {
      writeText.mockRejectedValue(new Error("denied"));
      chipFor("{{link}}").click();
      await flush();
      expect(debug).toHaveBeenCalledWith(
        "[Stub Notice]",
        "Couldn't copy {{link}}",
      );
    });
  });
});
