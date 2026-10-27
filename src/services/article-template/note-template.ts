import type { ArticleSavingSettings, SavedTemplate } from "../../types/types";
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
 * Whether a save leads its body with the item's hero image. A template that
 * places `{{image}}` in the note body has chosen where the image goes, as a
 * Web Clipper template does, so the body takes no hero of its own and the
 * image is not written twice.
 */
export function noteLeadsWithHero(
  settings: Pick<ArticleSavingSettings, "defaultTemplate">,
  customTemplate: string | undefined,
  savedTemplate: SavedTemplate | undefined,
): boolean {
  return !templatePlacesImage(
    resolveNoteTemplate(settings, customTemplate, savedTemplate),
  );
}
