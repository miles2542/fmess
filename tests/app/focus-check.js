// Probe for tests/app/focus-check.sh: with a chat open, does a click or a
// shortcut into another field keep the keyboard there, and can a message's
// text be selected? Clicks and keys are real ones, sent to the window by
// probe.rs (window.__fmessInputRequest): a focus() or dispatchEvent() from
// here took the field every time, even while people's clicks didn't (#51).
//
// __CASE__: "fresh" (just opened), "reload" (after the page reloads at the
// chat), "network" (after the network dies and comes back, the script cuts
// it), "chats" (after opening a few chats in a row).
// The probe returns "again" to be run again after a wait or a reload; where
// it is is kept in sessionStorage.
const CASE = __CASE__;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const KEY = 'fmess.focusCheck';
const state = JSON.parse(sessionStorage.getItem(KEY) || 'null') ?? { stage: 'start', at: Date.now() };
const save = () => sessionStorage.setItem(KEY, JSON.stringify(state));

const input = async (steps) => {
  const done = window.__fmessInputDone || 0;
  window.__fmessInputRequest = steps;
  for (let i = 0; i < 100 && (window.__fmessInputDone || 0) === done; i++) await sleep(100);
};
const point = (el) => {
  const box = el.getBoundingClientRect();
  return [box.x + Math.min(20, box.width / 2), box.y + box.height / 2];
};
const visible = (el) => el && el.getBoundingClientRect().width > 0;
const composer = () => document.querySelector('[role="main"] [contenteditable="true"][role="textbox"]');
const chatLinks = () => [...document.querySelectorAll('[role="grid"] [role="row"] a[href*="/messages/"]')].filter(visible);
// What has the keyboard, without any text or names.
const what = (el) => {
  if (!el || el === document.body) return el ? 'body' : 'nothing';
  if (el === composer()) return 'message box';
  if (el.closest('[role="navigation"]') && el.matches('input[type="search"]')) return 'chat list search';
  const where = el.closest('[role="main"]') ? ' in the chat' : el.closest('[role="navigation"]') ? ' in the chat list' : '';
  return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}${el.isContentEditable ? ' (editable)' : ''}${where}`;
};
const waitFor = async (check, ms) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (check()) return true;
  return false;
};
const openChat = async (link) => {
  const before = composer();
  await input([{ click: point(link) }]);
  await waitFor(() => composer() && composer() !== before && document.querySelector('[role="main"] [data-message-id] [dir="auto"]'), 15000);
  await sleep(2500);
};

// Getting to the case's state ------------------------------------------------
if (state.stage === 'start') {
  const link = chatLinks()[0];
  if (!link) return 'no chat in the list';
  await openChat(link);
  if (CASE === 'reload') {
    state.stage = 'reloaded';
    save();
    setTimeout(() => location.reload(), 500);
    return 'again';
  }
  if (CASE === 'network') {
    // focus-check.sh cuts the network now, for a minute, then brings it back.
    state.stage = 'network';
    state.at = Date.now();
    save();
    (window.__fmessErrors ||= []).push('[focus-check] chat open, cut the network');
    return 'again';
  }
  if (CASE === 'chats') {
    for (const next of chatLinks().slice(1, 4)) await openChat(next);
    await openChat(chatLinks()[0]);
  }
  state.stage = 'check';
}
if (state.stage === 'network') {
  // Run again every few seconds (the page may reload meanwhile) until the
  // network has been back for a while.
  if (Date.now() - state.at < 150000) return 'again';
  state.stage = 'check';
  save();
}
if (state.stage === 'reloaded' || state.stage === 'check') {
  await waitFor(() => composer() && document.querySelector('[role="main"] [data-message-id] [dir="auto"]'), 30000);
  await sleep(4000);
}
sessionStorage.removeItem(KEY);
if (!composer()) return { case: CASE, error: 'no chat open', path: location.pathname.replace(/\d+/g, 'N') };

// The checks -----------------------------------------------------------------
// Who moves the keyboard while a check runs: script calls of focus() (where
// from: fMess's own script shows as user-script) and where it lands.
const moves = [];
const t0 = performance.now();
const nativeFocus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (...args) {
  const from = (new Error().stack || '').split('\n').slice(1, 4).map((line) => line.replace(/@.*\/([^/]{0,10})[^/]*?(:\d+:\d+)$/, '@$1…$2')).join(' < ');
  moves.push(`${Math.round(performance.now() - t0)} ms focus() on ${what(this)} from ${from}`);
  return nativeFocus.apply(this, args);
};
const onFocusIn = (event) => moves.push(`${Math.round(performance.now() - t0)} ms → ${what(event.target)}`);
document.addEventListener('focusin', onFocusIn, true);
// And changes of address, which open a chat as far as fMess is concerned.
const path = () => location.pathname.replace(/\d{4,}/g, 'N') + (location.search ? '?…' : '');
const nativeHistory = {};
for (const method of ['pushState', 'replaceState']) {
  nativeHistory[method] = history[method];
  history[method] = function (...args) {
    const from = path();
    const result = nativeHistory[method].apply(this, args);
    moves.push(`${Math.round(performance.now() - t0)} ms ${method} ${from} → ${path()}`);
    return result;
  };
}
const failures = [];
const checks = {};
// Typed text that went into the message box comes out again (never sent).
const typed = 'zq';
const takeBack = async () => {
  if (!composer()?.textContent.includes(typed)) return;
  composer().focus();
  for (let i = 0; i < typed.length; i++) await input([{ key: 'Backspace' }]);
};

try {
  // 1. A click into the chat list's search field, then typing.
  const search = document.querySelector('[role="navigation"] input[type="search"]');
  if (!visible(search)) failures.push('no search field in the chat list');
  else {
    await input([{ click: point(search) }]);
    await sleep(1500);
    const after = what(document.activeElement);
    await input([{ type: typed }]);
    await sleep(600);
    const field = document.querySelector('[role="navigation"] input[type="search"]');
    checks.searchClick = { after, value: field?.value, inMessageBox: Boolean(composer()?.textContent.includes(typed)) };
    if (field?.value !== typed) failures.push(`search field click: typing went to ${what(document.activeElement)}, not the field (keyboard 1.5 s after the click: ${after})`);
    await takeBack();
    await input([{ key: 'Escape' }]);
    await sleep(800);
  }

  // 2. The search shortcut (⌘K / Ctrl+K) from the message box.
  await input([{ click: point(composer()) }]);
  await sleep(500);
  window.__fmessShortcut?.('search');
  await sleep(1500);
  {
    const after = what(document.activeElement);
    await input([{ type: typed }]);
    await sleep(600);
    const field = document.querySelector('[role="navigation"] input[type="search"]');
    checks.searchShortcut = { after, value: field?.value };
    if (field?.value !== typed) failures.push(`search shortcut: typing went to ${what(document.activeElement)} (keyboard 1.5 s after: ${after})`);
    await takeBack();
    await input([{ key: 'Escape' }]);
    await sleep(800);
  }

  // 3. Selecting a message's text by dragging across it.
  const texts = [...document.querySelectorAll('[role="main"] [data-message-id] [dir="auto"]')].filter(
    (el) => visible(el) && el.textContent.trim().length >= 4 && el.getBoundingClientRect().top > 80,
  );
  const text = texts.at(-1);
  if (!text) failures.push('no message text on screen to select');
  else {
    const box = text.getBoundingClientRect();
    getSelection().removeAllRanges();
    await input([{ drag: [box.x + 1, box.y + box.height / 2, box.right - 1, box.y + box.height / 2] }]);
    await sleep(1500);
    const selected = String(getSelection()).trim();
    checks.select = { chars: selected.length, of: text.textContent.trim().length, keyboard: what(document.activeElement) };
    if (selected.length < Math.min(3, text.textContent.trim().length)) failures.push(`message text: dragging selected nothing (keyboard then: ${what(document.activeElement)})`);
    getSelection().removeAllRanges();
  }
} finally {
  HTMLElement.prototype.focus = nativeFocus;
  Object.assign(history, nativeHistory);
  document.removeEventListener('focusin', onFocusIn, true);
}
return { case: CASE, failures, checks, moves: moves.slice(0, 60) };
