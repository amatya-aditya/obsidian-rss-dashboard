import { describe, expect, it } from "vitest";
import { MediaService } from "../../../src/services/media-service";

// The regex-based implementations that shipped before the scanning rewrite.
// They are the reference the new functions must agree with on every input.
function oracleAudio(description: string): string | undefined {
  if (!description) return undefined;
  const enclosureMatch = description.match(
    /<enclosure[^>]*url=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i,
  );
  if (enclosureMatch?.[1]) return enclosureMatch[1];
  const audioMatch = description.match(
    /<audio[^>]*src=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i,
  );
  if (audioMatch?.[1]) return audioMatch[1];
  const audioLinkMatch = description.match(
    /href=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i,
  );
  if (audioLinkMatch?.[1]) return audioLinkMatch[1];
  const sourceMatch = description.match(
    /<source[^>]*src=["']([^"']*\.(?:mp3|m4a|wav|ogg|opus|aac|flac))["']/i,
  );
  if (sourceMatch?.[1]) return sourceMatch[1];
  return undefined;
}

function oracleDuration(description: string): string | undefined {
  if (!description) return undefined;
  const durationMatch =
    description.match(/duration[^0-9]*(\d+:\d+(?::\d+)?)/i) ||
    description.match(/length[^0-9]*(\d+:\d+(?::\d+)?)/i) ||
    description.match(/time[^0-9]*(\d+:\d+(?::\d+)?)/i) ||
    description.match(/(\d+:\d+(?::\d+)?)\s*(?:min|minutes|mins)/i);
  if (durationMatch?.[1]) return durationMatch[1];
  return undefined;
}

describe("MediaService.extractPodcastAudio", () => {
  it.each([
    ['<enclosure url="https://a.test/ep.mp3" length="1"/>', "https://a.test/ep.mp3"],
    ["<enclosure type='audio/mpeg' url='https://a.test/EP.M4A'>", "https://a.test/EP.M4A"],
    ['<ENCLOSURE URL="x.opus">', "x.opus"],
    ['<audio controls src="https://a.test/a.ogg"></audio>', "https://a.test/a.ogg"],
    ['<p><a href="https://a.test/a.flac">listen</a></p>', "https://a.test/a.flac"],
    ['<audio><source src="https://a.test/s.aac" type="audio/aac"></audio>', "https://a.test/s.aac"],
    ['<source src="a.wav">', "a.wav"],
    ['<enclosure url="a.mp3" \n url="b.mp3">', "b.mp3"],
    ["<enclosure url=\"a.mp3'", "a.mp3"],
    ['<enclosure url="a.mp3">x<audio src="b.mp3">', "a.mp3"],
    ['<audio src="b.mp3"><enclosure url="a.mp3">', "a.mp3"],
    ['<source src="c.mp3"> <a href="b.mp3">', "b.mp3"],
    ['<enclosure url="a.txt"><audio src="b.mp3">', "b.mp3"],
    ['<enclosure x> <enclosure url="a.mp3">', "a.mp3"],
    ['<enclosure url="a.txt" x> y> url="b.mp3"', undefined],
  ] as Array<[string, string | undefined]>)("reads the audio url in %j", (input, expected) => {
    expect(MediaService.extractPodcastAudio(input)).toBe(expected);
  });

  it.each([
    "",
    "plain text with no markup",
    '<enclosure url="a.txt">',
    '<enclosure url="a.mp3',
    '<enclosure> url="a.mp3"',
    "<audio src=a.mp3>",
    '<img src="a.mp3">',
  ])("returns undefined for %j", (input) => {
    expect(MediaService.extractPodcastAudio(input)).toBeUndefined();
  });
});

describe("MediaService.extractPodcastDuration", () => {
  it.each([
    ["Duration: 45:30", "45:30"],
    ["<p>DURATION - 1:02:03 hrs</p>", "1:02:03"],
    ["length 12:34", "12:34"],
    ["Run time: 3:21", "3:21"],
    ["about 25:10 min", "25:10"],
    ["about 25:10:05 mins", "25:10:05"],
    ["1:2 3:4 minutes", "3:4"],
    ["duration abc 5:6 length 7:8", "5:6"],
    ["length 7:8 duration 5:6", "5:6"],
    ["duration none length 7:8", "7:8"],
    ["duration 12 then 34:56", undefined],
    ["time 10:20:", "10:20"],
    ["12:34:56:78 min", "34:56:78"],
    ["7:8:9  \t min", "7:8:9"],
  ] as Array<[string, string | undefined]>)("reads the duration in %j", (input, expected) => {
    expect(MediaService.extractPodcastDuration(input)).toBe(expected);
  });

  it.each(["", "no numbers here", "duration", "12:", "duration 5", "3:4 hours"])(
    "returns undefined for %j",
    (input) => {
      expect(MediaService.extractPodcastDuration(input)).toBeUndefined();
    },
  );
});

