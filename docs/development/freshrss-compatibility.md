# FreshRSS V1 compatibility

This page records what the FreshRSS V1 client was tested against, what the tests showed, and what they did not cover. It backs the release gates in
[#1558](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1558) and the evidence comments on
[#1562](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1562),
[#1563](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1563),
[#1683](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1683) and
[#1693](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1693).

FreshRSS is part of the plugin itself, not a separate connector. See
[ADR 0038](../adr/0038-keep-freshrss-in-core.md). To connect over HTTPS, see
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

- **Switching to a different FreshRSS account loses a pending local change.**
  Testing the connection with a second account sets the first account's saved
  state aside; testing with the first account again starts a fresh scope
  instead of restoring it, and a pending local read can revert to the server's
  value. Nothing is sent to the wrong account.
- After a sync run that fails inside the sync preview, its list of failed
  updates stays empty until the preview is reopened.
- A first connection test in a brand-new vault returned
  `storage-migration-required` once, then `connected` on retry.
- Same-run stale-binding recovery was last observed on 2026-10-28 and was not
  repeated for this record.
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
