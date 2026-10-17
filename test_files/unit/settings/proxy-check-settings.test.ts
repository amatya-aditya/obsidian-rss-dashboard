import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { PAGE_ACCEPT } from "../../../src/utils/request-headers";
import { PREDEFINED_PROXIES } from "../../../src/utils/proxy-utils";
import {
  PROXY_CHECK_TARGET_URL,
  PROXY_CHECK_TIMEOUT_MS,
  ProxyCheckStore,
} from "../../../src/utils/proxy-check";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// The check fetches through the plugin's own fetch helper; stubbing it here is
// what keeps this suite off the network.
vi.mock("../../../src/utils/platform-utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/utils/platform-utils")>();
  return { ...actual, robustFetchDetailed: vi.fn() };
});

import { robustFetchDetailed } from "../../../src/utils/platform-utils";
import {
  renderGeneralSettingsTab,
  type GeneralSettingsPlugin,
} from "../../../src/settings/tabs/general-settings-tab";

const ENCODED_TARGET = encodeURIComponent(PROXY_CHECK_TARGET_URL);
const BODY = "<html><body>Example Domain</body></html>";
const CUSTOM_PROXY_URL = "https://proxy.test/?url=";

const fetchMock = vi.mocked(robustFetchDetailed);

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
}

function createPlugin(
  overrides: { corsProxyUrl?: string; store?: ProxyCheckStore } = {},
): GeneralSettingsPlugin {
  const settings = cloneSettings();
  if (overrides.corsProxyUrl !== undefined) {
    settings.corsProxyUrl = overrides.corsProxyUrl;
  }
  return {
    app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
    settingTab: null,
    settings,
    saveSettings: vi.fn(async () => {}),
    getActiveDashboardView: vi.fn(async () => null),
    importPortableDataBundleFromFile: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
    applyFeedLimitsToAllFeeds: vi.fn(async () => {}),
    refreshFeeds: vi.fn(async () => {}),
    openShortcutHelp: vi.fn(),
    proxyCheckStore: overrides.store ?? new ProxyCheckStore(),
  } as unknown as GeneralSettingsPlugin;
}

function renderTab(plugin: GeneralSettingsPlugin): HTMLElement {
  const containerEl = createDiv();
  document.body.appendChild(containerEl);
  renderGeneralSettingsTab(containerEl, plugin);
  return containerEl;
}

function findButton(containerEl: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(containerEl.querySelectorAll("button")).find(
    (element) => element.textContent === text,
  );
  if (!button) throw new Error(`Could not find button: ${text}`);
  return button;
}

function rowTexts(containerEl: HTMLElement): string[] {
  return Array.from(
    containerEl.querySelectorAll<HTMLElement>(".rss-proxy-check-row"),
  ).map((row) => row.textContent ?? "");
}

/** Answers every request with a body after the given delay. */
function answersAfter(elapsedMs: number): void {
  fetchMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        window.setTimeout(
          () => resolve({ text: BODY, status: 200 }),
          elapsedMs,
        );
      }),
  );
}

function neverAnswers(): void {
  fetchMock.mockImplementation(() => new Promise(() => {}));
}

function rowLabels(containerEl: HTMLElement): string[] {
  return Array.from(
    containerEl.querySelectorAll<HTMLElement>(".rss-proxy-check-label"),
  ).map((label) => label.textContent ?? "");
}

function proxyControl<T extends Element>(
  containerEl: HTMLElement,
  selector: string,
): T {
  const element = containerEl.querySelector<T>(
    `.rss-proxy-setting-item ${selector}`,
  );
  if (!element) throw new Error(`Could not find proxy control: ${selector}`);
  return element;
}

/** Presses a check button and lets the run reach the network. */
async function press(button: HTMLButtonElement): Promise<void> {
  button.click();
  await vi.advanceTimersByTimeAsync(0);
}

