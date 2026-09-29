# Obsidian e2e for RSS Dashboard: research (2026-09-29)

Legend: **[V]** verified against a primary source (link given); **[I]** my inference or assumption.

## 1. wdio-obsidian-service

### Facts [V]

- Version 3.2.1, npm modified 2026-09-18; license MIT; peer deps `webdriverio ^9.18.1`, `obsidian >=1.1.1`, `appium >=2.19.0` (optional Android), engines node >=18.20. Source: `npm view wdio-obsidian-service` (registry, run 2026-09-29). Companion packages `obsidian-launcher` and `wdio-obsidian-reporter` are both 3.2.1 (same registry check). Monorepo: https://github.com/jesse-r-s-hines/wdio-obsidian-service
- Releases: 3.2.1 (Sep 18, Windows cache race fix), 3.2.0 (Aug 17), 3.1.3 (Aug 12), 3.1.1 (Jun 7, Node 26 fix), 3.1.0 (Jun 7, Android flakiness), 3.0.4 (May 30). Source: https://github.com/jesse-r-s-hines/wdio-obsidian-service/releases
- Activity: last push 2026-09-27, 53 stars, 875 commits, single main contributor (Jesse Hines) (GitHub API + `git shortlog` on a clone). Issues page shows 0 open; recent issues were closed within ~2 days (#87 opened 09-16, closed 09-18; #83 opened 09-03, closed 09-03; #55 Appium 3 compat closed in 5 days). Source: `gh issue list -R jesse-r-s-hines/wdio-obsidian-service`. Note: issue creation is restricted in the repo (WebFetch of the issues page), so external reporting may need a discussion or PR.
- Obsidian versions: `browserVersion`/`appVersion` accepts a specific version, `latest`, `latest-beta`, `earliest` ("run the `minAppVersion` set in your plugin's `manifest.json`"). `installerVersion` separate (Electron base). Source: https://github.com/jesse-r-s-hines/wdio-obsidian-service/blob/main/packages/wdio-obsidian-service/README.md#L154 . So it can pin our 1.8.7 (via `earliest`, or literally "1.8.7") and `latest` in one matrix; the sample config defaults to `earliest/earliest latest/latest`: https://github.com/jesse-r-s-hines/wdio-obsidian-service-sample-plugin/blob/main/wdio.conf.mts
- Beta versions need an Obsidian Insiders account (`OBSIDIAN_EMAIL`/`OBSIDIAN_PASSWORD`, 2FA off); not needed for stable. Same README.
- Plugin install + sandbox: capability `'wdio:obsidianOptions'` with `plugins: ["."]` (directory with built main.js/manifest/styles) and `vault: "path"`. By default the vault is copied to a temp dir; `copy: false` uses it in place (with warning that Obsidian writes under `.obsidian`). Source: `packages/wdio-obsidian-service/src/types.ts` lines ~61-104 (clone of repo) and README "Opening and Switching between Vaults". `browser.reloadObsidian({vault})` = fresh copy, slow; `obsidianPage.resetVault()` = fast in-place file reset. Isolated user config dir per instance, so parallel runs are safe (README: "Sandbox Obsidian so tests don't interfere with your system and can run in parallel", repo front page).
- Mobile: `emulateMobile: true` uses Obsidian's `app.emulateMobile` on desktop Electron plus `goog:chromeOptions.mobileEmulation.deviceMetrics` (sample uses 390x844). README warns real mobile is Capacitor, so Node/Electron API differences are not emulated. Real Android: Appium + AVD named `obsidian_test`, `wdio.mobile.conf.mts`, `maxInstances: 1`. Sources: README "Mobile Emulation"/"Android" sections; sample conf.
- CI: sample workflow runs `ubuntu-latest`, installs `herbstluftwm dzen2 x11-xserver-utils`, starts `Xvfb :99 -screen 0 1280x1024x24 +extension GLX -noreset` plus herbstluftwm as window manager, caches `.obsidian-cache` keyed on resolved versions, runs with `WDIO_MAX_INSTANCES: 2` ("Github runners are 2-core"). Windows/macOS matrix entries are present but commented out. Android job uses `reactivecircus/android-emulator-runner@v2`, KVM enabled, API 36. Source: https://github.com/jesse-r-s-hines/wdio-obsidian-service-sample-plugin/blob/main/.github/workflows/test.yaml
- Download source: launcher allows only `https://github.com/obsidianmd/obsidian-releases/releases/` and `https://releases.obsidian.md/` (verifyUrl in `packages/obsidian-launcher/src/launcher.ts` ~line 374; override env `OBSIDIAN_LAUNCHER_DISABLE_URL_CHECK`). Insiders logins hit `api.obsidian.md/user/signin` (`src/apis.ts`). So stable versions come from Obsidian's own public GitHub release assets.
- Terms/licensing: neither the launcher README nor the forum thread has any statement from Obsidian about CI downloads ("no official Obsidian position", https://forum.obsidian.md/t/package-for-end-to-end-testing-obsidian-plugins/98645). Obsidian's ToS (https://obsidian.md/terms) does not explicitly address automated downloads/CI; it restricts reverse engineering ("disassemble, reverse engineer or decompile the Services or Software") with an exception for developing third-party plugins. [I] Downloading public release assets in CI is the same as a user downloading them; but there's no explicit permission either. Low practical risk, not formally blessed.
- Helpers, e.g. `browser.executeObsidianCommand`, `browser.executeObsidian(({app, plugins}) => ...)`, `obsidianPage`. Source: README and sample specs.

### Gotchas [V unless marked]

- Recent bugs: Windows `.obsidian-cache` race (#87), `latest` selecting Android-only releases with no asar (#83), version metadata accuracy (#78), chromedriver download hang on some Node (3.0.4). https://github.com/jesse-r-s-hines/wdio-obsidian-service/issues?q=is%3Aissue
- Linux needs a window manager, not only Xvfb: sample workflow comment says "some Obsidian features won't work properly without it".
- Android cannot run in parallel; Android job needs KVM emulator, heavy.
- [I] Bus factor of 1 (though used by several large plugins, below).
- [I] The project moves fast and pins wdio 9; expect occasional dependency bumps.

## 2. Alternatives and real-world usage

- **Playwright/Puppeteer over Electron CDP**: no maintained Obsidian-specific harness found (GitHub code search "obsidian playwright \_electron.launch" returned nothing; repo search empty). [I] It is feasible in principle (launch the Obsidian binary with `--remote-debugging-port`, `connectOverCDP`), but you would hand-roll version download, sandboxed config dir, plugin/vault install, trust prompt handling and mobile emulation: exactly what the launcher provides. Not recommended.
- **mnaoumov/obsidian-integration-testing** (MIT, 3 stars, pushed 2026-09-28): "Simplifies integration testing of Obsidian plugins" (https://github.com/mnaoumov/obsidian-integration-testing); it has a "transports" guide. Very young; [I] not enough adoption to bet on.
- **Real plugins using wdio-obsidian-service** (all have `wdio.conf.mts` and `*.e2e.ts`; verified via GitHub code search and repo tree):
  - Templater (5.3k stars): https://github.com/SilentVoid13/Templater (`test/specs/*.e2e.ts`)
  - tldraw obsidian-plugin (454 stars): https://github.com/tldraw/obsidian-plugin (`test/specs/*.e2e.ts`)
  - obsidian_ink (1.4k stars): https://github.com/daledesilva/obsidian_ink (`tests/e2e/*.e2e.ts`)
  - obsidian-open-tab-settings (author's own): https://github.com/jesse-r-s-hines/obsidian-open-tab-settings
- Official-ish listing: https://webdriver.io/docs/wdio-obsidian-service/ (WebdriverIO docs include it, from search result).

## 3. Fit for this repo

Repo facts [V, local]: vitest config includes only `test_files/unit/**` and `test_files/stubs/**` (`vitest.config.mjs`); `npm run fixture:vault` builds `.fixture-vault/` from `test_files/fixture-vault/` (already enabling `rss-dashboard` in `community-plugins.json` with seeded data); build outputs `main.js` at repo root; CI is one Ubuntu job (`.github/workflows/test.yml`) running `npm ci --ignore-scripts`; manifest minAppVersion 1.8.7, isDesktopOnly false; `.nvmrc` = 22; fixture article "CDN image resizing" in feed `fx-rss-tech` already contains the Cloudinary image (`scripts/generate-fixture-vault.mjs` lines ~117-120 and ~383-391).

### Recommendation

Use **wdio-obsidian-service** (Mocha), with desktop capabilities for `earliest` (1.8.7) and `latest`, plus one `emulateMobile` capability. Skip Android initially. Rationale: only maintained, widely used harness; handles version download, sandbox, plugin install, mobile emulation; four sizeable plugins use it; MIT.

### Coexistence with vitest [I]

- Separate runner: new devDeps `webdriverio`, `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`? (reporter is `wdio-obsidian-reporter`), `wdio-obsidian-service`, `wdio-obsidian-reporter`, `mocha`, `@types/mocha`, `tsx` (for `.mts` config). Scripts: `"test:e2e": "wdio run ./wdio.conf.mts"`. Vitest's include globs do not match `test_files/e2e/**` so no clash; give it a distinct `*.e2e.ts` suffix and exclude from `test_files/tsconfig.json` type-check or add a separate tsconfig (wdio globals types) so `check:test-types` stays green.
- Layout: `wdio.conf.mts` at root; specs `test_files/e2e/specs/*.e2e.ts`; helpers `test_files/e2e/helpers/`. `docs/development/testing-guide` update. `.obsidian-cache/` gitignored. Check `scripts/check-architecture.mjs`/eslint scope so new dirs don't trip rules (I did not verify).
- Loading the build: `plugins: ["."]` needs `main.js`, `manifest.json`, `styles.css` in root, so run `npm run build` (or esbuild `production`) first; `npm run build` also runs lint/compliance, so a lighter `node esbuild.config.mjs production` is enough for the e2e job.
- Fixture vault as test vault: `vault: "test_files/fixture-vault"` works [I] because the service copies the vault. Caveat: the template's `.obsidian/plugins/rss-dashboard/` has a `data.json` bootstrap but no `main.js`; the service installs the plugin into the copy [V: README/types] but I did not verify how it merges with an existing plugin folder or whether `community-plugins.json` is honored/overwritten. First spike should confirm. Also verify that the "trust plugins" prompt is bypassed (service is designed to). Seeded dates are fixed at 2026-09-01, so any "recent" filters/age-based feed limits could hide items later; [I] check default filters.
- Fallback if the template conflicts: run `npm run fixture:vault -- <tmpdir> --plugin-only`-style setup as a wdio `onPrepare` hook and point `vault` at it with `copy:false`.

### CI job sketch [I, based on the sample workflow]

```yaml
e2e:
  runs-on: ubuntu-latest
  permissions: { contents: read }
  steps:
    - uses: actions/checkout@<pin>
    - uses: actions/setup-node@<pin>
      with: { node-version-file: .nvmrc, cache: npm }
    - run: npm ci --ignore-scripts # add rebuild if a wdio dep needs postinstall
    - run: node esbuild.config.mjs production
    - name: Obsidian cache key
      run: |
        npx tsx wdio.conf.mts | grep 'obsidian-cache-key:' > obsidian-versions-lock.txt
        rm -rf .obsidian-cache
    - uses: actions/cache@<pin>
      with:
        path: .obsidian-cache
        key: obsidian-cache-${{ runner.os }}-${{ hashFiles('obsidian-versions-lock.txt') }}
    - name: Virtual graphics
      run: |
        sudo apt-get update -q
        sudo apt-get install -q herbstluftwm dzen2 x11-xserver-utils
        export DISPLAY=:99; echo "DISPLAY=$DISPLAY" >> "$GITHUB_ENV"
        Xvfb $DISPLAY -screen 0 1280x1024x24 +extension GLX -noreset &
        sleep 1; herbstluftwm & sleep 1
    - run: npm run test:e2e
      env: { WDIO_MAX_INSTANCES: 2 }
```

Note this repo's `npm ci --ignore-scripts` matters: chromedriver is fetched at runtime by wdio, so probably fine [I]. Run e2e as a separate workflow/job (path-filtered, or nightly plus label) so the existing fast job stays fast. Pin actions by SHA as the existing workflow does.

### Timing and flakiness [I]

- No published CI timings found. Estimate: cold cache download of two Obsidian versions plus xvfb setup 1-3 min, each spec on each capability roughly 10-30 s (Obsidian boot ~5-10 s per instance). Expect ~3-6 min for a handful of specs on 3 capabilities.
- Risks: real network image hosts (Cloudinary) in the spec; assert on `src` attribute only, not load/naturalWidth. Async timing (lightbox opens with a 10 ms timeout, article render); use `waitUntil`/`$().waitForExist`. Layout depends on window size and split vs tab (`Platform.isMobile` picks tab vs split in `openArticleInNewTab`). Reader location setting default (`openInSplitView: true`). Fixture data state leaking between tests (use `obsidianPage.resetVault()`/`reloadObsidian`). Plugin writes storage on load; feed refresh on startup may hit the network (fixture feeds point at github.blog etc.): [I] disable auto-refresh via the fixture's settings or intercept. Obsidian 1.8.7 vs latest DOM differences. Windows path/cache issues only if you add a Windows runner.

### Effort [I]

- Spike to green (setup, config, fixture copy, one spec): about 0.5-1 day. Each further spec 30-60 min. CI job with caching/xvfb: another 2-3 h with debugging. Mobile-emulation capability: +1-2 h.

## 4. First spec (lightbox), drafted against real code

Code facts [V, local]: `ReaderLightbox.open()` appends `div.rss-reader-lightbox-backdrop` to `doc.body`, containing `img.rss-reader-lightbox-img.rss-reader-lightbox-full-img` with `src = source.fullUrl` and optional `.rss-reader-lightbox-preview-img` (`src/components/reader-lightbox.ts`). Reader adds `rss-reader-zoomable-img` to eligible images and opens the lightbox on click (`src/views/reader-view.ts` `setupLightboxForImage`, ~line 2246). Cloudinary transform is stripped by regex in `src/utils/full-size-image-resolver.ts` line ~131. Commands: `rss-dashboard:open-dashboard` (main.ts ~977; Obsidian prefixes plugin id). Reader view type `rss-reader-view`; article cards are `.rss-dashboard-article-card` (or `-item` in list mode) (`src/components/article-list.ts`); reader content `.rss-reader-content` (reader-view.ts ~1004).

Assumptions [A]: (A1) the dashboard shows the fixture articles without a feed selection (all feeds/"All articles" default); (A2) card view is default, else `.rss-dashboard-article-item`; (A3) the card contains the article title text; (A4) service copies fixture vault and enables the plugin; (A5) `executeObsidian` callback receives `{app}`; (A6) `injectGlobals: false` so imports are explicit. If clicking the card is flaky, fallback: drive `leaf.setViewState` + `view.displayItem(item)` via `browser.executeObsidian`, as `openArticleInNewTab` does.

```ts
// test_files/e2e/specs/reader-lightbox.e2e.ts
import { browser, expect } from "@wdio/globals";
import { describe, it, before } from "mocha";

const THUMB =
  "https://res.cloudinary.com/demo/image/upload/w_300,c_scale/sample.jpg";
const FULL = "https://res.cloudinary.com/demo/image/upload/sample.jpg";

// Cards may render as .rss-dashboard-article-card (card view) or -item (list view). [A2]
const CARD_BY_TITLE = (title: string) =>
  `//*[(contains(@class,'rss-dashboard-article-card') or contains(@class,'rss-dashboard-article-item'))` +
  `][.//*[contains(normalize-space(.),'${title}')]]`;

describe("Reader lightbox", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "test_files/fixture-vault" }); // [A4]
  });

  it("opens the full-size URL for a CDN-resized image", async () => {
    await browser.executeObsidianCommand("rss-dashboard:open-dashboard");

    const card = await $(CARD_BY_TITLE("CDN image resizing")); // [A1][A3]
    await card.waitForClickable({ timeout: 15000 });
    await card.click();

    // Reader view opens in a split (desktop) or tab (mobile emulation).
    const img = await $(".rss-reader-content img.rss-reader-zoomable-img");
    await img.waitForExist({ timeout: 15000 });
    expect(await img.getAttribute("src")).toBe(THUMB);

    await img.click();

    const fullImg = await $(
      ".rss-reader-lightbox-backdrop img.rss-reader-lightbox-full-img",
    );
    await fullImg.waitForExist({ timeout: 5000 });
    // Assert the attribute, not the network load: avoids flakiness on Cloudinary.
    await expect(fullImg).toHaveAttribute("src", FULL);

    // Cleanup / close behavior: the close button removes the backdrop after 200 ms.
    await $(".rss-reader-lightbox-btn-close").click();
    await $(".rss-reader-lightbox-backdrop").waitForExist({
      reverse: true,
      timeout: 3000,
    });
  });
});
```

Minimal `wdio.conf.mts` for this repo [I, adapted from the sample]:

```ts
import { parseObsidianVersions } from "wdio-obsidian-service";
import { env } from "process";
const cacheDir = ".obsidian-cache";
const versions = await parseObsidianVersions(
  env.OBSIDIAN_VERSIONS ?? "earliest/earliest latest/latest",
  { cacheDir },
);
export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",
  specs: ["./test_files/e2e/specs/**/*.e2e.ts"],
  maxInstances: Number(env.WDIO_MAX_INSTANCES || 2),
  capabilities: [
    ...versions.map(([appVersion, installerVersion]) => ({
      browserName: "obsidian",
      "wdio:obsidianOptions": {
        appVersion,
        installerVersion,
        plugins: ["."],
        vault: "test_files/fixture-vault",
      },
    })),
    // + emulateMobile capability copied from the sample config
  ],
  services: ["obsidian"],
  reporters: ["obsidian"],
  mochaOpts: { ui: "bdd", timeout: 60_000 },
  cacheDir,
  injectGlobals: false,
};
```

(`browser`/`$` come from `@wdio/globals` when `injectGlobals: false`; import `$` too in the spec: `import { $, browser, expect } from "@wdio/globals";`.)

## Open items to verify in a spike

1. Behavior when the vault already has `.obsidian/plugins/rss-dashboard/data.json` and `community-plugins.json`.
2. Startup feed refresh hitting the network in the fixture.
3. Whether `.rss-dashboard-article-card` text match works with the default view.
4. Whether isDesktopOnly:false plus `emulateMobile` opens the reader as a tab and the lightbox still works with touch (sample notes `touch: false` tweak if clicks misbehave).
5. Obsidian 1.8.7 download availability for the installer (`earliest` resolution) on Linux.
