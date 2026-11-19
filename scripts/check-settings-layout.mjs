// Verifies the reviewed settings rows in the running app, where jsdom cannot
// look: nothing clips its content, dropdown rows follow the pane-width rule, and
// the grouping stays visible with the platform's own tokens.
//
// Every check here was a hand-run CDP sweep before issue #1819, and two layout
// regressions reached a pull request because no script owned them. The phone
// pass exists because the invisible-group bug only reproduces with Obsidian's
// mobile token set (`--settings-background` collapses onto
// `--background-secondary`), which a desktop-touch render cannot show.
//
// Desktop pass — needs the Settings window open on the plugin tab:
//   node scripts/obsidian-cdp.mjs --profile <dir> --expect-vault <vault> \
//     open-settings rss-dashboard
//   node scripts/check-settings-layout.mjs --profile <dir> --expect-vault <vault>
//
// Phone pass — drives the vault window instead, so no Settings window is needed:
//   node scripts/check-settings-layout.mjs --profile <dir> --expect-vault <vault> --mobile
//
// Exits 0 when every row passes, 1 with a per-tab list otherwise. `--touch`
// turns on touch emulation (`hover: none`, `pointer: coarse`) on the Settings
// popout; `--mobile` also switches Obsidian to its mobile platform. Use a
// disposable profile: `app.emulateMobile` persists in it.

import {
  connect,
  evaluate,
  pageTargetsOn,
  readDevToolsActivePort,
} from "./obsidian-cdp.mjs";
import { basename, sep } from "node:path";
import { setTimeout } from "node:timers";

/** The tabs reviewed in #1819; Storage, Rules and About keep their own layout. */
const REVIEWED_TABS = [
  "General",
  "Display",
  "Sidebar",
  "Media",
  "Article saving",
  "Highlights",
  "Import/Export",
  "Tags",
];

/**
 * Window widths that put the settings pane either side of the 400px row rule and
 * the 560px palette rule. The pane is core's setting-group column: a 600px window
 * is a 324px pane, 700 is 424, 850 is 562, 900 is 599 and 1440 saturates at 688.
 */
const DEFAULT_WIDTHS = [600, 700, 850, 900, 1440];
const MOBILE_WIDTHS = [390];

const HOST = "localhost";

const USAGE = `Check the reviewed settings rows in the running app over CDP.

Usage: node scripts/check-settings-layout.mjs --profile <dir> --expect-vault <path> [options]

Options:
  --profile <dir>        The --user-data-dir Obsidian was launched with.
  --expect-vault <path>  Refuse unless the window belongs to this vault.
  --touch                Emulate touch input on the Settings popout and check the
                         touch presentation too.
  --mobile               Switch the app to its mobile platform, open Settings in
                         the vault window and check a phone pane. Implies --touch
                         and defaults --widths to ${MOBILE_WIDTHS.join(",")}.
  --widths <list>        Comma-separated window widths. Default: ${DEFAULT_WIDTHS.join(",")}.
  --port <n>             Debug port, when the profile has no DevToolsActivePort.
  --help                 Print this text.
`;

function parseArgs(argv) {
  const options = { touch: false, mobile: false, widths: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--profile") {
      options.profile = value;
      i += 1;
    } else if (arg === "--expect-vault") {
      options.expectVault = value;
      i += 1;
    } else if (arg === "--touch") {
      options.touch = true;
    } else if (arg === "--mobile") {
      options.mobile = true;
      options.touch = true;
    } else if (arg === "--widths") {
      options.widths = String(value ?? "")
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isFinite(entry) && entry > 0);
      i += 1;
    } else if (arg === "--port") {
      options.port = Number(value);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument ${JSON.stringify(arg)}.\n\n${USAGE}`);
    }
  }
  if (options.help) return options;
  if (!options.profile) throw new Error(`--profile is required.\n\n${USAGE}`);
  if (!options.widths || options.widths.length === 0) {
    options.widths = options.mobile ? MOBILE_WIDTHS : DEFAULT_WIDTHS;
  }
  return options;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function vaultNameOf(value) {
  return value ? basename(String(value).replace(/[\\/]+$/, `${sep}`)) : null;
}

/** The window whose title names this vault, excluding the Settings popout. */
function vaultWindow(pages, expectedVault) {
  const name = vaultNameOf(expectedVault);
  const [page] = pages.filter(
    (entry) =>
      typeof entry.title === "string" &&
      (!name || entry.title.includes(` - ${name} - Obsidian `)) &&
      !entry.title.startsWith("Settings - "),
  );
  if (!page) {
    throw new Error(
      `No open window for ${expectedVault}. Open the fixture vault first; see docs/development/fixture-vault.md.`,
    );
  }
  return page;
}

function settingsWindow(pages, expectedVault) {
  const name = vaultNameOf(expectedVault);
  const [page] = pages.filter(
    (entry) =>
      typeof entry.title === "string" &&
      entry.title.startsWith("Settings - ") &&
      (!name || entry.title.includes(` - ${name} - Obsidian `)),
  );
  if (!page) {
    throw new Error(
      "No Settings window is open on the expected vault. Run `node scripts/obsidian-cdp.mjs " +
        "--profile <dir> --expect-vault <vault> open-settings rss-dashboard` first, or use --mobile.",
    );
  }
  return page;
}

