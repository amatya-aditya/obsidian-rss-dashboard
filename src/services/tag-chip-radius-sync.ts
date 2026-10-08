import type { EventRef } from "obsidian";
import { setCssProps } from "../utils/platform-utils";
import {
  TAG_CHIP_RADIUS_CSS_VAR,
  TAG_CHIP_RADIUS_EVENT,
  normalizeTagChipRadius,
} from "../utils/tag-chip-radius";

/** The slice of the Obsidian workspace this service reads. */
export interface TagChipRadiusWorkspace {
  containerEl?: HTMLElement;
  iterateAllLeaves(
    callback: (leaf: { view?: { containerEl?: HTMLElement } }) => void,
  ): void;
  on(name: string, callback: (...args: unknown[]) => unknown): EventRef;
}

export interface TagChipRadiusSyncOptions {
  workspace: TagChipRadiusWorkspace;
  getRadius: () => string;
  /** The plugin's `registerEvent`; only the plugin registers events. */
  registerEvent: (ref: EventRef) => void;
}

/**
 * Publishes the tag chip radius preference (#663) as a custom property on the
 * body of every open Obsidian window, the main window and popouts alike.
 * Portals and modals render in `body`, outside any view root, so the property
 * has to live there for every chip to resolve it.
 */
export class TagChipRadiusSync {
  private readonly documents = new Set<Document>();

  constructor(private readonly options: TagChipRadiusSyncOptions) {}

  /** Registers the workspace listeners through the plugin and applies once. */
  start(): void {
    const { workspace, registerEvent } = this.options;
    registerEvent(workspace.on(TAG_CHIP_RADIUS_EVENT, () => this.apply()));
    registerEvent(
      workspace.on("window-open", (_win, openedWindow) => {
        if (isWindowWithDocument(openedWindow)) {
          this.applyToDocument(openedWindow.document);
        }
      }),
    );
    this.apply();
  }

  /** Re-reads the preference and writes it to every open window. */
  apply(): void {
    for (const doc of this.collectDocuments()) {
      this.applyToDocument(doc);
    }
  }

  /** Removes the property from every window this service has touched. */
  dispose(): void {
    for (const doc of this.documents) {
      doc.body?.style.removeProperty(TAG_CHIP_RADIUS_CSS_VAR);
    }
    this.documents.clear();
  }

  private applyToDocument(doc: Document): void {
    if (!doc.body) return;
    this.documents.add(doc);
    setCssProps(doc.body, {
      [TAG_CHIP_RADIUS_CSS_VAR]: normalizeTagChipRadius(
        this.options.getRadius(),
      ),
    });
  }

  private collectDocuments(): Set<Document> {
    const { workspace } = this.options;
    const docs = new Set<Document>();
    docs.add(workspace.containerEl?.ownerDocument ?? activeDocument);
    workspace.iterateAllLeaves((leaf) => {
      const doc = leaf.view?.containerEl?.ownerDocument;
      if (doc) docs.add(doc);
    });
    // A closed popout loses its window; forget it rather than writing to it.
    for (const doc of [...this.documents]) {
      if (doc.defaultView) docs.add(doc);
      else this.documents.delete(doc);
    }
    return docs;
  }
}

function isWindowWithDocument(value: unknown): value is { document: Document } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { document?: unknown }).document !== undefined
  );
}
