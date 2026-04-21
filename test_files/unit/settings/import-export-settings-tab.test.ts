import { describe, it, expect } from "vitest";
import {
  buildDefaultAutoBackupSettings,
  getBackupFilename,
} from "../../../src/settings/tabs/import-export-settings-tab";

describe("Auto Backup Helpers", () => {
  describe("buildDefaultAutoBackupSettings()", () => {
    it("returns the expected default values (OPML/Userdata true, DataJson false)", () => {
      const defaults = buildDefaultAutoBackupSettings();
      expect(defaults).toEqual({
        backupDataJson: false,
        backupOpml: true,
        backupUserdata: true,
      });
    });

    it("returns a fresh object on each call", () => {
      const a = buildDefaultAutoBackupSettings();
      const b = buildDefaultAutoBackupSettings();
      expect(a).not.toBe(b);
      
      // Mutate a, b should be unchanged
      a.backupDataJson = true;
      expect(b.backupDataJson).toBe(false);
    });
  });

  describe("getBackupFilename()", () => {
    it("appends .backup to standard filenames", () => {
      expect(getBackupFilename("data.json")).toBe("data.json.backup");
      expect(getBackupFilename("feeds.opml")).toBe("feeds.opml.backup");
      expect(getBackupFilename("userdata.json")).toBe("userdata.json.backup");
    });

    it("handles filenames without extensions", () => {
      expect(getBackupFilename("myfile")).toBe("myfile.backup");
    });

    it("handles empty string", () => {
      expect(getBackupFilename("")).toBe(".backup");
    });

    it("appends .backup even if it already ends in .backup", () => {
      expect(getBackupFilename("data.json.backup")).toBe("data.json.backup.backup");
    });
  });
});
