post-2.5.0 release community plugin scorecard

https://community.obsidian.md/plugins/rss-dashboard

Work in progress
Scorecards are new and may contain errors. If you notice anything inaccurate, please let us know. Learn more.
Health
Excellent
This plugin is actively maintained.
Hygiene Has readme, license, description. Missing contributing guide.
Maintenance Last commit last month. 596 commits in the past year. Last release last month.
Responsiveness Closed 91% of 123 issues. 1 contributor active in the past year.
Adoption 7.7k installations, 648 stars.
Review
Caution
51 issues found by automated scans of the latest release.
Passed8
No obfuscated code detected.
Build verified against source.
The main.js release asset has a verified GitHub artifact attestation.
The styles.css release asset has a verified GitHub artifact attestation.
No suspicious network patterns found.
Vault Read: Reads individual vault files via the Obsidian API (vault.read, vault.cachedRead)
Vault Write: Creates or modifies vault files via the Obsidian API (vault.modify, vault.create, etc.)
No vulnerable dependencies found.
Disclosures1
Malware scan not available.
Warnings47
Unexpected any. Specify a different type.29

    test_files/stubs/obsidian.ts:173
    test_files/stubs/obsidian.ts:301
    test_files/stubs/obsidian.ts:514
    test_files/stubs/obsidian.ts:592
    test_files/stubs/obsidian.ts:592
    test_files/stubs/obsidian.ts:594
    test_files/stubs/obsidian.ts:604
    test_files/stubs/obsidian.ts:613
    test_files/stubs/obsidian.ts:621
    test_files/stubs/obsidian.ts:624
    test_files/stubs/obsidian.ts:685
    test_files/stubs/obsidian.ts:715
    test_files/stubs/obsidian.ts:715
    test_files/stubs/obsidian.ts:726
    test_files/stubs/obsidian.ts:774
    test_files/stubs/obsidian.ts:774
    test_files/stubs/obsidian.ts:830
    test_files/stubs/obsidian.ts:830
    test_files/stubs/obsidian.ts:873
    test_files/stubs/obsidian.ts:873
    test_files/stubs/obsidian.ts:912
    test_files/stubs/obsidian.ts:912
    test_files/stubs/obsidian.ts:947
    test_files/stubs/obsidian.ts:947
    test_files/stubs/obsidian.ts:991
    test_files/stubs/obsidian.ts:991
    test_files/stubs/obsidian.ts:1115
    test_files/types.d.ts:9
    test_files/types.d.ts:50

Unexpected browser feature "css-scrollbar" is only partially supported by Obsidian 1.4.512

    styles.css:1
    styles.css:1
    styles.css:1
    styles.css:1
    styles.css:1
    styles.css:1
    src/styles/modals.css:833
    src/styles/modals.css:834-838
    src/styles/sidebar.css:211
    src/styles/sidebar.css:695
    src/styles/sidebar.css:696-700
    src/styles/sidebar.css:1162

Use 'activeDocument' instead of 'document' for popout window compatibility.5

    test_files/unit/test-dom-polyfills.ts:23
    test_files/unit/test-dom-polyfills.ts:229
    test_files/unit/test-dom-polyfills.ts:252
    test_files/unit/test-dom-polyfills.ts:273
    test_files/unit/test-dom-polyfills.ts:291

This assertion is unnecessary since the receiver accepts the original type of the expression.

    src/utils/settings-loader.ts:315

Other4
Clipboard Access: Reads or writes the system clipboard. May expose content copied from outside Obsidian.
'\_feeds' is assigned a value but never used.

    src/services/import-export-service.ts:34

'\_folders' is assigned a value but never used.

    src/services/import-export-service.ts:35

'\_availableTags' is assigned a value but never used.

    src/services/import-export-service.ts:36
