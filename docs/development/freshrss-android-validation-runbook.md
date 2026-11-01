# FreshRSS Android and Desktop Validation Runbook

This runbook records how the FreshRSS V1 release gates in #1563 were exercised
on the Android emulator and on desktop Obsidian over CDP, so a later pass can
repeat them. It is the working procedure from the 2026-10-31 run against build
`69140aec`, including the dead ends. Fixture-vault background is in
[Fixture Vault for Manual Testing](./fixture-vault.md).

Nothing here is automated. The maintainer approves the run, and the agent never
types, reads back or prints a FreshRSS password.

## Ground rules

- Use only a disposable vault carrying a throwaway marker file. Never the main
  or populated fixture vault.
- Use existing SecretStorage references. Never enter credentials. If a vault
  has no reference, stop and ask the maintainer to paste it once.
- Before every scenario, snapshot local and server state. If any pending
  mutation was not created by the scenario, stop and report; never send it.
- Do not edit plugin source. Do not synthesize a FreshRSS response for a case
  that needs a natural server event (#1615).
- Keep the exact build under test. Record the commit, plugin version, Obsidian
  version, FreshRSS image digest and the bundle hashes.

## What was learned the hard way

| Symptom                                                                    | Cause and fix                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fastboot devices` is empty, `adb reboot bootloader` returns to Android    | The stock emulator has no bootloader mode. Unlocking is not needed: the AOSP `default` (non-Play) image is `userdebug`, so `adb root` works.                                                                                                   |
| After a cold boot `/storage/emulated/0` is empty                           | The device user is `RUNNING_LOCKED`. Unlock the lock screen with the approved PIN, then the vault reappears. Check with `dumpsys user`.                                                                                                        |
| Plugin reports "did not complete the required connection checks"           | Target SDK 36 ignores user-added CAs, and the route must reach FreshRSS. Install the Caddy root CA as a system CA (below) and use the Docker Caddy route, not a Windows-hosted Caddy.                                                          |
| Request returns 502 from Caddy                                             | A Windows-hosted Caddy cannot resolve `host.docker.internal`. Start the existing Caddy container instead.                                                                                                                                      |
| Writing the CA under `/system` or the Conscrypt APEX directory did nothing | Android 14+ reads `/apex/com.android.conscrypt/cacerts`. Bind-mount a tmpfs copy over it in the init namespace and in every zygote's namespace, then restart the app.                                                                          |
| `adb reverse` mappings vanish                                              | `adb root` restarts adbd and clears them. Re-add the reverse after rooting.                                                                                                                                                                    |
| Desktop `app is not defined` over CDP                                      | Obsidian exposes more than one `page` target (a settings window shows `about:blank`). Pick the target whose URL starts with `app://`.                                                                                                          |
| New desktop vault shows no secret references                               | SecretStorage is keyed per vault id (`<vaultId>-secrets-*` in Local Storage), not per profile. Register the new vault in the copied profile's `obsidian.json` under the original vault's id to reuse its references. No credential is entered. |
| First open of a new vault asks to trust the author                         | Accept it for a vault you created yourself. Obsidian reloads the page afterwards; reconnect CDP.                                                                                                                                               |
| Config looks empty (149-byte `data.json`)                                  | `data.json` is a pointer. The real settings are in `data/data.json`, and FreshRSS state is in `data/freshrss-state.json`.                                                                                                                      |
| PowerShell tool blocks a command containing `/E` or `*` paths              | The path guard misreads them. Use `Copy-Item`, and write shell scripts with the Write tool instead of inline here-strings.                                                                                                                     |

## Environment

- Emulator AVD on the AOSP `default` Android 36 image. Obsidian Android 1.14.4
  as of this run.
- Docker containers: FreshRSS (host port 8080) and a Caddy container that
  terminates HTTPS on `localhost:8443` with `tls internal`, proxying to
  `host.docker.internal:8080`. The Caddy data directory holds the root CA the
  emulator must trust.
- Desktop Obsidian 1.14.5 launched with its own `--user-data-dir` and
  `--remote-debugging-port=9333`. Stop it later by matching that exact profile
  path in the process command line, never by a wildcard.

## Procedure

### 1. Verify the build

1. Run the worktree check from `AGENTS.md`.
2. `adb pull` `main.js`, `styles.css` and `manifest.json` from the vault's
   `.obsidian/plugins/rss-dashboard/` and compare SHA-256 against the recorded
   values. Stop on any mismatch.
3. Reuse those exact bytes for desktop vaults. No build is needed.
4. Read the source of the build under test with `git show <sha>:<path>`. The
   FreshRSS code may not be on the worktree's branch (this run's worktree was
   on `dev`, the build lived on `feat/1558-freshrss-dev-port`). `main.ts` is at
   the repository root, not under `src/`.

