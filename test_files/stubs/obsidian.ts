// Stub for obsidian module in tests - currently unused but available for mocking if needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requestUrl(_param?: any): Promise<{ status: number; text: string }> {
  throw new Error("requestUrl stub - configure mock in test if needed");
}

// Some production modules import RequestUrlParam as a runtime symbol (not type-only).
// Provide a value export to satisfy ESM imports in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RequestUrlParam: any = {};

export const Platform = {
  isAndroidApp: false,
};

export function setIcon(el: HTMLElement, iconName: string): void {
  el.dataset.icon = iconName;
}

export function requireApiVersion(): boolean {
  return false;
}

export class App {
  private localStorage = new Map<string, unknown>();

  // Minimal vault stub used by some UI helpers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vault: any = {
    on: () => ({}) as unknown,
    getRoot: () => ({ children: [] }),
  };

  saveLocalStorage(key: string, value: unknown): void {
    this.localStorage.set(key, value);
  }

  loadLocalStorage(key: string): unknown {
    return this.localStorage.get(key);
  }
}

export class Notice {
  constructor(message: string, timeout?: number) {
    console.log("[Stub Notice]", message);
  }
}

export class WorkspaceLeaf {
  app: App;
  constructor(app: App) {
    this.app = app;
  }
}

export class ItemView {
  app: App;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = leaf.app;

    // Many views assume `containerEl.children[1]` exists.
    this.containerEl = document.createElement("div");
    this.containerEl.appendChild(document.createElement("div"));
    this.containerEl.appendChild(document.createElement("div"));
  }

  // Lifecycle stubs
  onOpen(): Promise<void> {
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  // Event registration stubs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerEvent(_evt: any): void {}
}

export class TFile {}
export class TFolder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[] = [];
  path = "";
}

export class Menu {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addItem(_cb: (item: MenuItem) => any): this {
    return this;
  }
  showAtPosition(): void {}
}

export class MenuItem {
  setTitle(): this {
    return this;
  }
  setIcon(): this {
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick(_cb: (evt: any) => any): this {
    return this;
  }
}

export class Setting {
  settingEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  descEl: HTMLDivElement;
  controlEl: HTMLDivElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    this.settingEl.className = "setting-item";
    containerEl.appendChild(this.settingEl);

    const infoEl = document.createElement("div");
    infoEl.className = "setting-item-info";
    this.settingEl.appendChild(infoEl);

    this.nameEl = document.createElement("div");
    this.nameEl.className = "setting-item-name";
    infoEl.appendChild(this.nameEl);

    this.descEl = document.createElement("div");
    this.descEl.className = "setting-item-description";
    infoEl.appendChild(this.descEl);

    this.controlEl = document.createElement("div");
    this.controlEl.className = "setting-item-control";
    this.settingEl.appendChild(this.controlEl);
  }

