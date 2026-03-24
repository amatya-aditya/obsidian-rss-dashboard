import type { Feed, Folder } from "../types/types";
import { isValidFeedTitle, isValidFolderName, sanitizeName } from "../utils/validation";

type ImportMode = "update" | "overwrite";

const UNCATEGORIZED_FOLDER = "Uncategorized";

type FolderSelectionState = { checked: boolean; indeterminate: boolean };

type FeedState = {
  feed: Feed;
  selected: boolean;
  duplicate: boolean;
};

interface FolderNode {
  name: string;
  path: string;
  parent: FolderNode | null;
  children: FolderNode[];
  feedUrls: string[];
}

export type OpmlImportPreviewFolderSnapshot = {
  name: string;
  path: string;
  children: OpmlImportPreviewFolderSnapshot[];
  feedUrls: string[];
};

function splitFolderPath(path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed) return [UNCATEGORIZED_FOLDER];
  // Preserve semantics used across the plugin: `/` expresses nesting.
  return trimmed.split("/").filter((seg) => seg.length > 0);
}

function joinFolderPath(parts: string[]): string {
  return parts.join("/");
}

function validateFolderPath(path: string): { valid: boolean; error?: string } {
  const parts = splitFolderPath(path);
  for (const seg of parts) {
    const result = isValidFolderName(seg);
    if (!result.valid) {
      return result;
    }
  }
  return { valid: true };
}

function cloneFolderTreeFromPaths(paths: string[]): Folder[] {
  const roots: Folder[] = [];

  const findOrCreate = (children: Folder[], name: string): Folder => {
    const existing = children.find((f) => f.name === name);
    if (existing) return existing;
    const created: Folder = { name, subfolders: [] };
    children.push(created);
    return created;
  };

  for (const path of paths) {
    const parts = splitFolderPath(path).filter((p) => p !== UNCATEGORIZED_FOLDER);
    if (parts.length === 0) continue;

    let cursor = roots;
    for (const seg of parts) {
      const next = findOrCreate(cursor, seg);
      cursor = next.subfolders;
    }
  }

  return roots;
}

export class OpmlImportPreviewModel {
  private importMode: ImportMode;
  private feedByUrl = new Map<string, FeedState>();
  private rootFolders: FolderNode[] = [];
  private folderByPath = new Map<string, FolderNode>();

  constructor(args: {
    feeds: Feed[];
    folders: Folder[];
    importMode: ImportMode;
    existingUrls: Set<string>;
  }) {
    this.importMode = args.importMode;

    this.buildFolderNodesFromOpmlFolders(args.folders);

    for (const feed of args.feeds) {
      const normalizedFolder = feed.folder?.trim() ? feed.folder.trim() : UNCATEGORIZED_FOLDER;
      const duplicate = this.importMode === "update" && args.existingUrls.has(feed.url);
      const normalizedFeed: Feed = { ...feed, folder: normalizedFolder };
      this.feedByUrl.set(feed.url, { feed: normalizedFeed, selected: true, duplicate });
    }

    this.ensureFolderNodesForFeeds();
    this.assignFeedsToFolders();
  }

  setImportMode(importMode: ImportMode, existingUrls: Set<string>): void {
    this.importMode = importMode;
    for (const state of this.feedByUrl.values()) {
      state.duplicate = this.importMode === "update" && existingUrls.has(state.feed.url);
    }
  }

  getFolderTree(): OpmlImportPreviewFolderSnapshot[] {
    function clone(node: FolderNode): OpmlImportPreviewFolderSnapshot {
      return {
        name: node.name,
        path: node.path,
        children: node.children.map(clone),
        feedUrls: [...node.feedUrls],
      };
    }
    return this.rootFolders.map((n) => clone(n));
  }

  getFeedState(url: string): { feed: Feed; selected: boolean; duplicate: boolean } {
    const state = this.feedByUrl.get(url);
    if (!state) {
      throw new Error(`Unknown feed url: ${url}`);
    }
    return { feed: state.feed, selected: state.selected, duplicate: state.duplicate };
  }

  getSelectedImportableFeeds(): Feed[] {
    return Array.from(this.feedByUrl.values())
      .filter((s) => s.selected && !s.duplicate)
      .map((s) => s.feed);
  }

  renameFeedTitle(url: string, newTitle: string): void {
    const state = this.feedByUrl.get(url);
    if (!state) return;
    state.feed = { ...state.feed, title: newTitle };
  }