/**
 * Runs inside the page. Returns the failures for one tab at one viewport, plus
 * the truncations a human should look at even though the layout still holds.
 */
const AUDIT_EXPRESSION = String.raw`(() => {
  const REVIEWED = '.rss-dashboard-settings-tab-content';
  const pane = document.querySelector(REVIEWED);
  if (!pane) return JSON.stringify({ missing: true });
  const issues = [];
  const truncations = [];
  const overflow = (el) => el.scrollWidth - el.clientWidth;
  const describe = (el) => {
    const row = el.closest('.setting-item');
    const name = row?.querySelector('.setting-item-name')?.textContent?.trim();
    const cls = (el.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return name ? name + ' > ' + el.tagName.toLowerCase() + (cls ? '.' + cls : '') : el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const ellipsized = (style) => style.textOverflow === 'ellipsis';
  // Sub-pixel rounding moves scrollWidth by a pixel or two; the regressions this
  // guards against lost 15px and more.
  const SLACK = 2;

  if (overflow(pane) > SLACK) issues.push('pane overflows by ' + overflow(pane) + 'px');
  for (const el of pane.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (!ellipsized(style) && style.overflow === 'hidden') continue;
    const lost = overflow(el);
    if (lost <= SLACK) continue;
    (ellipsized(style) ? truncations : issues).push(describe(el) + ' loses ' + lost + 'px');
  }

  const paneWidth = pane.clientWidth;
  const expected = paneWidth <= 400 ? 'column' : 'row';
  for (const row of pane.querySelectorAll('.setting-item')) {
    // Only the canonical dropdown row is asserted: rows that pair a select with
    // other controls (the Proxy URL field) keep their own touch-first rule.
    if (!row.querySelector(':scope > .setting-item-control > select:only-child'))
      continue;
    const direction = getComputedStyle(row).flexDirection;
    if (direction !== expected) {
      issues.push(describe(row) + ': dropdown row is ' + direction + ' at a ' + paneWidth + 'px pane (expected ' + expected + ')');
    }
  }

  const transparent = (color) => color === 'rgba(0, 0, 0, 0)' || color === 'transparent';
  const pageColor = getComputedStyle(pane.parentElement ?? pane).backgroundColor;
  for (const row of pane.querySelectorAll('.setting-item')) {
    // Section headings are labels, not rows: they carry no control and no fill.
    if (row.classList.contains('setting-item-heading')) continue;
    const control = row.querySelector(':scope > .setting-item-control');
    if (!control || control.children.length === 0) continue;
    const rowColor = getComputedStyle(row).backgroundColor;
    const group = row.closest('.rss-dashboard-settings-group');
    const groupColor = group ? getComputedStyle(group).backgroundColor : null;
    if (transparent(rowColor) && (!groupColor || transparent(groupColor))) {
      issues.push(describe(row) + ': no row or group background');
    }
    if (groupColor && !transparent(groupColor) && groupColor === pageColor) {
      issues.push(describe(row) + ': group background matches the page (' + groupColor + ')');
    }
  }

  return JSON.stringify({ pane: paneWidth, issues, truncations });
})()`;

async function clickTab(connection, tab) {
  return evaluate(
    connection,
    `(() => {\n` +
      `  const button = [...document.querySelectorAll('.rss-dashboard-settings-tab-btn')]\n` +
      `    .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(tab)});\n` +
      `  if (!button) return 'missing';\n` +
      `  button.click();\n` +
      `  return 'clicked';\n` +
      `})()`,
  );
}

