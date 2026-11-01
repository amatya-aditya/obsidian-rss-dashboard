# FreshRSS V1 compatibility

This page records what the FreshRSS V1 client was tested against, what the tests showed, and what they did not cover. It backs the release gates in
[#1558](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1558) and the evidence comments on
[#1562](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1562),
[#1563](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1563),
[#1683](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1683) and
[#1693](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1693).

FreshRSS is part of the plugin itself, not a separate connector. See
[ADR 0038](../adr/0042-keep-freshrss-in-core.md). To connect over HTTPS, see
[Connect FreshRSS over HTTPS](../user/freshrss-https-setup.md).

## Tested combination

| Component       | Version                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin          | 2.7.1, revision `8d4bb35393d7d936209e82fdfe5ce5c832ee3894` (bundle SHA-256 `8CF8F298B2F1745BA44D97349EFE5A47F94CE84E627AEB5710D88B3AE8174920`)  |
| FreshRSS server | 1.29.1, Docker image digest `sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d`, served through a local Caddy HTTPS proxy |
| Desktop         | Windows 11 Pro (build 26200), Obsidian 1.14.5                                                                                                   |
| Android         | Emulator, Android 16 (API 36), Obsidian 1.14.4. **Emulator only; no physical device was tested.**                                               |

Other FreshRSS versions, other Obsidian versions, iOS, macOS and Linux were not tested.
The sync preview's mobile layout was fixed after this run and re-verified on the emulator with real touch input. That fix is not part of revision `8d4bb353`.

### Later runs on the dev-port line

Two later runs used the same FreshRSS image digest, Obsidian 1.14.5 on desktop, and the same Android emulator and Obsidian 1.14.4. Credentials were never entered; every connection used an existing SecretStorage reference.

| Build                                                                      | Plugin bundle SHA-256 (`main.js`)                                  | Covered                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `69140aecc4eec6227c6a2069b5ca1ae6e2188098` (`feat/1558-freshrss-dev-port`) | `4f07936c52098657e9e35ceb3bcebc9500d1572c1a1a9d955d4e78a5f8cc6a88` | Android connection and sync modal controls, account-mismatch refusal, same-run stale-binding recovery, [#1693](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1693) retryability, [#1714](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1714), read-state round trip, OPML export and import, label reconciliation |
| `a837bf1d` (`feat/1558-freshrss-dev-port`)                                 | `24209d3cff0dc645a1fbac36a224bbbcc799d4736403ede55b3b0532bf5e3331` | [#1750](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1750): deleting a bound feed and syncing leaves no article bindings for the old feed id. Android and desktop, 2026-11-01                                                                                                                                                     |

The `a837bf1d` run removed one bound feed per platform (11 article bindings on Android, 23 on desktop), synced, and found 0 bindings left for the old feed id. The feed was recreated under a new id on the same remote subscription, with 0 pending mutations. Server counts and `PRAGMA integrity_check` were unchanged for both test accounts.

## What was verified

All results below were checked against files on disk and the FreshRSS database,
not against dialog text.

| Area                                                                                | Result                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Connection setup and test                                                           | Pass over HTTPS with certificate validation on                                                                                            |
| Incoming read, starred and label state                                              | Pass, including an existing, already-bound article                                                                                        |
| Outgoing read, starred and label state                                              | Pass; changes were queued on disk before sync and the server showed them afterwards                                                       |
| Receive-only mode                                                                   | Pass: remote read state is not imported and local changes are not sent; pending changes are kept and sent after switching back to two-way |
| Local pending changes beat a contradictory remote value                             | Pass                                                                                                                                      |
| Failed update (HTTP 422) recorded, kept across restart, never retried automatically | Pass                                                                                                                                      |
| Retry and Cancel mutation                                                           | Pass                                                                                                                                      |
| Credentials switched to another account                                             | Pass: sync is blocked, saved state is unchanged and neither account is written                                                            |
| Sync preview: keyboard, focus return, popout window                                 | Pass with real key events                                                                                                                 |
| Sync preview: accessibility tree                                                    | Pass (dialog, status region, labelled groups, named buttons)                                                                              |
| FreshRSS-compatible OPML export                                                     | Pass: the export matches the account's subscriptions and imports into a second account without duplicates                                 |
| Android: connection visible, sync controls                                          | Pass on the emulator, with real touch input                                                                                               |
| Feed shard read-back before bindings advance                                        | Pass on Android: see [#1693](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1693)                                         |

The preview loads at most 50 articles per subscription. Subscriptions with more
articles are marked partial by design.

## Known limits and open items

- After a sync run that fails inside the sync preview, its list of failed
  updates stays empty until the preview is reopened.
- A first connection test in a brand-new vault returned
  `storage-migration-required` on revision `8d4bb353`. It is fixed on the
  dev-port line ([#1714](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1714));
  the first test in a fresh vault returned `connected` on build `69140aec`.
- Same-run stale-binding recovery was repeated on build `69140aec` and, with
  the dead-binding fix, on `a837bf1d` on both Android and desktop.
- A partial-load warning in the sync preview ("Some recent articles could not
  be loaded") appeared once and did not recur in nine clean previews, so its
  cause is unknown ([#1682](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1682)).
  The warning itself is intended: it marks a feed whose request failed.
- A silently accepted label addition (HTTP 200 with the label absent) is
  handled by keeping the change pending with a manual-recovery reason. It was
  verified against the live server on `a837bf1d`: a 200-character label was
  accepted and stored cut to 191 bytes, so the readback lacked it
  ([#1615](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1615)).
  The input was engineered, not a spontaneous server event.
- No real screen reader (NVDA, VoiceOver, TalkBack) was run.
- No physical Android device was tested; the maintainer waived that
  requirement for closing the Android issues.

## How to repeat the checks

1. Run FreshRSS from the image digest above and put it behind an HTTPS endpoint
   the test device trusts. Do not disable certificate validation.
2. Use a disposable vault and a dedicated FreshRSS account; keep credentials in
   Obsidian's SecretStorage (a JSON secret holding `username` and `apiPassword`).
3. Drive the plugin through its own UI and confirm results from the vault's
   `freshrss-state.json`, `user-state.json` and feed shards plus the FreshRSS
   database, as described in [Fixture vault](./fixture-vault.md).
4. Restore the vault's saved baseline and remove any fixture feeds and
   temporary accounts afterwards.
