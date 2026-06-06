import { Setting } from "obsidian";

export function decorateFolderSelectorInput(
  setting: Setting,
  inputEl: HTMLInputElement,
): void {
  inputEl.addClass("rss-dashboard-folder-combobox-input");
  inputEl.setAttribute("aria-autocomplete", "list");
  inputEl.setAttribute("aria-haspopup", "listbox");

  const wrapper = setting.controlEl.createDiv({
    cls: "rss-dashboard-folder-combobox",
  });

  wrapper.appendChild(inputEl);

  wrapper.addEventListener("click", (event) => {
    if (event.target instanceof HTMLInputElement) return;

    inputEl.focus();
    inputEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