  getStats(): {
    totalFeeds: number;
    duplicateFeeds: number;
    selectedFeeds: number;
    selectedImportableFeeds: number;
    hasBlockingErrors: boolean;
  } {
    const all = Array.from(this.feedByUrl.values());
    const totalFeeds = all.length;
    const duplicateFeeds = all.filter((f) => f.duplicate).length;
    const selectedFeeds = all.filter((f) => f.selected).length;

    const selectedImportableFeeds = all.filter((f) => f.selected && !f.duplicate).length;
    const hasBlockingErrors = all.some((f) => {
      if (!f.selected || f.duplicate) return false;
      return !this.isFeedValidForImport(f.feed);
    });

    return {
      totalFeeds,
      duplicateFeeds,
      selectedFeeds,
      selectedImportableFeeds,
      hasBlockingErrors,
    };
  }

  getFeed(url: string): Feed {
    const state = this.feedByUrl.get(url);
    if (!state) {
      throw new Error(`Unknown feed url: ${url}`);
    }
    return state.feed;
  }

  toggleFeed(url: string, selected: boolean): void {
    const state = this.feedByUrl.get(url);
    if (!state) return;
    state.selected = selected;
  }

  getFolderSelectionState(path: string): FolderSelectionState {
    const node = this.folderByPath.get(path);
    if (!node) return { checked: false, indeterminate: false };

    const urls = this.collectDescendantFeedUrls(node);
    if (urls.length === 0) return { checked: false, indeterminate: false };

    let selected = 0;
    for (const url of urls) {
      if (this.feedByUrl.get(url)?.selected) selected++;
    }

    return {
      checked: selected === urls.length,
      indeterminate: selected > 0 && selected < urls.length,
    };
  }

  toggleFolder(path: string, selected: boolean): void {
    const node = this.folderByPath.get(path);
    if (!node) return;
    const urls = this.collectDescendantFeedUrls(node);
    for (const url of urls) {
      const state = this.feedByUrl.get(url);
      if (state) state.selected = selected;
    }
  }

  renameFolderSegment(path: string, newName: string): void {
    const node = this.folderByPath.get(path);
    if (!node) return;

    const trimmed = newName.trim();
    const parent = node.parent;
    const newPath = parent ? `${parent.path}/${trimmed}` : trimmed;
    if (!trimmed || newPath === node.path) {
      node.name = trimmed || node.name;
      return;
    }

    const collision = this.folderByPath.get(newPath);
    const oldPath = node.path;

    if (collision && collision !== node) {
      // Merge node into collision target.
      this.updateFeedFolderPrefix(oldPath, newPath);
      this.mergeFolderNodes(collision, node, oldPath, newPath);
      this.detachNode(node);
      return;
    }

    node.name = trimmed;
    this.updateNodePaths(node, parent);
    this.updateFeedFolderPrefix(oldPath, node.path);
  }

  autoFixInvalidNames(): void {
    // Fix folders first so feed folder paths update deterministically.
    // Collect paths snapshot since rename mutates maps.
    const folderPaths = Array.from(this.folderByPath.keys()).sort((a, b) => a.length - b.length);
    for (const path of folderPaths) {
      const node = this.folderByPath.get(path);
      if (!node) continue;
      const result = isValidFolderName(node.name);
      if (result.valid) continue;
      const fixed = sanitizeName(node.name);
      this.renameFolderSegment(node.path, fixed);
    }

    for (const state of this.feedByUrl.values()) {
      const titleResult = isValidFeedTitle(state.feed.title);
      if (!titleResult.valid) {
        state.feed = { ...state.feed, title: sanitizeName(state.feed.title) };
      }

      const folderResult = validateFolderPath(state.feed.folder);
      if (!folderResult.valid) {
        // If the feed is in a folder path that doesn't exist as nodes (e.g. category attribute),
        // create nodes and then sanitize at the node level above.
        this.ensureFolderPathExists(state.feed.folder);
        // After nodes exist, normalize the feed folder to the node path we find.
        const normalized = joinFolderPath(splitFolderPath(state.feed.folder));
        state.feed = { ...state.feed, folder: normalized };
      }
    }
  }

  getDerivedFoldersForSelectedFeeds(): Folder[] {
    const selectedPaths: string[] = [];
    for (const state of this.feedByUrl.values()) {
      if (!state.selected || state.duplicate) continue;
      selectedPaths.push(state.feed.folder);
    }
    return cloneFolderTreeFromPaths(selectedPaths);
  }

  private isFeedValidForImport(feed: Feed): boolean {
    if (!isValidFeedTitle(feed.title).valid) return false;
    if (!validateFolderPath(feed.folder).valid) return false;
    return true;
  }

