import { describe, expect, it } from "vitest";
import {
  YOUTUBE_PLAYER_ALLOW,
  youTubePlayerSourceUrl,
} from "../../../src/utils/youtube-player-source";

const VIDEO_ID = "z9TFdTqkbPk";
const HOST_PREFIX = "https://releases.obsidian.md/youtube";
const DIRECT_PREFIX = "https://www.youtube-nocookie.com/embed";

describe("youTubePlayerSourceUrl", () => {
  it("routes a non-https origin through Obsidian's embed host", () => {
    expect(youTubePlayerSourceUrl(VIDEO_ID, {}, "app:")).toBe(
      `${HOST_PREFIX}?v=${VIDEO_ID}&enablejsapi=1`,
    );
  });

  it("routes iOS and Android origins through the host too", () => {
    for (const protocol of ["capacitor:", "http:"]) {
      expect(youTubePlayerSourceUrl(VIDEO_ID, {}, protocol)).toContain(
        HOST_PREFIX,
      );
    }
  });

  it("uses the direct nocookie embed only on an https origin", () => {
    expect(youTubePlayerSourceUrl(VIDEO_ID, {}, "https:")).toBe(
      `${DIRECT_PREFIX}/${VIDEO_ID}?rel=0&enablejsapi=1`,
    );
  });

  it("asks the host to autoplay when requested", () => {
    expect(youTubePlayerSourceUrl(VIDEO_ID, { autoplay: true }, "app:")).toBe(
      `${HOST_PREFIX}?v=${VIDEO_ID}&enablejsapi=1&autoplay=1`,
    );
  });

  it("forwards a resume position as a whole number of seconds", () => {
    const url = youTubePlayerSourceUrl(
      VIDEO_ID,
      { startSeconds: 61.9 },
      "app:",
    );
    expect(url).toContain("start=61");
  });

  it("omits start at zero or a negative position", () => {
    expect(
      youTubePlayerSourceUrl(VIDEO_ID, { startSeconds: 0 }, "app:"),
    ).not.toContain("start");
    expect(
      youTubePlayerSourceUrl(VIDEO_ID, { startSeconds: -5 }, "app:"),
    ).not.toContain("start");
  });

  it.each([
    ["a short ID", "short"],
    ["a long ID", "z9TFdTqkbPkX"],
    ["a non-URL-safe ID", "abc def!hijk"],
    ["an empty ID", ""],
  ])("rejects %s", (_label, videoId) => {
    expect(() => youTubePlayerSourceUrl(videoId, {}, "app:")).toThrow();
  });

  it("exposes a permission set the host player can autoplay under", () => {
    expect(YOUTUBE_PLAYER_ALLOW).toContain("autoplay");
    expect(YOUTUBE_PLAYER_ALLOW).toContain("encrypted-media");
  });
});
