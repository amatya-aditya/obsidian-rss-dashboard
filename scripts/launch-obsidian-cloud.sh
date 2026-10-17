#!/usr/bin/env bash
# Launch Obsidian headless in a Linux cloud container, with the fixture vault
# open and rss-dashboard enabled, ready for scripts/obsidian-cdp.mjs.
#
#   scripts/launch-obsidian-cloud.sh start   # install if missing, launch, print the CDP flags
#   scripts/launch-obsidian-cloud.sh stop    # stop only the instance this script started
#
# Run `npm run build` first so the plugin build exists. Details and the CDP
# harness are in docs/development/fixture-vault.md ("Headless Obsidian in a
# Linux container").
set -euo pipefail

OBS_VER="${OBS_VER:-1.13.7}"
OBS_DIR="${OBS_DIR:-/opt/obsidian}"
PORT="${CDP_PORT:-9333}"
WORK="${OBS_WORK_DIR:-${TMPDIR:-/tmp}/rss-dashboard-obsidian}"
PROFILE="$WORK/profile"
VAULT="$WORK/vault"
PIDFILE="$WORK/obsidian.pid"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install_obsidian() {
  [ -x "$OBS_DIR/obsidian" ] && return 0
  local tmp
  tmp="$(mktemp -d)"
  (
    cd "$tmp"
    curl -sSL -o obsidian.AppImage \
      "https://github.com/obsidianmd/obsidian-releases/releases/download/v${OBS_VER}/Obsidian-${OBS_VER}.AppImage"
    chmod +x obsidian.AppImage
    ./obsidian.AppImage --appimage-extract >/dev/null # no FUSE in the container
    mkdir -p "$OBS_DIR"
    cp -a squashfs-root/. "$OBS_DIR/"
  )
  rm -rf "$tmp"
}

stop_obsidian() {
  # Kill only the tree this script started, never other sessions' instances.
  if [ -f "$PIDFILE" ]; then
    local pid
    pid="$(cat "$PIDFILE")"
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
}

start_obsidian() {
  for file in main.js manifest.json styles.css; do
    [ -f "$REPO/$file" ] || { echo "Missing $file: run npm run build first." >&2; exit 1; }
  done
  stop_obsidian
  install_obsidian
  mkdir -p "$WORK"
  (cd "$REPO" && npm run fixture:vault -- "$VAULT" >/dev/null)
  mkdir -p "$PROFILE"
  cat >"$PROFILE/obsidian.json" <<JSON
{"vaults":{"fixture0000000001":{"path":"$VAULT","ts":1790000000000,"open":true}},"updateDisabled":true}
JSON
  # --no-sandbox because the container runs as root; xvfb provides the display.
  xvfb-run -a -s "-screen 0 1400x900x24" "$OBS_DIR/obsidian" \
    --no-sandbox --disable-gpu \
    --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" \
    >"$WORK/obsidian.log" 2>&1 &
  echo $! >"$PIDFILE"

  local tries=0
  until curl -s "http://localhost:$PORT/json/list" | grep -q '"type": "page"'; do
    tries=$((tries + 1))
    [ "$tries" -gt 60 ] && { echo "Obsidian did not expose CDP on port $PORT." >&2; exit 1; }
    sleep 1
  done

  # Restricted mode is on in a fresh profile: dismiss the trust dialog, turn
  # community plugins on, and load ours. The vault window opens a moment after
  # CDP answers, so retry until the plugin is loaded.
  local enable="$WORK/enable-plugin.js"
  cat >"$enable" <<'JS'
(async () => {
  const trust = [...document.querySelectorAll('button')].find((b) =>
    /Trust author/.test(b.textContent),
  );
  if (trust) trust.click();
  await app.plugins.setEnable(true);
  await app.plugins.loadManifests();
  await app.plugins.enablePluginAndSave('rss-dashboard');
  return 'enabled';
})()
JS
  local cdp=(node "$REPO/scripts/obsidian-cdp.mjs" --port "$PORT" --profile "$PROFILE" --expect-vault "$VAULT")
  # eval does not await a promise, so fire the enable and then probe synchronously.
  local probe="$WORK/probe-plugin.js"
  echo "Boolean(app.plugins.plugins['rss-dashboard'])" >"$probe"
  local attempt=0
  until "${cdp[@]}" eval "$probe" 2>/dev/null | tail -1 | grep -q '^true$'; do
    "${cdp[@]}" eval "$enable" >/dev/null 2>&1 || true
    sleep 1
    attempt=$((attempt + 1))
    [ "$attempt" -gt 30 ] && { echo "rss-dashboard did not load; see $WORK/obsidian.log." >&2; exit 1; }
  done

  echo "Obsidian $OBS_VER running. Pass these to scripts/obsidian-cdp.mjs:"
  echo "  --port $PORT --profile $PROFILE --expect-vault $VAULT"
}

case "${1:-}" in
  start) start_obsidian ;;
  stop) stop_obsidian ;;
  *) echo "Usage: $0 start|stop" >&2; exit 2 ;;
esac
