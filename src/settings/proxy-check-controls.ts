/**
 * The on-demand CORS proxy check's controls (#1298), rendered inside
 * Settings → General → Proxy: two buttons, the threshold hint, and the inline
 * board. The probe and the session-only holder live in `src/utils/proxy-check.ts`.
 */
import { Setting, setTooltip } from "obsidian";
import {
  buildProxyCheckCandidates,
  fastestProxyCheckIndex,
  formatProxyCheckElapsed,
  PROXY_CHECK_FAST_MS,
  PROXY_CHECK_TARGET_URL,
  PROXY_CHECK_TIMEOUT_MS,
  proxyCheckCandidateLabel,
  proxyCheckStatusLabel,
  resolveSelectedProxyState,
  runProxyCheck,
  type ProxyCheckBoard,
  type ProxyCheckCandidate,
  type ProxyCheckResponse,
  type ProxyCheckResult,
  type ProxyCheckStore,
  type SelectedProxyState,
} from "../utils/proxy-check";

/**
 * Why "Test selected proxy" is unavailable, in the words its tooltip shows.
 * Colour and state alone never carry the reason.
 */
const UNAVAILABLE_REASON: Record<"auto" | "empty" | "uncommitted", string> = {
  auto: "Choose a single proxy to test it on its own",
  empty: "Choose a proxy to test",
  uncommitted: "Save the proxy URL before testing it",
};

const RUNNING_REASON = "Wait for the running check to finish";

export interface ProxyCheckControlsOptions {
  /** The Proxy URL dropdown's current value, including its empty option. */
  readSelectedProxyOption: () => string;
  /** The saved Proxy URL setting, read when a button is pressed. */
  readSavedProxyUrl: () => string;
  /** The URL field's current value, which may not be saved yet. */
  readPendingProxyUrl: () => string;
  /** The plugin's session-only holder for the last run. */
  store: ProxyCheckStore;
  /** Fetches one URL, through the same request path a real fetch uses. */
  fetchText: (url: string) => Promise<ProxyCheckResponse>;
}

export interface ProxyCheckControls {
  /** Re-reads the selection and redraws the buttons' availability. */
  refreshSelection: () => void;
  /** Releases the store subscription. */
  dispose: () => void;
}

/** The hint beside the buttons: what is fetched, the thresholds, and the path covered. */
function proxyCheckHint(): DocumentFragment {
  const fastSeconds = PROXY_CHECK_FAST_MS / 1000;
  const timeoutSeconds = PROXY_CHECK_TIMEOUT_MS / 1000;
  return createFragment((fragment) => {
    fragment.appendText("Requests ");
    fragment.createEl("code", { text: PROXY_CHECK_TARGET_URL });
    fragment.appendText(
      ` through each proxy: under ${fastSeconds} s is fast, from ${fastSeconds} s to ${timeoutSeconds} s is slow, and no answer in ${timeoutSeconds} s is a timeout. Covers full-article fetches only, not feed refresh.`,
    );
  });
}

/** One row per proxy, in the order given, with the fastest answered row marked. */
function buildProxyCheckRows(
  results: readonly ProxyCheckResult[],
  fastestIndex: number,
): HTMLUListElement {
  const list = createEl("ul", { cls: "rss-proxy-check-rows" });

  results.forEach((result, index) => {
    const item = list.createEl("li", { cls: "rss-proxy-check-row" });
    item.setAttr("data-status", result.status);
    item.createSpan({ cls: "rss-proxy-check-label", text: result.label });
    if (result.elapsedMs !== undefined) {
      item.createSpan({
        cls: "rss-proxy-check-time",
        text: formatProxyCheckElapsed(result.elapsedMs),
      });
    }
    item.createSpan({
      cls: "rss-proxy-check-status",
      text: proxyCheckStatusLabel(result),
    });
    if (index === fastestIndex) {
      item.createSpan({ cls: "rss-proxy-check-fastest", text: "fastest" });
    }
  });

  return list;
}

