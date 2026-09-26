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
    globalScope.activeDocument = window.document;
  }

  const nativeCreateElement = (
    Document.prototype as unknown as Record<
      string,
      (tagName: string) => HTMLElement
    >
  )["createElement"];
  const nativeCreateElementNS = Document.prototype.createElementNS;
  const nativeCreateDocumentFragment = (
    Document.prototype as unknown as Record<
      string,
      () => DocumentFragment
    >
  )["createDocumentFragment"];

  const documentProto = Document.prototype as unknown as Record<
    string,
    unknown
  >;

  type HelperOptions =
    | string
    | {
        cls?: string;
        text?: string;
        attr?: Record<string, string>;
        // Keep permissive to mirror Obsidian's helper behavior in tests.
        [key: string]: unknown;
      };

  // Builds a detached element the way Obsidian's helpers configure one.
  const createDetachedEl = <K extends keyof HTMLElementTagNameMap>(
    doc: Document,
    tag: K,
    opts?: HelperOptions,
  ): HTMLElementTagNameMap[K] => {
    const el = nativeCreateElement.call(doc, tag) as HTMLElementTagNameMap[K];
    if (typeof opts === "string") {
      el.className = opts;
      return el;
    }
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
          (el as unknown as Record<string, unknown>)[key] = value;
        }
      });
    }
    return el;
  };

  // Like Obsidian, the Node helpers on a Document append the new element to
  // the document itself. A document that already has <html> throws
  // HierarchyRequestError (observed on 1.13.7, #409). Use the Window helpers
  // (`el.win.createDiv()`) or createElement for a detached element.
  if (typeof documentProto.createEl !== "function") {
    documentProto.createEl = function createEl<
      K extends keyof HTMLElementTagNameMap,
    >(this: Document, tag: K, opts?: HelperOptions): HTMLElementTagNameMap[K] {
      const el = createDetachedEl(this, tag, opts);
      this.appendChild(el);
      return el;
    };
  }

  if (typeof documentProto.createDiv !== "function") {
    documentProto.createDiv = function createDiv(
      this: Document,
      opts?: HelperOptions,
    ): HTMLDivElement {
      const el = createDetachedEl(this, "div", opts);
      this.appendChild(el);
      return el;
    };
  }

  if (typeof documentProto.createSpan !== "function") {
    documentProto.createSpan = function createSpan(
      this: Document,
      opts?: HelperOptions,
    ): HTMLSpanElement {
      const el = createDetachedEl(this, "span", opts);
      this.appendChild(el);
      return el;
    };
  }

  if (typeof documentProto.createFragment !== "function") {
    documentProto.createFragment = function createFragment(
      this: Document,
    ): DocumentFragment {
      return nativeCreateDocumentFragment.call(this);
    };
  }

  const ensureWindowDomHelpers = (target: Window): Window => {
    const helperTarget = target as unknown as Record<string, unknown>;

    // The global Window helpers return detached elements.
    if (typeof helperTarget.createEl !== "function") {
      helperTarget.createEl = function createEl<
        K extends keyof HTMLElementTagNameMap,
      >(this: Window, tag: K, opts?: HelperOptions): HTMLElementTagNameMap[K] {
        const doc = this?.document ?? globalScope.activeDocument ?? window.document;
        return createDetachedEl(doc, tag, opts);
      };
    }

    if (typeof helperTarget.createDiv !== "function") {
      helperTarget.createDiv = function createDiv(
        this: Window,
        opts?: HelperOptions,
      ): HTMLDivElement {
        const doc = this?.document ?? globalScope.activeDocument ?? window.document;
        return createDetachedEl(doc, "div", opts);
      };
    }

    if (typeof helperTarget.createSpan !== "function") {
      helperTarget.createSpan = function createSpan(
        this: Window,
        opts?: HelperOptions,
      ): HTMLSpanElement {
        const doc = this?.document ?? globalScope.activeDocument ?? window.document;
        return createDetachedEl(doc, "span", opts);
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
        const doc = this?.document ?? globalScope.activeDocument ?? window.document;
        const el = nativeCreateElementNS.call(
          doc,
          "http://www.w3.org/2000/svg",
          tag,
        ) as SVGElementTagNameMap[K];
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
        const doc = this?.document ?? globalScope.activeDocument ?? window.document;
        return nativeCreateDocumentFragment.call(doc);
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
      const doc = this.ownerDocument ?? globalScope.activeDocument ?? window.document;
      const el = nativeCreateElement.call(doc, "div") as HTMLDivElement;
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
      const doc = this.ownerDocument ?? globalScope.activeDocument ?? window.document;
      const el = nativeCreateElement.call(doc, "span") as HTMLSpanElement;
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
      const doc = this.ownerDocument ?? globalScope.activeDocument ?? window.document;
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
      const doc = this.ownerDocument ?? globalScope.activeDocument ?? window.document;
      const el = nativeCreateElement.call(doc, tag) as HTMLElementTagNameMap[K];
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
            (el as unknown as Record<string, unknown>)[key] = value;
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

  installWindowNodePolyfills(window);
}

const windowMigrationListeners = new WeakMap<
  HTMLElement,
  Set<(win: Window) => unknown>
>();

/**
 * Installs Obsidian's cross-window Node helpers on a window's prototypes.
 * Obsidian patches every popout window as well as the main one, so tests that
 * build a second jsdom window for a popout call this on it too.
 */
export function installWindowNodePolyfills(win: Window): void {
  const scope = win as unknown as {
    Node: { prototype: Record<string, unknown> };
    HTMLElement: { prototype: Record<string, unknown> };
    Document: { prototype: Record<string, unknown> };
  };

  // A popout's own Document class; the main window gets the full helper above.
  // Like Obsidian, these append to the document, so they throw once it has
  // its <html> element (#409).
  if (typeof scope.Document.prototype.createEl !== "function") {
    const nativeCreate = scope.Document.prototype.createElement as (
      tag: string,
    ) => HTMLElement;
    scope.Document.prototype.createEl = function createEl(
      this: Document,
      tag: string,
    ): HTMLElement {
      return this.appendChild(nativeCreate.call(this, tag));
    };
    scope.Document.prototype.createDiv = function createDiv(
      this: Document,
      opts?: { cls?: string },
    ): HTMLElement {
      const el = nativeCreate.call(this, "div");
      if (opts?.cls) el.className = opts.cls;
      return this.appendChild(el);
    };
  }

  // A popout's global helpers, which return detached elements.
  const windowHelpers = win as unknown as Record<string, unknown>;
  if (typeof windowHelpers.createEl !== "function") {
    const nativeCreate = scope.Document.prototype.createElement as (
      tag: string,
    ) => HTMLElement;
    const createDetached = (tag: string, opts?: { cls?: string }): HTMLElement => {
      const el = nativeCreate.call(win.document, tag);
      if (opts?.cls) el.className = opts.cls;
      return el;
    };
    windowHelpers.createEl = createDetached;
    windowHelpers.createDiv = (opts?: { cls?: string }): HTMLElement =>
      createDetached("div", opts);
  }

  if (typeof scope.Node.prototype.instanceOf !== "function") {
    // Like Obsidian: match the constructor in the node's own window, so an
    // element created in a popout still counts as an HTMLElement.
    scope.Node.prototype.instanceOf = function instanceOf(
      this: Node,
      type: { new (): unknown; name: string },
    ): boolean {
      if (this instanceof type) return true;
      const nodeWindow = (this.ownerDocument ?? (this as Document)).defaultView;
      const local = (nodeWindow as unknown as Record<string, unknown> | null)?.[
        type.name
      ];
      return typeof local === "function" && this instanceof local;
    };
  }

  if (typeof scope.HTMLElement.prototype.onWindowMigrated !== "function") {
    scope.HTMLElement.prototype.onWindowMigrated = function onWindowMigrated(
      this: HTMLElement,
      listener: (win: Window) => unknown,
    ): () => void {
      let listeners = windowMigrationListeners.get(this);
      if (!listeners) {
        listeners = new Set();
        windowMigrationListeners.set(this, listeners);
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
  }
}

/**
 * Moves an element into another window's document and fires its
 * onWindowMigrated listeners, as Obsidian does for "Move to new window".
 */
export function migrateElementToWindow(el: HTMLElement, win: Window): void {
  win.document.body.appendChild(el);
  windowMigrationListeners.get(el)?.forEach((listener) => listener(win));
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
