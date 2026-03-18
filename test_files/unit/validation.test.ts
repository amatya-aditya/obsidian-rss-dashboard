import { describe, it, expect } from "vitest";
import { isValidFolderName, isValidFeedTitle, sanitizeName } from "../../src/utils/validation";

describe("Validation Utility", () => {
  describe("isValidFolderName", () => {
    it("returns false for empty names", () => {
      expect(isValidFolderName("").valid).toBe(false);
      expect(isValidFolderName("   ").valid).toBe(false);
    });

    it("returns false for names starting with a dot", () => {
      expect(isValidFolderName(".test").valid).toBe(false);
      expect(isValidFolderName("..test").valid).toBe(false);
    });

    it("returns false for forbidden characters", () => {
      const forbidden = ["#", "^", "[", "]", "|", "/", "\\", ":", "*", "\"", "<", ">", "?"];
      forbidden.forEach(char => {
        const result = isValidFolderName(`Folder${char}Name`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(char);
      });
    });

    it("returns true for valid names", () => {
      expect(isValidFolderName("My Folder").valid).toBe(true);
      expect(isValidFolderName("Folder_123").valid).toBe(true);
      expect(isValidFolderName("Folder-456").valid).toBe(true);
      expect(isValidFolderName("Folder (789)").valid).toBe(true);
    });
  });

  describe("isValidFeedTitle", () => {
    it("returns false for empty titles", () => {
      expect(isValidFeedTitle("").valid).toBe(false);
    });

    it("returns false for titles starting with a dot", () => {
      expect(isValidFeedTitle(".feed").valid).toBe(false);
    });

    it("returns false for forbidden characters", () => {
      expect(isValidFeedTitle("Feed/Title").valid).toBe(false);
      expect(isValidFeedTitle("Feed: Title").valid).toBe(false);
    });

    it("returns true for valid titles", () => {
      expect(isValidFeedTitle("My Feed").valid).toBe(true);
    });
  });

  describe("sanitizeName", () => {
    it("replaces forbidden characters with underscores", () => {
      expect(sanitizeName("My/Folder:Name?")).toBe("My_Folder_Name_");
      expect(sanitizeName("Folder[#]")).toBe("Folder___");
    });

    it("strips leading dots", () => {
      expect(sanitizeName(".test")).toBe("test");
      expect(sanitizeName("...test")).toBe("test");
      expect(sanitizeName("..test..")).toBe("test..");
    });

    it("returns 'Unnamed' for empty or only-invalid results", () => {
      expect(sanitizeName("")).toBe("Unnamed");
      expect(sanitizeName("...")).toBe("Unnamed");
      expect(sanitizeName("/\\")).toBe("Unnamed");
    });

    it("trims whitespace", () => {
      expect(sanitizeName("  My Folder  ")).toBe("My Folder");
    });
  });
});
