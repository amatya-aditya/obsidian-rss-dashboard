import { Setting, setIcon } from "obsidian";
import { addInputClearButton } from "../../utils/input-clear-button";
import { isDomNode } from "../../utils/dom-node";

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

  // Decorative: the field's visible label and placeholder name it. It comes
  // before the input so the clear button stays the input's later sibling.
  const iconEl = wrapper.createSpan({
    cls: "rss-dashboard-folder-combobox-icon",
    attr: { "aria-hidden": "true" },
  });
  setIcon(iconEl, "folder");

  wrapper.appendChild(inputEl);
  // Only `input`, so the folder suggestions refresh; a `change` would run
  // commit-on-change handlers that restore a default folder at once.
  addInputClearButton(inputEl, {
    container: wrapper,
    label: "Clear folder",
    onClear: () => inputEl.dispatchEvent(new Event("input", { bubbles: true })),
  });

  wrapper.addEventListener("click", (event) => {
    const target = event.target;
    if (isDomNode(target) && target.instanceOf(HTMLInputElement)) return;
    if (isDomNode(target) && target.instanceOf(HTMLButtonElement)) return;

    inputEl.focus();
    inputEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