  private buildFolderNodesFromOpmlFolders(folders: Folder[]): void {
    const build = (folder: Folder, parent: FolderNode | null): FolderNode => {
      const path = parent ? `${parent.path}/${folder.name}` : folder.name;
      const node: FolderNode = {
        name: folder.name,
        path,
        parent,
        children: [],
        feedUrls: [],
      };
      this.folderByPath.set(path, node);
      node.children = folder.subfolders.map((sub) => build(sub, node));
      return node;
    };

    this.rootFolders = folders.map((f) => build(f, null));
  }

  private ensureFolderNodesForFeeds(): void {
    for (const state of this.feedByUrl.values()) {
      this.ensureFolderPathExists(state.feed.folder);
    }
  }

  private ensureFolderPathExists(folderPath: string): void {
    const parts: string[] = splitFolderPath(folderPath);
    let parent: FolderNode | null = null;
    for (const seg of parts) {
      const segment = String(seg);
      const path: string = parent ? `${parent.path}/${segment}` : segment;
      let node: FolderNode | undefined = this.folderByPath.get(path);
      if (!node) {
        node = { name: segment, path, parent, children: [], feedUrls: [] };
        this.folderByPath.set(path, node);
        if (parent) {
          parent.children.push(node);
        } else {
          this.rootFolders.push(node);
        }
      }
      parent = node;
    }
  }

  private assignFeedsToFolders(): void {
    for (const node of this.folderByPath.values()) {
      node.feedUrls = [];
    }

    for (const [url, state] of this.feedByUrl.entries()) {
      const leafPath = joinFolderPath(splitFolderPath(state.feed.folder));
      const leaf = this.folderByPath.get(leafPath);
      if (leaf) {
        leaf.feedUrls.push(url);
      }
    }
  }

  private collectDescendantFeedUrls(node: FolderNode): string[] {
    const urls: string[] = [];
    const stack: FolderNode[] = [node];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      urls.push(...current.feedUrls);
      for (const child of current.children) stack.push(child);
    }
    return urls;
  }

  private updateFeedFolderPrefix(oldPrefix: string, newPrefix: string): void {
    for (const state of this.feedByUrl.values()) {
      if (state.feed.folder === oldPrefix) {
        state.feed = { ...state.feed, folder: newPrefix };
        continue;
      }
      if (state.feed.folder.startsWith(`${oldPrefix}/`)) {
        state.feed = {
          ...state.feed,
          folder: state.feed.folder.replace(oldPrefix, newPrefix),
        };
      }
    }
  }

  private updateNodePaths(node: FolderNode, parent: FolderNode | null): void {
    const oldPath = node.path;
    const newPath = parent ? `${parent.path}/${node.name}` : node.name;

    if (oldPath !== newPath) {
      this.folderByPath.delete(oldPath);
      node.path = newPath;
      node.parent = parent;
      this.folderByPath.set(newPath, node);
    }

    for (const child of node.children) {
      this.updateNodePaths(child, node);
    }
  }

  private detachNode(node: FolderNode): void {
    const parent = node.parent;
    if (parent) {
      parent.children = parent.children.filter((c) => c !== node);
    } else {
      this.rootFolders = this.rootFolders.filter((r) => r !== node);
    }
    this.removeNodeFromMap(node);
  }

  private removeNodeFromMap(node: FolderNode): void {
    this.folderByPath.delete(node.path);
    for (const child of node.children) {
      this.removeNodeFromMap(child);
    }
  }

  private mergeFolderNodes(
    target: FolderNode,
    source: FolderNode,
    sourcePrefix: string,
    targetPrefix: string,
  ): void {
    // Move feed urls
    const mergedUrls = new Set([...target.feedUrls, ...source.feedUrls]);
    target.feedUrls = Array.from(mergedUrls);

    // Move children, merging by name.
    for (const sourceChild of source.children) {
      const desiredName = sourceChild.name;
      const existing = target.children.find((c) => c.name === desiredName);
      if (existing) {
        this.mergeFolderNodes(existing, sourceChild, sourcePrefix, targetPrefix);
      } else {
        // Rehome and update paths for moved subtree.
        sourceChild.parent = target;
        target.children.push(sourceChild);
        this.reprefixNodePaths(sourceChild, sourcePrefix, targetPrefix);
      }
    }
  }

  private reprefixNodePaths(node: FolderNode, oldPrefix: string, newPrefix: string): void {
    const oldPath = node.path;
    const newPath = oldPath === oldPrefix ? newPrefix : oldPath.replace(oldPrefix, newPrefix);
    if (oldPath !== newPath) {
      this.folderByPath.delete(oldPath);
      node.path = newPath;
      this.folderByPath.set(newPath, node);
    }
    for (const child of node.children) {
      this.reprefixNodePaths(child, oldPrefix, newPrefix);
    }
  }
}
