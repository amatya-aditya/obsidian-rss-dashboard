import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  foreignProcesses,
  formatComparison,
  median,
  parseArgs,
  shardPaths,
  summarizeProfile,
  summarizeWarm,
  summarizeWrites,
  usesDefaultProfile,
  warmRunExpression,
} from "../../scripts/benchmark-plugin-load.mjs";

describe("median", () => {
  it("returns the middle value, or the mean of the two middle values", () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });
});

describe("parseArgs", () => {
  const run = [
    "run",
    "--exe",
    "Obsidian",
    "--vault",
    "vault",
    "--label",
    "before",
    "--out",
    "before.json",
  ];

  it("reads a run command with its defaults", () => {
    expect(parseArgs(run)).toMatchObject({
      command: "run",
      port: 9444,
      warmRuns: 4,
      pluginId: "rss-dashboard",
      label: "before",
    });
  });

  it("reads overridden numeric options as numbers", () => {
    expect(
      parseArgs([...run, "--port", "9555", "--warm-runs", "6"]),
    ).toMatchObject({
      port: 9555,
      warmRuns: 6,
    });
  });

  it("rejects a run that leaves out a required option", () => {
    expect(() => parseArgs(["run", "--label", "x"])).toThrow("run needs --exe");
  });

  it("rejects an unknown option", () => {
    expect(() => parseArgs([...run, "--nope", "1"])).toThrow("Unknown option");
  });

  it("requires two result files to compare", () => {
    expect(() => parseArgs(["compare", "only.json"])).toThrow(
      "two result files",
    );
    expect(parseArgs(["compare", "a.json", "b.json"]).files).toEqual([
      "a.json",
      "b.json",
    ]);
  });
});

describe("summarizeProfile", () => {
  // root -> idle, plugin onload -> plugin hydrate, app code.
  const frame = (
    id: number,
    functionName: string,
    url: string,
    children: number[] = [],
  ) => ({
    id,
    callFrame: { functionName, url, lineNumber: 0 },
    children,
  });
  const profile = {
    nodes: [
      frame(1, "(root)", "", [2, 3, 4]),
      frame(2, "(idle)", ""),
      frame(3, "onload", "plugin:rss-dashboard", [5]),
      frame(4, "appCode", "app.js"),
      frame(5, "hydrate", "plugin:rss-dashboard"),
    ],
    samples: [2, 3, 5, 4, 5],
    timeDeltas: [1000, 2000, 3000, 4000, 5000],
  };

  it("splits the sampled span into plugin, idle and other CPU", () => {
    const summary = summarizeProfile(profile, "rss-dashboard");

    expect(summary).toMatchObject({
      spanMs: 15,
      pluginCpuMs: 10,
      idleMs: 1,
      otherCpuMs: 4,
    });
  });

  it("ranks named plugin frames by inclusive time, counting a frame once per sample", () => {
    const { topPluginFrames } = summarizeProfile(profile, "rss-dashboard");

    expect(topPluginFrames).toEqual([
      { name: "onload", ms: 10 },
      { name: "hydrate", ms: 8 },
    ]);
  });

  it("attributes nothing to the plugin when another plugin id is asked for", () => {
    expect(summarizeProfile(profile, "other-plugin").pluginCpuMs).toBe(0);
  });
});

describe("shard paths", () => {
  const paths = [
    "data/feeds/a.json",
    "data/feeds/b.json",
    "data/feeds/sub/c.json",
    "data/feeds/notes.txt",
    "data/data.json",
    "data/user-state.json",
  ];

  it("keeps only json files directly inside the shard folder", () => {
    expect(shardPaths(paths, "data/feeds")).toEqual([
      "data/feeds/a.json",
      "data/feeds/b.json",
    ]);
    expect(shardPaths(paths, "data/feeds/")).toHaveLength(2);
  });

  it("counts writes by file name, never by vault path", () => {
    expect(summarizeWrites(paths, "data/feeds")).toEqual({
      shards: 2,
      other: {
        "c.json": 1,
        "notes.txt": 1,
        "data.json": 1,
        "user-state.json": 1,
      },
    });
  });
});

describe("usesDefaultProfile", () => {
  const main = '"C:\\Program Files\\Obsidian\\Obsidian.exe"';

  it("is true for an Obsidian main process on the default profile", () => {
    expect(usesDefaultProfile([main, `${main} --type=renderer`])).toBe(true);
  });

  it("ignores helper processes and instances that have their own profile", () => {
    expect(
      usesDefaultProfile([
        `${main} --type=gpu-process`,
        `${main} --remote-debugging-port=9355 --user-data-dir=C:\\tmp\\profile`,
      ]),
    ).toBe(false);
  });

  it("is false when no Obsidian is running", () => {
    expect(usesDefaultProfile([])).toBe(false);
  });
});

describe("foreignProcesses", () => {
  it("ignores the tool processes that were already running before the run", () => {
    // An editor's ESLint server is always alive, so it counts at both ends.
    expect(foreignProcesses(1, 1, 1)).toBe(0);
  });

  it("reports the rise above the ambient count at either end of a measurement", () => {
    expect(foreignProcesses(1, 1, 4)).toBe(3);
    expect(foreignProcesses(1, 3, 1)).toBe(2);
  });

  it("never goes negative when the ambient process exits mid-run", () => {
    expect(foreignProcesses(2, 0, 1)).toBe(0);
  });
});

