import { describe, expect, it } from "vitest";

import {
  CdpError,
  DEFAULT_PORTS,
  assertWebSocket,
  choosePort,
  connect,
  parseArgs,
  parseBatch,
  renderValue,
  selectTarget,
} from "../../scripts/obsidian-cdp.mjs";

const noEnv = {};

function page(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "page-1",
    type: "page",
    title: "Obsidian",
    url: "app://obsidian.md/index.html",
    webSocketDebuggerUrl: "ws://localhost:9333/devtools/page/page-1",
    ...overrides,
  };
}

/** A WebSocket stand-in that lets a test drive open/message/close by hand. */
class FakeSocket {
  static last: FakeSocket | undefined;

  listeners = new Map<string, Array<(event: unknown) => void>>();
  sent: Array<Record<string, unknown>> = [];

  constructor() {
    FakeSocket.last = this;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.emit("close");
  }
}

function connectWithFakeSocket(timeoutMs: number) {
  const connection = connect("ws://example", {
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    timeoutMs,
  });
  const socket = FakeSocket.last;
  if (!socket) throw new Error("the fake socket was not created");
  return { connection, socket };
}

describe("obsidian-cdp parseArgs", () => {
  it("defaults to the common debug ports and localhost", () => {
    const options = parseArgs(["targets"], noEnv);
    expect(options.command).toBe("targets");
    expect(options.args).toEqual([]);
    expect(options.ports).toEqual(DEFAULT_PORTS);
    expect(options.host).toBe("localhost");
    expect(options.target).toBeUndefined();
    expect(options.json).toBe(false);
    expect(options.help).toBe(false);
  });

  it("reads the command and its positional arguments", () => {
    const evalOptions = parseArgs(["eval", "probe.js"], noEnv);
    expect(evalOptions.command).toBe("eval");
    expect(evalOptions.args).toEqual(["probe.js"]);
    expect(parseArgs(["shot", "out.png"], noEnv).args).toEqual(["out.png"]);
  });

  it("keeps - as a stdin argument", () => {
    expect(parseArgs(["eval", "-"], noEnv).args).toEqual(["-"]);
  });

  it("treats batch as a synonym for repl", () => {
    expect(parseArgs(["batch", "steps.txt"], noEnv).command).toBe("repl");
    expect(parseArgs(["batch"], noEnv).command).toBe("repl");
  });

  it("accepts --port in both forms and pins a single port", () => {
    expect(parseArgs(["--port", "9333", "targets"], noEnv).ports).toEqual([
      9333,
    ]);
    expect(parseArgs(["--port=9333", "targets"], noEnv).ports).toEqual([9333]);
  });

  it("falls back to CDP_PORT, and lets --port win", () => {
    expect(parseArgs(["targets"], { CDP_PORT: "9334" }).ports).toEqual([9334]);
    expect(
      parseArgs(["--port", "9333", "targets"], { CDP_PORT: "9334" }).ports,
    ).toEqual([9333]);
  });

  it("reads the target selector from the flag or CDP_TARGET", () => {
    expect(parseArgs(["--target", "Settings", "targets"], noEnv).target).toBe(
      "Settings",
    );
    expect(parseArgs(["--target=Settings", "targets"], noEnv).target).toBe(
      "Settings",
    );
    expect(parseArgs(["targets"], { CDP_TARGET: "Settings" }).target).toBe(
      "Settings",
    );
  });

  it("reads the host and the json flag", () => {
    expect(parseArgs(["--host", "127.0.0.1", "targets"], noEnv).host).toBe(
      "127.0.0.1",
    );
    expect(parseArgs(["--json", "targets"], noEnv).json).toBe(true);
  });

  it("recognises help", () => {
    expect(parseArgs(["--help"], noEnv).help).toBe(true);
    expect(parseArgs(["-h"], noEnv).help).toBe(true);
    expect(parseArgs(["help"], noEnv).help).toBe(true);
  });

  it("lets --help win over a command and its arity check", () => {
    expect(parseArgs(["eval", "--help"], noEnv).help).toBe(true);
    expect(parseArgs(["shot", "--help"], noEnv).help).toBe(true);
    expect(parseArgs(["targets", "extra", "--help"], noEnv).help).toBe(true);
  });

  it("rejects bad usage", () => {
    expect(() => parseArgs([], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["--nope"], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["frobnicate"], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["--port"], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["--port", "abc", "targets"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["--port", "70000", "targets"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["--host", "", "targets"], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["eval"], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["shot"], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["repl", "a", "b"], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["targets", "extra"], noEnv)).toThrow(CdpError);
    expect(() => parseArgs(["targets"], { CDP_PORT: "abc" })).toThrow(CdpError);
  });
});

describe("obsidian-cdp selectTarget", () => {
  it("prefers the Obsidian app window over other pages", () => {
    const picked = selectTarget(
      [
        page({
          id: "devtools",
          title: "DevTools",
          url: "devtools://devtools/bundled/inspector.html",
        }),
        page({ id: "main", title: "Obsidian" }),
      ],
      {},
    );
    expect(picked.id).toBe("main");
  });

  it("selects a window by a case-insensitive title substring", () => {
    const picked = selectTarget(
      [
        page({ id: "main", title: "Obsidian" }),
        page({
          id: "settings",
          title: "Settings - RSS Dashboard",
          url: "app://obsidian.md/settings.html",
        }),
      ],
      { title: "settings" },
    );
    expect(picked.id).toBe("settings");
  });

  it("refuses to guess between several windows matching the same title text", () => {
    expect(() =>
      selectTarget(
        [
          page({ id: "a", title: "Obsidian - vault one" }),
          page({ id: "b", title: "Obsidian - vault two" }),
        ],
        { title: "obsidian" },
      ),
    ).toThrow(CdpError);
  });

  it("ignores targets that cannot be connected to", () => {
    const picked = selectTarget(
      [
        page({
          id: "worker",
          type: "service_worker",
          webSocketDebuggerUrl: undefined,
        }),
        page({ id: "main" }),
      ],
      {},
    );
    expect(picked.id).toBe("main");
  });

  it("falls back to the only page target", () => {
    const picked = selectTarget(
      [page({ id: "only", url: "https://example.com/" })],
      {},
    );
    expect(picked.id).toBe("only");
  });

  it("reports the available titles when the requested one is missing", () => {
    expect(() =>
      selectTarget([page({ id: "main", title: "Obsidian" })], {
        title: "Settings",
      }),
    ).toThrow(/Obsidian/);
  });

  it("refuses to guess between several non-Obsidian pages", () => {
    expect(() =>
      selectTarget(
        [
          page({ id: "a", title: "A", url: "https://a.example/" }),
          page({ id: "b", title: "B", url: "https://b.example/" }),
        ],
        {},
      ),
    ).toThrow(CdpError);
  });

  it("throws when there is no page target", () => {
    expect(() => selectTarget([], {})).toThrow(CdpError);
  });
});

describe("obsidian-cdp choosePort", () => {
  it("prefers a port with an Obsidian window over an earlier other app", () => {
    const chosen = choosePort([
      {
        port: 9222,
        pages: [page({ id: "chrome", url: "https://example.com/" })],
      },
      { port: 9333, pages: [page({ id: "obsidian" })] },
    ]);
    expect(chosen.port).toBe(9333);
  });

  it("falls back to the first reachable port when none is Obsidian", () => {
    const chosen = choosePort([
      {
        port: 9222,
        pages: [page({ id: "chrome", url: "https://example.com/" })],
      },
    ]);
    expect(chosen.port).toBe(9222);
  });

  it("returns undefined when no port is reachable", () => {
    expect(choosePort([])).toBeUndefined();
  });
});

describe("obsidian-cdp renderValue", () => {
  it("prints a serializable value as JSON", () => {
    expect(renderValue({ type: "number", value: 3 })).toBe("3");
  });

  it("prints non-finite numbers and bigints from unserializableValue", () => {
    expect(renderValue({ type: "number", unserializableValue: "NaN" })).toBe(
      "NaN",
    );
    expect(renderValue({ type: "number", unserializableValue: "-0" })).toBe(
      "-0",
    );
    expect(renderValue({ type: "bigint", unserializableValue: "42n" })).toBe(
      "42n",
    );
  });

  it("prints undefined and a missing result", () => {
    expect(renderValue({ type: "undefined" })).toBe("undefined");
    expect(renderValue(undefined)).toBe("undefined");
  });
});

describe("obsidian-cdp parseBatch", () => {
  it("reads a single-line eval", () => {
    expect(parseBatch("@eval 1 + 1")).toEqual([
      { kind: "eval", code: "1 + 1" },
    ]);
  });

  it("reads a multi-line eval body, dedented and trimmed", () => {
    const text = [
      "@eval",
      "  const a = 1;",
      "  a + 1",
      "",
      "@shot out.png",
    ].join("\n");
    expect(parseBatch(text)).toEqual([
      { kind: "eval", code: "const a = 1;\na + 1" },
      { kind: "shot", path: "out.png" },
    ]);
  });

  it("keeps an @-line that is not a step inside an eval body", () => {
    const text = [
      "@eval",
      "const css = `@media { color: red }`;",
      "css",
      "@shot out.png",
    ].join("\n");
    expect(parseBatch(text)).toEqual([
      { kind: "eval", code: "const css = `@media { color: red }`;\ncss" },
      { kind: "shot", path: "out.png" },
    ]);
  });

  it("reads wait and target steps", () => {
    expect(parseBatch("@wait 250\n@target Settings")).toEqual([
      { kind: "wait", ms: 250 },
      { kind: "target", title: "Settings" },
    ]);
  });

  it("ignores blank lines and handles CRLF", () => {
    expect(parseBatch("\r\n\r\n@eval 1\r\n\r\n")).toEqual([
      { kind: "eval", code: "1" },
    ]);
  });

  it("rejects stray, unknown, or incomplete steps", () => {
    expect(() => parseBatch("just text")).toThrow(CdpError);
    expect(() => parseBatch("@frob")).toThrow(CdpError);
    expect(() => parseBatch("@shot")).toThrow(CdpError);
    expect(() => parseBatch("@wait soon")).toThrow(CdpError);
    expect(() => parseBatch("")).toThrow(CdpError);
  });
});

describe("obsidian-cdp assertWebSocket", () => {
  it("accepts a runtime that provides WebSocket", () => {
    expect(() => assertWebSocket(true)).not.toThrow();
  });

  it("explains the Node requirement when WebSocket is missing", () => {
    expect(() => assertWebSocket(false)).toThrow(/Node 22/);
  });
});

describe("obsidian-cdp connect", () => {
  it("rejects a pending call when the socket closes", async () => {
    const { connection, socket } = connectWithFakeSocket(10_000);
    socket.emit("open");
    const pending = connection.send("Runtime.evaluate", { expression: "1" });
    socket.emit("close");
    await expect(pending).rejects.toThrow(/closed/);
  });

  it("rejects a call that is never answered", async () => {
    const { connection, socket } = connectWithFakeSocket(20);
    socket.emit("open");
    await expect(connection.send("Runtime.evaluate")).rejects.toThrow(
      /Timed out/,
    );
  });

  it("resolves a call when the matching reply arrives", async () => {
    const { connection, socket } = connectWithFakeSocket(10_000);
    socket.emit("open");
    const pending = connection.send("Runtime.evaluate", { expression: "1" });
    socket.emit("message", {
      data: JSON.stringify({
        id: socket.sent[0].id,
        result: { type: "number", value: 1 },
      }),
    });
    await expect(pending).resolves.toEqual({ type: "number", value: 1 });
  });
});
