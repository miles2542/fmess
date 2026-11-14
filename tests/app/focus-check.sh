#!/bin/bash
# Checks in the real app (macOS, debug build) that the keyboard goes where
# it is put while a chat is open: a click into the chat list's search field,
# or ⌘K, then typing, types there and not in the message box (#51), and a
# message's text can be selected by dragging. Clicks and keys are real
# window events (probe.rs), not the page's own.
#
#   tests/app/focus-check.sh [fresh] [reload] [chats] [network]   (all by default)
#
#   fresh    just after opening a chat
#   reload   after the page reloads at that chat (fMess's own reload after
#            sleep or a dead network, Ctrl+R)
#   chats    after opening a few chats in a row
#   network  after the network dies for a minute and comes back (needs the
#            build with the proxy: --features test-proxy; see live-check.sh)
#
# Needs a debug build (npx tauri build --debug --bundles app). It quits the
# fMess that is running and opens the installed one again at the end. The
# window stays behind what you work in (the events go to it all the same). It
# types "zq" into fields and deletes it again; nothing is sent.
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT="${FOCUS_OUT:-$(mktemp -d "${TMPDIR:-/tmp}/fmess-focus.XXXXXX")}"
APP=src-tauri/target/debug/bundle/macos/fMess.app
PORT=18080
CONTROL=18081
CASES="${*:-fresh reload chats network}"
[ -d "$APP" ] || { echo "No debug build at $APP: npx tauri build --debug --bundles app"; exit 1; }
mkdir -p "$OUT"
echo "Focus checks: $CASES (logs in $OUT)"

PROXY_PID=
cleanup() {
  pkill -f "debug/bundle/macos/fMess.app/Contents/MacOS/fmess" 2> /dev/null
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2> /dev/null
  sleep 1
  [ -d /Applications/fMess.app ] && open -g -a /Applications/fMess.app
}
trap cleanup EXIT
proxy() { curl -s --max-time 5 "localhost:$CONTROL/$1" > /dev/null; }

FAILED=0
for CASE in $CASES; do
  DIR="$OUT/$CASE"
  mkdir -p "$DIR"
  sed "s/__CASE__/\"$CASE\"/" tests/app/focus-check.js > "$DIR/probe.js"
  pkill -f "fMess.app/Contents/MacOS/fmess"
  sleep 2
  ARGS=(--env FMESS_PROBE="$DIR/probe.js" --env FMESS_PROBE_DELAY=15 --env FMESS_PROBE_WAIT=400 --env FMESS_PROBE_NO_FOCUS=1)
  if [ "$CASE" = network ]; then
    python3 tests/app/net-proxy.py $PORT $CONTROL "$DIR/proxy.jsonl" 2> "$DIR/proxy.err" &
    PROXY_PID=$!
    disown "$PROXY_PID"
    sleep 1
    ARGS+=(--env FMESS_PROXY="http://127.0.0.1:$PORT")
  fi
  open -g "${ARGS[@]}" --stderr "$DIR/app.log" "$APP"
  if [ "$CASE" = network ]; then
    for _ in $(seq 1 120); do grep -q 'cut the network' "$DIR/app.log" 2> /dev/null && break; sleep 1; done
    if [ ! -s "$DIR/proxy.jsonl" ]; then
      echo "note: no traffic through the proxy; is the build made with --features test-proxy?"
    fi
    proxy blackhole
    sleep 60
    proxy pass
  fi
  for _ in $(seq 1 400); do grep -q '^\[probe\] [^a]' "$DIR/app.log" 2> /dev/null && break; sleep 1; done
  python3 - "$DIR/app.log" "$CASE" <<'PY' || FAILED=$((FAILED + 1))
import json, sys
log, case = sys.argv[1], sys.argv[2]
line = next((l for l in open(log) if l.startswith('[probe] ') and not l.startswith('[probe] again')), None)
if not line:
    print(f'FAIL {case}: no result from the probe; see {log}'); sys.exit(1)
raw = json.loads(line[len('[probe] '):])
result = json.loads(raw) if isinstance(raw, str) else raw
if not isinstance(result, dict) or result.get('error'):
    print(f'FAIL {case}: {result}'); sys.exit(1)
recovered = sum(1 for l in open(log) if 'recover: reloaded' in l)
for failure in result['failures']:
    print(f'FAIL {case}: {failure}')
if result['failures']:
    print('  keyboard moves:'); [print('   ', m) for m in result['moves']]
    sys.exit(1)
print(f'PASS {case}' + (f' (fMess reloaded {recovered}×)' if recovered else ''))
PY
  if [ -n "$PROXY_PID" ]; then kill "$PROXY_PID" 2> /dev/null; PROXY_PID=; fi
done
[ "$FAILED" = 0 ] && echo PASSED || echo "FAILED ($FAILED)"
exit "$FAILED"
