import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAutomaticArticleTags,
  getFolderAutoTags,
  resolveArticleTags,
  showEditTagModal,
  updateTagInSettings,
  withSavedTagName,
} from "../../../src/utils/tag-utils";
import {
  FeedItem,
  Folder,
  RssDashboardSettings,
  Tag,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type TestTag = { name: string; color?: string };

function makeSettings(tags: TestTag[]): RssDashboardSettings {
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
  } as unknown as RssDashboardSettings;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  interface ObsidianElement extends HTMLElement {
    empty(): void;
  }
  (document.body as unknown as ObsidianElement).empty();
  vi.restoreAllMocks();
});

describe("tag-utils.updateTagInSettings", () => {
  it("updates availableTags and cascades changes into feed item tags", () => {
    const oldTag: TestTag = { name: "Tech", color: "#111111" };
    const settings = makeSettings([oldTag, { name: "News", color: "#222222" }]);

    const updated = updateTagInSettings(
      settings,
      oldTag as unknown as Tag,
      {
        name: "Technology",
        color: "#abcdef",
      } as unknown as Tag,
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
    const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const settings = makeSettings([
      { name: "Tech", color: "#111111" },
      { name: "News", color: "#222222" },
    ]);
    const tag = settings.availableTags[0];

    const onSave = vi.fn().mockResolvedValue(undefined);
    showEditTagModal({ settings, tag, onSave });

    const modal = document.querySelector<HTMLElement>(
      ".rss-dashboard-modal",
    );
    expect(modal).not.toBeNull();

    const nameInput = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-name-input",
    );
    expect(nameInput).not.toBeNull();

    const saveButton = document.querySelector<HTMLButtonElement>(
      "button.rss-dashboard-primary-button",
    );
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
    expect(settings.feeds[0].items[0].tags?.[0].name).toBe("Technology");
    expect(document.querySelector(".rss-dashboard-modal")).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Tag "Technology" updated successfully!',
    );
  });
});

describe("tag-utils.showEditTagModal submit button", () => {
  it("reads 'Save changes' and hands the updated tag to onSave", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const settings = makeSettings([{ name: "Tech", color: "#111111" }]);
    const onSave = vi.fn().mockResolvedValue(undefined);
    showEditTagModal({ settings, tag: settings.availableTags[0], onSave });

    const saveButton = document.querySelector<HTMLButtonElement>(
      "button.rss-dashboard-primary-button",
    )!;
    expect(saveButton.textContent).toBe("Save changes");

    document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-color-picker",
    )!.value = "#00ff00";
    saveButton.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(onSave).toHaveBeenCalledWith({ name: "Tech", color: "#00ff00" });
  });
});

describe("tag-utils.applyAutomaticArticleTags", () => {
  it("starring an article leaves its tags unchanged", () => {
    const article = {
      starred: false,
      tags: [{ name: "news", color: "#111111" }],
    };

    const updates = applyAutomaticArticleTags(article as unknown as FeedItem, { starred: true }, {
      availableTags: [{ name: "Favorite", color: "#f1c40f" }],
      articleSaving: { addSavedTag: true },
    } as unknown as RssDashboardSettings);

    expect(updates).toEqual({ starred: true });
  });

  it("unstarring an article leaves a manually assigned Favorite tag unchanged", () => {
    const article = {
      starred: true,
      tags: [
        { name: "Favorite", color: "#f1c40f" },
        { name: "news", color: "#111111" },
      ],
    };

    const updates = applyAutomaticArticleTags(article as unknown as FeedItem, { starred: false }, {
      availableTags: [{ name: "Favorite", color: "#f1c40f" }],
      articleSaving: { addSavedTag: true },
    } as unknown as RssDashboardSettings);

    expect(updates).toEqual({ starred: false });
  });

  it("starring an article leaves tags unchanged even without any prior tags", () => {
    const article = { starred: false };

    const updates = applyAutomaticArticleTags(article as unknown as FeedItem, { starred: true }, {
      availableTags: [],
      articleSaving: { addSavedTag: true },
    } as unknown as RssDashboardSettings);

    expect(updates).toEqual({ starred: true });
  });

  it("adding a Favorite tag directly leaves starred state untouched", () => {
    const article = {
      starred: false,
      tags: [],
    };

    const updates = applyAutomaticArticleTags(
      article as unknown as FeedItem,
      { tags: [{ name: "Favorite", color: "#f1c40f" }] },
      {
        availableTags: [{ name: "Favorite", color: "#f1c40f" }],
        articleSaving: { addSavedTag: true },
      } as unknown as RssDashboardSettings,
    );

    expect(updates.starred).toBeUndefined();
    expect(updates.tags).toEqual([{ name: "Favorite", color: "#f1c40f" }]);
  });

  it("normalizes an existing lowercase saved tag when saving", () => {
    const article = {
      saved: false,
      tags: [{ name: "saved", color: "#123456" }],
    };

    const updates = applyAutomaticArticleTags(article as unknown as FeedItem, { saved: true }, {
      availableTags: [],
      articleSaving: { addSavedTag: true },
    } as unknown as RssDashboardSettings);

    expect(updates.tags).toEqual([{ name: "Saved", color: "#123456" }]);
  });
});

describe("tag-utils.withSavedTagName", () => {
  it("appends Saved when missing and normalizes lowercase variants", () => {
    expect(withSavedTagName(["tech"])).toEqual(["tech", "Saved"]);
    expect(withSavedTagName(["tech", "saved"])).toEqual(["tech", "Saved"]);
  });
});

describe("tag-utils folder auto-tag resolution", () => {
  const folders: Folder[] = [
    {
      name: "Technology",
      autoTags: [
        { name: "Topic", color: "#111111" },
        { name: "Tech", color: "#222222" },
      ],
      subfolders: [
        {
          name: "Web",
          autoTags: [
            { name: "Topic", color: "#333333" },
            { name: "JavaScript", color: "#444444" },
          ],
          subfolders: [
            {
              name: "React",
              autoTags: [{ name: "React", color: "#555555" }],
              subfolders: [],
            },
          ],
        },
      ],
    },
  ];

  it("collects folder auto-tags from ancestors through the selected folder", () => {
    expect(getFolderAutoTags("Technology/Web/React", folders)).toEqual([
      { name: "Topic", color: "#333333" },
      { name: "Tech", color: "#222222" },
      { name: "JavaScript", color: "#444444" },
      { name: "React", color: "#555555" },
    ]);
  });

  it("resolves media, folder, feed, and article tags with later scopes winning", () => {
    const resolved = resolveArticleTags(
      [
        { name: "manual", color: "#aaaaaa" },
        { name: "topic", color: "#bbbbbb" },
      ],
      [
        { name: "Feed", color: "#666666" },
        { name: "TECH", color: "#777777" },
      ],
      "Technology/Web",
      folders,
      [
        { name: "RSS", color: "#888888" },
        { name: "Topic", color: "#999999" },
      ],
    );

    expect(resolved).toEqual([
      { name: "RSS", color: "#888888" },
      { name: "topic", color: "#bbbbbb" },
      { name: "TECH", color: "#777777" },
      { name: "JavaScript", color: "#444444" },
      { name: "Feed", color: "#666666" },
      { name: "manual", color: "#aaaaaa" },
    ]);
  });
});
