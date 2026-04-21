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

  if (typeof (proto as any).setText !== "function") {
    (proto as any).setText = function (this: HTMLElement, text: string): void {
      this.textContent = text;
    };
  }

  if (typeof proto.addClass !== "function") {
    proto.addClass = function addClass(this: HTMLElement, ...classes: string[]): void {
      this.classList.add(...classes);
    };
  }

  if (typeof (proto as any).addClasses !== "function") {
    (proto as any).addClasses = function addClasses(
      this: HTMLElement,
      classes: string[],
    ): void {
      this.classList.add(...classes);
    };
  }

  if (typeof proto.removeClass !== "function") {
    proto.removeClass = function removeClass(this: HTMLElement, ...classes: string[]): void {
      this.classList.remove(...classes);
    };
  }

  if (typeof (proto as any).hasClass !== "function") {
    (proto as any).hasClass = function (this: HTMLElement, cls: string): boolean {
      return this.classList.contains(cls);
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

  if (typeof (proto as any).getAttr !== "function") {
    (proto as any).getAttr = function (this: HTMLElement, key: string): string | null {
      return this.getAttribute(key);
    };
  }

  if (typeof proto.createDiv !== "function") {
    proto.createDiv = function createDiv(
      this: HTMLElement,
      opts?:
        | string
        | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLDivElement {
      const el = document.createElement("div");
      if (typeof opts === "string") {
        el.className = opts;
      } else {
        if (opts?.cls) el.className = opts.cls;
        if (opts?.text !== undefined) el.textContent = opts.text;
        if (opts?.attr) {
          Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
        }
      }
      this.appendChild(el);
      return el;
    };
  }

  if (typeof proto.createSpan !== "function") {
    proto.createSpan = function createSpan(
      this: HTMLElement,
      opts?:
        | string
        | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLSpanElement {
      const el = document.createElement("span");
      if (typeof opts === "string") {
        el.className = opts;
      } else {
        if (opts?.cls) el.className = opts.cls;
        if (opts?.text !== undefined) el.textContent = opts.text;
        if (opts?.attr) {
          Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
        }
      }
      this.appendChild(el);
      return el;
    };
  }

  if (typeof (proto as any).appendText !== "function") {
    (proto as any).appendText = function appendText(this: HTMLElement, text: string): void {
      this.append(document.createTextNode(text));
    };
  }

  if (typeof proto.createEl !== "function") {
    proto.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
      this: HTMLElement,
      tag: K,
      opts?: {
        cls?: string;
        text?: string;
        attr?: Record<string, string>;
        // Obsidian's createEl supports passing through common element props (e.g. value/placeholder).
        // Keep this permissive so unit tests behave like plugin runtime.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      },
    ): HTMLElementTagNameMap[K] {
      const el = document.createElement(tag);
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text !== undefined) el.textContent = opts.text;
      if (opts?.attr) {
        Object.entries(opts.attr).forEach(([k, v]) =>
          el.setAttribute(k, v),
        );
      }
      if (opts) {
        Object.entries(opts).forEach(([key, value]) => {
          if (key === "cls" || key === "text" || key === "attr") return;
          if (tag === "input" && key === "type" && typeof value === "string") {
            (el as unknown as HTMLInputElement).type = value;
            return;
          }
          // Pass through common properties like value/placeholder/disabled/etc.
          if (key in el) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (el as any)[key] = value;
          }
        });
      }
      this.appendChild(el);
      return el;
    };
  }

  if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {
      // no-op for jsdom
    };
  }

  if (typeof window.ResizeObserver !== "function") {
    class MockResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (window as any).ResizeObserver = MockResizeObserver;
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
