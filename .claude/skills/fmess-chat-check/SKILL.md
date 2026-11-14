---
name: fmess-chat-check
description: Check how chats look in the real fMess app before a change to the page script or a theme ships. Run it for any CSS or inject change that can touch messages, bubbles, quotes, the chat's background or colours (0.1.31 shipped bare bubbles because one chat kind was never looked at).
---

# Chat check

`tests/app/chat-check.sh [output dir] [max chats]` (macOS, debug build:
`npx tauri build --debug --bundles app` first). It quits the running fMess,
runs `tests/app/chat-check.js` as a probe, and opens the installed fMess again.

## What it covers

For one read chat of each kind found in the list, with each Messenger chat
theme found:

| Dimension | Values |
|---|---|
| Chat | encrypted (e2ee), not encrypted, group |
| Messenger chat theme | default, gradient, colour (and wallpaper) |
| fMess look | Messenger, Zalo, WhatsApp, Teams, and any other theme in `src-tauri/themes/` (CSS put in the page, nothing saved) |
| Mode | light, dark (Messenger's own setting, put back at the end) |
| Messages | text bubbles (yours, theirs), quotes, emoji-only ("icons") |
| Toasts | one of Facebook's own (`cometPushToast`) per look and mode, as a chat named `toast` |

It scrolls back up to 8 screens for a screen with a quote or an emoji message.
Notes at the end say what wasn't found (e.g. no emoji message): look for one
by hand then.

## What it checks (on the picture's pixels)

- a bubble is visible: beside its text differs from just outside it
- its text reads: contrast ≥ 2.5 (Messenger's own white on #0099FF is ~3)
- a quote's text (≥ 2) and bar (≥ 1.25) read on the bubble
- an emoji-only message has no bubble behind it
- `box gradient` per chat: whether the chat box still paints the theme's
  gradient (the fast-scroll flash, #27, comes from it)
- a toast's text reads (≥ 3) and its close button's cross shows on its face
  (≥ 2). Facebook draws toasts the other way round from the page, so a theme's
  page colours leaking into them gave white on white (0.1.33, dark mode, all
  three themes). A toast that never showed fails (`no toast showed`, with
  whether the page was hidden: keep the window in view while it runs)

Skipped on purpose: text in links (shared posts) and buttons (the message a
reply quotes), see-through bubbles Messenger dims, bubbles drawn as a border
only (unsent messages), anything covered (pinned message, a theme's card).

## Reading the result

`PASSED`/`FAILED` and one line per problem; `result.json` and the pictures in
the output dir, plus `sheet-<chat>.png` per chat: Messenger, Zalo, WhatsApp,
Teams across, light above dark. Look at the sheets even when it passes.

Before trusting a new check, run it on a known-bad build (it must fail) and a
known-good one (it must pass).

## Still by hand

The fast-scroll flash, hover cards, pinch/zoom, anything animated: ask anh
to try it in the debug build (a recorder probe helps, see fmess-fast-iteration
in memory).

For what happens when the computer sleeps, the network drops, the encrypted
chats' worker dies or a notification rings, and for whether the search field
can be typed in and text selected (focus-check.sh), see the fmess-live-check
skill. A check that clicks or types should use real events (probe.rs,
`window.__fmessInputRequest`), described there.
