#!/bin/bash
# Can a person click into a field in fMess and type there? (macOS, debug
# build: npx tauri build --debug --bundles app.) Runs tests/app/field-check.js
# as a probe, which lays test fields over the page as Messenger has them and
# lists Messenger's own fields it can type in harmlessly; then clicks each
# with the real mouse and types with the real keyboard
# (tests/app/field-click.swift: "fm" as keys, "ê" as an input method hands it
# over). Every field must end up with "fmê". It quits the running fMess and
# opens the installed one again at the end. Moves the pointer and types for
# about 20 s: hands off the keyboard while it runs. Needs Accessibility access
# for the terminal.
#
#   tests/app/field-check.sh [output dir]
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:-$(mktemp -d "${TMPDIR:-/tmp}/fmess-field-check.XXXXXX")}"
APP=src-tauri/target/debug/bundle/macos/fMess.app
mkdir -p "$OUT"
[ -d "$APP" ] || { echo "No debug build at $APP: npx tauri build --debug --bundles app"; exit 1; }

pkill -f "fMess.app/Contents/MacOS/fmess" || true
sleep 2
open --env FMESS_PROBE="$PWD/tests/app/field-check.js" --env FMESS_PROBE_DELAY=15 --env FMESS_PROBE_WAIT=200 --stderr "$OUT/app.log" "$APP"
echo "Waiting for the page (about 20 s); logs in $OUT"
for _ in $(seq 1 60); do
  grep -q 'fieldcheck ready' "$OUT/app.log" 2>/dev/null && break
  sleep 2
done
grep -q 'fieldcheck ready' "$OUT/app.log" || { echo "No fields from the probe; see $OUT/app.log"; exit 1; }
PID=$(pgrep -f "$APP/Contents/MacOS/fmess" | head -1)
WIDTH=$(grep -o 'fieldcheck window [0-9]*' "$OUT/app.log" | head -1 | awk '{print $3}')
grep -o 'fieldcheck target .*' "$OUT/app.log" | while read -r _ _ name x y; do
  echo "$name: $(swift tests/app/field-click.swift "$PID" "$x" "$y" "$WIDTH")"
done
for _ in $(seq 1 100); do
  grep -q '^\[probe\]' "$OUT/app.log" && break
  sleep 2
done

pkill -f "$APP/Contents/MacOS/fmess" || true
sleep 2
open -a /Applications/fMess.app 2>/dev/null || true

python3 - "$OUT" <<'EOF'
import json, sys
out = sys.argv[1]
line = next((l for l in open(f'{out}/app.log') if l.startswith('[probe]')), None)
if not line:
    print('No result from the probe; see', f'{out}/app.log'); sys.exit(1)
raw = json.loads(line[len('[probe] '):])
result = json.loads(raw) if isinstance(raw, str) else raw
if isinstance(result, str):
    print('Probe:', result); sys.exit(1)
failed = 0
for name, value in result['values'].items():
    ok = value == 'fmê'
    failed += not ok
    print(f"{'PASS' if ok else 'FAIL'} {name}: {value!r}")
for line in result.get('notes', []):
    print('note:', line)
if failed:
    print('Page events:')
    for line in result['seen'][:120]:
        print('  ', line)
print(f'FAILED ({failed})' if failed else 'PASSED')
sys.exit(1 if failed else 0)
EOF