### 2. Snapshot the server (read-only, no credentials)

Read counts from the FreshRSS SQLite files inside the container with
`PRAGMA query_only=1`:

```php
<?php
foreach (["marc", "test"] as $u) {
  $db = new PDO("sqlite:/var/www/FreshRSS/data/users/$u/db.sqlite");
  $db->exec("PRAGMA query_only=1");
  $q = function ($s) use ($db) { return $db->query($s)->fetchColumn(); };
  echo "$u feeds=" . $q("select count(*) from feed")
     . " entries=" . $q("select count(*) from entry")
     . " unread=" . $q("select count(*) from entry where is_read=0")
     . " fav=" . $q("select count(*) from entry where is_favorite=1")
     . " labels=" . $q("select count(*) from tag")
     . " taglinks=" . $q("select count(*) from entrytag") . "\n";
}
```

Run it with `docker exec -i <freshrss-container> php`. The server's own OPML is
`php cli/export-opml-for-user.php --user <name>` in the container.

An article's server id is the hex tail of its `remoteArticleId`
(`tag:google.com,2005:reader/item/<hex>`) converted to decimal.

### 3. Android connection

1. Boot the AVD. Unlock the lock screen with the approved PIN.
2. Start the Caddy container (`docker start <caddy-container>`).
3. As root, add `adb reverse tcp:8443 tcp:8443`.
4. Install the CA without touching the system image. Convert the Caddy root
   `.crt` to PEM and name it `<subject_hash_old>.0` (`openssl x509 -subject_hash_old`).
   Push it and this script to `/data/local/tmp` and run it as root:

   ```sh
   set -e
   CA=/data/local/tmp/<hash>.0
   mkdir -p -m 700 /data/local/tmp/tmp-ca-copy
   cp /apex/com.android.conscrypt/cacerts/* /data/local/tmp/tmp-ca-copy/
   mount -t tmpfs tmpfs /system/etc/security/cacerts
   mv /data/local/tmp/tmp-ca-copy/* /system/etc/security/cacerts/
   cp $CA /system/etc/security/cacerts/<hash>.0
   chown root:root /system/etc/security/cacerts/*
   chmod 644 /system/etc/security/cacerts/*
   chcon u:object_r:system_file:s0 /system/etc/security/cacerts/*
   mount --bind /system/etc/security/cacerts /apex/com.android.conscrypt/cacerts
   for P in $(pidof zygote) $(pidof zygote64); do
     nsenter --mount=/proc/$P/ns/mnt -- /bin/mount --bind \
       /system/etc/security/cacerts /apex/com.android.conscrypt/cacerts
   done
   ```

   The mounts do not survive a reboot, which is also the cleanup.

5. `am force-stop md.obsidian` and relaunch so the app forks from the patched
   zygote.
6. Find the WebView socket and forward it:
   `adb shell cat /proc/net/unix | grep devtools`, then
   `adb forward tcp:9444 localabstract:webview_devtools_remote_<pid>`. The pid
   changes on every app restart, so re-forward after each relaunch.

### 4. Driving the plugin over CDP

A small Node script is enough (Node 22+ has a built-in `WebSocket`). It lists
`/json`, picks the page whose URL is `app://...` (desktop) or `http://localhost/`
(Android), and runs `Runtime.evaluate` with `awaitPromise` and `returnByValue`.
The plugin instance is `app.plugins.plugins["rss-dashboard"]`. Useful methods:

- `testFreshRssConnection()`, `syncFreshRssNow()`, `getFreshRssSyncPreview()`
- `getFreshRssPendingMutations()`, `getFreshRssSecretReferences()` (names only)
- `saveFreshRssEndpoint()`, `saveFreshRssCredentialReference()`
- `openFreshRssSyncPreview()` opens the real modal
- `queueArticleStateSave([{ feedUrl, guid, changes: { read: true } }])`
- Commands such as `rss-dashboard:open-settings-freshrss` through
  `app.commands.executeCommandById`

