# Sync v3 detects and recovers from adoption races instead of preventing them with a lock

Two devices can create a [Sync v3 set](../../CONTEXT.md) simultaneously if neither has yet
seen the other's `epoch.json` — an [adoption race](../../CONTEXT.md). We considered adding a
claim/lock file to close this window, but Obsidian Sync publishes no API for coordinating
writes across devices or reporting when a sync has completed, and Obsidian's own staff have
said this is deliberate: they "purposefully don't have APIs published and discourage third
party sync clients" because they can't quality-control undefined behavior it might cause
(forum, July 2025). A lock file would itself be subject to the same race it's meant to prevent
(https://forum.obsidian.md/t/sync-api-way-to-access-syncd-data/25371/20).

We chose instead to detect an adoption race after the fact (comparing epoch IDs across
devices' health reports) and offer one generic, backup-first [Sync v3 recovery](../../CONTEXT.md)
action to reconcile it, rather than trying to prevent the race itself. Narrow, cheap guards
(e.g., a post-publish read-back of `epoch.json`) may still reduce the window opportunistically,
but the design does not assume any guard can close it.
