import { describe, expect, it } from "vitest";

import {
  CdpError,
  DEFAULT_PORTS,
  assertWebSocket,
  parseArgs,
  parseBatch,
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
