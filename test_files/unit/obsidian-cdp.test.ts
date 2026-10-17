import { describe, expect, it } from "vitest";

import {
  CdpError,
  DEFAULT_PORTS,
  assessCompanionTarget,
  assessVaultOwnership,
  assertWebSocket,
  buildPrepareScript,
  choosePort,
  connect,
  isObsidianVaultTarget,
  normalizeVaultPath,
  parseArgs,
  parseBatch,
  parseDevToolsActivePort,
  parseKeySpec,
  parseSettingsTitle,
  pollUntilReady,
  renderValue,
  selectSettingsTarget,
  selectSettingsTargets,
  selectStarterTargets,
  selectTarget,
  summarizeAxNode,
  summarizeAxQuery,
  vaultBasename,
} from "../../scripts/obsidian-cdp.mjs";

const noEnv = {};

const SETTINGS_TITLE = "Settings - .fixture-vault - Obsidian 1.14.0";
const FIXTURE_VAULT = "C:\\work\\rss\\.fixture-vault";

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
    expect(options.expectVault).toBeUndefined();
    expect(options.profile).toBeUndefined();
    expect(options.waitMs).toBe(0);
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

  it("reads the vault expectation, profile, and wait in both forms", () => {
    const spaced = parseArgs(
      [
        "--expect-vault",
        "C:\\vault",
        "--profile",
        "C:\\profile",
        "--wait",
        "5000",
        "eval",
        "probe.js",
      ],
      noEnv,
    );
    expect(spaced.expectVault).toBe("C:\\vault");
    expect(spaced.profile).toBe("C:\\profile");
    expect(spaced.waitMs).toBe(5000);

    const equals = parseArgs(
      [
        "--expect-vault=C:\\vault",
        "--profile=C:\\profile",
        "--wait=0",
        "targets",
      ],
      noEnv,
    );
    expect(equals.expectVault).toBe("C:\\vault");
    expect(equals.profile).toBe("C:\\profile");
    expect(equals.waitMs).toBe(0);
  });

  it("falls back to CDP_EXPECT_VAULT, CDP_PROFILE, and CDP_WAIT", () => {
    const options = parseArgs(["targets"], {
      CDP_EXPECT_VAULT: "C:\\vault",
      CDP_PROFILE: "C:\\profile",
      CDP_WAIT: "250",
    });
    expect(options.expectVault).toBe("C:\\vault");
    expect(options.profile).toBe("C:\\profile");
    expect(options.waitMs).toBe(250);
  });

  it("rejects bad ownership and wait values", () => {
    expect(() => parseArgs(["--wait", "-1", "targets"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["--wait", "soon", "targets"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["--expect-vault", "", "targets"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["--profile", "", "targets"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["targets"], { CDP_WAIT: "x" })).toThrow(CdpError);
  });

  it("reads --settings and the open-settings command", () => {
    expect(parseArgs(["eval", "probe.js"], noEnv).settings).toBe(false);
    expect(parseArgs(["--settings", "eval", "probe.js"], noEnv).settings).toBe(
      true,
    );
    const open = parseArgs(["open-settings", "rss-dashboard"], noEnv);
    expect(open.command).toBe("open-settings");
    expect(open.args).toEqual(["rss-dashboard"]);
  });

  it("rejects --settings where it has no meaning", () => {
    expect(() => parseArgs(["--settings", "targets"], noEnv)).toThrow(CdpError);
    expect(() =>
      parseArgs(["--settings", "open-settings", "rss-dashboard"], noEnv),
    ).toThrow(CdpError);
    expect(() =>
      parseArgs(["--settings", "--target", "x", "eval", "p.js"], noEnv),
    ).toThrow(CdpError);
    expect(() => parseArgs(["open-settings"], noEnv)).toThrow(CdpError);
  });

  it("reads the prepare-vault command and its keep flags", () => {
    const prep = parseArgs(["prepare-vault"], noEnv);
    expect(prep.command).toBe("prepare-vault");
    expect(prep.keepSettings).toBe(false);
    expect(prep.keepLeft).toBe(false);
    expect(
      parseArgs(["--keep-settings", "prepare-vault"], noEnv).keepSettings,
    ).toBe(true);
    expect(parseArgs(["--keep-left", "prepare-vault"], noEnv).keepLeft).toBe(
      true,
    );
  });

  it("rejects prepare-vault misuse", () => {
    expect(() => parseArgs(["prepare-vault", "extra"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["--settings", "prepare-vault"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["--keep-settings", "eval", "p.js"], noEnv)).toThrow(
      CdpError,
    );
    expect(() => parseArgs(["--keep-left", "targets"], noEnv)).toThrow(
      CdpError,
    );
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

  it("prefers a real vault window over the picker", () => {
    const picked = selectTarget(
      [
        page({
          id: "picker",
          title: "Obsidian",
          url: "app://obsidian.md/starter.html",
        }),
        page({
          id: "vault",
          title: "Obsidian",
          url: "app://obsidian.md/index.html",
        }),
      ],
      {},
    );
    expect(picked.id).toBe("vault");
  });

  it("does not silently pick the picker while other pages are open", () => {
    expect(() =>
      selectTarget(
        [
          page({ id: "picker", url: "app://obsidian.md/starter.html" }),
          page({ id: "settings", url: "about:blank" }),
        ],
        {},
      ),
    ).toThrow(CdpError);
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

  it("prefers a real vault port over a picker-only port", () => {
    const chosen = choosePort([
      {
        port: 9333,
        pages: [page({ id: "picker", url: "app://obsidian.md/starter.html" })],
      },
      {
        port: 9334,
        pages: [page({ id: "vault", url: "app://obsidian.md/index.html" })],
      },
    ]);
    expect(chosen.port).toBe(9334);
  });
});

describe("obsidian-cdp vault ownership", () => {
  it("accepts the expected vault, ignoring case and separators", () => {
    const result = assessVaultOwnership({
      targetUrl: "app://obsidian.md/index.html",
      vaultPath: "C:\\Work\\Vault\\",
      expectedVault: "c:/work/vault",
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("ok");
  });

  it("refuses a different vault and names the one it found", () => {
    const result = assessVaultOwnership({
      targetUrl: "app://obsidian.md/index.html",
      vaultPath: "C:\\other\\worktree\\.fixture-vault",
      expectedVault: "C:\\mine\\.fixture-vault",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("mismatch");
    expect(result.message).toContain("C:\\other\\worktree\\.fixture-vault");
    expect(result.message).toContain("--port");
  });

  it("refuses the vault picker, which has no vault", () => {
    const result = assessVaultOwnership({
      targetUrl: "app://obsidian.md/starter.html",
      vaultPath: undefined,
      expectedVault: "C:\\mine\\.fixture-vault",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not-a-vault");
    expect(result.message).toContain("starter.html");
  });

  it("refuses a vault window whose path is missing", () => {
    const result = assessVaultOwnership({
      targetUrl: "app://obsidian.md/index.html",
      vaultPath: undefined,
      expectedVault: "C:\\mine",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("no-vault");
  });

  it("has no opinion without an expectation (backward compatible)", () => {
    const result = assessVaultOwnership({
      targetUrl: "app://obsidian.md/starter.html",
      vaultPath: undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("no-expectation");
  });

  it("recognises only the vault window, not the picker or other urls", () => {
    expect(isObsidianVaultTarget({ url: "app://obsidian.md/index.html" })).toBe(
      true,
    );
    expect(
      isObsidianVaultTarget({ url: "app://obsidian.md/starter.html" }),
    ).toBe(false);
    expect(isObsidianVaultTarget({ url: "about:blank" })).toBe(false);
    expect(isObsidianVaultTarget({ url: "https://example.com/" })).toBe(false);
  });

  it("normalises Windows paths for comparison", () => {
    expect(normalizeVaultPath("C:\\Vault\\")).toBe("c:/vault");
    expect(normalizeVaultPath("c:/vault")).toBe("c:/vault");
    expect(normalizeVaultPath("  ")).toBeUndefined();
    expect(normalizeVaultPath(undefined)).toBeUndefined();
  });
});

describe("obsidian-cdp companion Settings target", () => {
  const settingsPage = (overrides: Record<string, unknown> = {}) =>
    page({
      id: "settings",
      title: SETTINGS_TITLE,
      url: "about:blank",
      ...overrides,
    });

  it("reads the vault name and version from the Settings title", () => {
    expect(parseSettingsTitle(SETTINGS_TITLE)).toEqual({
      vaultName: ".fixture-vault",
      version: "1.14.0",
    });
    expect(
      parseSettingsTitle("Settings - My - Vault - Obsidian 1.14.0")?.vaultName,
    ).toBe("My - Vault");
    expect(parseSettingsTitle("Obsidian")).toBeUndefined();
    expect(parseSettingsTitle("Settings - RSS Dashboard")).toBeUndefined();
    expect(parseSettingsTitle(undefined)).toBeUndefined();
  });

  it("takes the vault name from the last path segment, ignoring case", () => {
    expect(vaultBasename("C:\\Work\\.Fixture-Vault\\")).toBe(".fixture-vault");
    expect(vaultBasename("/home/me/vault")).toBe("vault");
    expect(vaultBasename("  ")).toBeUndefined();
  });

  it("accepts the Settings window of the expected vault on a pinned port", () => {
    const result = assessCompanionTarget({
      target: settingsPage(),
      expectedVault: FIXTURE_VAULT,
      pinned: true,
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("ok");
  });

  it("refuses a Settings window that names another vault", () => {
    const result = assessCompanionTarget({
      target: settingsPage({
        title: "Settings - Personal - Obsidian 1.14.0",
      }),
      expectedVault: FIXTURE_VAULT,
      pinned: true,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("wrong-vault");
    expect(result.message).toContain("Personal");
  });

  it("refuses the Settings window when the port is not pinned by --profile", () => {
    const result = assessCompanionTarget({
      target: settingsPage(),
      expectedVault: FIXTURE_VAULT,
      pinned: false,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("unpinned");
    expect(result.message).toContain("--profile");
  });

  it("refuses the Settings window without an expected vault", () => {
    const result = assessCompanionTarget({
      target: settingsPage(),
      expectedVault: undefined,
      pinned: true,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("no-expectation");
    expect(result.message).toContain("--expect-vault");
  });

  it("refuses a page that is not titled as a Settings window", () => {
    const result = assessCompanionTarget({
      target: page({ title: "Some page", url: "about:blank" }),
      expectedVault: FIXTURE_VAULT,
      pinned: true,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not-settings");
  });

  it("refuses a Settings-titled page that is not about:blank", () => {
    const result = assessCompanionTarget({
      target: settingsPage({ url: "https://evil.example/" }),
      expectedVault: FIXTURE_VAULT,
      pinned: true,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not-settings");
  });

  it("selects the matching Settings window among the open pages", () => {
    const picked = selectSettingsTarget(
      [page({ id: "vault" }), settingsPage()],
      { expectedVault: FIXTURE_VAULT, pinned: true },
    );
    expect(picked.ok).toBe(true);
    expect(picked.target?.id).toBe("settings");
  });

  it("reports that no Settings window is open yet", () => {
    const picked = selectSettingsTarget([page({ id: "vault" })], {
      expectedVault: FIXTURE_VAULT,
      pinned: true,
    });
    expect(picked.ok).toBe(false);
    expect(picked.code).toBe("none-open");
  });

  it("refuses to pick when only another vault's Settings window is open", () => {
    const picked = selectSettingsTarget(
      [
        page({ id: "vault" }),
        settingsPage({ title: "Settings - Personal - Obsidian 1.14.0" }),
      ],
      { expectedVault: FIXTURE_VAULT, pinned: true },
    );
    expect(picked.ok).toBe(false);
    expect(picked.code).toBe("wrong-vault");
  });

  it("refuses to pick on an unpinned port even when the name matches", () => {
    const picked = selectSettingsTarget(
      [page({ id: "vault" }), settingsPage()],
      {
        expectedVault: FIXTURE_VAULT,
        pinned: false,
      },
    );
    expect(picked.ok).toBe(false);
    expect(picked.code).toBe("unpinned");
  });
});

describe("obsidian-cdp prepare-vault", () => {
  const starterPage = (overrides: Record<string, unknown> = {}) =>
    page({
      id: "picker",
      title: "Obsidian",
      url: "app://obsidian.md/starter.html",
      ...overrides,
    });
  const settingsPage = (overrides: Record<string, unknown> = {}) =>
    page({
      id: "settings",
      title: SETTINGS_TITLE,
      url: "about:blank",
      ...overrides,
    });

  it("finds the vault-picker windows and ignores the vault", () => {
    const pickers = selectStarterTargets([
      page({ id: "vault" }),
      starterPage(),
      page({ id: "other", url: "https://example.com/" }),
    ]);
    expect(pickers.map((target) => target.id)).toEqual(["picker"]);
  });

  it("finds every Settings window of the expected vault", () => {
    const found = selectSettingsTargets(
      [
        page({ id: "vault" }),
        settingsPage(),
        settingsPage({ id: "settings-2" }),
        settingsPage({
          id: "foreign",
          title: "Settings - Personal - Obsidian 1.14.0",
        }),
      ],
      { expectedVault: FIXTURE_VAULT },
    );
    expect(found.map((target) => target.id)).toEqual([
      "settings",
      "settings-2",
    ]);
  });

  it("finds no Settings windows on an unpinned port", () => {
    expect(
      selectSettingsTargets([settingsPage()], {
        expectedVault: FIXTURE_VAULT,
        pinned: false,
      }),
    ).toEqual([]);
  });

  it("builds a script that closes Settings and collapses the panes", () => {
    const script = buildPrepareScript();
    expect(script).toContain("app.setting.close()");
    expect(script).toContain("leftSplit?.collapse");
    expect(script).toContain("rightSplit?.collapse");
  });

  it("leaves a surface alone when its keep flag is set", () => {
    const keepSettings = buildPrepareScript({ keepSettings: true });
    expect(keepSettings).not.toContain("app.setting.close()");
    expect(keepSettings).toContain("leftSplit?.collapse");

    const keepLeft = buildPrepareScript({ keepLeft: true });
    expect(keepLeft).toContain("app.setting.close()");
    expect(keepLeft).not.toContain("collapse");
  });
});

describe("obsidian-cdp parseDevToolsActivePort", () => {
  it("reads the bound port from the first line", () => {
    expect(parseDevToolsActivePort("9333\n/devtools/browser/abc\n")).toBe(9333);
    expect(parseDevToolsActivePort("  9437  \r\n")).toBe(9437);
  });

  it("rejects a file without a usable port", () => {
    expect(() => parseDevToolsActivePort("")).toThrow(CdpError);
    expect(() => parseDevToolsActivePort("nope")).toThrow(CdpError);
    expect(() => parseDevToolsActivePort("99999")).toThrow(CdpError);
  });
});

describe("obsidian-cdp pollUntilReady", () => {
  function fakeClock() {
    let value = 0;
    return {
      now: () => value,
      sleep: async (ms: number) => {
        value += ms;
      },
    };
  }

  it("returns the value once the target appears after N polls", async () => {
    let polls = 0;
    const clock = fakeClock();
    const result = await pollUntilReady({
      attempt: async () => {
        polls += 1;
        return polls >= 3 ? { id: "ready" } : undefined;
      },
      budgetMs: 1000,
      intervalMs: 100,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result).toEqual({ id: "ready" });
    expect(polls).toBe(3);
  });

  it("throws when the budget expires with no target", async () => {
    let polls = 0;
    const clock = fakeClock();
    await expect(
      pollUntilReady({
        attempt: async () => {
          polls += 1;
          return undefined;
        },
        budgetMs: 300,
        intervalMs: 100,
        now: clock.now,
        sleep: clock.sleep,
        onTimeout: () => new CdpError("nothing ready yet"),
      }),
    ).rejects.toThrow(/nothing ready yet/);
    expect(polls).toBeGreaterThan(1);
  });

  it("tries once and fails fast with no budget", async () => {
    let polls = 0;
    await expect(
      pollUntilReady({
        attempt: async () => {
          polls += 1;
          return undefined;
        },
        budgetMs: 0,
      }),
    ).rejects.toThrow(CdpError);
    expect(polls).toBe(1);
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

  it("reads the settings step", () => {
    expect(parseBatch("@settings\n@shot s.png")).toEqual([
      { kind: "settings" },
      { kind: "shot", path: "s.png" },
    ]);
  });

  it("reads the vault step", () => {
    expect(parseBatch("@settings\n@vault\n@shot v.png")).toEqual([
      { kind: "settings" },
      { kind: "vault" },
      { kind: "shot", path: "v.png" },
    ]);
  });

  it("rejects an argument on the vault step", () => {
    expect(() => parseBatch("@vault my-vault")).toThrow(CdpError);
  });

  it("rejects stray, unknown, or incomplete steps", () => {
    expect(() => parseBatch("just text")).toThrow(CdpError);
    expect(() => parseBatch("@frob")).toThrow(CdpError);
    expect(() => parseBatch("@shot")).toThrow(CdpError);
    expect(() => parseBatch("@wait soon")).toThrow(CdpError);
    expect(() => parseBatch("")).toThrow(CdpError);
  });

  it("reads key steps with an optional repeat count", () => {
    expect(parseBatch("@key Tab\n@key Shift+Tab 3")).toEqual([
      { kind: "key", key: parseKeySpec("Tab"), spec: "Tab", count: 1 },
      {
        kind: "key",
        key: parseKeySpec("Shift+Tab"),
        spec: "Shift+Tab",
        count: 3,
      },
    ]);
  });

  it("reads ax and axquery steps, keeping spaces in the selector", () => {
    const text = [
      '@ax .workspace-leaf-content[data-type="rss-dashboard-view"] .rss-dashboard-feed',
      "@axquery heading .modal-container .modal",
    ].join("\n");
    expect(parseBatch(text)).toEqual([
      {
        kind: "ax",
        selector:
          '.workspace-leaf-content[data-type="rss-dashboard-view"] .rss-dashboard-feed',
      },
      { kind: "axquery", role: "heading", selector: ".modal-container .modal" },
    ]);
  });

  it("rejects incomplete key, ax and axquery steps", () => {
    expect(() => parseBatch("@key")).toThrow(CdpError);
    expect(() => parseBatch("@key Tab zero")).toThrow(CdpError);
    expect(() => parseBatch("@key Tab 0")).toThrow(CdpError);
    expect(() => parseBatch("@key Hyper+Tab")).toThrow(CdpError);
    expect(() => parseBatch("@ax")).toThrow(CdpError);
    expect(() => parseBatch("@axquery heading")).toThrow(CdpError);
  });
});

describe("obsidian-cdp parseKeySpec", () => {
  it("reads named keys without text", () => {
    expect(parseKeySpec("Tab")).toEqual({
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      modifiers: 0,
    });
    expect(parseKeySpec("Esc")).toMatchObject({
      key: "Escape",
      windowsVirtualKeyCode: 27,
    });
    expect(parseKeySpec("ArrowDown")).toMatchObject({
      code: "ArrowDown",
      windowsVirtualKeyCode: 40,
    });
  });

  it("gives Enter and Space the text that activates native controls", () => {
    expect(parseKeySpec("Enter")).toMatchObject({ text: "\r" });
    expect(parseKeySpec("Space")).toMatchObject({ key: " ", text: " " });
  });

  it("sets modifier bits and reads function keys", () => {
    expect(parseKeySpec("Shift+F10")).toEqual({
      key: "F10",
      code: "F10",
      windowsVirtualKeyCode: 121,
      modifiers: 8,
    });
    expect(parseKeySpec("Ctrl+Alt+Delete").modifiers).toBe(3);
    expect(parseKeySpec("Meta+k").modifiers).toBe(4);
  });

  it("types a letter, upper-casing it under Shift", () => {
    expect(parseKeySpec("t")).toEqual({
      key: "t",
      code: "KeyT",
      windowsVirtualKeyCode: 84,
      modifiers: 0,
      text: "t",
    });
    expect(parseKeySpec("Shift+s")).toMatchObject({
      key: "S",
      code: "KeyS",
      modifiers: 8,
      text: "S",
    });
  });

  it("sends no text for a shortcut held with Ctrl, Alt or Meta", () => {
    expect(parseKeySpec("Ctrl+p")).not.toHaveProperty("text");
  });

  it("types digits and ?", () => {
    expect(parseKeySpec("1")).toMatchObject({ code: "Digit1", text: "1" });
    expect(parseKeySpec("?")).toMatchObject({ key: "?", text: "?" });
  });

  it("rejects empty specs, unknown keys and unknown modifiers", () => {
    expect(() => parseKeySpec("")).toThrow(CdpError);
    expect(() => parseKeySpec("Shift+")).toThrow(CdpError);
    expect(() => parseKeySpec("Banana")).toThrow(CdpError);
    expect(() => parseKeySpec("Hyper+a")).toThrow(CdpError);
  });
});

describe("obsidian-cdp accessibility summaries", () => {
  it("summarizes a node's role, name, ignored flag and properties", () => {
    expect(
      summarizeAxNode({
        nodeId: "7",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "computedString", value: "Article one" },
        properties: [
          { name: "level", value: { type: "integer", value: 3 } },
          {
            name: "focusable",
            value: { type: "booleanOrUndefined", value: true },
          },
        ],
      }),
    ).toEqual({
      role: "heading",
      name: "Article one",
      ignored: false,
      properties: { level: 3, focusable: true },
    });
  });

  it("reports an ignored node with an empty name", () => {
    expect(
      summarizeAxNode({
        ignored: true,
        role: { type: "role", value: "none" },
      }),
    ).toEqual({ role: "none", name: "", ignored: true, properties: {} });
  });

  it("counts query matches and leaves ignored nodes out", () => {
    expect(
      summarizeAxQuery([
        {
          ignored: false,
          role: { value: "dialog" },
          name: { value: "Add feed" },
        },
        { ignored: true, role: { value: "dialog" } },
        { ignored: false, role: { value: "dialog" } },
      ]),
    ).toEqual({
      count: 2,
      nodes: [
        { role: "dialog", name: "Add feed" },
        { role: "dialog", name: "" },
      ],
    });
  });

  it("returns an empty result for no matches", () => {
    expect(summarizeAxQuery([])).toEqual({ count: 0, nodes: [] });
    expect(summarizeAxQuery(undefined)).toEqual({ count: 0, nodes: [] });
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