describe("summarizeWarm", () => {
  const warm = (onloadMs: number, foreignProcesses = 0, shardReads = 410) => ({
    onloadMs,
    shardReads,
    writes: { shards: 0, other: {} },
    foreignProcesses,
  });

  it("takes the median of the runs that had the machine to themselves", () => {
    const summary = summarizeWarm([
      warm(5000),
      warm(9000, 2),
      warm(5200),
      warm(5400),
    ]);

    expect(summary).toMatchObject({
      onloadMs: 5200,
      shardReads: 410,
      cleanRuns: 3,
      contaminatedRuns: 1,
    });
  });

  it("falls back to every run when all of them overlapped other work", () => {
    const summary = summarizeWarm([warm(6000, 1), warm(8000, 3)]);

    expect(summary.onloadMs).toBe(7000);
    expect(summary.cleanRuns).toBe(0);
    expect(summary.contaminatedRuns).toBe(2);
  });
});

describe("formatComparison", () => {
  const result = (
    label: string,
    onloadMs: number,
    shardReads: number,
    cpuMs: number,
  ) => ({
    label,
    date: "2026-10-22T00:00:00.000Z",
    commit: "abc1234",
    dirty: false,
    obsidian: "1.14.4",
    plugin: "2.7.1",
    machine: {
      cpu: "Test CPU",
      threads: 16,
      memoryGb: 17,
      os: "Windows 11",
      node: "24",
    },
    cold: {
      layoutReadyMs: 6700,
      foreignProcesses: 0,
      profile: { pluginCpuMs: cpuMs },
    },
    warm: {
      runs: [1, 2, 3].map(() => ({
        onloadMs,
        shardReads,
        writes: { shards: 0, other: {} },
        foreignProcesses: 0,
      })),
    },
  });

  it("tabulates the change between two runs", () => {
    const table = formatComparison(
      result("before", 5000, 410, 5000),
      result("after", 3000, 205, 3000),
    );

    expect(table).toContain(
      "| Warm `onload`, median ms | 5000 | 3000 | -40% |",
    );
    expect(table).toContain(
      "| Shard reads per plugin start | 410 | 205 | -50% |",
    );
    expect(table).toContain(
      "| Cold launch: plugin CPU ms | 5000 | 3000 | -40% |",
    );
  });

  it("flags a run that overlapped other tool processes", () => {
    const before = result("before", 5000, 410, 5000);
    before.warm.runs[0].foreignProcesses = 2;

    expect(
      formatComparison(before, result("after", 3000, 205, 3000)),
    ).toContain("1 warm run(s) overlapped");
  });
});

describe("warm run expression", () => {
  // Runs the in-page script against a fake app, as Obsidian would run it.
  async function runInFakeApp(adapter: Record<string, unknown>) {
    const plugin = { settings: { storageFolder: "data/feeds" } };
    const app = {
      vault: { adapter },
      plugins: {
        plugins: { "rss-dashboard": plugin },
        disablePlugin: async () => undefined,
        enablePlugin: async () => {
          await (adapter.read as (p: string) => Promise<string>)(
            "data/feeds/a.json",
          );
          await (adapter.read as (p: string) => Promise<string>)(
            "data/feeds/b.json",
          );
          await (adapter.write as (p: string, d: string) => Promise<void>)(
            "data/data.json",
            "{}",
          );
        },
      },
    };
    const raw: unknown = await vm.runInNewContext(
      warmRunExpression("rss-dashboard", 1),
      { app, performance, setTimeout },
    );
    return JSON.parse(JSON.stringify(raw)) as {
      onloadMs: number;
      reads: string[];
      writes: string[];
      folder: string;
    };
  }

  it("records the reads and writes made while the plugin loads", async () => {
    const adapter = {
      read: async (_p: string) => "{}",
      write: async (_p: string, _d: string) => undefined,
    };

    const result = await runInFakeApp(adapter);

    expect(result.reads).toEqual(["data/feeds/a.json", "data/feeds/b.json"]);
    expect(result.writes).toEqual(["data/data.json"]);
    expect(result.folder).toBe("data/feeds");
    expect(result.onloadMs).toBeGreaterThanOrEqual(0);
  });

  it("restores the adapter's own methods afterwards", async () => {
    const read = async (_p: string) => "{}";
    const write = async (_p: string, _d: string) => undefined;
    const adapter = { read, write };

    await runInFakeApp(adapter);

    expect(adapter.read).toBe(read);
    expect(adapter.write).toBe(write);
  });

  it("removes its patch from an adapter whose methods live on the prototype", async () => {
    class ProtoAdapter {
      async read(_p: string) {
        return "{}";
      }
      async write(_p: string, _d: string) {}
    }
    const adapter = new ProtoAdapter();

    await runInFakeApp(adapter as unknown as Record<string, unknown>);

    expect(Object.prototype.hasOwnProperty.call(adapter, "read")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(adapter, "write")).toBe(false);
  });
});