State lives in `<plugin>/data/freshrss-state.json` (`feedBindings`,
`articleBindings`, `checkpoints`, `pendingFacetMutations`, `scope`). Snapshot it
and the feed shards, and hash the data directory with `sha256sum` before and
after any scenario that must not change local files.

### 5. Scenarios

Each scenario: snapshot, act, snapshot, compare, record.

- **Connection visibility and modal controls.** Open the FreshRSS settings tab,
  confirm "connected and ready" and that Test connection and Sync now are
  enabled. Open the modal; read the Cancel and Start sync bounding boxes
  against `window.innerHeight` and take a screenshot. Click Cancel and confirm
  the data hashes are unchanged.
- **Account-mismatch refusal.** Change the credential reference to the other
  account without saving settings and set the status to `connected` in memory,
  call `syncFreshRssNow()`, and expect the notice "FreshRSS account changed.
  Test the connection before syncing." and no binding change. The refusal
  persists `test-required` and the swapped reference to disk, so restore the
  reference and run Test connection afterwards. Switching the reference through
  the normal setting only reaches the earlier `test-required` gate.
- **Same-run stale-binding recovery.** Remove one local feed from
  `settings.feeds`, call `saveSettings()`, then `syncFreshRssNow()`. Expect the
  feed recreated under a new id, rebound to the same `remoteSubscriptionId`,
  and its articles re-bound, all in one run. Reload and verify. Expect the old
  feed's article bindings to remain (see the observation in #1563).
- **#1693 shard fault.** Back up the plugin `data` folder first. Wrap
  `app.vault.adapter.write` for one feed's shard path so it writes an empty
  string and reports success. Run a sync and expect `failed` with bindings and
  checkpoints unchanged and 0 pending. Note that a path-persistent fault also
  empties the guard's rollback write. Delete the instance property to remove
  the fault, retry, and verify bindings advance, the shard is rewritten and the
  result survives an app restart. Choose a shard whose feed has more incoming
  articles than local items so the sync must write it.
- **Preview and cancel (#1682).** Open the preview repeatedly. Record status
  text, feed and article counts, any feed flagged "could not be loaded", and
  that all data files hash the same after Cancel. If the partial-load warning
  appears, save the modal text, the server log and the request log at once.
- **Reversible read-state round trip.** Pick a bound unread article, mark it
  read through `queueArticleStateSave`, confirm one pending `read` mutation,
  sync, read `is_read` from SQLite, then mark unread and repeat. Confirm the
  server returns to its baseline and the state survives a reload.
- **OPML.** Compare the plugin's feed URLs with the server's OPML export for the
  account. The import leg changes the server; run it only against a throwaway
  FreshRSS user.
- **#1714 empty vault.** Create one empty vault with a throwaway marker and the
  verified bundle. Expect storage v2 and capability `available` on first open.
  Set the endpoint and an existing reference, run the first Test connection,
  reload, and confirm the status and active scope. Delete the vault afterwards.
- **#1615.** Observe only. It needs a natural silent-200 label addition.

### 6. Desktop profile and vault

1. Copy an existing disposable CDP profile, skipping the cache folders, so the
   original stays untouched.
2. Rewrite the copy's `obsidian.json` to list only the new vault, registered
   under the original vault's id (see the table above).
3. Create the vault folder with `.obsidian/community-plugins.json` set to
   `["rss-dashboard"]`, the verified bundle, and the throwaway marker file.
4. Launch Obsidian with `--user-data-dir` and `--remote-debugging-port=9333`.
   Accept the trust prompt for your own vault.
5. Do not open a vault that holds pre-existing pending mutations.

### 7. Cleanup and evidence

- Stop desktop Obsidian by exact profile path. Delete only the vault and profile
  copy you created.
- Remove every `adb reverse` and `forward`, stop the Caddy container, restart
  the emulator without `-writable-system`, unlock it, and confirm the CA is
  absent from `/apex/com.android.conscrypt/cacerts`.
- Confirm the screen timeout, the vault marker and the vault files.
- Confirm the server counts equal the baseline and `PRAGMA integrity_check` is
  `ok`.
- Post the results on #1563 and read the comment back. Keep local paths,
  usernames of the host machine and every credential out of the text.
