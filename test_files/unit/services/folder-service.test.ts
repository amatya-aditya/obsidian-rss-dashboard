import { describe, it, expect, beforeEach } from "vitest";
import { FolderService } from "../../../src/services/folder-service";
import type { Feed, Folder } from "../../../src/types/types";

describe("FolderService", () => {
  let folderService: FolderService;

  function createFeed(overrides: Partial<Feed> = {}): Feed {
    return {
      title: "Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: 0,
      mediaType: "article",
      ...overrides,
    };
  }

  let settings: { folders: Folder[] };

  beforeEach(() => {
    settings = {
      folders: [
        {
          name: "News",
          subfolders: [
            {
              name: "Tech",
              subfolders: [],
              createdAt: Date.now(),
              modifiedAt: Date.now(),
            },
            {
              name: "Science",
              subfolders: [],
              createdAt: Date.now(),
              modifiedAt: Date.now(),
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        },
        {
          name: "Entertainment",
          subfolders: [],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        },
      ],
    };
    folderService = new FolderService(settings);
  });

  describe("folderPathExists", () => {
    it('returns true for "Uncategorized"', () => {
      expect(folderService.folderPathExists("Uncategorized")).toBe(true);
    });

    it("returns true for empty string", () => {
      expect(folderService.folderPathExists("")).toBe(true);
    });

    it("returns true for a path that exists in the hierarchy", () => {
      expect(folderService.folderPathExists("News")).toBe(true);
      expect(folderService.folderPathExists("News/Tech")).toBe(true);
      expect(folderService.folderPathExists("News/Science")).toBe(true);
    });

    it("returns false for a missing top-level folder", () => {
      expect(folderService.folderPathExists("NonExistent")).toBe(false);
    });

    it("returns false for a missing nested path", () => {
      expect(folderService.folderPathExists("News/NonExistent")).toBe(false);
      expect(folderService.folderPathExists("NonExistent/Tech")).toBe(false);
    });
  });

  describe("ensureFolderExists", () => {
    it("creates a missing top-level folder and returns true", async () => {
      const result = await folderService.ensureFolderExists("NewFolder", {
        saveSettings: false,
        refreshView: false,
      });
      expect(result).toBe(true);
      expect(
        settings.folders.find((f) => f.name === "NewFolder"),
      ).toBeDefined();
    });

    it("creates a nested path and returns true", async () => {
      const result = await folderService.ensureFolderExists(
        "News/NewSubfolder",
        {
          saveSettings: false,
          refreshView: false,
        },
      );
      expect(result).toBe(true);
      const newsFolder = settings.folders.find((f) => f.name === "News");
      expect(
        newsFolder?.subfolders?.find((f) => f.name === "NewSubfolder"),
      ).toBeDefined();
    });

    it("is a no-op for existing paths and returns false", async () => {
      const result = await folderService.ensureFolderExists("News", {
        saveSettings: false,
        refreshView: false,
      });
      expect(result).toBe(false);
    });

    it('returns false for "Uncategorized"', async () => {
      const result = await folderService.ensureFolderExists("Uncategorized", {
        saveSettings: false,
        refreshView: false,
      });
      expect(result).toBe(false);
    });

    it("calls saveSettings callback when saveSettings is true", async () => {
      let saveSettingsCalled = false;
      await folderService.ensureFolderExists("NewFolder", {
        saveSettings: true,
        refreshView: false,
        onSaveSettings: async () => {
          saveSettingsCalled = true;
        },
        onRefreshView: async () => {},
      });
      expect(saveSettingsCalled).toBe(true);
    });

    it("does not call saveSettings callback when saveSettings is false", async () => {
      let saveSettingsCalled = false;
      await folderService.ensureFolderExists("NewFolder", {
        saveSettings: false,
        refreshView: false,
        onSaveSettings: async () => {
          saveSettingsCalled = true;
        },
        onRefreshView: async () => {},
      });
      expect(saveSettingsCalled).toBe(false);
    });

    it("calls refreshView callback when refreshView is true and changed", async () => {
      let refreshViewCalled = false;
      await folderService.ensureFolderExists("NewFolder", {
        saveSettings: false,
        refreshView: true,
        onSaveSettings: async () => {},
        onRefreshView: async () => {
          refreshViewCalled = true;
        },
      });
      expect(refreshViewCalled).toBe(true);
    });
  });

  describe("repairMissingFolderPathsForFeeds", () => {
    it("creates missing paths referenced by feeds", async () => {
      const settingsWithFeeds = {
        ...settings,
        feeds: [
          createFeed({
            title: "Feed 1",
            url: "https://example.com/feed1",
            folder: "News/Tech",
          }),
          createFeed({
            title: "Feed 2",
            url: "https://example.com/feed2",
            folder: "News/MissingFolder",
          }),
          createFeed({
            title: "Feed 3",
            url: "https://example.com/feed3",
            folder: "TotallyNewFolder",
          }),
        ],
      };
      const service = new FolderService(settingsWithFeeds);

      let saveSettingsCalled = false;
      await service.repairMissingFolderPathsForFeeds({
        onSaveSettings: async () => {
          saveSettingsCalled = true;
        },
      });

      // Verify missing paths are created
      expect(
        settingsWithFeeds.folders
          .find((f) => f.name === "News")
          ?.subfolders?.find((f: Folder) => f.name === "MissingFolder"),
      ).toBeDefined();
      expect(
        settingsWithFeeds.folders.find((f) => f.name === "TotallyNewFolder"),
      ).toBeDefined();
      expect(saveSettingsCalled).toBe(true);
    });

    it("is a no-op when all paths are valid", async () => {
      const settingsWithFeeds = {
        ...settings,
        feeds: [
          createFeed({
            title: "Feed 1",
            url: "https://example.com/feed1",
            folder: "News/Tech",
          }),
          createFeed({
            title: "Feed 2",
            url: "https://example.com/feed2",
            folder: "Entertainment",
          }),
        ],
      };
      const service = new FolderService(settingsWithFeeds);

      let saveSettingsCalled = false;
      await service.repairMissingFolderPathsForFeeds({
        onSaveSettings: async () => {
          saveSettingsCalled = true;
        },
      });

      expect(saveSettingsCalled).toBe(false);
    });

    it("skips feeds with missing or Uncategorized folder", async () => {
      const settingsWithFeeds = {
        ...settings,
        feeds: [
          createFeed({
            title: "Feed 1",
            url: "https://example.com/feed1",
            folder: "",
          }),
          createFeed({
            title: "Feed 2",
            url: "https://example.com/feed2",
            folder: "Uncategorized",
          }),
        ],
      };
      const service = new FolderService(settingsWithFeeds);

      let saveSettingsCalled = false;
      await service.repairMissingFolderPathsForFeeds({
        onSaveSettings: async () => {
          saveSettingsCalled = true;
        },
      });

      // Should not call saveSettings since all feeds are either empty or Uncategorized
      expect(saveSettingsCalled).toBe(false);
    });
  });
});
