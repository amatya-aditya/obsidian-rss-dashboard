import {
  WHATS_NEW_FEATURES,
  WHATS_NEW_VERSION,
} from "../generated/whats-new-content";

/**
 * The embedded Features summary, if it was generated for the version
 * currently running. Guards against a stale generated file — one built for
 * a different version than `manifest.version` — being bundled by mistake.
 */
export function getWhatsNewFeatures(currentVersion: string): string[] | null {
  if (WHATS_NEW_VERSION !== currentVersion) {
    return null;
  }
  return WHATS_NEW_FEATURES.length > 0 ? WHATS_NEW_FEATURES : null;
}

export interface WhatsNewDecisionInput {
  currentVersion: string;
  lastShownVersion: string | undefined;
  features: string[] | null;
}

export interface WhatsNewDecision {
  shouldShow: boolean;
  nextLastShownVersion: string;
}

/**
 * Whether the What's New popup should open this session, and what
 * `lastShownVersion` should become afterward. A release with no Features
 * section always advances the marker silently. Fresh-install suppression
 * happens one layer up, in main.ts's `maybeShowWhatsNew` — it never calls
 * this at all on a null/failed settings load, so there is no "fresh
 * install" case for this function itself to encode.
 */
export function decideWhatsNew({
  currentVersion,
  lastShownVersion,
  features,
}: WhatsNewDecisionInput): WhatsNewDecision {
  const hasFeatures = Boolean(features && features.length > 0);
  const alreadyShown = lastShownVersion === currentVersion;

  return { shouldShow: !alreadyShown && hasFeatures, nextLastShownVersion: currentVersion };
}
