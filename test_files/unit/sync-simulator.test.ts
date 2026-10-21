import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Plugin } from "obsidian";
import { SyncSimulator } from "./sync-simulator";

type MockVault = {
  configDir: string;
  adapterFiles: Map<string, string>;
  addFolderOnDisk(path: string): void;
  on(name: string, callback: (...args: unknown[]) => unknown): unknown;
};

function vaultOf(app: App): MockVault {
  return app.vault as unknown as MockVault;
}

function setUp(): { desktop: App; mobile: App; sync: SyncSimulator } {
  const desktop = App.createMock();
  const mobile = App.createMock();
  return { desktop, mobile, sync: new SyncSimulator(desktop, mobile) };
}

function seed(app: App, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const parent = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "";
    if (parent) vaultOf(app).addFolderOnDisk(parent);
    vaultOf(app).adapterFiles.set(path, content);
  }
}

function received(app: App): Record<string, string> {
  return Object.fromEntries(vaultOf(app).adapterFiles);
}

function record(app: App): string[] {
  const events: string[] = [];
  for (const name of ["create", "modify", "delete", "rename"]) {
    vaultOf(app).on(name, (file) =>
      events.push(`${name}:${(file as { path: string }).path}`),
    );
  }
  return events;
}

describe("SyncSimulator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("path rules", () => {
    it("delivers visible files and skips every dot-path", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, {
        "rss-dashboard-data/data.json": "{}",
        "rss-dashboard-data/feeds/a.json": "a",
        ".hidden/b.json": "b",
        "notes/.cache/c.json": "c",
        ".vault-config/app.json": "d",
      });

      const delivered = await sync.deliver();

      expect(delivered).toEqual([
        "rss-dashboard-data/data.json",
        "rss-dashboard-data/feeds/a.json",
      ]);
      expect(Object.keys(received(mobile)).sort()).toEqual([
        "rss-dashboard-data/data.json",
        "rss-dashboard-data/feeds/a.json",
      ]);
    });

    it("carries the bootstrap data.json from the config folder and nothing else in it", async () => {
      const { desktop, mobile, sync } = setUp();
      const pointer = ".vault-config/plugins/rss-dashboard/data.json";
      seed(desktop, {
        [pointer]: '{"pointer":true}',
        ".vault-config/plugins/rss-dashboard/other.json": "x",
        ".vault-config/plugins/other-plugin/data.json": "y",
        ".vault-config/plugins/rss-dashboard/data/user-state.json": "z",
      });

      await sync.deliver();

      expect(received(mobile)).toEqual({ [pointer]: '{"pointer":true}' });
    });

    it("honours a different plugin id for the bootstrap exception", async () => {
      const desktop = App.createMock();
      const mobile = App.createMock();
      const pointer = ".vault-config/plugins/other/data.json";
      seed(desktop, { [pointer]: "{}" });

      await new SyncSimulator(desktop, mobile, { pluginId: "other" }).deliver();

      expect(received(mobile)).toEqual({ [pointer]: "{}" });
    });
  });

  describe("receiving-vault events", () => {
    it("fires create for a new file and modify for a replaced one, with raw for each", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "data/a.json": "one" });
      const events = record(mobile);
      const raw: unknown[] = [];
      vaultOf(mobile).on("raw", (path) => raw.push(path));

      await sync.deliver();
      seed(desktop, { "data/a.json": "two" });
      await sync.deliver();

      expect(events).toEqual(["create:data/a.json", "modify:data/a.json"]);
      expect(raw).toEqual(["data/a.json", "data/a.json"]);
    });

    it("fires only raw for a dot-folder file the exception lets through", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { ".vault-config/plugins/rss-dashboard/data.json": "{}" });
      const events = record(mobile);
      const raw: unknown[] = [];
      vaultOf(mobile).on("raw", (path) => raw.push(path));

      await sync.deliver();

      expect(events).toEqual([]);
      expect(raw).toEqual([".vault-config/plugins/rss-dashboard/data.json"]);
    });

    it("calls onExternalSettingsChange for the bootstrap data.json and fires no vault event", async () => {
      const { desktop, mobile, sync } = setUp();
      const onChange = vi.fn();
      class ProbePlugin extends Plugin {
        onExternalSettingsChange(): void {
          onChange();
        }
      }
      new ProbePlugin(mobile, {
        id: "rss-dashboard",
        name: "RSS Dashboard",
        version: "0",
        minAppVersion: "1.8.7",
        description: "",
        author: "",
        dir: ".vault-config/plugins/rss-dashboard",
      });
      seed(desktop, { ".vault-config/plugins/rss-dashboard/data.json": "{}" });
      const events = record(mobile);

      await sync.deliver();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(events).toEqual([]);
    });

    it("stamps the received file's mtime and size", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "data/a.json": "four" });

      await sync.deliver();

      const stat = await mobile.vault.adapter.stat("data/a.json");
      expect(stat).toMatchObject({ type: "file", size: 4 });
      expect(stat?.mtime).toBeGreaterThan(0);
    });
  });

  describe("delivery order", () => {
    const files = { "d/a.json": "a", "d/b.json": "b", "d/c.json": "c" };

    it("delivers in the source's order by default", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, files);
      const events = record(mobile);

      await sync.deliver();

      expect(events).toEqual([
        "create:d/a.json",
        "create:d/b.json",
        "create:d/c.json",
      ]);
    });

    it("delivers reversed", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, files);
      const events = record(mobile);

      await sync.deliver({ order: "reverse" });

      expect(events).toEqual([
        "create:d/c.json",
        "create:d/b.json",
        "create:d/a.json",
      ]);
    });

    it("delivers an explicit order and ignores a path Sync would skip", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { ...files, ".hidden/x.json": "x" });
      const events = record(mobile);

      const delivered = await sync.deliver({
        order: ["d/b.json", ".hidden/x.json", "d/a.json"],
      });

      expect(delivered).toEqual(["d/b.json", "d/a.json"]);
      expect(events).toEqual(["create:d/b.json", "create:d/a.json"]);
    });

    it("delivers one file per next() call and then reports nothing left", () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, files);
      const events = record(mobile);
      const delivery = sync.startDelivery({ order: "reverse" });

      expect(delivery.remaining()).toEqual([
        "d/c.json",
        "d/b.json",
        "d/a.json",
      ]);
      expect(delivery.next()).toBe("d/c.json");
      expect(events).toEqual(["create:d/c.json"]);
      expect(received(mobile)).toEqual({ "d/c.json": "c" });
      expect(delivery.next()).toBe("d/b.json");
      expect(delivery.next()).toBe("d/a.json");
      expect(delivery.next()).toBeUndefined();
      expect(delivery.remaining()).toEqual([]);
    });

    it("lets a one-at-a-time delivery pick up an edit made between calls", () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "d/a.json": "old", "d/b.json": "b" });
      const delivery = sync.startDelivery();

      delivery.next();
      seed(desktop, { "d/b.json": "new" });
      delivery.next();

      expect(received(mobile)["d/b.json"]).toBe("new");
    });
  });

  describe("delays", () => {
    it("lands each file after the delay under fake timers", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "d/a.json": "a", "d/b.json": "b", "d/c.json": "c" });

      const pending = sync.deliver({ delayMs: 1000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(Object.keys(received(mobile))).toEqual(["d/a.json"]);

      await vi.advanceTimersByTimeAsync(999);
      expect(Object.keys(received(mobile))).toEqual(["d/a.json"]);

      await vi.advanceTimersByTimeAsync(1);
      expect(Object.keys(received(mobile))).toEqual(["d/a.json", "d/b.json"]);

      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toEqual([
        "d/a.json",
        "d/b.json",
        "d/c.json",
      ]);
    });
  });

  describe("partial arrival", () => {
    it("never delivers a file that is not in `only`", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "d/data.json": "d", "d/shard.json": "s" });

      const delivered = await sync.deliver({ only: ["d/data.json"] });

      expect(delivered).toEqual(["d/data.json"]);
      expect(received(mobile)).toEqual({ "d/data.json": "d" });
    });

    it("lets the missing file arrive in a later delivery", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "d/data.json": "d", "d/shard.json": "s" });
      const events = record(mobile);

      await sync.deliver({ only: ["d/data.json"] });
      await sync.deliver({ only: ["d/shard.json"] });

      expect(events).toEqual(["create:d/data.json", "create:d/shard.json"]);
    });
  });

  describe("last writer wins", () => {
    it("replaces the receiver's copy with the delivered one, with no merge", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "d/a.json": '{"remote":1}' });
      seed(mobile, { "d/a.json": '{"local":1}' });

      await sync.deliver();

      expect(received(mobile)["d/a.json"]).toBe('{"remote":1}');
    });

    it("keeps whichever delivery arrived last", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "d/a.json": "first" });
      await sync.deliver();
      seed(desktop, { "d/a.json": "second" });
      await sync.deliver();

      expect(received(mobile)["d/a.json"]).toBe("second");
    });

    it("writes no conflict copy when both vaults changed the same file", async () => {
      const { desktop, mobile, sync } = setUp();
      seed(desktop, { "d/a.json": "remote" });
      seed(mobile, { "d/a.json": "local" });

      await sync.deliver();

      expect(Object.keys(received(mobile))).toEqual(["d/a.json"]);
    });
  });
});