/** Opens Settings on the plugin tab inside the vault window, as a phone does. */
async function prepareMobileSettings(pages, options) {
  const page = vaultWindow(pages, options.expectVault);
  const connection = connect(page.webSocketDebuggerUrl);
  await connection.opened;
  await evaluate(
    connection,
    "(() => { window.app.emulateMobile(true); return 'mobile'; })()",
  );
  await delay(700);
  await evaluate(
    connection,
    "(() => { window.app.setting.open(); return 'settings'; })()",
  );
  await delay(900);
  const opened = await evaluate(
    connection,
    "(() => {\n" +
      "  const tab = window.app.setting.pluginTabs.find((entry) => entry.id === 'rss-dashboard');\n" +
      "  if (!tab) return 'missing';\n" +
      "  window.app.setting.openTabById('rss-dashboard');\n" +
      "  return 'tab';\n" +
      "})()",
  );
  if (opened.value !== "tab") {
    throw new Error(
      "The rss-dashboard settings tab is not available. Enable the plugin in this profile first.",
    );
  }
  await delay(900);
  return connection;
}

async function runSweep(connection, options) {
  const failures = [];
  const truncationNotes = new Set();
  let checks = 0;

  for (const width of options.widths) {
    // `mobile: true` would lay the page out at the 980px default viewport unless
    // the document carries a viewport meta; only touch emulation is switched on.
    await connection.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: options.mobile ? 844 : 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await connection.send("Emulation.setTouchEmulationEnabled", {
      enabled: options.touch,
      maxTouchPoints: 5,
    });
    await delay(300);

    const measured = await evaluate(
      connection,
      "JSON.stringify({ width: innerWidth, hoverNone: matchMedia('(hover: none)').matches })",
    );
    const viewport = JSON.parse(measured.value);
    if (viewport.width !== width) {
      failures.push(`asked for ${width}px, measured ${viewport.width}px`);
      continue;
    }
    if (options.touch && !viewport.hoverNone) {
      failures.push(
        `${options.mobile ? "--mobile" : "--touch"} asked for a phone but the window still reports hover: hover`,
      );
      continue;
    }

    for (const tab of REVIEWED_TABS) {
      checks += 1;
      const clicked = await clickTab(connection, tab);
      if (clicked.value === "missing") {
        failures.push(
          `${width}px ${tab}: no tab button — is the plugin settings tab open?`,
        );
        continue;
      }
      await delay(350);
      const result = await evaluate(connection, AUDIT_EXPRESSION);
      const audit = JSON.parse(result.value);
      if (audit.missing) {
        failures.push(`${width}px ${tab}: settings pane not rendered`);
        continue;
      }
      for (const issue of audit.issues)
        failures.push(`${width}px ${tab}: ${issue}`);
      for (const note of audit.truncations) {
        truncationNotes.add(`${width}px ${tab}: ${note}`);
      }
    }
  }

  return { failures, truncationNotes, checks };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const port = options.port ?? readDevToolsActivePort(options.profile);
  const pages = await pageTargetsOn(HOST, port);

  const connection = options.mobile
    ? await prepareMobileSettings(pages, options)
    : await (async () => {
        const page = settingsWindow(pages, options.expectVault);
        const opened = connect(page.webSocketDebuggerUrl);
        await opened.opened;
        return opened;
      })();

  let sweep;
  try {
    sweep = await runSweep(connection, options);
  } finally {
    if (options.mobile) {
      try {
        await evaluate(
          connection,
          "(() => { window.app.emulateMobile(false); return 'desktop'; })()",
        );
      } catch {
        // Best effort: the setting also persists in the profile, so the run may
        // leave the app in mobile mode until the next launch.
      }
    }
    connection.close();
  }

  for (const note of sweep.truncationNotes) {
    console.log(`truncated (not a failure): ${note}`);
  }
  if (sweep.failures.length > 0) {
    console.error(`settings layout check failed (${sweep.checks} tab checks):`);
    for (const failure of sweep.failures) console.error(`- ${failure}`);
    return 1;
  }
  console.log(
    `settings layout check passed: ${sweep.checks} tab checks across ` +
      `${options.widths.join(", ")}px${options.mobile ? " (mobile)" : options.touch ? " (touch)" : ""}.`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
