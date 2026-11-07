---
name: fmess-field-check
description: Check that a person can click into fields in the real fMess app and type there, with the real mouse and keyboard (search, text fields, the message box, fields in dialogs, a PIN field, Facebook's own fields, Settings' App name), Vietnamese letters included. Run it for any change that touches clicks, keys, focus, selection or the page's CSS (10-selection, 13-shortcuts, 06-routes, 17-theme-hooks, a theme), and when a user reports a field that won't take typing (#51). Part of a full test run, with fmess-chat-check and fmess-live-check.
---

# Field check

A probe (`FMESS_PROBE`) only sends synthetic events, which the page treats
differently from a person's (focus, `user-select`, default actions, input
methods), so this check clicks and types for real. Until it existed nothing
tested typing anywhere but the message box, which fMess focuses by itself
when a chat opens: a field that took no clicks would still have looked fine
there (#51 came from a user).

## Running it

**Windows** (where #51 was reported): Actions → *Field check (Windows)* → Run
workflow on a branch, or label the pull request `test build` (it runs beside
the Windows test build, and again on each push). It builds the debug app on a
Windows runner (WebView2) and runs `tests/app/field-check.ps1` twice, without
and with fMess's page script. The runner isn't signed in to Facebook, so the
page is Facebook's login. About 15 minutes; logs in the run's `field-check`
artifact (`gh run download <id> --dir <dir>`). On a Windows machine with a
debug build: `pwsh tests/app/field-check.ps1 [-NoInject]`.

**macOS** (debug build, `npx tauri build --debug --bundles app`):
`tests/app/field-check.sh [output dir]`. It quits the running fMess
(installed or debug) and opens that one again at the end, and needs
Accessibility access for the terminal (`tests/app/field-click.swift` posts
the events). It moves the pointer and types for about a minute: **only while
anh is at the Mac and has said go**, never while the screen is locked (see
the traps). Signed in, it also types in Messenger's chat list search and
empties it afterwards.

## What it covers

`tests/app/field-check.js` lays test fields over the page inside the roles
Messenger uses (fMess's rules key on them), with the page marked as the chats
(`data-fmess-chats`, so 10-selection's `user-select` rules apply):

| Field | Where |
|---|---|
| `type=search` combobox, plain text | `role="navigation"` (the chat list) |
| `contenteditable="true"` in a `role="region"`, `contenteditable="plaintext-only"` | `role="main"` (the chat) |
| text, textarea, a `type=tel` PIN field | `role="dialog"` |
| Messenger's chat list search (signed in) | the real one, emptied after |
| Facebook's login email (signed out, when the test fields don't cover it) | the real one, never sent |
| Settings › App name (Windows only: typing renames the app) | the Settings window, found through UI Automation |

Each gets a click, then `f` `m` as key presses and `ê` the way Vietnamese input
methods (Unikey, EVKey) hand it over: a Unicode character (Windows
`KEYEVENTF_UNICODE`, a macOS key event carrying a Unicode string). Every field
must end with `fmê`. The probe logs each pointerdown, mousedown, focusin,
keydown, beforeinput and input with the field it reached, the focused element
after it, and `PREVENTED` when a listener cancelled it, so a failure shows
where the typing stopped. No events at all means the clicks never reached the
page (another window, a locked screen).

Never type into a chat's real message box (Messenger shows the other side
"typing…"), never into the encrypted chats' PIN (Restore now: a wrong PIN
counts against the account), and never press Enter.

## Results

- 2026-11-07, #51 (0.1.35, Windows 10, Messenger look): Windows runner,
  WebView2, real mouse and keyboard: every test field and Settings' App name
  took `fmê`, with and without fMess's script (run 42379196816). Chrome on a
  Mac with the whole script put in facebook.com/messages (signed in,
  `navigator.platform` made `Win32`, Windows' classic scroll bars): Messenger's
  search, Search in conversation and the new message's To field all took
  typing. So fMess's script doesn't block clicks or keys in fields as such;
  #51 needs the user's details (which field, what happens, which input method).

## Traps

- A locked Mac screen: `loginwindow` is the active app and every key goes to
  the lock screen's password field (it happened once: tell anh to clear it
  before typing the password). field-click.swift now clicks only when fMess is
  the active app and its own window is under the point, and says why it
  didn't. Check first: `CGSessionCopyCurrentDictionary()["CGSSessionScreenIsLocked"]`.
- A command-line tool learns the active app only by running its run loop
  (`NSWorkspace.frontmostApplication` stays stale otherwise).
- WKWebView ignores the click that brings an inactive window forward: activate
  fMess first (`open "$APP"` on the running debug app does).
- PowerShell's `-like "[probe]*"` reads `[probe]` as a set of letters: match
  log lines with `.StartsWith("[probe]")`.
- The Settings window is taller than the runner's screen: App name is below
  its edge, so it gets the focus through UI Automation instead of a click.
- Putting fMess's script into a page that has already loaded (Chrome, for a
  quick look): keep Facebook's module loader (`window.__d`) and set it again
  after the script, or every module loaded later fails with "__d is not a
  function" and panels stay skeletons. Facebook's CSP allows `blob:` scripts.

## Still by hand

- A real Vietnamese input method (Unikey/EVKey hooks, Windows' own Telex IME,
  which composes): in the Windows VM, type in Messenger's search, Search in
  conversation, a new message's To field, a nickname, Settings › App name.
- Fields only a signed-in Windows app shows: the same list, in the Windows VM.
