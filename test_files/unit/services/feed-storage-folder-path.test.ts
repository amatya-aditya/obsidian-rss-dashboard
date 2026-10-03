import { describe, it, expect } from "vitest";
import { normalizePath } from "obsidian";
import { normalizeFolderPath } from "../../../src/services/feed-storage-repository";

const DEFAULT_FOLDER = ".rss-dashboard-data/feeds";

// The original implementation, kept as a reference for the differential test.
function originalNormalizeFolderPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return DEFAULT_FOLDER;
  }
  return normalizePath(trimmed.replace(/^\/+|\/+$/g, ""));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("normalizeFolderPath", () => {
  it("falls back to the default folder for blank input", () => {
    expect(normalizeFolderPath("")).toBe(DEFAULT_FOLDER);
    expect(normalizeFolderPath("   ")).toBe(DEFAULT_FOLDER);
  });

  it("drops leading and trailing slashes", () => {
    expect(normalizeFolderPath("/data/feeds/")).toBe("data/feeds");
    expect(normalizeFolderPath("///data//feeds///")).toBe("data/feeds");
  });

  it("treats backslashes as slashes", () => {
    expect(normalizeFolderPath("\\data\\feeds\\")).toBe("data/feeds");
  });

  it("keeps a hidden folder name", () => {
    expect(normalizeFolderPath(" .rss-dashboard-data/feeds ")).toBe(
      ".rss-dashboard-data/feeds",
    );
  });

  it("handles input made only of slashes", () => {
    for (const input of ["/", "//", "\\\\", "/ /", " / "]) {
      expect(normalizeFolderPath(input), input).toBe(
        originalNormalizeFolderPath(input),
      );
    }
  });

  it("matches the previous behavior on generated inputs", () => {
    const random = seededRandom(20260929);
    const alphabet = ["/", "/", "\\", " ", "a", "b", ".", "/"];
    for (let i = 0; i < 4000; i++) {
      const length = Math.floor(random() * 14);
      let input = "";
      for (let j = 0; j < length; j++) {
        input += alphabet[Math.floor(random() * alphabet.length)];
      }
      expect(normalizeFolderPath(input), JSON.stringify(input)).toBe(
        originalNormalizeFolderPath(input),
      );
    }
  });

  it("handles long paths quickly", () => {
    for (const input of [
      "a" + "/".repeat(50000) + "b",
      "/".repeat(25000) + "a" + "\\".repeat(25000) + "b",
    ]) {
      const started = performance.now();
      normalizeFolderPath(input);
      expect(performance.now() - started).toBeLessThan(200);
    }
  });
});
