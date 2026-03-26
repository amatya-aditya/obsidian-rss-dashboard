# Phase 1: Correcting the Version Mistake (`dev`)

Goal: Bring the `2.2.0-beta.8` fixes into `dev` and overwrite the `2.3.0-alpha` error.

- [ ] **Checkout `dev` and pull latest**
  ```bash
  git checkout dev
  git pull origin dev
  ```
- [ ] **Merge the release branch**
  ```bash
  git merge release/2.2.0-beta.8
  ```
- [ ] **Resolve Conflicts** (if any)
  - Open [manifest.json](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/manifest.json) and [package.json](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/package.json).
  - Ensure the version is **`2.2.0-beta.8`** (discard the `2.3.0` lines).
- [ ] **Commit the merge**
  ```bash
  git add .
  git commit -m "Merge release/2.2.0-beta.8: Correcting version to 2.2.0 line and syncing stabilization fixes"
  ```

# Phase 2: Integrating All Features (`wip/all-features`)

Goal: Bring the "Everything" package into `dev`.

- [ ] **Merge `wip/all-features` into `dev`**
  ```bash
  # Ensure you are still on dev
  git merge wip/all-features
  ```
- [ ] **Verify and Test**
  - Run `npm run test:unit`.
  - Check the [manifest.json](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/manifest.json) version (still `2.2.0-beta.8`).

# Phase 3: Preparing `beta.9`

Goal: Official release of the new "everything" package.

- [ ] **Push the synced `dev` branch**
  ```bash
  git push origin dev
  ```
- [ ] **Official Beta.9 Bump & Tag**
  ```bash
  # From dev
  npm version 2.2.0-beta.9
  git push origin dev --tags
  ```

---
> [!TIP]
> **Why `npm version`?** 
> Your project has a [version-bump.mjs](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/version-bump.mjs) script that handles [manifest.json](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/manifest.json) and `versions.json` automatically when you use this command.
