import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Setting } from "obsidian";
import { AccessibleModal } from "../../../src/utils/accessible-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Obsidian's Modal supplies initial focus and Esc only (1.14.4), so these tests
// pin what the shared base class adds: dialog semantics, a name from the visible
// heading, Tab containment, and focus return (#826 AC-014d/e/f).

type Build = (modal: TestModal) => void;

class TestModal extends AccessibleModal {
  constructor(
    private readonly build: Build,
    private readonly label: string | null = null,
  ) {
    super({} as unknown as App);
  }
  onOpen(): void {
    this.build(this);
  }
  protected getDialogLabel(): string | null {
    return this.label;
  }
}

function button(parent: HTMLElement, text: string): HTMLButtonElement {
  return parent.createEl("button", { text });
}

function titledForm(modal: TestModal): void {
  new Setting(modal.contentEl).setName("Add folder").setHeading();
  modal.contentEl.createEl("input", { attr: { type: "text" } });
  button(modal.contentEl, "Cancel");
  button(modal.contentEl, "Create");
}

function accessibleName(dialog: Element): string {
  const labelledBy = dialog.getAttribute("aria-labelledby");
  if (labelledBy) {
    return (
      dialog.ownerDocument.getElementById(labelledBy)?.textContent?.trim() ?? ""
    );
  }
  return dialog.getAttribute("aria-label") ?? "";
}

function pressTab(shift = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

function opener(): HTMLButtonElement {
  const el = document.body.createEl("button", { text: "Opener" });
  el.focus();
  return el;
}

describe("AccessibleModal dialog semantics", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });
  afterEach(() => {
    document.body.empty();
  });

  it("exposes role dialog and aria-modal on the modal", () => {
    const modal = new TestModal(titledForm);
    modal.open();

    expect(modal.containerEl.getAttribute("role")).toBe("dialog");
    expect(modal.containerEl.getAttribute("aria-modal")).toBe("true");
    modal.close();
  });

  it("names the dialog from a settings-style heading", () => {
    const modal = new TestModal(titledForm);
    modal.open();

    expect(accessibleName(modal.containerEl)).toBe("Add folder");
    modal.close();
  });

  it("names the dialog from an h2 heading", () => {
    const modal = new TestModal((m) => {
      m.contentEl.createEl("h2", { text: "Factory reset?" });
      button(m.contentEl, "Reset");
    });
    modal.open();

    expect(accessibleName(modal.containerEl)).toBe("Factory reset?");
    modal.close();
  });

  it("names the dialog from the modal title when one is set", () => {
    const modal = new TestModal((m) => {
      m.setTitle("Refresh details");
      m.contentEl.createDiv({ text: "3 feeds refreshed" });
    });
    modal.open();

    expect(accessibleName(modal.containerEl)).toBe("Refresh details");
    modal.close();
  });

  it("falls back to the modal's own label when it shows no heading", () => {
    const modal = new TestModal((m) => {
      button(m.contentEl, "Folder");
    }, "Dashboard navigation");
    modal.open();

    expect(accessibleName(modal.containerEl)).toBe("Dashboard navigation");
    modal.close();
  });

  it("prefers the visible heading over the fallback label", () => {
    const modal = new TestModal(titledForm, "Fallback");
    modal.open();

    expect(accessibleName(modal.containerEl)).toBe("Add folder");
    modal.close();
  });

  it("leaves the dialog unnamed when there is neither heading nor label", () => {
    const modal = new TestModal((m) => {
      button(m.contentEl, "OK");
    });
    modal.open();

    expect(accessibleName(modal.containerEl)).toBe("");
    modal.close();
  });

  it("follows the heading when the modal redraws its content", async () => {
    const modal = new TestModal(titledForm);
    modal.open();

    modal.contentEl.empty();
    modal.contentEl.createEl("h2", { text: "Delete all feeds?" });
    await Promise.resolve();

    expect(accessibleName(modal.containerEl)).toBe("Delete all feeds?");
    modal.close();
  });

  it("keeps an existing id on the heading it points at", () => {
    const modal = new TestModal((m) => {
      m.contentEl.createEl("h2", { text: "Title", attr: { id: "mine" } });
    });
    modal.open();

    expect(modal.containerEl.getAttribute("aria-labelledby")).toBe("mine");
    modal.close();
  });

  it("gives two open modals different heading ids", () => {
    const first = new TestModal(titledForm);
    const second = new TestModal(titledForm);
    first.open();
    second.open();

    expect(first.containerEl.getAttribute("aria-labelledby")).not.toBe(
      second.containerEl.getAttribute("aria-labelledby"),
    );
    second.close();
    first.close();
  });
});

