# FreshRSS Guide

Updated 9/9/26.

RSS Dashboard can connect to a [FreshRSS](https://freshrss.org/) account as a
**portable-state client**: FreshRSS keeps aggregating your feeds, and RSS
Dashboard becomes another place you read them, with read, starred, and
mapped-label state kept in sync in both directions. RSS Dashboard does not
replace FreshRSS, and it does not manage FreshRSS subscriptions, categories,
or labels for you.

This guide explains setup and the exact, tested boundaries of the
integration. For the underlying test evidence behind every claim here, see
`docs/development/freshrss-docker-contract.md` (the compatibility matrix) and
`docs/development/freshrss-rollout-validation.md` (what is automated-verified
versus still needs manual confirmation).

## What FreshRSS sync does and does not do

**It does:**

- Import your FreshRSS subscriptions as local feeds and a bounded set of
  recent articles.
- Keep read/unread, starred/unstarred, and known mapped-label membership
  synchronized between RSS Dashboard and FreshRSS.
- Let you export your RSS Dashboard subscriptions as a FreshRSS-compatible
  OPML file.

**It does not:**

- Create, rename, or delete FreshRSS subscriptions, categories, or labels.
- Delete a FreshRSS article, or treat a FreshRSS article's absence as
  permission to delete your local copy.
- Back up article content, read/starred state, or labels through OPML --
  OPML export is subscriptions only.
- Change your existing local-only feeds, saved notes, playback progress, or
  retention settings in any way.

## Requirements

- **Obsidian 1.11.4 or newer**, because FreshRSS relies on Obsidian's
  `SecretStorage` API (added in that version) to hold your FreshRSS
  credentials. On an older Obsidian version, FreshRSS stays visible in
  settings but every control is disabled, with an explanation, and RSS
  Dashboard makes no network or credential access at all.
- **Vault Shards v2 storage.** FreshRSS state lives in a dedicated
  `freshrss-state.json` sidecar alongside Vault Shards v2's `user-state.json`
  (see `docs/storage-vault-shards-guide.md`). If you are on Legacy JSON or
  Vault Shards v1, RSS Dashboard offers the existing explicit migration
  choice the first time you try to enable FreshRSS. Declining or failing
  that migration leaves FreshRSS disabled and does not partially set up any
  FreshRSS state.
- A FreshRSS account with API access enabled, and its API username and
  password/token.

## Setting up a connection

1. Open **Settings > RSS Dashboard > FreshRSS**.
2. If prompted, choose your Vault Shards v2 storage migration.
3. Enter your FreshRSS **endpoint** -- the full Google-Reader-compatible API
   address, exactly as FreshRSS's own settings page shows it (for example
   `https://reader.example.com/api/greader.php`), not just the site root.
   The endpoint must be HTTPS; a plain `http://` endpoint is rejected,
   because the login request would otherwise carry your password over an
   unencrypted connection. (If your FreshRSS instance is genuinely only
   reachable over plain HTTP on a private network, this is a known,
   deliberate limitation of the first release -- see the implementation
   record for ticket 02 in
   `docs/archive/plans/unreleased/draft-20260908-freshrss-02-secure-connection-scoped-sidecar.md`.)
4. Create (or reuse) an Obsidian **SecretStorage** entry containing your
   FreshRSS API username and password/token, then select it under **FreshRSS
   credential bundle**. RSS Dashboard stores only the name of that entry --
   never the credential value -- in its own settings.
5. Click **Test connection**. This performs a login, a read-only identity
   check, and a write-authorization check, but never changes any
   subscription, category, label, read state, or starred state on your
   FreshRSS account. A successful test is required before any sync can run.
6. Click **Sync now** for your first import.

### FreshRSS connection scope

A **FreshRSS connection scope** is your canonical endpoint plus your
authenticated FreshRSS user identity together. All remote bindings and
pending changes are only meaningful inside the scope that created them. If
you change the endpoint or switch FreshRSS accounts, RSS Dashboard
**quarantines** the old scope's state (keeping it for diagnosis, but never
replaying it into the new scope) and requires a fresh, successful connection
test before the new scope can sync. Your local feeds, articles, and settings
are never affected by a scope change.

## Synchronized state versus local-only state

Synchronized in both directions, for FreshRSS-linked articles only:

- Read / unread
- Starred / unstarred
- Membership in a FreshRSS label that RSS Dashboard has discovered and
  mapped to one of your dashboard tags by matching normalized names

Always local, never sent to or affected by FreshRSS:

- Local feed folder placement after the initial import (FreshRSS supplies
  the starting folder; after that, it is yours to reorganize)
- Saved-note status and file path
- Playback progress (video/podcast position)
- Dashboard tag color
- Any dashboard tag that is not a known FreshRSS label mapping
- Local retention and capacity settings

### Pending facet mutations

When you change a synchronized fact (mark read, star, add/remove a mapped
tag) on a FreshRSS-linked article, RSS Dashboard durably records that intent
-- a **pending facet mutation** -- before applying it locally, so the change
survives offline use and app restarts. A pending change always takes
priority over whatever the next sync pulls from FreshRSS, and it is only
cleared once FreshRSS acknowledges it with an exact `OK` response. If a
sidecar write fails, the local change is not applied either, and you get a
clear error instead of a silently lost action.

### Repair

If FreshRSS rejects a specific change outright (for example, the underlying
article or label binding no longer exists), that pending change enters a
**terminal** state: RSS Dashboard keeps the desired value and the reason on
file rather than retrying it forever, and the sync summary tells you when a
change needs attention. As of this writing, resolving a terminal state
reliably may require reconnecting or running another full sync rather than a
dedicated per-change control in the settings tab -- check
`docs/development/freshrss-rollout-validation.md` ("Known gap: terminal
mutation retry/cancel UI") for the current, exact state of this before
relying on it.

## History bounds and Fetch more history

The initial import, and each stream FreshRSS sync reads (all content,
unread, starred, and each mapped label), is bounded to 25,000 item IDs by
default. A capped stream is reported as partial, never as "nothing more
exists" -- RSS Dashboard never clears read/starred/label state based on an
incomplete stream. To pull in older history for one specific feed beyond
that default, use **Fetch more history** in FreshRSS settings: pick an
eligible feed (one whose import is still capped) and each click extends its
history by another bounded batch, resuming from where the last run stopped.

## FreshRSS OPML export

FreshRSS settings includes a dedicated **Export FreshRSS OPML** action,
separate from RSS Dashboard's regular OPML export. It is subscription-only:
feed URLs, titles, and a flattened version of your folder structure (nested
folders collapse into one FreshRSS category, since FreshRSS does not support
nested categories). It never includes credentials, tokens, sessions, article
content, read/starred state, dashboard tags, FreshRSS labels, or saved-note
data. It works independently of whether FreshRSS sync is connected, so you
can use it purely as a one-way migration tool if you like.

## Disconnecting or changing your connection

Disabling FreshRSS, or changing the endpoint or credential entry, never
deletes local feeds, articles, saved notes, or retention settings -- it only
affects which FreshRSS scope, if any, is currently active for synchronization
and, per the quarantine behavior above, retires the previous scope's pending
state and bindings rather than deleting or replaying them.

## Tested compatibility

This integration's compatibility claim is intentionally finite: it covers
exactly what an automated Docker contract has proven against one pinned
FreshRSS release, plus the Obsidian capability boundary tested separately.
See the full compatibility matrix in
`docs/development/freshrss-docker-contract.md` before assuming behavior
against a FreshRSS version, or a FreshRSS API surface, not listed there.
