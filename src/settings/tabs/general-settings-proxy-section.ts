/** The Proxy section of the General settings tab. */
import { Notice, Setting } from "obsidian";
import type {
  ButtonComponent,
  DropdownComponent,
  TextComponent,
} from "obsidian";
import { robustFetchDetailed, setCssProps } from "../../utils/platform-utils";
import { addInputClearButton } from "../../utils/input-clear-button";
import { isValidUrl } from "../../utils/validation";
import { pageRequestHeaders } from "../../utils/request-headers";
import { renderProxyCheckControls } from "../proxy-check-controls";
import { CUSTOM_PROXY_OPTION } from "../../utils/proxy-check";
import { AUTO_PROXY_URL, PREDEFINED_PROXIES } from "../../utils/proxy-utils";
import type { GeneralSettingsPlugin } from "./general-settings-plugin";

/** The Proxy URL row's controls and the URL state they share. */
interface ProxyRowState {
  textComponent: TextComponent | null;
  saveButton: ButtonComponent | null;
  dropdownComponent: DropdownComponent | null;
  lastSavedProxyUrl: string;
  pendingProxyUrl: string;
  // The dropdown's current value, which the check's availability follows:
  // its empty option means nothing is selected, even though choosing it
  // leaves the configured proxy in place.
  selectedProxyOption: string;
  // The check controls are built below the dropdown and URL field they read,
  // so the handlers above them only reach them through this callback.
  refreshProxyCheckSelection: () => void;
}

/** Renders the Proxy heading, CORS toggle and URL row; returns the check disposer. */
export function renderGeneralProxySection(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): (() => void) | undefined {
  new Setting(containerEl).setName("Proxy").setHeading();

  renderCorsProxyToggle(containerEl, plugin);

  if (plugin.settings.corsProxyEnabled) {
    return renderProxyUrlRow(containerEl, plugin);
  }
  return undefined;
}

function renderCorsProxyToggle(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): void {
  new Setting(containerEl)
    .setName("Enable CORS proxy")
    .setDesc(
      "On by default, set to auto. When a direct fetch fails (for example a block on iOS), the plugin retries through a third-party CORS proxy, so the feed or article URL is sent to that proxy. Turn this off to keep fetches direct.",
    )
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.corsProxyEnabled ?? false)
        .onChange(async (value) => {
          plugin.settings.corsProxyEnabled = value;
          await plugin.saveSettings();
          // Re-render the full settings tab to show/hide the URL input.
          // The tab instance calls this renderer so we use a custom event.
          containerEl.dispatchEvent(new CustomEvent("rss-settings-refresh"));
        });
    });
}

/**
 * Whether the saved setting names an option the dropdown itself offers:
 * auto, or a built-in proxy. Anything else is a custom URL, which the
 * dropdown shows as the "add new proxy URL" option.
 */
function isDropdownProxyOption(url: string): boolean {
  return (
    url === AUTO_PROXY_URL ||
    PREDEFINED_PROXIES.some((proxy) => proxy.url === url)
  );
}

/** Shows the save button only for the custom URL field. */
function setSaveButtonVisible(state: ProxyRowState, visible: boolean): void {
  if (!state.saveButton) return;
  setCssProps(state.saveButton.buttonEl, { display: visible ? "" : "none" });
}

/**
 * Brings the dropdown and the save button back in line with the saved
 * setting, for the paths that change it without the dropdown: the URL
 * field's commit and Clear. Choosing an option in the dropdown keeps the
 * setting and the control in step on its own.
 */
function syncProxyRowToSetting(
  plugin: GeneralSettingsPlugin,
  state: ProxyRowState,
): void {
  const currentUrl = (plugin.settings.corsProxyUrl || "").trim();
  const isOption = isDropdownProxyOption(currentUrl);
  state.selectedProxyOption = isOption
    ? currentUrl
    : currentUrl
      ? CUSTOM_PROXY_OPTION
      : "";
  state.dropdownComponent?.setValue(state.selectedProxyOption);
  setSaveButtonVisible(state, !isOption && currentUrl !== "");
  state.refreshProxyCheckSelection();
}

async function commitProxyUrl(
  plugin: GeneralSettingsPlugin,
  state: ProxyRowState,
  rawValue: string,
): Promise<void> {
  const value = rawValue.trim();
  if (value === state.lastSavedProxyUrl) return;

  if (value === "") {
    plugin.settings.corsProxyUrl = "";
    state.lastSavedProxyUrl = "";
    state.pendingProxyUrl = "";
    await plugin.saveSettings();
    syncProxyRowToSetting(plugin, state);
    return;
  }

  const validation = isValidUrl(value);
  if (!validation.valid) {
    state.pendingProxyUrl = state.lastSavedProxyUrl;
    state.textComponent?.setValue(state.lastSavedProxyUrl);
    new Notice(validation.error || "Invalid URL");
    state.refreshProxyCheckSelection();
    return;
  }

  plugin.settings.corsProxyUrl = value;
  state.lastSavedProxyUrl = value;
  state.pendingProxyUrl = value;
  await plugin.saveSettings();
  syncProxyRowToSetting(plugin, state);
}

