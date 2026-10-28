import type { FeedItem } from "../../../types/types";
import type { ViewDeps } from "./view-types";
import { renderListView as renderListViewImplementation } from "./list-view-renderer";
import type { ListViewContext } from "./list-view-renderer";

export type { ListViewContext } from "./list-view-renderer";

export function renderListView(
  container: HTMLElement,
  articles: FeedItem[],
  ctx: ListViewContext,
  deps: ViewDeps,
): void {
  renderListViewImplementation(container, articles, ctx, deps);
}
