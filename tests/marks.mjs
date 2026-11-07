// The data-fmess-ui marks themes style (09-marks.js) on a small fake of
// Messenger's chat, shaped like the real one: the message box, then a
// message being edited (Facebook's edit box has no region of its own, and
// the nearest region holds the whole chat), then the message box again.
// `node tests/marks.mjs`
import { readFileSync } from 'node:fs';

const part = readFileSync(new URL('../src-tauri/src/inject/09-marks.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Selectors as the part uses them: tags, [name] and [name="value"],
// joined by spaces (descendants).
const compound = (text) => {
  const tag = text.match(/^[a-z0-9]+/i)?.[0]?.toUpperCase() ?? null;
  const attrs = [...text.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map(([, name, value]) => [name, value]);
  return (el) => (!tag || el.tagName === tag) && attrs.every(([name, value]) => (value === undefined ? name in el.attrs : el.attrs[name] === value));
};
class El {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    for (const child of children) this.append(child);
  }
  append(child) {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = null;
  }
  getAttribute(name) {
    return name in this.attrs ? this.attrs[name] : null;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
  removeAttribute(name) {
    delete this.attrs[name];
  }
  hasAttribute(name) {
    return name in this.attrs;
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }
  get previousElementSibling() {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) - 1] ?? null;
  }
  get isConnected() {
    return true;
  }
  contains(other) {
    for (let el = other; el; el = el.parentElement) if (el === this) return true;
    return false;
  }
  *descendants() {
    for (const child of this.children) {
      yield child;
      yield* child.descendants();
    }
  }
  matches(selector) {
    const parts = selector.trim().split(/\s+(?![^[]*\])/).map(compound);
    if (!parts.at(-1)(this)) return false;
    let at = parts.length - 2;
    for (let el = this.parentElement; el && at >= 0; el = el.parentElement) if (parts[at](el)) at--;
    return at < 0;
  }
  querySelectorAll(selector) {
    return [...this.descendants()].filter((el) => el.matches(selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector) {
    for (let el = this; el; el = el.parentElement) if (el.matches(selector)) return el;
    return null;
  }
  getBoundingClientRect() {
    return { top: 0 };
  }
}
const div = (attrs, ...children) => new El('div', attrs, children);
const icon = (d) => new El('svg', {}, [new El('path', { d })]);
const button = (d, attrs = {}) => div({ role: 'button', ...attrs }, icon(d));
const textbox = () => div({ role: 'textbox', contenteditable: 'true' });

const markUi = new Function(
  'document',
  'Element',
  'requestAnimationFrame',
  `${part}\nreturn markUi;`,
)({ querySelectorAll: () => [], addEventListener: () => {} }, El, () => 0);

// The chat: a header (calls, info), the messages, and below them the box.
function chat() {
  const info = button('M1', { 'aria-expanded': 'false' });
  const header = div({}, div({}, button('M2'), button('M3'), info));
  const log = div({ role: 'log' }, div({}, div({}, button('M4'))));
  const bottom = div({});
  const thread = div({}, header, div({}, div({ 'data-mw-file-dropzone': 'true' }, div({}, log), bottom)));
  const main = div({ role: 'main' }, div({}, new El('h3', { id: 'r1' }), div({ role: 'region', 'aria-labelledby': 'r1' }, thread)));
  return { main, log, header, bottom, outer: main.querySelector('[role="region"]') };
}
// Messenger's message box: tools, the field (text and emoji), and like.
function composer() {
  const attach = button('M7 4.25a1.25 1.25 0 1 1-2.5 0');
  const emoji = button('M210.5,405 C209.121');
  const like = button('M16,9.1c');
  const box = textbox();
  const region = div(
    { role: 'region', 'aria-label': 'Thread composer' },
    div({}, new El('span', {}, [attach])),
    div({}, div({}, box), new El('span', {}, [emoji])),
    new El('span', {}, [like]),
  );
  return { region, attach, emoji, like, box };
}
// Facebook's edit box, as on 2026-11-06: a bar (title, cancel) and the box
// (the field with the text and emoji, then ✓).
function editBox() {
  const cancel = button('m98.095 917.155 7.75 7.75');
  const emoji = button('M458.25 1079.25a1.001 1.001 0 0 1 0-2');
  const done = button('m459.3 1078.26-3.718 4', { 'aria-disabled': 'true' });
  const box = textbox();
  const field = div({}, div({}, box), div({}, new El('span', {}, [div({}, emoji)])));
  const row = div({}, div({}, field), div({}, new El('span', {}, [div({}, done)])));
  const bar = div({}, div({}, new El('h3', {}, [new El('span')])), div({}, new El('span', {}, [cancel])));
  const panel = div({}, bar, div({}, row));
  return { panel, bar, box: panel.children[1], field, cancel, emoji, done };
}

const results = [];
const check = (name, ok, detail) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(detail)}`}`);
const ui = (el) => el.getAttribute('data-fmess-ui');
const marked = (main, name) => main.querySelectorAll(`[data-fmess-ui="${name}"]`);

const c = chat();
const normal = composer();
c.bottom.append(div({}, normal.region));
markUi(c.main, null, c.log, null);
check('the message box is the composer', ui(normal.region) === 'composer' && marked(c.main, 'composer').length === 1, marked(c.main, 'composer').length);
check('its buttons are marked', ui(normal.attach) === 'attach' && ui(normal.emoji) === 'emoji' && ui(normal.like) === 'like');
check('the header is marked', ui(c.header) === 'chat-header' && marked(c.main, 'info').length === 1);

// Editing: Facebook swaps the box for its edit box.
normal.region.parentElement.remove();
const edit = editBox();
c.bottom.append(div({}, edit.panel));
markUi(c.main, null, c.log, null);
check('editing: the region around the whole chat is not the composer', ui(c.outer) === null && marked(c.main, 'composer').length === 0, ui(c.outer));
check('editing: no button in the chat gets a message box mark', ['more-actions', 'send', 'like', 'emoji', 'attach'].every((name) => marked(c.main, name).length === 0));
check('editing: the header keeps its marks', ui(c.header) === 'chat-header' && marked(c.main, 'info').length === 1);
check(
  'editing: the edit box and its parts are marked',
  ui(edit.panel) === 'edit-composer' && ui(edit.bar) === 'edit-bar' && ui(edit.box) === 'edit-box' && ui(edit.field) === 'edit-field',
  [ui(edit.panel), ui(edit.bar), ui(edit.box), ui(edit.field)],
);
check('editing: cancel, emoji and ✓', ui(edit.cancel) === 'edit-cancel' && ui(edit.emoji) === 'edit-emoji' && ui(edit.done) === 'edit-done', [
  ui(edit.cancel),
  ui(edit.emoji),
  ui(edit.done),
]);

// Done editing: the message box comes back. The edit box's text goes; its
// shell stays here, as Facebook may keep an element for later.
edit.field.children[0].remove();
const again = composer();
c.bottom.append(div({}, again.region));
markUi(c.main, null, c.log, null);
check('after editing: the message box is the composer again', ui(again.region) === 'composer' && marked(c.main, 'composer').length === 1);
check('after editing: no edit marks are left', [...c.main.descendants()].every((el) => !String(ui(el)).startsWith('edit-')));
check('after editing: the edit box left in the chat loses its marks', ui(edit.panel) === null && ui(edit.done) === null);

// Marks left by fMess 0.1.34, which marked the whole chat while editing.
{
  const old = chat();
  const box = composer();
  old.bottom.append(div({}, box.region));
  old.outer.setAttribute('data-fmess-ui', 'composer');
  old.outer.previousElementSibling.setAttribute('data-fmess-ui', 'composer-bar');
  const stray = old.log.querySelector('[role="button"]');
  stray.setAttribute('data-fmess-ui', 'more-actions');
  markUi(old.main, null, old.log, null);
  check('a composer mark on the whole chat is taken off', ui(old.outer) === null && ui(old.outer.previousElementSibling) === null);
  check('a message box mark on a message button is taken off', ui(stray) === null);
  check('the real message box is still the composer', ui(box.region) === 'composer');
}

// Recording a voice clip: a bar (stop, the clip's progress and its timer)
// comes before the field, which stays, hidden; send is on, and cancel comes
// after send's span.
{
  const rec = chat();
  const stop = div({ role: 'button' }, new El('svg', {}, [new El('rect')]));
  const bar = div({}, stop, div({ role: 'slider' }), div({ role: 'timer' }));
  const send = button('M16.6915026,12.4744748');
  const cancel = button('M8 .5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z');
  const region = div(
    { role: 'region', 'aria-label': 'Thread composer' },
    div({}, new El('span', {}, [button('M7 4.25a1.25 1.25 0 1 1-2.5 0')])),
    bar,
    div({}, div({}, textbox())),
    new El('span', {}, [send]),
    div({}, new El('span', {}, [cancel])),
  );
  rec.bottom.append(div({}, region));
  markUi(rec.main, null, rec.log, null);
  check('recording: the bar is record-bar', ui(bar) === 'record-bar' && marked(rec.main, 'record-bar').length === 1, ui(bar));
  check('recording: stop, send and cancel', ui(stop) === 'record-stop' && ui(send) === 'send' && ui(cancel) === 'record-cancel', [ui(stop), ui(send), ui(cancel)]);
  // Done: the timer goes, and Facebook may keep the bar's box.
  bar.children.at(-1).remove();
  markUi(rec.main, null, rec.log, null);
  check('after recording: the box left behind is not record-bar', ui(bar) === null, ui(bar));
}

console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) process.exit(1);
