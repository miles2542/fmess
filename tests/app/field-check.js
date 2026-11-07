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

const host = document.createElement('div');
host.id = 'fmess-field-check';
host.style.cssText =
  'position: fixed; left: 0; top: 0; width: 860px; height: 420px; z-index: 2147480000; background: #fff; color: #000;' +
  'display: flex; gap: 16px; padding: 60px 20px 20px; box-sizing: border-box; font: 14px sans-serif;';
host.innerHTML = `
  <div role="navigation" style="width: 240px">
    <input id="fc-search" type="search" role="combobox" placeholder="search" autocomplete="off" spellcheck="false" style="width: 220px; height: 32px">
  </div>
  <div role="main" style="flex: 1; display: flex; flex-direction: column; gap: 16px">
    <input id="fc-text" type="text" placeholder="text" style="height: 32px">
    <div role="region"><div id="fc-composer" contenteditable="true" role="textbox" style="height: 40px; border: 1px solid #888"><p><br></p></div></div>
  </div>
  <div role="dialog" style="width: 240px; display: flex; flex-direction: column; gap: 16px">
    <input id="fc-dialog" type="text" placeholder="dialog" style="height: 32px">
    <textarea id="fc-area" placeholder="area" style="height: 40px"></textarea>
    <input id="fc-pin" type="tel" maxlength="6" inputmode="numeric" placeholder="pin" style="height: 32px">
  </div>`;
document.body.append(host);
const fields = [...host.querySelectorAll('input, textarea, [contenteditable="true"]')];

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
  say(`target ${field.id} ${Math.round(box.left + box.width / 2)} ${Math.round(box.top + box.height / 2)}`);
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
  values: Object.fromEntries(fields.map((field) => [field.id, valueOf(field)])),
  styles: Object.fromEntries(fields.map((field) => [field.id, getComputedStyle(field).userSelect])),
  seen,
};
host.remove();
return result;
