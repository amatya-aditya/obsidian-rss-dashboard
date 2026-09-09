# RSS Dashboard
## FreshRSS portable-state client

Opaque remote reference
: A FreshRSS-provided subscription, stream, tag, or article identifier whose
  value is stored and compared as-is. It is not inferred from a URL, title,
  local GUID, or export format.

Docker contract
: The explicitly tested FreshRSS compatibility boundary used to validate the
  portable-state client. It is a finite supported test contract, not a claim
  that every FreshRSS release is compatible.

Fixture identity
: A stable test-owned logical key for a seeded feed or article. It is distinct
  from the opaque FreshRSS identifier returned for that fixture during a test
  run.

Contract readiness
: The state in which a test FreshRSS instance is reachable, authenticated,
  responds to the required read-only and modification-token probes, and
  exposes the seeded fixture data.

Compatibility matrix
: The small, explicit set of FreshRSS image versions and Obsidian capability
  versions that the project tests. It is a tested boundary, not an unbounded
  support promise.

The vocabulary used for user-facing RSS Dashboard behavior, including its podcast player.

## Podcast player

**Active episode**:
The episode currently loaded in the podcast player's audio element. It anchors the visible episode-list range whenever the player selects or advances to an episode.
_Avoid_: Current article, selected row

**Episode list**:
A bounded, ordered set of episode rows from one feed. It is read-only and does not imply a saved or customizable playlist.
_Avoid_: Playlist, queue

**Episode order**:
The current sequence of episodes after the player's selected sort or shuffle behavior has been applied. It determines an episode's before and after neighbors.
_Avoid_: Publication order, feed order

**Episode-list browsing**:
Loading or viewing a bounded range of episodes without changing the active episode or audio playback.
_Avoid_: Skipping, episode navigation

**Incremental loading**:
Adding the next bounded batch of episode rows to the rendered list. It preserves responsive performance for feeds with thousands of locally stored episodes.
_Avoid_: Full-list rendering, unbounded scrolling

## Sidebar feed management

**Sidebar selection**:
The active group of feeds and folders selected in the sidebar via click, modifier-click, or range-selection.
_Avoid_: Active feeds, multi-selection target, highlighted list

**Batch move**:
Relocating multiple selected feeds or folders together into a target destination folder or root in a single operation.
_Avoid_: Bulk drag, mass reorder, multi-drop

## Reader view

**Reader lightbox**:
The modal overlay presented over the reader view to display an article or hero image in its full resolution with pan and zoom capabilities.
_Avoid_: Modal dialog, photo popup, preview card, photo gallery

**Full-resolution image source**:
The unconstrained original media URL extracted by resolving direct image links, selecting the highest-resolution candidate in a srcset, or stripping CDN resize transformations.
_Avoid_: Thumbnail, cached preview, compressed version
## Data retention and article lifecycle

**Auto-delete cutoff**:
The calculated timestamp before which unprotected articles are deleted from local storage, based on publication date and the configured retention duration.
_Avoid_: Expiration date, purge limit

**Retention protection**:
The user-selected set of article states (such as starred, saved to vault, or tagged) that shield an article from automatic deletion and feed capacity trimming.
_Avoid_: Pinned articles, whitelisted items, lock state

## FreshRSS integration

**FreshRSS-linked feed**:
A local dashboard feed associated with a FreshRSS subscription. FreshRSS supplies its title and folder placement at initial import; thereafter folder placement belongs to the user. Removing the remote subscription never deletes the local feed or its local configuration.
_Avoid_: Mirrored feed, remote-only feed

**FreshRSS article**:
An article imported from FreshRSS that retains FreshRSS's opaque item identifier. Only these articles participate in FreshRSS read and starred state synchronization.
_Avoid_: Remote GUID, synced feed item

**FreshRSS label mapping**:
The correspondence between a FreshRSS article label and a dashboard tag is determined by their normalized names. Dashboard tag color remains local presentation metadata and is not part of the mapping.
_Avoid_: Color synchronization, tag mirroring

**Article-state synchronization**:
The bidirectional exchange of read, starred, and label state between a FreshRSS article and its FreshRSS counterpart. Local-only feeds and articles are excluded.
_Avoid_: Full sync, feed synchronization

**FreshRSS portable-state client**:
RSS Dashboard imports FreshRSS subscriptions, articles, and their state, and writes article read, starred, and label mutations back to FreshRSS. It does not manage FreshRSS subscriptions or categories.
_Avoid_: FreshRSS replacement server, full FreshRSS client

**Pending facet mutation**:
A durable local desired state for one remote article facet — read, starred, or a normalized mapped label — recorded before the matching local change commits. A pending facet mutation takes precedence over a pulled remote state and is sent before the next state pull; it is removed only when FreshRSS acknowledges the matching operation.
_Avoid_: Pending FreshRSS mutation, unsaved state, sync conflict

**FreshRSS retention boundary**:
FreshRSS removing an article does not remove its local dashboard copy. Local article lifecycle remains governed by the dashboard's retention settings.
_Avoid_: Remote deletion sync, mirrored retention

**FreshRSS capability gate**:
The runtime condition that makes FreshRSS available: Obsidian 1.11.4 or newer with usable SecretStorage support. It applies to FreshRSS only and does not redefine the plugin-wide compatibility baseline.
_Avoid_: Plugin minimum, global compatibility gate

**FreshRSS credential bundle**:
The user-managed FreshRSS API login material selected through SecretStorage; RSS Dashboard settings retain only its reference and never the credential value.
_Avoid_: Plaintext credentials, saved password

**FreshRSS connection test**:
A non-mutating check that proves FreshRSS login, authenticated reading, and write-authentication readiness without changing subscriptions or article state.
_Avoid_: Sync run, login attempt

**FreshRSS connection scope**:
The canonical FreshRSS endpoint together with the authenticated FreshRSS user identity that owns the remote references. Remote bindings, checkpoints, and pending facet mutations — including mapped-label facets — are meaningful only inside this scope.
_Avoid_: Server profile, account alias

**Quarantined FreshRSS namespace**:
FreshRSS sidecar state and pending mutations retained after a connection-scope change but excluded from the new active scope and never replayed into it.
_Avoid_: Old session, migration bucket

**FreshRSS authentication pause**:
The state in which automatic FreshRSS synchronization is suspended after an unrecoverable credential failure until a successful connection test or credential/scope change restores readiness.
_Avoid_: Disabled plugin, permanent disconnect
