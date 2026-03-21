export function installObsidianDomPolyfills(): void {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {
          // deprecated
        },
        removeListener: () => {
          // deprecated
        },
        addEventListener: () => {
          // no-op
        },
        removeEventListener: () => {
          // no-op
        },
        dispatchEvent: () => false,
      } as MediaQueryList;
    }) as typeof window.matchMedia;
  }

  if (typeof proto.empty !== "function") {
    proto.empty = function empty(this: HTMLElement): void {
      this.textContent = "";
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
    };
  }

  if (typeof proto.addClass !== "function") {
    proto.addClass = function addClass(this: HTMLElement, ...classes: string[]): void {
      this.classList.add(...classes);
    };
  }

  if (typeof proto.removeClass !== "function") {
    proto.removeClass = function removeClass(this: HTMLElement, ...classes: string[]): void {
      this.classList.remove(...classes);
    };
  }

  if (typeof proto.toggleClass !== "function") {
    proto.toggleClass = function toggleClass(this: HTMLElement, cls: string, force?: boolean): void {
      this.classList.toggle(cls, force);
    };
  }

  if (typeof proto.setAttr !== "function") {
    proto.setAttr = function setAttr(this: HTMLElement, key: string, value: string): void {
      this.setAttribute(key, value);
    };
  }

  if (typeof proto.createDiv !== "function") {
    proto.createDiv = function createDiv(
      this: HTMLElement,
      opts?: { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLDivElement {
      const el = document.createElement("div");
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text !== undefined) el.textContent = opts.text;
      if (opts?.attr) {
        Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
      }
      this.appendChild(el);
      return el;
    };
  }

  if (typeof proto.createSpan !== "function") {
    proto.createSpan = function createSpan(
      this: HTMLElement,
      opts?: { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLSpanElement {
      const el = document.createElement("span");
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text !== undefined) el.textContent = opts.text;
      if (opts?.attr) {
        Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
      }
      this.appendChild(el);
      return el;
    };
  }

  if (typeof proto.createEl !== "function") {
    proto.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
      this: HTMLElement,
      tag: K,
      opts?: { cls?: string; text?: string; attr?: Record<string, string> } & Partial<
        HTMLElementTagNameMap[K] extends HTMLInputElement ? { type: string } : Record<string, never>
      >,
    ): HTMLElementTagNameMap[K] {
      const el = document.createElement(tag);
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text !== undefined) el.textContent = opts.text;
      if (opts?.attr) {
        Object.entries(opts.attr).forEach(([k, v]) =>
          el.setAttribute(k, v),
        );
      }
      if (tag === "input" && opts && "type" in opts && typeof (opts as { type?: unknown }).type === "string") {
        (el as unknown as HTMLInputElement).type = (opts as { type: string }).type;
      }
      this.appendChild(el);
      return el;
    };
  }
}

export function installMediaElementPolyfills(): void {
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement): Promise<void> {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };

  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement): void {
    this.dispatchEvent(new Event("pause"));
  };

  HTMLMediaElement.prototype.load = function load(): void {
    // no-op for jsdom
  };
}
