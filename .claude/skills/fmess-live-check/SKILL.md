---
name: fmess-live-check
description: Check in the real fMess app what happens when the computer sleeps, the network dies or comes back, Messenger's encrypted chats' worker dies ("Couldn't load chats"), when a notification rings, and whether the keyboard and mouse still go where they're put (search field, ⌘K, selecting a message's text) after a reload or a dead network. Run it before shipping any change to connections, reloading, notifications, sounds, timers or focus (19-recover, 14-notifications, 05-messenger-prefs, 06-routes, 01-start, notify.rs), and when a user reports stuck "Sending", missing notifications or sounds, a blank or error screen, a field that can't be typed in, typing that lands in the message box, or text that can't be selected. Fix by simulating the case, not by releasing and waiting for reports.
---

# Live check

`tests/app/live-check.sh [wake] [network] [chats] [sound]` (all four by default;
macOS). It needs a debug build that can go through a proxy:

```
npx tauri build --debug --bundles app --features test-proxy
```

It quits the running fMess, runs the debug app through `tests/app/net-proxy.py`
(a local CONNECT proxy that can cut the network), and opens the installed fMess
again at the end. The window isn't brought forward (`FMESS_PROBE_NO_FOCUS`).
It prints `PASS`/`FAIL` per case, then `PASSED` or `FAILED (n)`; logs go to
`$LIVE_OUT` or a temp folder (each case's `app.log`, `proxy.jsonl`, `stats.json`).
About 25 minutes for all four.

## How things are made up

| What | How |
|---|---|
| Network dies silently (sleep, Wi-Fi drop, NAT) | proxy `blackhole`: open tunnels pass nothing and never close; new ones get no answer |
| Offline | proxy `refuse`: open tunnels close, new ones refused at once |
| Every connection dropped | proxy `reset` |
| Sleep | a clock jump between two ticks of 19-recover's timer (`window.__fmessCheckAwake(now)`, debug) |
| A message being typed | a hidden contenteditable with text, focused (not Messenger's box, so nobody sees "typing…") |
| "Couldn't load chats" (#24) | Messenger's own `MAWSetupWorker.setPreventWorkerRestart(true)` + `terminateWorker`, then work for the worker (reading ahead encrypted chats, which opens none) |
| Messenger's sound | its real `MWLSChatPopperCommon.playChatTabSound(message)` |
| Do Not Disturb, Messenger's sounds | `__fmessSetMessengerPref('muteFor' / 'soundsOn')`, reported at once (`__fmessReportMessengerPrefs`), put back as they were |
| The Mac muted | the probe logs `sound: mute`; the script runs `set volume output muted true` and puts it back |
| Windows' ring decision on a Mac | `window.__fmessRingAnywhere = true` (debug) |

Debug builds log what the page does: `[page] main recover: … @<ms>` (19-recover),
`window.__fmessSockets` (every WebSocket: opened, closed, last frame each way),
and `[fmess] notify #n: <title> (…, sound true|false)`.

## Cases

**wake**
- a timer a minute late (a hidden page's timer) doesn't reload; a 2-minute sleep doesn't
- after a 6-minute sleep: no reload while a message is being typed, reload once it's sent
- after the reload, messages (gateway.facebook.com) and encrypted chats (web-chat-e2ee) talk to Facebook within 20 s
- waking with the network off, then dead: no reload until it's back, reload within 10 s after

**network** (no sleep)
- a minute of dead network: messages back within 10 s by Messenger itself; fMess reloads at most once, within 60 s, for the connections Messenger leaves down
- every connection dropped: back within 10 s, no reload
- 30 s offline: back within 60 s
- 2.5 minutes offline: fMess reloads within 60 s of the network coming back (Messenger had given up on its calls connection), and everything talks to Facebook within 75 s

**chats** (#24)
- the worker dies for good: Messenger shows its error screen, fMess reloads within 30 s, encrypted chats talk to Facebook again
- the same within 10 minutes of fMess's last reload for it: the screen stays (Messenger's own Reload can also clear and refetch the encrypted chats stored on the computer)

**sound** (decided as on Windows, plus macOS's own rule)
- after Messenger's sound played, the notification is quiet (one sound per message)
- no sound from Messenger (its 4th message in a chat, or its sound failed): it rings
- a notification asking for silence: quiet
- Do Not Disturb on: quiet, and Messenger quiet too; off again: rings
- Messenger's sounds off: quiet; on again: rings
- the Mac muted: Messenger's sound still counts as played, so quiet; without it, it rings (the system keeps it quiet)
- macOS: notifications stay silent (Messenger plays its own)
- each case checks the page's decision and what fMess's native side was told

## What Messenger and WebKit do on their own (measured 2026-11-05)

Messenger keeps four WebSockets to gateway.facebook.com (`/ws/lightspeed`
messages, `/ws/realtime`, `/ws/rpsignaling` calls, `/ws/streamcontroller`) and
the encrypted chats' worker keeps one to web-chat-e2ee.facebook.com.
- A silent death: it notices in 11–13 s and keeps trying; lightspeed and
  rpsignaling are back within 2 s of the network, but realtime and
  streamcontroller were left down (over 2.5 minutes, until a reload).
- Offline: it retries with growing gaps, lightspeed every ~75 s after a few
  minutes, so it came back 77 s after the network did; rpsignaling tries every
  second and gives up after ~110 s, for good.
- The dead socket of a silent death is never closed: the newest socket of each
  kind is the one in use.
- A dead worker is restarted by itself, unless it can't (the #24 screen).
- WebKit keeps sending HTTP requests to a host down its pooled connection after
  a silent death until it gives up on it, 44 s later; a request to a host the
  page doesn't use (m.facebook.com) goes out on a new one. 19-recover asks both.

## Focus check (#51)

`tests/app/focus-check.sh [fresh] [reload] [chats] [network]` (all four by
default; macOS, debug build; `network` needs `--features test-proxy`). About 8
minutes. With a chat open, real clicks and keys (see below) check that:

- a click into the chat list's search field, then typing, types there
- ⌘K from the message box, then typing, types in the search field
- dragging across a message's text selects it

| Case | State |
|---|---|
| fresh | a chat just opened |
| reload | the page reloaded at that chat (fMess's own reload, Ctrl+R) |
| chats | after opening four chats in a row |
| network | a minute of dead network, then back (fMess reloads by itself) |

It prints `PASS`/`FAIL` per case and, for a failure, every move of the
keyboard: each `focus()` call with where it came from (`user-script` is
fMess's own) and each change of address. The window stays behind what you work
in. It types "zq" and deletes it again; nothing is sent.

What it found: Facebook swaps `window.setInterval`/`clearInterval` for its
scheduler's once its scripts load, and that `clearInterval` can't stop a
timer started before. After a reload at a chat, 06-routes' "cursor in the
message box" timer ran for ever (every 50 ms), so no field could be typed in and
no text selected until fMess was quit. fMess's script now keeps the browser's
own timers (01-start). A timer started as the page loads is the case to test.

## Real clicks and keys in a probe

Synthetic events (`dispatchEvent`, `el.focus()`) passed where people failed:
#51 never showed with them. A probe asks the app for real ones (probe.rs,
macOS): set `window.__fmessInputRequest` to steps in CSS pixels, then wait for
`window.__fmessInputDone` to count up.

```js
const input = async (steps) => {
  const done = window.__fmessInputDone || 0;
  window.__fmessInputRequest = steps;
  while ((window.__fmessInputDone || 0) === done) await new Promise((r) => setTimeout(r, 100));
};
await input([{ click: [x, y] }, { type: 'zq' }, { key: 'Escape' }]); // also Enter, Tab, Backspace
await input([{ drag: [x1, y1, x2, y2] }]);                       // selects text
await input([{ click: [x, y], count: 2 }]);                      // double click
```

They go through the window when it is the key one, otherwise straight to the
web view (macOS won't let fMess come in front of the app you're in), so no
Accessibility permission and the pointer doesn't move. A probe that returns
`"again"` runs again `FMESS_PROBE_DELAY` seconds later, after a reload too:
keep where it is in `sessionStorage` (focus-check.js does).

## Still by hand

- Windows: the real toast sound (a `test build` labelled PR; install it in the
  Windows VM). Settings → Send Test Notification rings; one message rings once;
  Do Not Disturb or Messenger's sounds off: silent.
- A real night's sleep (the morning after: send a message, it goes).
- A muted group: Messenger doesn't notify for it, and fMess's own notification
  leaves muted chats out (14-notifications, unread chats); needs someone to write
  in a muted group.
- Messages waiting at "Sending" go out after a reload: needs a chat you may send
  test messages to.

## Adding a case

Make it up at the proxy or with Messenger's own calls, never with a real chat
someone else sees. A probe that gets the page reloaded loses its result: log
from the page with `window.__fmessErrors?.push('<what>: … @' + Date.now())` and
judge in `live-check.sh` with `judge`/`at`/`reloads`/`back`, or return
`"again"` and pick up after the reload (see focus-check.js). Click and type
with real events, not the page's own (above).
