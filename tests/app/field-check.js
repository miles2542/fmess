// Probe for tests/app/field-check.{sh,ps1}: can a person click into a field and
// type there? Lays test fields over the page the way Messenger has them (a
// search field in the chat list, a text field and the message box in the
// chat, fields in a dialog), marks the page as the chats, and logs where each
// field is. The driver (field-check.ps1 on Windows) then clicks each with the
// real mouse and types with the real keyboard; this waits for the text and
// returns what each field got, with what the page saw on the way.
const say = (line) => (window.__fmessErrors ??= []).push(`fieldcheck ${line}`);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CHATS = 'data-fmess-chats';
// Facebook's own route changes would take the chats' mark off.
const keepChats = setInterval(() => document.documentElement.setAttribute(CHATS, ''), 100);
document.documentElement.setAttribute(CHATS, '');

// Beside the chat list, which keeps Messenger's own search field in view.
const host = document.createElement('div');
host.id = 'fmess-field-check';
host.style.cssText =
  'position: fixed; left: 340px; top: 120px; width: 520px; height: 300px; z-index: 2147480000; background: #fff; color: #000;' +
  'display: flex; flex-wrap: wrap; gap: 16px; padding: 20px; box-sizing: border-box; font: 14px sans-serif; border: 2px solid #f0f;';
host.innerHTML = `
  <div role="navigation" style="width: 220px; display: flex; flex-direction: column; gap: 16px">
    <input id="fc-search" type="search" role="combobox" placeholder="search" autocomplete="off" spellcheck="false" style="height: 32px">
    <input id="fc-text" type="text" placeholder="text" style="height: 32px">
  </div>
  <div role="main" style="width: 240px; display: flex; flex-direction: column; gap: 16px">
    <div role="region"><div id="fc-composer" contenteditable="true" role="textbox" style="height: 32px; border: 1px solid #888"><p><br></p></div></div>
    <div id="fc-plain" contenteditable="plaintext-only" role="textbox" style="height: 32px; border: 1px solid #888"></div>
  </div>
  <div role="dialog" style="width: 476px; display: flex; gap: 16px">
    <input id="fc-dialog" type="text" placeholder="dialog" style="width: 140px; height: 32px">
    <textarea id="fc-area" placeholder="area" style="width: 140px; height: 32px"></textarea>
    <input id="fc-pin" type="tel" maxlength="6" inputmode="numeric" placeholder="pin" style="width: 140px; height: 32px">
  </div>`;
document.body.append(host);
const fields = [...host.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')];
// Messenger's own fields that take typing without anyone seeing it: the
// chat list's search (when signed in; cleared afterwards). Never the message
// box, which tells the other side you're typing.
const messengerSearch = [...document.querySelectorAll('[role="navigation"] input[type="search"]')].find((field) => {
  const box = field.getBoundingClientRect();
  return box.width > 0 && box.right < 340;
});
if (messengerSearch) {
  messengerSearch.id ||= 'messenger-search';
  fields.unshift(messengerSearch);
}
// Signed out (the Windows check runs on a fresh profile): Facebook's own
// login field, typed in but never sent.
const loginField = [...document.querySelectorAll('input[name="email"]')].find((field) => {
  const box = field.getBoundingClientRect();
  return box.width > 0 && box.bottom > 0 && box.top < innerHeight && (box.right < 340 || box.left > 860 || box.top > 420);
});
if (loginField) fields.unshift(loginField);
const idOf = (field) => field.id || field.name;

// What the page does with the clicks and keys, after every listener ran.
const seen = [];
const note = (event) => {
  const id = event.target instanceof Element ? event.target.closest('[id]')?.id ?? event.target.tagName : String(event.target);
  setTimeout(() => {
    if (seen.length < 300) seen.push(`${event.type}${event.key ? `:${event.key}` : ''} ${id}${event.defaultPrevented ? ' PREVENTED' : ''} active=${document.activeElement?.id || document.activeElement?.tagName}`);
  });
};
for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'focusin', 'keydown', 'beforeinput', 'input', 'compositionstart']) {
  window.addEventListener(type, note, true);
}

await pause(500);
say(`window ${innerWidth} ${innerHeight} ${devicePixelRatio} ${navigator.platform} inject=${Boolean(window.__fmessInstalled)}`);
for (const field of fields) {
  const box = field.getBoundingClientRect();
  say(`target ${idOf(field)} ${Math.round(box.left + box.width / 2)} ${Math.round(box.top + box.height / 2)}`);
}
say('ready');

const valueOf = (field) => (field.isContentEditable ? field.textContent : field.value);
const until = Date.now() + 150000;
while (Date.now() < until) {
  if (window.__fmessFieldCheckDone || fields.every((field) => valueOf(field).length >= 2)) break;
  await pause(500);
}
clearInterval(keepChats);
const result = {
  inject: Boolean(window.__fmessInstalled),
  values: Object.fromEntries(fields.map((field) => [idOf(field), valueOf(field)])),
  styles: Object.fromEntries(fields.map((field) => [idOf(field), getComputedStyle(field).userSelect])),
  seen,
};
host.remove();
for (const field of [loginField].filter(Boolean)) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.blur();
}
// On Windows, the Settings window's App name next: field-check.ps1 finds it
// there through UI Automation. (Typing there renames the app, so not on a Mac
// someone uses.)
if (/^Win/.test(navigator.platform)) window.__TAURI_INTERNALS__?.invoke('open_settings').catch(() => {});
if (messengerSearch) {
  // Through the value setter React watches, so Messenger sees it emptied.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(messengerSearch, '');
  messengerSearch.dispatchEvent(new Event('input', { bubbles: true }));
  messengerSearch.blur();
  if (messengerSearch.id === 'messenger-search') messengerSearch.removeAttribute('id');
}
return result;
