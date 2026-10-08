import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRef } from "obsidian";
import {
  TagChipRadiusSync,
  type TagChipRadiusWorkspace,
} from "../../../src/services/tag-chip-radius-sync";
import {
  TAG_CHIP_RADIUS_CSS_VAR,
  TAG_CHIP_RADIUS_EVENT,
} from "../../../src/utils/tag-chip-radius";

type Handler = (...args: unknown[]) => unknown;

/** Minimal workspace double: records handlers and lists leaves per document. */
function createWorkspace(mainDoc: Document) {
  const handlers = new Map<string, Handler[]>();
  const leafDocs: Document[] = [];
  const workspace: TagChipRadiusWorkspace = {
    containerEl: mainDoc.body,
    iterateAllLeaves: (callback) => {
      for (const doc of leafDocs) {
        callback({ view: { containerEl: doc.body } });
      }
    },
    on: (name, callback) => {
      handlers.set(name, [...(handlers.get(name) ?? []), callback]);
      return { name } as unknown as EventRef;
    },
  };
  return {
    workspace,
    leafDocs,
    fire: (name: string, ...args: unknown[]) =>
      (handlers.get(name) ?? []).forEach((handler) => handler(...args)),
  };
}

// jsdom documents made by hand have no window; a live popout document does.
function createWindowDocument(title: string): Document {
  const doc = document.implementation.createHTMLDocument(title);
  Object.defineProperty(doc, "defaultView", {
    value: {},
    configurable: true,
  });
  return doc;
}

const readVar = (doc: Document) =>
  doc.body.style.getPropertyValue(TAG_CHIP_RADIUS_CSS_VAR);

describe("TagChipRadiusSync", () => {
  let mainDoc: Document;
  let popoutDoc: Document;
  let radius: string;
  let registered: EventRef[];
  let host: ReturnType<typeof createWorkspace>;
  let sync: TagChipRadiusSync;

  beforeEach(() => {
    mainDoc = createWindowDocument("main");
    popoutDoc = createWindowDocument("popout");
    radius = "999px";
    registered = [];
    host = createWorkspace(mainDoc);
    sync = new TagChipRadiusSync({
      workspace: host.workspace,
      getRadius: () => radius,
      registerEvent: (ref) => registered.push(ref),
    });
  });

  afterEach(() => {
    sync.dispose();
  });

  it("applies the saved radius to the main window on start", () => {
    radius = "10px";
    sync.start();

    expect(readVar(mainDoc)).toBe("10px");
  });

  it("hands every workspace listener to the plugin's register callback", () => {
    sync.start();

    expect(
      registered.map((ref) => (ref as unknown as { name: string }).name),
    ).toEqual([TAG_CHIP_RADIUS_EVENT, "window-open"]);
  });

  it("updates the main window and an open popout when the preference changes", () => {
    host.leafDocs.push(popoutDoc);
    sync.start();
    expect(readVar(popoutDoc)).toBe("999px");

    radius = "0px";
    host.fire(TAG_CHIP_RADIUS_EVENT);

    expect(readVar(mainDoc)).toBe("0px");
    expect(readVar(popoutDoc)).toBe("0px");
  });

  it("applies the radius to a popout as soon as it opens", () => {
    radius = "10px";
    sync.start();

    host.fire("window-open", {}, { document: popoutDoc });

    expect(readVar(popoutDoc)).toBe("10px");
  });

  it("falls back to Pill when the stored radius is unusable", () => {
    radius = "not a radius";
    sync.start();

    expect(readVar(mainDoc)).toBe("999px");
  });

  it("stops touching a popout once its window is gone", () => {
    sync.start();
    host.fire("window-open", {}, { document: popoutDoc });
    Object.defineProperty(popoutDoc, "defaultView", { value: null });

    radius = "0px";
    host.fire(TAG_CHIP_RADIUS_EVENT);

    expect(readVar(popoutDoc)).toBe("999px");
    expect(readVar(mainDoc)).toBe("0px");
  });

  it("removes the property from every window on dispose", () => {
    host.leafDocs.push(popoutDoc);
    sync.start();

    sync.dispose();

    expect(readVar(mainDoc)).toBe("");
    expect(readVar(popoutDoc)).toBe("");
  });

  it("ignores window events that carry no document", () => {
    sync.start();
    const apply = vi.spyOn(sync, "apply");

    expect(() => host.fire("window-open", {}, undefined)).not.toThrow();
    expect(apply).not.toHaveBeenCalled();
  });
});