// Small seeded generator so the comparison runs the same way every time.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AUDIO_FRAGMENTS = [
  "<enclosure", "<audio", "<source", "<ENCLOSURE", "<Audio", "url=", "src=",
  "href=", "URL=", "SRC=", "Href=", '"', "'", ">", ">", ".mp3", ".M4A", ".ogg",
  ".opus", ".flac", ".aac", ".wav", ".txt", "mp3", "a", "b/c", " ", " ", "\n",
  "=", "<", "x=", "/",
];

// Includes non-ASCII characters whose case mapping could change string length
// or fold onto ASCII letters if the text were lowercased naively.
const DURATION_FRAGMENTS = [
  "duration", "DURATION", "length", "LENGTH", "time", "Time", "runtime", "1",
  "23", "4", "0", "05", ":", ":", " min", "mins", "minutes", "MIN", "Mins",
  " ", " ", "\t", "\n", "a", "b", "x", "-", ".", "\u00a0", "\u0130", "\u212a",
  "\u0131", "\u017f", "tim\u212a", "\u0130min",
];

function generate(random: () => number, fragments: string[]): string {
  const count = 1 + Math.floor(random() * 14);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += fragments[Math.floor(random() * fragments.length)];
  }
  return out;
}

describe("podcast extraction compared with the regex implementations", () => {
  it("returns the same audio url for generated descriptions", () => {
    const random = createRandom(20260929);
    for (let i = 0; i < 6000; i++) {
      const input = generate(random, AUDIO_FRAGMENTS);
      expect(MediaService.extractPodcastAudio(input), JSON.stringify(input)).toBe(
        oracleAudio(input),
      );
    }
  });

  it("returns the same audio url for generated markup that contains a real url", () => {
    const random = createRandom(77);
    const tags = ["<enclosure", "<audio", "<source", "<a"];
    const attrs = ["url=", "src=", "href="];
    const exts = [".mp3", ".M4A", ".opus", ".txt"];
    const quotes = ['"', "'"];
    const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
    for (let i = 0; i < 3000; i++) {
      const input =
        generate(random, AUDIO_FRAGMENTS) +
        `${pick(tags)} ${pick(attrs)}${pick(quotes)}f${i}${pick(exts)}${pick(quotes)}>` +
        generate(random, AUDIO_FRAGMENTS);
      expect(MediaService.extractPodcastAudio(input), JSON.stringify(input)).toBe(
        oracleAudio(input),
      );
    }
  });

  it("returns the same duration for generated descriptions", () => {
    const random = createRandom(929);
    for (let i = 0; i < 6000; i++) {
      const input = generate(random, DURATION_FRAGMENTS);
      expect(
        MediaService.extractPodcastDuration(input),
        JSON.stringify(input),
      ).toBe(oracleDuration(input));
    }
  });
});

describe("podcast extraction on long descriptions", () => {
  const LENGTH = 50000;
  const repeat = (unit: string): string => unit.repeat(Math.ceil(LENGTH / unit.length));

  function elapsedMs(run: () => unknown): number {
    const start = performance.now();
    run();
    return performance.now() - start;
  }

  it.each([
    ["enclosure", "<enclosure "],
    ["audio", "<audio "],
    ["source", "<source "],
    ["href", 'href="a" '],
    ["enclosure attributes", '<enclosure url="a" '],
    ["audio attributes", '<audio src="a" '],
    ["closed tags", "<source >"],
    ["tags with a non-audio url", '<enclosure url="a.txt" x> '],
  ])("handles long descriptions without slowing down (audio, %s)", (_name, unit) => {
    const input = repeat(unit);
    expect(elapsedMs(() => MediaService.extractPodcastAudio(input))).toBeLessThan(200);
    expect(MediaService.extractPodcastAudio(input)).toBeUndefined();
  });

  it("still finds an audio url that follows a long run of tags", () => {
    const input = repeat("<enclosure ") + '<enclosure url="ep.mp3">';
    expect(elapsedMs(() => MediaService.extractPodcastAudio(input))).toBeLessThan(200);
    expect(MediaService.extractPodcastAudio(input)).toBe("ep.mp3");
  });

  it.each([
    ["duration", "duration "],
    ["length", "length "],
    ["time", "time "],
    ["digits", "1"],
    ["clock", "1:2 "],
    ["long clock", "1:2:3 "],
    ["digits and colons", "1:"],
    ["clock and spaces", "1:2" + " ".repeat(50)],
    ["labels and digits", "duration 1:"],
  ])("handles long descriptions without slowing down (duration, %s)", (_name, unit) => {
    const input = repeat(unit);
    expect(elapsedMs(() => MediaService.extractPodcastDuration(input))).toBeLessThan(200);
    expect(MediaService.extractPodcastDuration(input)).toBeUndefined();
  });

  it("still finds a duration that follows a long run of labels", () => {
    const input = repeat("duration ") + "duration 12:34";
    expect(elapsedMs(() => MediaService.extractPodcastDuration(input))).toBeLessThan(200);
    expect(MediaService.extractPodcastDuration(input)).toBe("12:34");
  });
});