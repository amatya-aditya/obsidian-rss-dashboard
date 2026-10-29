# ADR 0040: Defer YouTube Data API Feeds Pending Compliance Clearance

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse project decisions.

## Status

accepted

## Date

2026-10-29

## Context and problem

Users have asked to enter a YouTube API key to receive more channel videos and
use additional YouTube features. The proposed MVP goal was up to 50 uploads for
a channel. RSS Dashboard already supports YouTube channel RSS feeds and
embedded playback; neither requires a YouTube Data API key. The current RSS
item count is not a fixed RSS Dashboard contract.

The proposed Data API calls could request one page of up to 50 uploads, but the
API reference does not promise that this page is the 50 newest uploads. More
importantly, the feature has unresolved credential, data-retention, deletion,
and cross-channel display questions. A user-managed key in Obsidian SecretStorage
would keep the value out of settings and portable data, but it would not settle
whether the distributed plugin may use that key under YouTube's API credential
rules.

## Decision

Do not implement or promise a YouTube Data API source or ask users to create and
enter API keys unless the compliance and product gates below are cleared. Keep
the existing YouTube RSS and IFrame behavior available without a Data API key.
This is a defer decision; the up-to-50 goal remains a user need, not a release
commitment.

FreshRSS may be mentioned as an independent self-hosted alternative whose users
can evaluate its extension ecosystem. Do not describe it as a compliance-cleared
or equivalent 50-item API solution. FreshRSS's [official YouTube
extension](https://github.com/FreshRSS/Extensions/blob/main/xExtension-YouTube/README.md)
converts channel URLs to YouTube feeds and embeds videos. A separate
[community extension](https://github.com/cevvalkoala/xExtension-YouTubeDuration)
uses a user-supplied Data API key to add duration or Shorts labels to existing
feed items; it does not establish that the key arrangement is allowed or
provide the proposed 50-upload source. FreshRSS distinguishes official from
[community extensions](https://freshrss.github.io/FreshRSS/en/admins/15_extensions.html);
community implementations are not policy clearance for RSS Dashboard.

FreshRSS is the only implemented SecretStorage consumer today. Keep its
resolver feature-local, and defer a shared module rather than designing it
around the unimplemented YouTube proposal. Issue [#1363](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1363)
is closed with a no-go for generic credentialed article fetching and no
implementation. It is not a current or approved SecretStorage
consumer. A separate, publisher-specific proposal may be considered only if it
establishes that the exact access pattern is permitted and meets its own
product and security requirements. YouTube, such a future proposal, or another
approved feature may justify reconsidering the seam only after it becomes a
concrete consumer. At that point, compare the callers' needs and choose an
interface only if it provides shared behavior with enough depth, leverage, and
locality. Do not assume every secret type fits the same adapter or module.

The SecretStorage contract in [ADR 0039](0039-use-user-managed-secretstorage-references.md)
continues to apply: users manage SecretStorage entries, settings and portable
data contain only a reference ID, missing references are preserved and block
requests, and the plugin makes no promise about SecretStorage sync.

## Evidence and unresolved policy interpretation

### User-managed API keys

YouTube's [Developer Policies, API Credentials section](https://developers.google.com/youtube/terms/developer-policies)
say API credentials are assigned to an API project and API client; credentials
must be used only for the assigned project, each API client must have one
project, and credentials must not be shared with or made available to third
parties or embedded in open-source projects. Google Cloud's [API key best
practices](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)
also advise against putting keys in client code or repositories and recommend
that a client send requests through a server that adds the credential. Those
rules and recommendations do not explicitly explain whether an end user's own
key, entered at runtime into a distributed open-source Obsidian plugin and
stored in SecretStorage, is an allowed credential arrangement. The key would
not be committed in source, but plugin code would still read and use it.
SecretStorage limits where RSS Dashboard persists the value; it does not answer
who is the API client or whether plugin code may use that user's credential.
Treat this as unresolved, not as permission and not as a definitive prohibition.

Google's [compliance guide](https://developers.google.com/youtube/terms/developer-policies-guide)
says developers who remain unsure whether a service is allowed should request
an API Compliance Audit and include a clear summary of the use case and its end
users. Do not implement this credential path until authoritative guidance
addresses this exact user-owned-key arrangement.

### Retention, deletion, and cross-channel display

For API data accessible without YouTube User Credentials, the policy's term is
Non-Authorized Data. Its [refreshing and storage
policy](https://developers.google.com/youtube/terms/developer-policies) allows
only limited temporary storage, for no longer than 30 calendar days; after
that, the client must delete or refresh the data and use reasonable efforts to
keep stored data consistent with current YouTube data. The proposed
public-channel feed would therefore need a retention contract for API-derived
item fields. RSS Dashboard can retain feed history and protect starred or saved
items, and users can export data or copy article content into notes. The policy
does not settle here how those user actions and copies interact with the
30-day rule. A design must account for which YouTube-derived fields are
refreshed or removed across those surfaces.

The [policy's user-data deletion
rule](https://developers.google.com/youtube/terms/developer-policies)
separately requires clients that access or use user data to provide a
deletion-request path and complete covered requests within seven calendar days.
Whether that requirement applies to a public, no-OAuth feed of channel uploads
must be confirmed; it is not assumed to govern every public API item.

YouTube's [data aggregation
policy](https://developers.google.com/youtube/terms/developer-policies) also
prohibits aggregating API Data across different recognized content owners,
except for the stated same-owner case. RSS Dashboard's combined feed views can
show items from many channels and services. The policy text is clear, but
whether a chronological feed of public uploads counts as prohibited aggregation,
and whether source labels are sufficient, requires authoritative interpretation
for this product.

The [YouTube playlist items reference](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list)
documents a maximum page size of 50; it does not promise that a page is the 50
newest uploads. The product must not claim that guarantee without verifying it.

## Reconsideration criteria

Reopen the decision only when all of these have evidence:

1. Authoritative guidance, such as a Google API Compliance Audit, addresses
   user-owned keys used by this distributed open-source Obsidian client, its
   API Client identity, and the proposed key restrictions on desktop and mobile.
2. The product contract explains refresh or deletion of API-derived data within
   the documented 30-day window, the applicable deletion-request deadline, and
   the treatment of protected items, saved notes, history, portable exports,
   and copies.
3. Authoritative guidance clears the combined cross-channel presentation or
   the product changes to satisfy the policy.
4. The up-to-50 user need remains concrete, and verification supports the
   promised ordering and supported-device behavior.

If these gates are cleared, define the consumer contract first. Only then
decide whether two real consumers justify a shared SecretStorage module and
what small, deep interface would provide leverage and locality. A shared
resolver must not be extracted just to wrap `app.secretStorage.getSecret`.

The shared-module decision is not tied to this YouTube feature. A future,
separately scoped publisher-specific proposal or another approved independent
feature may supply a second consumer; #1363 itself does not. Its own policy and
product questions remain separate and do not clear the YouTube gates above.

## Consequences

- RSS Dashboard gains no Data API calls, API-key setting, or key-creation
  instructions under this decision.
- Existing RSS discovery and IFrame playback continue without a key.
- Users do not receive the proposed 50-upload API source or other Data API-only
  features from RSS Dashboard while these gates remain unresolved.
- Users looking for a self-hosted alternative may evaluate FreshRSS and its
  extensions independently. RSS Dashboard does not endorse those extensions
  as compliant or equivalent to the deferred feature.
- FreshRSS credential resolution remains local to its feature. No shared
  SecretStorage seam is introduced until another concrete consumer exists and
  the callers' needs show that shared behavior earns the module.

## Related and source references

- [GitHub Issue #1076 — Design the shared credential seam on SecretStorage](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1076)
- [GitHub Issue #1077 — Scope the first YouTube Data API release](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1077)
- [GitHub Issue #1363 — Research credentialed article fetch for paywalled sites](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1363) — closed: generic scope declined; no implementation; any publisher-specific proposal requires separate review
- [ADR 0039 — Use User-Managed SecretStorage References for Credentials](0039-use-user-managed-secretstorage-references.md)
- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies) — API credential assignment and sharing, data aggregation, and API data retention
- [Google Cloud API key best practices](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices) — client-key exposure and server-side request guidance
- [Complying with YouTube's Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide) — request an API Compliance Audit if the use case remains uncertain; include end users
- [YouTube playlistItems.list](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list)
- [FreshRSS extension guide](https://freshrss.github.io/FreshRSS/en/admins/15_extensions.html) — distinguishes official and community extensions
- [FreshRSS official YouTube extension](https://github.com/FreshRSS/Extensions/blob/main/xExtension-YouTube/README.md)
- [Community YouTube Duration extension](https://github.com/cevvalkoala/xExtension-YouTubeDuration) — uses a user-supplied key to enrich existing feed items
- [Community YouTube Channels extension](https://github.com/shcheglovnd/FreshRSS-xExtension-YouTubeChannels) — describes a channel-page fallback; this is not a compliance precedent