describe("AccessibleModal Tab containment", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });
  afterEach(() => {
    document.body.empty();
  });

  function openForm(): { modal: TestModal; stops: HTMLElement[] } {
    const modal = new TestModal(titledForm);
    modal.open();
    const stops = Array.from(
      modal.contentEl.querySelectorAll<HTMLElement>("input, button"),
    );
    return { modal, stops };
  }

  it("wraps Tab from the last control to the first", () => {
    const { modal, stops } = openForm();
    stops[stops.length - 1].focus();

    const event = pressTab();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops[0]);
    modal.close();
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    const { modal, stops } = openForm();
    stops[0].focus();

    const event = pressTab(true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops[stops.length - 1]);
    modal.close();
  });

  it("leaves Tab between controls to the browser", () => {
    const { modal, stops } = openForm();
    stops[1].focus();

    expect(pressTab().defaultPrevented).toBe(false);
    expect(pressTab(true).defaultPrevented).toBe(false);
    modal.close();
  });

  it("adds no listener to the document", () => {
    const addListener = vi.spyOn(document, "addEventListener");
    const { modal } = openForm();

    modal.close();

    expect(addListener).not.toHaveBeenCalledWith("keydown", expect.anything());
    addListener.mockRestore();
  });

  it("skips disabled, hidden and tabindex -1 controls when wrapping", () => {
    const modal = new TestModal((m) => {
      new Setting(m.contentEl).setName("Options").setHeading();
      button(m.contentEl, "First");
      button(m.contentEl, "Last");
      const disabled = button(m.contentEl, "Disabled");
      disabled.disabled = true;
      const skipped = button(m.contentEl, "Skipped");
      skipped.tabIndex = -1;
      const hidden = button(m.contentEl, "Hidden");
      hidden.hidden = true;
    });
    modal.open();
    const [first, last] = Array.from(
      modal.contentEl.querySelectorAll<HTMLElement>("button"),
    );
    last.focus();

    pressTab();

    expect(document.activeElement).toBe(first);
    modal.close();
  });

  it("treats a radio group as one stop", () => {
    const modal = new TestModal((m) => {
      new Setting(m.contentEl).setName("Mode").setHeading();
      for (const [value, checked] of [
        ["a", false],
        ["b", true],
        ["c", false],
      ] as const) {
        const radio = m.contentEl.createEl("input", {
          attr: { type: "radio", name: "mode", value },
        });
        radio.checked = checked;
      }
    });
    modal.open();
    const radios = Array.from(
      modal.contentEl.querySelectorAll<HTMLInputElement>("input"),
    );
    radios[1].focus();

    const event = pressTab();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(radios[1]);
    modal.close();
  });

  it("wraps from an unfocusable element that follows the last control", () => {
    const modal = new TestModal((m) => {
      new Setting(m.contentEl).setName("Notes").setHeading();
      button(m.contentEl, "Only");
      const note = m.contentEl.createDiv({ text: "Footnote" });
      note.tabIndex = -1;
    });
    modal.open();
    const note = modal.contentEl.querySelector<HTMLElement>("div[tabindex]")!;
    note.focus();

    const event = pressTab();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(
      modal.contentEl.querySelector("button"),
    );
    modal.close();
  });

  it("leaves Tab alone when a widget inside already handled it", () => {
    const { modal, stops } = openForm();
    const last = stops[stops.length - 1];
    last.focus();
    last.addEventListener("keydown", (e) => e.preventDefault());

    pressTab();

    expect(document.activeElement).toBe(last);
    modal.close();
  });

  it("ignores Tab with Ctrl, Alt or Meta held", () => {
    const { modal, stops } = openForm();
    stops[stops.length - 1].focus();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    document.activeElement?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    modal.close();
  });

  it("does not touch Escape or Enter", () => {
    const { modal, stops } = openForm();
    stops[0].focus();

    for (const key of ["Escape", "Enter"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      stops[0].dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    modal.close();
  });

  it("leaves focus alone when it sits in a popup mounted outside the modal", () => {
    const { modal } = openForm();
    const popup = document.body.createDiv();
    const popupButton = button(popup, "Popup item");
    popupButton.focus();

    const event = pressTab();

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(popupButton);
    modal.close();
  });

  it("includes a portal menu mounted inside the modal container in the walk", () => {
    const { modal, stops } = openForm();
    const portal = modal.containerEl.createDiv();
    const portalButton = button(portal, "Portal item");
    stops[stops.length - 1].focus();
    expect(pressTab().defaultPrevented).toBe(false);

    portalButton.focus();
    const event = pressTab();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops[0]);
    modal.close();
  });

  it("contains only the topmost of two stacked modals", () => {
    const lower = new TestModal(titledForm);
    const upper = new TestModal(titledForm);
    lower.open();
    upper.open();
    const upperStops = Array.from(
      upper.contentEl.querySelectorAll<HTMLElement>("input, button"),
    );
    upperStops[upperStops.length - 1].focus();

    pressTab();

    expect(document.activeElement).toBe(upperStops[0]);
    upper.close();
    lower.close();
  });

  it("stops containing Tab after the modal closes", () => {
    const { modal, stops } = openForm();
    const outside = opener();
    stops[stops.length - 1].focus();
    modal.close();
    outside.focus();

    expect(pressTab().defaultPrevented).toBe(false);
  });

  it("takes no part when the modal has nothing to focus", () => {
    const modal = new TestModal((m) => {
      new Setting(m.contentEl).setName("Notice").setHeading();
    });
    modal.open();

    expect(pressTab().defaultPrevented).toBe(false);
    modal.close();
  });
});

