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

  type HelperOptions = string | DomElementInfo;
  type AttrValue = string | number | boolean | null;

  // Obsidian applies these createEl options only on these tags and ignores
  // them elsewhere (observed on 1.13.7): a textarea gets no placeholder, and a
  // select, textarea or button gets no value.
  const TYPE_TAGS = new Set(["input", "button"]);
  const VALUE_TAGS = new Set(["input", "option"]);
  const PLACEHOLDER_TAGS = new Set(["input"]);
  const HREF_TAGS = new Set(["a"]);

  // Like Obsidian's setAttr: null removes the attribute, and other values are
  // stringified (false -> "false", 0 -> "0").
  const setAttrValue = (
    el: Element,
    name: string,
    value: AttrValue | undefined,
  ): void => {
    if (value === null || value === undefined) {
      el.removeAttribute(name);
      return;
    }
    el.setAttribute(name, String(value));
  };

  // A string sets the text; a DocumentFragment replaces the children with the
  // fragment's nodes.
  const setTextValue = (el: Node, text: string | DocumentFragment): void => {
    if (typeof text === "string") {
      el.textContent = text;
      return;
    }
    el.textContent = "";
    el.appendChild(text);
  };

  const applyElementInfo = (
    el: HTMLElement,
    tag: string,
    opts?: HelperOptions,
  ): void => {
    if (opts === undefined) return;
    if (typeof opts === "string") {
      el.className = opts;
      return;
    }
    if (opts.cls !== undefined) {
      el.className = Array.isArray(opts.cls) ? opts.cls.join(" ") : opts.cls;
    }
    if (opts.text !== undefined) setTextValue(el, opts.text);
    if (opts.attr) {
      Object.entries(opts.attr).forEach(([name, value]) =>
        setAttrValue(el, name, value),
      );
    }
    if (opts.title !== undefined) el.title = opts.title;
    const props = el as unknown as Record<string, unknown>;
    const tagName = tag.toLowerCase();
    if (opts.type !== undefined && TYPE_TAGS.has(tagName)) {
      props.type = opts.type;
    }
    if (opts.value !== undefined && VALUE_TAGS.has(tagName)) {
      props.value = opts.value;
    }
    if (opts.placeholder !== undefined && PLACEHOLDER_TAGS.has(tagName)) {
      props.placeholder = opts.placeholder;
    }
    if (opts.href !== undefined && HREF_TAGS.has(tagName)) {
      props.href = opts.href;
    }
  };

  // Builds a detached element the way Obsidian's helpers configure one.
  const createDetachedEl = <K extends keyof HTMLElementTagNameMap>(
    doc: Document,
    tag: K,
    opts?: HelperOptions,
  ): HTMLElementTagNameMap[K] => {
    const el = nativeCreateElement.call(doc, tag) as HTMLElementTagNameMap[K];
    applyElementInfo(el, tag, opts);
    return el;
  };

  // Like Obsidian's Node helpers: create the element, add it to the receiver
  // (as the first child with `prepend`), then call the callback with it.
  const createChildEl = <K extends keyof HTMLElementTagNameMap>(
    parent: Node,
    tag: K,
    opts?: HelperOptions,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ): HTMLElementTagNameMap[K] => {
    const doc =
      parent.nodeType === Node.DOCUMENT_NODE
        ? (parent as Document)
        : (parent.ownerDocument ?? globalScope.activeDocument ?? window.document);
    const el = createDetachedEl(doc, tag, opts);
    if (typeof opts === "object" && opts.prepend) {
      parent.insertBefore(el, parent.firstChild);
    } else {
      parent.appendChild(el);
    }
    callback?.(el);
    return el;
  };

  // Like Obsidian, the Node helpers on a Document append the new element to
  // the document itself. A document that already has <html> throws
  // HierarchyRequestError (observed on 1.13.7, #409). Use the Window helpers
  // (`el.win.createDiv()`) or createElement for a detached element.
  if (typeof documentProto.createEl !== "function") {
    documentProto.createEl = function createEl<
      K extends keyof HTMLElementTagNameMap,
    >(
      this: Document,
      tag: K,
      opts?: HelperOptions,
      callback?: (el: HTMLElementTagNameMap[K]) => void,
    ): HTMLElementTagNameMap[K] {
      return createChildEl(this, tag, opts, callback);
    };
  }

  if (typeof documentProto.createDiv !== "function") {
    documentProto.createDiv = function createDiv(
      this: Document,
      opts?: HelperOptions,
      callback?: (el: HTMLDivElement) => void,
    ): HTMLDivElement {
      return createChildEl(this, "div", opts, callback);
    };
  }

  if (typeof documentProto.createSpan !== "function") {
    documentProto.createSpan = function createSpan(
      this: Document,
      opts?: HelperOptions,
      callback?: (el: HTMLSpanElement) => void,
    ): HTMLSpanElement {
      return createChildEl(this, "span", opts, callback);
    };
  }

  if (typeof documentProto.createFragment !== "function") {
    documentProto.createFragment = function createFragment(
      this: Document,
      callback?: (fragment: DocumentFragment) => void,
    ): DocumentFragment {
      const fragment = nativeCreateDocumentFragment.call(this);
      callback?.(fragment);
      return fragment;
    };
  }

  const ensureWindowDomHelpers = (target: Window): Window => {
    const helperTarget = target as unknown as Record<string, unknown>;
    const documentOf = (win: Window | undefined): Document =>
      win?.document ?? globalScope.activeDocument ?? window.document;

    // The global Window helpers return detached elements.
    if (typeof helperTarget.createEl !== "function") {
      helperTarget.createEl = function createEl<
        K extends keyof HTMLElementTagNameMap,
      >(
        this: Window | undefined,
        tag: K,
        opts?: HelperOptions,
        callback?: (el: HTMLElementTagNameMap[K]) => void,
      ): HTMLElementTagNameMap[K] {
        const el = createDetachedEl(documentOf(this), tag, opts);
        callback?.(el);
        return el;
      };
    }

    if (typeof helperTarget.createDiv !== "function") {
      helperTarget.createDiv = function createDiv(
        this: Window | undefined,
        opts?: HelperOptions,
        callback?: (el: HTMLDivElement) => void,
      ): HTMLDivElement {
        const el = createDetachedEl(documentOf(this), "div", opts);
        callback?.(el);
        return el;
      };
    }

    if (typeof helperTarget.createSpan !== "function") {
      helperTarget.createSpan = function createSpan(
        this: Window | undefined,
        opts?: HelperOptions,
        callback?: (el: HTMLSpanElement) => void,
      ): HTMLSpanElement {
        const el = createDetachedEl(documentOf(this), "span", opts);
        callback?.(el);
        return el;
      };
    }

    if (typeof helperTarget.createSvg !== "function") {
      helperTarget.createSvg = function createSvg<
        K extends keyof SVGElementTagNameMap,
      >(
        this: Window | undefined,
        tag: K,
        attrs?: Record<string, string>,
      ): SVGElementTagNameMap[K] {
        const el = nativeCreateElementNS.call(
          documentOf(this),
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
        this: Window | undefined,
        callback?: (fragment: DocumentFragment) => void,
      ): DocumentFragment {
        const fragment = nativeCreateDocumentFragment.call(documentOf(this));
        callback?.(fragment);
        return fragment;
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

  const nodeProto = Node.prototype as unknown as Record<string, unknown>;
  const elementProto = Element.prototype as unknown as Record<string, unknown>;
  const fragmentProto = DocumentFragment.prototype as unknown as Record<
    string,
    unknown
  >;

  // Node helpers. Obsidian defines these on Node, so a DocumentFragment has
  // them too (`createFragment((f) => f.createSpan())`).
  if (typeof nodeProto.createEl !== "function") {
    nodeProto.createEl = function createEl<
      K extends keyof HTMLElementTagNameMap,
    >(
      this: Node,
      tag: K,
      opts?: HelperOptions,
      callback?: (el: HTMLElementTagNameMap[K]) => void,
    ): HTMLElementTagNameMap[K] {
      return createChildEl(this, tag, opts, callback);
    };
  }

  if (typeof nodeProto.createDiv !== "function") {
    nodeProto.createDiv = function createDiv(
      this: Node,
      opts?: HelperOptions,
      callback?: (el: HTMLDivElement) => void,
    ): HTMLDivElement {
      return createChildEl(this, "div", opts, callback);
    };
  }

  if (typeof nodeProto.createSpan !== "function") {
    nodeProto.createSpan = function createSpan(
      this: Node,
      opts?: HelperOptions,
      callback?: (el: HTMLSpanElement) => void,
    ): HTMLSpanElement {
      return createChildEl(this, "span", opts, callback);
    };
  }

  if (typeof nodeProto.empty !== "function") {
    nodeProto.empty = function empty(this: Node): void {
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
    };
  }

  if (typeof nodeProto.appendText !== "function") {
    nodeProto.appendText = function appendText(this: Node, text: string): void {
      const doc =
        this.ownerDocument ?? globalScope.activeDocument ?? window.document;
      this.appendChild(doc.createTextNode(text));
    };
  }

  if (typeof nodeProto.detach !== "function") {
    nodeProto.detach = function detach(this: Node): void {
      this.parentNode?.removeChild(this);
    };
  }

  if (!Object.getOwnPropertyDescriptor(Node.prototype, "doc")) {
    Object.defineProperty(Node.prototype, "doc", {
      configurable: true,
      get(this: Node): Document {
        return this.nodeType === Node.DOCUMENT_NODE
          ? (this as Document)
          : (this.ownerDocument ?? window.document);
      },
    });
  }

  // Element helpers.
  if (typeof elementProto.setText !== "function") {
    elementProto.setText = function setText(
      this: Element,
      text: string | DocumentFragment,
    ): void {
      setTextValue(this, text);
    };
  }

  if (typeof elementProto.addClass !== "function") {
    elementProto.addClass = function addClass(
      this: Element,
      ...classes: string[]
    ): void {
      this.classList.add(...classes);
    };
  }

  if (typeof elementProto.addClasses !== "function") {
    elementProto.addClasses = function addClasses(
      this: Element,
      classes: string[],
    ): void {
      this.classList.add(...classes);
    };
  }

  if (typeof elementProto.removeClass !== "function") {
    elementProto.removeClass = function removeClass(
      this: Element,
      ...classes: string[]
    ): void {
      this.classList.remove(...classes);
    };
  }

  if (typeof elementProto.hasClass !== "function") {
    elementProto.hasClass = function hasClass(
      this: Element,
      cls: string,
    ): boolean {
      return this.classList.contains(cls);
    };
  }

  // Not a toggle: without `value`, Obsidian removes the classes whether or
  // not they were present (observed on 1.13.7).
  if (typeof elementProto.toggleClass !== "function") {
    elementProto.toggleClass = function toggleClass(
      this: Element,
      classes: string | string[],
      value?: boolean,
    ): void {
      const list = Array.isArray(classes) ? classes : [classes];
      if (value) {
        this.classList.add(...list);
      } else {
        this.classList.remove(...list);
      }
    };
  }

  if (typeof elementProto.setAttr !== "function") {
    elementProto.setAttr = function setAttr(
      this: Element,
      name: string,
      value: AttrValue,
    ): void {
      setAttrValue(this, name, value);
    };
  }

  if (typeof elementProto.getAttr !== "function") {
    elementProto.getAttr = function getAttr(
      this: Element,
      name: string,
    ): string | null {
      return this.getAttribute(name);
    };
  }

  const find = function find(
    this: ParentNode,
    selector: string,
  ): Element | null {
    return this.querySelector(selector);
  };
  const findAll = function findAll(
    this: ParentNode,
    selector: string,
  ): HTMLElement[] {
    return Array.from(this.querySelectorAll<HTMLElement>(selector));
  };
  [elementProto, fragmentProto].forEach((target) => {
    if (typeof target.find !== "function") target.find = find;
    if (typeof target.findAll !== "function") target.findAll = findAll;
  });

  // HTMLElement helpers.
  if (typeof proto.show !== "function") {
    proto.show = function show(this: HTMLElement): void {
      this.setCssProps({ display: "" });
    };
  }

  if (typeof proto.hide !== "function") {
    proto.hide = function hide(this: HTMLElement): void {
      this.setCssProps({ display: "none" });
    };
  }

  if (typeof proto.setCssProps !== "function") {
    proto.setCssProps = function setCssProps(
      this: HTMLElement,
      props: Record<string, string>,
    ): void {
      Object.entries(props).forEach(([name, value]) => {
        this.style.setProperty(name, value);
      });
    };
  }

  if (typeof proto.setCssStyles !== "function") {
    proto.setCssStyles = function setCssStyles(
      this: HTMLElement,
      styles: Partial<CSSStyleDeclaration>,
    ): void {
      Object.assign(this.style, styles);
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