/** Draws the whole block from the board: a run in flight, the last run, or nothing yet. */
function paintProxyCheckBoard(
  boardEl: HTMLElement,
  board: ProxyCheckBoard,
): void {
  boardEl.empty();

  if (board.running) {
    boardEl.createDiv({
      cls: "rss-proxy-check-progress",
      text: "Testing proxies…",
    });
    // One "not tested" row per proxy in flight, so the board shows what the
    // run covers before any answer arrives.
    boardEl.appendChild(
      buildProxyCheckRows(
        board.candidates.map((candidate) => ({
          label: candidate.label,
          prefix: candidate.prefix,
          status: "not-tested",
        })),
        -1,
      ),
    );
    return;
  }

  const results = board.results;
  if (!results || results.length === 0) return;

  boardEl.appendChild(
    buildProxyCheckRows(
      results,
      results.length > 1 ? fastestProxyCheckIndex(results) : -1,
    ),
  );

  if (results.every((result) => result.status === "timeout")) {
    boardEl.createDiv({
      cls: "rss-proxy-check-note",
      text: `No proxy answered within ${PROXY_CHECK_TIMEOUT_MS / 1000} seconds; a slow or offline connection looks the same.`,
    });
  }
}

/** A disabled button says why through its tooltip; clearing it removes the attribute. */
function setButtonTooltip(
  buttonEl: HTMLButtonElement | undefined,
  text: string | null,
): void {
  if (!buttonEl) return;
  if (text === null) buttonEl.removeAttribute("aria-label");
  else setTooltip(buttonEl, text);
}

/**
 * Builds the check controls under the Proxy URL row and returns the selection
 * refresh the proxy controls call when the dropdown or URL field changes.
 */
export function renderProxyCheckControls(
  containerEl: HTMLElement,
  options: ProxyCheckControlsOptions,
): ProxyCheckControls {
  const {
    store,
    readSelectedProxyOption,
    readSavedProxyUrl,
    readPendingProxyUrl,
    fetchText,
  } = options;
  let testAllButton: import("obsidian").ButtonComponent | null = null;
  let testSelectedButton: import("obsidian").ButtonComponent | null = null;

  const setting = new Setting(containerEl)
    .setName("Test proxy connections")
    .setDesc(proxyCheckHint());

  const readSelection = (): SelectedProxyState =>
    resolveSelectedProxyState(
      readSelectedProxyOption(),
      readSavedProxyUrl(),
      readPendingProxyUrl(),
    );

  const runCheck = async (candidates: ProxyCheckCandidate[]): Promise<void> => {
    store.startRun(candidates);
    const results = await runProxyCheck({ candidates, fetchText });
    store.finishRun(results);
  };

  setting.addButton((button) => {
    testAllButton = button;
    button.setButtonText("Test all proxies").onClick(() => {
      void runCheck(buildProxyCheckCandidates(readSavedProxyUrl()));
    });
  });

  setting.addButton((button) => {
    testSelectedButton = button;
    button.setButtonText("Test selected proxy").onClick(() => {
      const state = readSelection();
      if (state.kind !== "ready") return;
      void runCheck([
        { label: proxyCheckCandidateLabel(state.prefix), prefix: state.prefix },
      ]);
    });
  });

  const boardEl = containerEl.createDiv({
    cls: "rss-proxy-check-board",
    attr: { role: "status" },
  });

  const refreshSelection = (): void => {
    const running = store.getBoard().running;
    const state = readSelection();
    const selectedReason = running
      ? RUNNING_REASON
      : state.kind === "ready"
        ? null
        : UNAVAILABLE_REASON[state.kind];

    testAllButton?.setDisabled(running);
    testSelectedButton?.setDisabled(state.kind !== "ready" || running);
    setButtonTooltip(testAllButton?.buttonEl, running ? RUNNING_REASON : null);
    setButtonTooltip(testSelectedButton?.buttonEl, selectedReason);
  };

  const unsubscribe = store.subscribe(() => {
    paintProxyCheckBoard(boardEl, store.getBoard());
    refreshSelection();
  });
  paintProxyCheckBoard(boardEl, store.getBoard());
  refreshSelection();

  return {
    refreshSelection,
    dispose: () => {
      unsubscribe();
    },
  };
}