describe("AccessibleModal focus return", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });
  afterEach(() => {
    document.body.empty();
  });

  it("keeps the modal's own initial focus inside the modal", () => {
    opener();
    const modal = new TestModal((m) => {
      titledForm(m);
      m.contentEl.querySelector("input")?.focus();
    });
    modal.open();

    expect(modal.containerEl.contains(document.activeElement)).toBe(true);
    modal.close();
  });

  it("returns focus to the element that opened the modal", () => {
    const trigger = opener();
    const modal = new TestModal(titledForm);
    modal.open();
    modal.contentEl.querySelector("input")?.focus();

    modal.close();

    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus after a close button inside the modal is clicked", () => {
    const trigger = opener();
    const modal = new TestModal((m) => {
      titledForm(m);
      m.contentEl.querySelector("button")?.addEventListener("click", () => {
        m.close();
      });
    });
    modal.open();
    const cancel = modal.contentEl.querySelector("button")!;
    cancel.focus();
    cancel.click();

    expect(document.activeElement).toBe(trigger);
  });

  it("does not move focus when the opener has left the page", () => {
    const trigger = opener();
    const modal = new TestModal(titledForm);
    modal.open();
    const input = modal.contentEl.querySelector("input")!;
    input.focus();
    trigger.remove();

    modal.close();

    expect(document.activeElement).not.toBe(trigger);
    expect(modal.containerEl.isConnected).toBe(false);
  });

  it("does nothing when the modal opened with nothing focused", () => {
    const modal = new TestModal(titledForm);
    modal.open();

    expect(() => modal.close()).not.toThrow();
  });

  it("restores focus once when close is called twice", () => {
    const trigger = opener();
    const modal = new TestModal(titledForm);
    modal.open();
    modal.close();
    trigger.blur();

    modal.close();

    expect(document.activeElement).not.toBe(trigger);
  });

  it("returns focus into the lower modal when a modal opened from it closes", () => {
    const lower = new TestModal(titledForm);
    lower.open();
    const lowerButton = lower.contentEl.querySelector("button")!;
    lowerButton.focus();
    const upper = new TestModal(titledForm);
    upper.open();
    upper.contentEl.querySelector("input")?.focus();

    upper.close();

    expect(document.activeElement).toBe(lowerButton);
    lower.close();
  });

  it("does not take focus from a modal opened just before this one closes", () => {
    const trigger = opener();
    const first = new TestModal(titledForm);
    first.open();
    const next = new TestModal(titledForm);
    next.open();
    const nextInput = next.contentEl.querySelector("input")!;
    nextInput.focus();

    first.close();

    expect(trigger.isConnected).toBe(true);
    expect(document.activeElement).toBe(nextInput);
    next.close();
  });
});
