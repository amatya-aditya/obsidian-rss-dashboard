import { renderCardView as renderCardViewImplementation } from "./card-view-renderer";
import type { CardViewContext as CardViewCtx } from "./card-view-renderer";
import type { FeedItem } from "../../../types/types";
import type { ViewDeps } from "./view-types";

export type { CardViewContext } from "./card-view-renderer";

export function renderCardView(
  container: HTMLElement,
  articles: FeedItem[],
  ctx: CardViewCtx,
  deps: ViewDeps,
): void {
  renderCardViewImplementation(container, articles, ctx, deps);
}
