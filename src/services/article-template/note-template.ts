import type {
  ArticleSavingSettings,
  FeedItem,
  SavedTemplate,
} from "../../types/types";
import { firstNonFormulaImageUrl } from "../../utils/image-url-utils";
import { normalizeSubstackImageUrl } from "../../utils/substack-image-url";
import { templatePlacesImage } from "./template-variables";

/** The note template a save falls back to when none is set. */
const BUILT_IN_NOTE_TEMPLATE =
  "# {{title}}\n\n{{content}}\n\n[Source]({{link}})";

/**
 * The note template a save uses: a custom one, the saved template's own,
 * the settings' default, or the built-in fallback, in that order. A saved
 * template without a custom one never reads the settings' default.
 */
export function resolveNoteTemplate(
  settings: Pick<ArticleSavingSettings, "defaultTemplate">,
  customTemplate: string | undefined,
  savedTemplate: SavedTemplate | undefined,
): string {
  return savedTemplate
    ? (customTemplate ?? savedTemplate.template)
    : customTemplate || settings.defaultTemplate || BUILT_IN_NOTE_TEMPLATE;
}

/**
 * What `{{image}}` fills for an item: its displayed cover, then the feed's
 * image, an iTunes image, or an image enclosure. Empty when the item has none.
 */
export function templateImageUrl(item: FeedItem): string {
  const enclosureImageUrl =
    item.enclosure?.type?.startsWith("image/") && item.enclosure.url
      ? item.enclosure.url
      : "";

  const imageUrl = firstNonFormulaImageUrl([
    item.coverImage,
    item.image,
    item.itunes?.image?.href,
    enclosureImageUrl,
  ]);

  return normalizeSubstackImageUrl((imageUrl || "").trim());
}

/**
 * Whether a note body leads with the item's hero image. A template that places
 * `{{image}}` in the note body has chosen where the image goes, as a Web
 * Clipper template does, so the body takes no hero of its own and the image is
 * not written twice. That holds only while `{{image}}` has an image to fill: an
 * item with none would otherwise be left with no image at all.
 */
export function bodyLeadsWithHero(template: string, item: FeedItem): boolean {
  return !templatePlacesImage(template) || templateImageUrl(item) === "";
}

/** {@link bodyLeadsWithHero} for the template a save will resolve. */
export function noteLeadsWithHero(
  settings: Pick<ArticleSavingSettings, "defaultTemplate">,
  customTemplate: string | undefined,
  savedTemplate: SavedTemplate | undefined,
  item: FeedItem,
): boolean {
  return bodyLeadsWithHero(
    resolveNoteTemplate(settings, customTemplate, savedTemplate),
    item,
  );
}