describe("General settings proxy check (#1298)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.useFakeTimers();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("offers both check buttons under the proxy controls and sends nothing on its own", () => {
    const containerEl = renderTab(createPlugin());

    expect(findButton(containerEl, "Test all proxies")).toBeTruthy();
    expect(findButton(containerEl, "Test selected proxy")).toBeTruthy();
    expect(containerEl.textContent).toContain(PROXY_CHECK_TARGET_URL);
    expect(containerEl.textContent).toContain("full-article");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rowTexts(containerEl)).toEqual([]);
  });

  it("disables Test selected proxy on auto, with a reason", () => {
    const containerEl = renderTab(createPlugin({ corsProxyUrl: "auto" }));
    const button = findButton(containerEl, "Test selected proxy");

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe(
      "Choose a single proxy to test it on its own",
    );
  });

  it("disables Test selected proxy when no proxy is chosen", () => {
    const containerEl = renderTab(createPlugin({ corsProxyUrl: "" }));
    const button = findButton(containerEl, "Test selected proxy");

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBeTruthy();
  });

  it("enables Test selected proxy for one chosen built-in proxy", () => {
    const proxyUrl = PREDEFINED_PROXIES[3]?.url ?? "";
    const containerEl = renderTab(createPlugin({ corsProxyUrl: proxyUrl }));
    const button = findButton(containerEl, "Test selected proxy");

    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBeNull();
  });

  it("disables Test selected proxy while a custom URL is uncommitted", () => {
    const containerEl = renderTab(
      createPlugin({ corsProxyUrl: CUSTOM_PROXY_URL }),
    );
    const input = proxyControl<HTMLInputElement>(
      containerEl,
      "input[type='text']",
    );

    expect(findButton(containerEl, "Test selected proxy").disabled).toBe(false);

    input.value = "https://other.test/?url=";
    input.dispatchEvent(new Event("input"));

    expect(findButton(containerEl, "Test selected proxy").disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables Test selected proxy when the dropdown goes back to its empty option", () => {
    const containerEl = renderTab(
      createPlugin({ corsProxyUrl: PREDEFINED_PROXIES[1]?.url ?? "" }),
    );
    const select = proxyControl<HTMLSelectElement>(containerEl, "select");

    expect(findButton(containerEl, "Test selected proxy").disabled).toBe(false);

    select.value = "";
    select.dispatchEvent(new Event("change"));

    const button = findButton(containerEl, "Test selected proxy");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables Test selected proxy when the dropdown asks for a new URL while a built-in is saved", () => {
    const containerEl = renderTab(
      createPlugin({ corsProxyUrl: PREDEFINED_PROXIES[1]?.url ?? "" }),
    );
    const select = proxyControl<HTMLSelectElement>(containerEl, "select");

    select.value = "custom";
    select.dispatchEvent(new Event("change"));

    const button = findButton(containerEl, "Test selected proxy");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tests every built-in proxy plus the configured custom URL, through the fixed target", async () => {
    answersAfter(142);
    const containerEl = renderTab(
      createPlugin({ corsProxyUrl: CUSTOM_PROXY_URL }),
    );

    await press(findButton(containerEl, "Test all proxies"));

    expect(fetchMock).toHaveBeenCalledTimes(PREDEFINED_PROXIES.length + 1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      ...PREDEFINED_PROXIES.map((proxy) => `${proxy.url}${ENCODED_TARGET}`),
      `${CUSTOM_PROXY_URL}${ENCODED_TARGET}`,
    ]);
    // The check reads a page, so it carries the page Accept policy header.
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { Accept: PAGE_ACCEPT },
    });
  });

  it("shows one row per proxy, in dropdown order, with the fastest marked", async () => {
    fetchMock.mockImplementation((url: string) => {
      const slow = url.startsWith(PREDEFINED_PROXIES[0]?.url ?? "");
      return new Promise((resolve) => {
        window.setTimeout(
          () => resolve({ text: BODY, status: 200 }),
          slow ? 3000 : 100,
        );
      });
    });
    const containerEl = renderTab(createPlugin());

    await press(findButton(containerEl, "Test all proxies"));
    await vi.advanceTimersByTimeAsync(3000);

    const rows = Array.from(
      containerEl.querySelectorAll<HTMLElement>(".rss-proxy-check-row"),
    );
    expect(rows).toHaveLength(PREDEFINED_PROXIES.length);
    expect(rowLabels(containerEl)).toEqual(
      PREDEFINED_PROXIES.map((proxy) => proxy.label),
    );
    expect(rows[0]?.querySelector(".rss-proxy-check-time")?.textContent).toBe(
      "3.0 s",
    );
    expect(rows[0]?.querySelector(".rss-proxy-check-status")?.textContent).toBe(
      "slow",
    );
    expect(rows[1]?.querySelector(".rss-proxy-check-time")?.textContent).toBe(
      "100 ms",
    );
    expect(rows[1]?.querySelector(".rss-proxy-check-status")?.textContent).toBe(
      "fast",
    );
    expect(
      rows.map((row) => row.querySelector(".rss-proxy-check-fastest") !== null),
    ).toEqual([false, true, false, false, false, false]);
  });

  it("states each failure and a timeout in words as well as colour", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith(PREDEFINED_PROXIES[0]?.url ?? "")) {
        return Promise.reject(
          Object.assign(new Error("Request failed, status 502"), {
            status: 502,
          }),
        );
      }
      if (url.startsWith(PREDEFINED_PROXIES[1]?.url ?? "")) {
        return Promise.resolve({ text: "  ", status: 200 });
      }
      return new Promise(() => {});
    });
    const containerEl = renderTab(createPlugin());

    await press(findButton(containerEl, "Test all proxies"));
    await vi.advanceTimersByTimeAsync(PROXY_CHECK_TIMEOUT_MS);

    expect(rowTexts(containerEl)[0]).toContain("failed (HTTP 502)");
    expect(rowTexts(containerEl)[1]).toContain("failed (no content)");
    expect(rowTexts(containerEl)[2]).toContain("timed out");
    expect(
      containerEl.querySelector<HTMLElement>(".rss-proxy-check-row")?.dataset
        .status,
    ).toBe("failed");
  });

  it("disables both buttons during a run and shows the proxies being tested", async () => {
    neverAnswers();
    const containerEl = renderTab(createPlugin());
    const all = findButton(containerEl, "Test all proxies");
    const selected = findButton(containerEl, "Test selected proxy");

    await press(all);

    expect(all.disabled).toBe(true);
    expect(selected.disabled).toBe(true);
    expect(
      containerEl.querySelector(".rss-proxy-check-progress")?.textContent,
    ).toBeTruthy();
    expect(rowTexts(containerEl)).toHaveLength(PREDEFINED_PROXIES.length);
    expect(
      containerEl.querySelector(".rss-proxy-check-status")?.textContent,
    ).toBe("not tested");

    await vi.advanceTimersByTimeAsync(PROXY_CHECK_TIMEOUT_MS);

    expect(all.disabled).toBe(false);
    expect(containerEl.querySelector(".rss-proxy-check-progress")).toBeNull();
  });

  it("says in a sentence when every proxy timed out", async () => {
    neverAnswers();
    const containerEl = renderTab(createPlugin());

    await press(findButton(containerEl, "Test all proxies"));
    await vi.advanceTimersByTimeAsync(PROXY_CHECK_TIMEOUT_MS);

    expect(
      containerEl.querySelector(".rss-proxy-check-note")?.textContent,
    ).toContain("No proxy answered");
  });

  it("tests only the chosen proxy and replaces the block with its single row", async () => {
    answersAfter(142);
    const proxy = PREDEFINED_PROXIES[3];
    const containerEl = renderTab(
      createPlugin({ corsProxyUrl: proxy?.url ?? "" }),
    );

    await press(findButton(containerEl, "Test all proxies"));
    await vi.advanceTimersByTimeAsync(142);
    await press(findButton(containerEl, "Test selected proxy"));
    await vi.advanceTimersByTimeAsync(142);

    expect(fetchMock).toHaveBeenCalledTimes(PREDEFINED_PROXIES.length + 1);
    const calls = fetchMock.mock.calls;
    expect(calls[calls.length - 1]?.[0]).toBe(
      `${proxy?.url ?? ""}${ENCODED_TARGET}`,
    );
    expect(rowLabels(containerEl)).toEqual([proxy?.label ?? ""]);
  });

  it("keeps a finished run across a re-render and drops it on reload", async () => {
    answersAfter(142);
    const store = new ProxyCheckStore();
    const plugin = createPlugin({ store });
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const dispose = renderGeneralSettingsTab(containerEl, plugin);

    await press(findButton(containerEl, "Test all proxies"));
    await vi.advanceTimersByTimeAsync(142);

    expect(rowLabels(containerEl)).toHaveLength(PREDEFINED_PROXIES.length);
    expect(rowTexts(containerEl)[0]).toContain("fast");
    expect(plugin.saveSettings).not.toHaveBeenCalled();

    // A settings-tab switch disposes this render's subscription and renders again.
    dispose?.();
    containerEl.empty();
    renderGeneralSettingsTab(containerEl, plugin);

    expect(rowLabels(containerEl)).toHaveLength(PREDEFINED_PROXIES.length);
    expect(rowTexts(containerEl)[0]).toContain("fast");

    // A plugin reload builds a new store, so the session's board is gone.
    const reloadedContainer = renderTab(createPlugin());
    expect(rowTexts(reloadedContainer)).toEqual([]);
  });

  it("sends nothing when the dropdown changes", async () => {
    const containerEl = renderTab(createPlugin());
    const select = proxyControl<HTMLSelectElement>(containerEl, "select");

    select.value = PREDEFINED_PROXIES[1]?.url ?? "";
    select.dispatchEvent(new Event("change"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(findButton(containerEl, "Test selected proxy").disabled).toBe(false);
  });
});
