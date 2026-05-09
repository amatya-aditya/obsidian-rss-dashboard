import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAutomaticArticleTags,
  showEditTagModal,
  updateTagInSettings,
  withSavedTagName,
} from "../../../src/utils/tag-utils";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type TestTag = { name: string; color?: string };

function makeSettings(tags: TestTag[]): any {
  return {
    availableTags: [...tags],
    feeds: [
      {
        items: [
          { title: "a", tags: [{ name: tags[0].name, color: tags[0].color }] },
          { title: "b", tags: [{ name: "other" }] },
          { title: "c" },
        ],
      },
    ],
  };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("tag-utils.updateTagInSettings", () => {
  it("updates availableTags and cascades changes into feed item tags", () => {
    const oldTag: TestTag = { name: "Tech", color: "#111111" };
    const settings = makeSettings([oldTag, { name: "News", color: "#222222" }]);

    const updated = updateTagInSettings(
      settings,
      oldTag as any,
      {
        name: "Technology",
        color: "#abcdef",
      } as any,
    );

    expect(updated).toEqual([
      { name: "Technology", color: "#abcdef" },
      { name: "News", color: "#222222" },
    ]);

    // Mutates settings.availableTags in-place (live reference).
    expect(settings.availableTags).toEqual(updated);

    expect(settings.feeds[0].items[0].tags).toEqual([
      { name: "Technology", color: "#abcdef" },
    ]);
    expect(settings.feeds[0].items[1].tags).toEqual([{ name: "other" }]);
    expect(settings.feeds[0].items[2].tags).toBeUndefined();
  });
});

describe("tag-utils.showEditTagModal", () => {
  it("validates empty and duplicate names, then saves and closes", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const settings = makeSettings([
      { name: "Tech", color: "#111111" },
      { name: "News", color: "#222222" },
    ]);
    const tag = settings.availableTags[0];

    const onSave = vi.fn().mockResolvedValue(undefined);
    showEditTagModal({ settings, tag, onSave });

    const modal = document.querySelector(
      ".rss-dashboard-modal",
    ) as HTMLElement | null;
    expect(modal).not.toBeNull();

    const nameInput = document.querySelector(
      ".rss-dashboard-tag-modal-name-input",
    ) as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();

    const saveButton = document.querySelector(
      "button.rss-dashboard-primary-button",
    ) as HTMLButtonElement | null;
    expect(saveButton).not.toBeNull();

    // Empty name
    nameInput!.value = "   ";
    saveButton!.click();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Please enter a tag name!",
    );
    expect(document.querySelector(".rss-dashboard-modal")).not.toBeNull();

    // Duplicate (case-insensitive, and not same tag ref)
    nameInput!.value = "news";
    saveButton!.click();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "A tag with this name already exists!",
    );
    expect(document.querySelector(".rss-dashboard-modal")).not.toBeNull();

    // Success
    nameInput!.value = "Technology";
    saveButton!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(settings.availableTags[0].name).toBe("Technology");
    expect(settings.feeds[0].items[0].tags[0].name).toBe("Technology");
    expect(document.querySelector(".rss-dashboard-modal")).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Tag "Technology" updated successfully!',
    );
  });
});

describe("tag-utils.applyAutomaticArticleTags", () => {
  it("adds a canonical Favorite tag when an article is starred", () => {
    const article = {
      starred: false,
      tags: [{ name: "news", color: "#111111" }],
    } as any;

    const updates = applyAutomaticArticleTags(article, { starred: true }, {
      availableTags: [{ name: "Favorite", color: "#f1c40f" }],
      articleSaving: { addSavedTag: true },
    } as any);

    expect(updates.tags).toEqual([
      { name: "news", color: "#111111" },
      { name: "Favorite", color: "#f1c40f" },
    ]);
  });

  it("removes the canonical Favorite tag when an article is unstarred", () => {
    const article = {
      starred: true,
      tags: [
        { name: "Favorite", color: "#f1c40f" },
        { name: "news", color: "#111111" },
      ],
    } as any;

    const updates = applyAutomaticArticleTags(article, { starred: false }, {
      availableTags: [{ name: "Favorite", color: "#f1c40f" }],
      articleSaving: { addSavedTag: true },
    } as any);

    expect(updates.tags).toEqual([{ name: "news", color: "#111111" }]);
  });

  it("normalizes an existing lowercase saved tag when saving", () => {
    const article = {
      saved: false,
      tags: [{ name: "saved", color: "#123456" }],
    } as any;

    const updates = applyAutomaticArticleTags(article, { saved: true }, {
      availableTags: [],
      articleSaving: { addSavedTag: true },
    } as any);

    expect(updates.tags).toEqual([{ name: "Saved", color: "#123456" }]);
  });
});

describe("tag-utils.withSavedTagName", () => {
  it("appends Saved when missing and normalizes lowercase variants", () => {
    expect(withSavedTagName(["tech"])).toEqual(["tech", "Saved"]);
    expect(withSavedTagName(["tech", "saved"])).toEqual(["tech", "Saved"]);
  });
});
