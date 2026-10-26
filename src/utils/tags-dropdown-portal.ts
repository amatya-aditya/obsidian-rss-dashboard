import type { App } from "obsidian";
import type { FeedItem, RssDashboardSettings, Tag } from "../types/types";
import { createTagsDropdownPortalImplementation } from "./tags-dropdown-portal-implementation";

export type TagsDropdownPortalOptions = {
  app: App;
  anchor: HTMLElement;
  settings: RssDashboardSettings;
  item: FeedItem;
  onTagAssignmentChange: (tag: Tag, checked: boolean) => void;
  onPersistSettings?: () => Promise<void> | void;
  onAfterSettingsTagsMutated?: () => void;
  /**
   * Called after a tag is edited through the portal, with the tag as it was
   * and as it is now. Lets callers whose items are not in `settings.feeds`
   * (e.g. the starred-import preview) apply the same rename/recolor.
   */
  onTagEdited?: (previous: Tag, updated: Tag) => void;
  onOpenTagsSettings?: () => Promise<void> | void;
  appContainer?: HTMLElement | null;
  /**
   * Keep Tab and Shift+Tab cycling inside the menu. Opt-in, because the portal
   * also mounts inside modals: there the host dialog claims Escape, so a
   * trapped menu would leave closing the whole dialog as the only way out.
   * The dashboard and Reader opt in; the Import Starred dialog keeps its
   * normal Tab order (#1480).
   */
  containTab?: boolean;
  /**
   * Receives the mounted menu root. A view whose own focus-restore handler
   * could pull focus out of the menu (the dashboard and Reader restore their
   * container on leaf activation) keeps this reference and passes it to
   * `tagsPortalHoldsFocus` before taking focus (#1480).
   */
  onOpen?: (portal: HTMLElement) => void;
  onClosed?: () => void;
};

/**
 * True while `portal` is still mounted and keyboard focus belongs to the menu
 * it opened: inside the menu, on its opener, or on the document body that a
 * click on the menu's non-focusable text leaves. This is the same set of
 * states the portal's Escape handler accepts, so the dashboard and Reader can
 * skip their leaf-activation focus grab without making Escape unreachable
 * (#1480).
 */
export function tagsPortalHoldsFocus(
  portal: HTMLElement | null,
  anchor?: HTMLElement | null,
): boolean {
  if (!portal?.isConnected) return false;
  const doc = portal.ownerDocument;
  const focused = doc.activeElement;
  return (
    !focused ||
    focused === doc.body ||
    portal.contains(focused) ||
    (anchor?.contains(focused) ?? false)
  );
}

export function createTagsDropdownPortal(
  options: TagsDropdownPortalOptions,
): () => void {
  return createTagsDropdownPortalImplementation(options);
}
