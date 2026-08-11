export function installObsidianDomPolyfills(): void {
  const globalScope = window as Window & {
    activeWindow?: Window & {
      instanceOf?: (
        value: unknown,
        ctor: new (...args: never[]) => unknown,
      ) => boolean;
    };
    activeDocument?: Document;
  };

  // Obsidian exposes these as globals; define them in jsdom test runs.
  if (!globalScope.activeWindow) {
    globalScope.activeWindow = window;
  }
  if (typeof globalScope.activeWindow.instanceOf !== "function") {
    globalScope.activeWindow.instanceOf = (
      value: unknown,
      ctor: new (...args: never[]) => unknown,
    ): boolean => value instanceof ctor;
  }
  if (!globalScope.activeDocument) {
    globalScope.activeDocument = document;
  }

  const documentProto = Document.prototype as unknown as Record<
    string,
    unknown
  >;

  if (typeof documentProto.createEl !== "function") {
    documentProto.createEl = function createEl<
      K extends keyof HTMLElementTagNameMap,
    >(
      this: Document,
      tag: K,
      opts?: {
        cls?: string;
        text?: string;
        attr?: Record<string, string>;
        // Keep permissive to mirror Obsidian's helper behavior in tests.
        [key: string]: unknown;
      },
    ): HTMLElementTagNameMap[K] {
      const el = this.createElement(tag);
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text !== undefined) el.textContent = opts.text;
      if (opts?.attr) {
        Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
      }
      if (opts) {
        Object.entries(opts).forEach(([key, value]) => {
          if (key === "cls" || key === "text" || key === "attr") return;
          if (tag === "input" && key === "type" && typeof value === "string") {
            (el as unknown as HTMLInputElement).type = value;
            return;
          }
          if (key in el) {
            (el as Record<string, unknown>)[key] = value;
          }
        });
      }
      return el;
    };
  }

  if (typeof documentProto.createDiv !== "function") {
    documentProto.createDiv = function createDiv(
      this: Document,
      opts?:
        | string
        | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLDivElement {
      const el = this.createElement("div");
      if (typeof opts === "string") {
        el.className = opts;
      } else {
        if (opts?.cls) el.className = opts.cls;
        if (opts?.text !== undefined) el.textContent = opts.text;
        if (opts?.attr) {
          Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
        }
      }
      return el;
    };
  }

  if (typeof documentProto.createSpan !== "function") {
    documentProto.createSpan = function createSpan(
      this: Document,
      opts?:
        | string
        | { cls?: string; text?: string; attr?: Record<string, string> },
    ): HTMLSpanElement {
      const el = this.createElement("span");
      if (typeof opts === "string") {
        el.className = opts;
      } else {
        if (opts?.cls) el.className = opts.cls;
        if (opts?.text !== undefined) el.textContent = opts.text;
        if (opts?.attr) {
          Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
        }
      }
      return el;
    };
  }

  if (typeof documentProto.createFragment !== "function") {
    documentProto.createFragment = function createFragment(
      this: Document,
    ): DocumentFragment {
      return this.createDocumentFragment();
    };
  }

  const ensureWindowDomHelpers = (target: Window): Window => {
    const helperTarget = target as unknown as Record<string, unknown>;

    if (typeof helperTarget.createEl !== "function") {
      helperTarget.createEl = function createEl<
        K extends keyof HTMLElementTagNameMap,
      >(
        this: Window,
        tag: K,
        opts?: {
          cls?: string;
          text?: string;
          attr?: Record<string, string>;
          [key: string]: unknown;
        },
      ): HTMLElementTagNameMap[K] {
        return this.document.createEl(tag, opts);
      };
    }

    if (typeof helperTarget.createDiv !== "function") {
      helperTarget.createDiv = function createDiv(
        this: Window,
        opts?:
          | string
          | { cls?: string; text?: string; attr?: Record<string, string> },
      ): HTMLDivElement {
        return this.document.createDiv(opts);
      };
    }

    if (typeof helperTarget.createSpan !== "function") {
      helperTarget.createSpan = function createSpan(
        this: Window,
        opts?:
          | string
          | { cls?: string; text?: string; attr?: Record<string, string> },
      ): HTMLSpanElement {
        return this.document.createSpan(opts);
      };
    }

    if (typeof helperTarget.createSvg !== "function") {
      helperTarget.createSvg = function createSvg<
        K extends keyof SVGElementTagNameMap,
      >(
        this: Window,
        tag: K,
        attrs?: Record<string, string>,
      ): SVGElementTagNameMap[K] {
        const el = this.document.createElementNS(
          "http://www.w3.org/2000/svg",
          tag,
        );
        Object.entries(attrs ?? {}).forEach(([key, value]) => {
          el.setAttribute(key, value);
        });
        return el;
      };
    }

    if (typeof helperTarget.createFragment !== "function") {
      helperTarget.createFragment = function createFragment(
        this: Window,
      ): DocumentFragment {
        return this.document.createFragment();
      };
    }

    return target;
  };

  ensureWindowDomHelpers(window);
  ensureWindowDomHelpers(globalScope.activeWindow);

  if (!Object.getOwnPropertyDescriptor(Node.prototype, "win")) {
    Object.defineProperty(Node.prototype, "win", {
      configurable: true,
      get(this: Node): Window {
        const owningDocument =
          this.nodeType === Node.DOCUMENT_NODE
            ? (this as Document)
            : this.ownerDocument;
        return ensureWindowDomHelpers(owningDocument?.defaultView ?? window);
      },
    });
  }

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
      };
    });
  }

  if (typeof proto.empty !== "function") {
    proto.empty = function empty(this: HTMLElement): void {
      this.textContent = "";
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
    };
  }

  if (typeof proto["setText"] !== "function") {
    proto["setText"] = function setText(this: HTMLElement, text: string): void {
      this.textContent = text;
    };
  }

  if (typeof proto.addClass !== "function") {
    proto.addClass = function addClass(
      this: HTMLElement,
      ...classes: string[]
    ): void {
      this.classList.add(...classes);
    };
  }

  if (typeof proto["addClasses"] !== "function") {
    proto["addClasses"] = function addClasses(
      this: HTMLElement,
      classes: string[],
    ): void {
      this.classList.add(...classes);
    };
  }

  if (typeof proto.removeClass !== "function") {
    proto.removeClass = function removeClass(
      this: HTMLElement,
      ...classes: string[]
    ): void {
      this.classList.remove(...classes);
    };
  }

  if (typeof proto["hasClass"] !== "function") {
    proto["hasClass"] = function hasClass(
      this: HTMLElement,
      cls: string,
    ): boolean {
      return this.classList.contains(cls);
    };
  }

  if (typeof proto.toggleClass !== "function") {
    proto.toggleClass = function toggleClass(
      this: HTMLElement,
      cls: string,
      force?: boolean,
    ): void {
      this.classList.toggle(cls, force);
    };
  }

  if (typeof proto.setAttr !== "function") {
    proto.setAttr = function setAttr(
      this: HTMLElement,
      key: string,
      value: string,
    ): void {
      this.setAttribute(key, value);
    };
  }

  if (typeof proto["getAttr"] !== "function") {
    proto["getAttr"] = function getAttr(
      this: HTMLElement,
      key: string,
    ): string | null {
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
      const doc = this.ownerDocument ?? document;
      const el = doc.createElement("div");
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
      const doc = this.ownerDocument ?? document;
      const el = doc.createElement("span");
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

  if (typeof proto["appendText"] !== "function") {
    proto["appendText"] = function appendText(
      this: HTMLElement,
      text: string,
    ): void {
      const doc = this.ownerDocument ?? document;
      this.append(doc.createTextNode(text));
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
        [key: string]: unknown;
      },
    ): HTMLElementTagNameMap[K] {
      const doc = this.ownerDocument ?? document;
      const el = doc.createElement(tag);
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text !== undefined) el.textContent = opts.text;
      if (opts?.attr) {
        Object.entries(opts.attr).forEach(([k, v]) => el.setAttribute(k, v));
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
            (el as Record<string, unknown>)[key] = value;
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
    window.ResizeObserver =
      MockResizeObserver;
  }
}

export function installMediaElementPolyfills(): void {
  HTMLMediaElement.prototype.play = function play(
    this: HTMLMediaElement,
  ): Promise<void> {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };

  HTMLMediaElement.prototype.pause = function pause(
    this: HTMLMediaElement,
  ): void {
    this.dispatchEvent(new Event("pause"));
  };

  HTMLMediaElement.prototype.load = function load(): void {
    // no-op for jsdom
  };
}