  setName(_name?: string): this {
    return this;
  }
  setDesc(_desc?: string): this {
    return this;
  }
  setHeading(): this {
    return this;
  }
  setClass(_cls?: string): this {
    return this;
  }
  setTooltip(_tooltip?: string): this {
    return this;
  }
  setDisabled(_disabled?: boolean): this {
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addButton(cb: (component: any) => any): this {
    class ButtonComponent {
      buttonEl: HTMLButtonElement;
      private clickHandler: ((evt: MouseEvent) => void) | null = null;

      constructor(container: HTMLElement) {
        this.buttonEl = document.createElement("button");
        container.appendChild(this.buttonEl);
      }

      setButtonText(text: string): this {
        this.buttonEl.textContent = text;
        return this;
      }

      onClick(handler: (evt: MouseEvent) => void): this {
        this.clickHandler = handler;
        this.buttonEl.addEventListener("click", handler);
        return this;
      }

      setCta(): this {
        this.buttonEl.classList.add("mod-cta");
        return this;
      }

      _triggerClick(evt?: MouseEvent): void {
        if (this.clickHandler) {
          this.clickHandler(evt ?? (new MouseEvent("click") as MouseEvent));
        } else {
          this.buttonEl.click();
        }
      }
    }

    const component = new ButtonComponent(this.controlEl);
    cb(component);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addSlider(cb: (component: any) => any): this {
    class SliderComponent {
      sliderEl: HTMLInputElement;
      private changeHandler: ((value: number) => void) | null = null;

      constructor(container: HTMLElement) {
        this.sliderEl = document.createElement("input");
        this.sliderEl.type = "range";
        container.appendChild(this.sliderEl);
        this.sliderEl.addEventListener("input", () => {
          const value = Number(this.sliderEl.value);
          this.changeHandler?.(value);
        });
      }

      setLimits(min: number, max: number, step: number): this {
        this.sliderEl.min = String(min);
        this.sliderEl.max = String(max);
        this.sliderEl.step = String(step);
        return this;
      }

      setValue(value: number): this {
        this.sliderEl.value = String(value);
        return this;
      }

      setDynamicTooltip(): this {
        return this;
      }

      onChange(handler: (value: number) => void): this {
        this.changeHandler = handler;
        return this;
      }
    }

    const component = new SliderComponent(this.controlEl);
    cb(component);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addColorPicker(cb: (component: any) => any): this {
    class ColorComponent {
      inputEl: HTMLInputElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.inputEl = document.createElement("input");
        this.inputEl.type = "color";
        container.appendChild(this.inputEl);
        this.inputEl.addEventListener("input", () => {
          this.changeHandler?.(this.inputEl.value);
        });
      }

      setValue(value: string): this {
        this.inputEl.value = value;
        return this;
      }

      setPlaceholder(value: string): this {
        this.inputEl.placeholder = value;
        return this;
      }

      onChange(handler: (value: string) => void): this {
        this.changeHandler = handler;
        return this;
      }
    }

    const component = new ColorComponent(this.controlEl);
    cb(component);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addToggle(cb: (component: any) => any): this {
    class ToggleComponent {
      toggleEl: HTMLInputElement;
      private changeHandler: ((value: boolean) => void) | null = null;

      constructor(container: HTMLElement) {
        this.toggleEl = document.createElement("input");
        this.toggleEl.type = "checkbox";
        container.appendChild(this.toggleEl);
        this.toggleEl.addEventListener("change", () => {
          this.changeHandler?.(this.toggleEl.checked);
        });
      }

      setValue(value: boolean): this {
        this.toggleEl.checked = value;
        return this;
      }

      onChange(handler: (value: boolean) => void): this {
        this.changeHandler = handler;
        return this;
      }

      _triggerChange(value: boolean): void {
        this.toggleEl.checked = value;
        this.toggleEl.dispatchEvent(new Event("change"));
      }
    }

    const component = new ToggleComponent(this.controlEl);
    cb(component);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addText(cb: (component: any) => any): this {
    class TextComponent {
      inputEl: HTMLInputElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.inputEl = document.createElement("input");
        this.inputEl.type = "text";
        container.appendChild(this.inputEl);
        this.inputEl.addEventListener("input", () => {
          this.changeHandler?.(this.inputEl.value);
        });
      }

      setValue(value: string): this {
        this.inputEl.value = value;
        return this;
      }

      setPlaceholder(value: string): this {
        this.inputEl.placeholder = value;
        return this;
      }

      onChange(handler: (value: string) => void): this {
        this.changeHandler = handler;
        return this;
      }

      _triggerChange(value: string): void {
        this.inputEl.value = value;
        this.inputEl.dispatchEvent(new Event("input"));
      }
    }

    const component = new TextComponent(this.controlEl);
    cb(component);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addDropdown(cb: (component: any) => any): this {
    class DropdownComponent {
      selectEl: HTMLSelectElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.selectEl = document.createElement("select");
        container.appendChild(this.selectEl);
        this.selectEl.addEventListener("change", () => {
          this.changeHandler?.(this.selectEl.value);
        });
      }

      addOption(value: string, label: string): this {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        this.selectEl.appendChild(opt);
        return this;
      }

      setValue(value: string): this {
        this.selectEl.value = value;
        return this;
      }

      onChange(handler: (value: string) => void): this {
        this.changeHandler = handler;
        return this;
      }

      _triggerChange(value: string): void {
        this.selectEl.value = value;
        this.selectEl.dispatchEvent(new Event("change"));
      }
    }

    const component = new DropdownComponent(this.controlEl);
    cb(component);
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement;
  private changeHandler: ((value: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.inputEl = document.createElement("input");
    this.inputEl.type = "text";
    container.appendChild(this.inputEl);
    this.inputEl.addEventListener("input", () => {
      this.changeHandler?.(this.inputEl.value);
    });
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(value: string): this {
    this.inputEl.placeholder = value;
    return this;
  }

  onChange(handler: (value: string) => void): this {
    this.changeHandler = handler;
    return this;
  }
}

export class Modal {
  app: App;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  containerEl: any;
  constructor(app: App) {
    this.app = app;
    this.containerEl = document.createElement("div");
  }
  open(): void {}
  close(): void {}
}

export class AbstractInputSuggest<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected app: any;
  protected inputEl: HTMLInputElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(app: any, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getSuggestions(_query: string): T[] {
    return [];
  }
  renderSuggestion(_value: T, _el: HTMLElement): void {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectSuggestion(_value: T, _evt: any): void {}
  close(): void {}
}