function configureProxyDropdown(
  plugin: GeneralSettingsPlugin,
  state: ProxyRowState,
  dropdown: DropdownComponent,
): void {
  state.dropdownComponent = dropdown;
  dropdown.addOption("", "Select a proxy...");
  dropdown.addOption(AUTO_PROXY_URL, "Auto-cycle (try all proxies on failure)");
  PREDEFINED_PROXIES.forEach((proxy) => {
    dropdown.addOption(proxy.url, proxy.label);
  });
  dropdown.addOption(CUSTOM_PROXY_OPTION, "Add new proxy URL...");

  const currentUrl = (plugin.settings.corsProxyUrl || "").trim();
  if (isDropdownProxyOption(currentUrl)) {
    state.selectedProxyOption = currentUrl;
  } else if (currentUrl) {
    state.selectedProxyOption = CUSTOM_PROXY_OPTION;
  } else {
    state.selectedProxyOption = "";
  }
  dropdown.setValue(state.selectedProxyOption);

  dropdown.onChange((value: string) => {
    state.selectedProxyOption = value;
    setSaveButtonVisible(state, value === CUSTOM_PROXY_OPTION);
    if (value !== CUSTOM_PROXY_OPTION && value !== "") {
      state.textComponent?.setValue(value);
      void (async () => {
        plugin.settings.corsProxyUrl = value;
        state.lastSavedProxyUrl = value;
        state.pendingProxyUrl = value;
        await plugin.saveSettings();
      })();
    }
    state.refreshProxyCheckSelection();
  });
}

function configureProxyText(
  plugin: GeneralSettingsPlugin,
  state: ProxyRowState,
  text: TextComponent,
): void {
  state.textComponent = text;
  text
    .setPlaceholder("https://proxy.com/?url=")
    .setValue(plugin.settings.corsProxyUrl || "")
    .onChange((value) => {
      state.pendingProxyUrl = value;
      state.refreshProxyCheckSelection();
    });

  text.inputEl.addEventListener("blur", () => {
    void commitProxyUrl(plugin, state, state.pendingProxyUrl);
  });
  text.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
    if (evt.key !== "Enter") return;
    void commitProxyUrl(plugin, state, text.getValue());
    text.inputEl.blur();
  });

  addInputClearButton(text.inputEl, {
    label: "Clear proxy URL",
    onClear: () => {
      plugin.settings.corsProxyUrl = "";
      state.lastSavedProxyUrl = "";
      state.pendingProxyUrl = "";
      void plugin.saveSettings();
      syncProxyRowToSetting(plugin, state);
    },
  });
  if (text.inputEl.parentElement) {
    setCssProps(text.inputEl.parentElement, {
      flex: "1 1 auto",
      minWidth: "150px",
    });
  }
  setCssProps(text.inputEl, { width: "100%" });
}

function configureProxySaveButton(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
  state: ProxyRowState,
  btn: ButtonComponent,
): void {
  state.saveButton = btn;
  btn
    .setIcon("save")
    .setTooltip("Save proxy URL")
    .onClick(async () => {
      const customUrl = (state.textComponent?.getValue() ?? "").trim();
      const validation = isValidUrl(customUrl);
      if (validation.valid) {
        plugin.settings.corsProxyUrl = customUrl;
        state.lastSavedProxyUrl = customUrl;
        state.pendingProxyUrl = customUrl;
        await plugin.saveSettings();
        new Notice("Proxy URL saved");
        syncProxyRowToSetting(plugin, state);
        containerEl.dispatchEvent(new CustomEvent("rss-settings-refresh"));
      } else {
        new Notice(validation.error || "Invalid URL");
      }
    });

  const currentUrl = (plugin.settings.corsProxyUrl || "").trim();
  setSaveButtonVisible(
    state,
    !isDropdownProxyOption(currentUrl) && currentUrl !== "",
  );
}

function renderProxyUrlRow(
  containerEl: HTMLElement,
  plugin: GeneralSettingsPlugin,
): () => void {
  const proxySetting = new Setting(containerEl)
    .setName("Proxy URL")
    .setDesc(
      "Base URL of the CORS proxy. The default, auto, tries each built-in proxy in turn when a direct fetch fails, relaying the URL to those third-party services. Pick one proxy or enter your own to use only that.",
    );
  proxySetting.settingEl.addClass("rss-proxy-setting-item");

  const initialUrl = (plugin.settings.corsProxyUrl || "").trim();
  const state: ProxyRowState = {
    textComponent: null,
    saveButton: null,
    dropdownComponent: null,
    lastSavedProxyUrl: initialUrl,
    pendingProxyUrl: initialUrl,
    selectedProxyOption: "",
    refreshProxyCheckSelection: () => {},
  };

  proxySetting
    .addDropdown((dropdown) => configureProxyDropdown(plugin, state, dropdown))
    .addText((text) => configureProxyText(plugin, state, text))
    .addButton((btn) =>
      configureProxySaveButton(containerEl, plugin, state, btn),
    );

  const proxyCheckControls = renderProxyCheckControls(containerEl, {
    readSelectedProxyOption: () => state.selectedProxyOption,
    readSavedProxyUrl: () => plugin.settings.corsProxyUrl,
    readPendingProxyUrl: () => state.pendingProxyUrl,
    store: plugin.proxyCheckStore,
    fetchText: (url) =>
      robustFetchDetailed(url, { headers: pageRequestHeaders() }),
  });
  state.refreshProxyCheckSelection = proxyCheckControls.refreshSelection;
  return proxyCheckControls.dispose;
}
