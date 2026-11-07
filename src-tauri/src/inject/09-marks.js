  // Marks for themes that don't depend on the language. Facebook translates
  // its aria-labels (a Vietnamese Facebook says "Tìm kiếm", not "Search"), so
  // a theme that only matched them worked in English. fMess marks the parts
  // themes style with data-fmess-ui, found by where they are and by their
  // icons: composer (the message box) and in it voice-clip, attach, sticker,
  // gif, more-actions (any other button there), emoji, like and send, and
  // while recording a voice clip record-bar (the clip's timer, its progress
  // and record-stop, then record-play) and record-cancel; while a message is
  // edited, edit-composer in its place and in it edit-bar
  // ("Edit message" and edit-cancel), edit-box with edit-field (the box and
  // edit-emoji) and edit-done (✓, which saves);
  // chat-header and in it audio-call, video-call and info (which shows the
  // details); details; list-menu (⋯ above the chat list); reactions (the
  // reaction picker) and in it more-emojis.
  const UI = 'data-fmess-ui';
  // The start of the path each icon begins with.
  const COMPOSER_ICONS = [
    ['M102 926.75 102 929', 'voice-clip'],
    ['M8 .5A3.5 3.5 0 0 0 4.5 4', 'voice-clip'],
    ['M7 4.25a1.25 1.25 0 1 1-2.5 0', 'attach'],
    ['M8.305 1h-.61c-1.368', 'sticker'],
    ['M7.695 1h.61c1.367', 'gif'],
    // While recording a voice clip: cancel, and send (stop has no path).
    ['M8 .5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z', 'record-cancel'],
    ['M16.6915026,12.4744748', 'send'],
    // The replay of a recorded clip (the pause icon appears once it plays).
    ['M10 25.5v-15a1.5 1.5 0 012.17-1.34l15 7.5a1.5', 'record-play'],
    ['M99.825 918.322', 'attach'],
    ['M106.617 923.049', 'sticker'],
    ['M460.25 1079a', 'gif'],
    ['M210.5,405 C209.121', 'emoji'],
  ];
  // Messenger's own like button, a thumbs-up (a chat's own one is an emoji picture).
  const THUMBS_UP = 'M16,9.1c';
  const mark = (el, name) => {
    if (el && el.getAttribute(UI) !== name) el.setAttribute(UI, name);
  };
  const markComposer = (composer) => {
    mark(composer, 'composer');
    // The bar above the box while replying, or with a link's preview.
    mark(composer.previousElementSibling, 'composer-bar');
    const field = [...composer.children].find((child) => child.querySelector('[role="textbox"]'));
    const buttons = [...composer.querySelectorAll('[role="button"]')];
    const pathOf = (button) => button.querySelector('svg path')?.getAttribute('d') ?? '';
    // Recording a voice clip, or replaying it: the cancel button is there, and
    // so is a play button that becomes pause (its icon is not listed).
    const recording = buttons.some((button) => pathOf(button).startsWith('M8 .5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z'));
    // While recording, a bar with the clip's timer takes the field's place
    // (not the last span, which holds send).
    const tail = [...composer.children].findLast((child) => child.tagName === 'SPAN');
    for (const child of composer.children) {
      if (child !== tail && child.querySelector('[role="timer"]')) mark(child, 'record-bar');
      else if (child.getAttribute(UI) === 'record-bar') child.removeAttribute(UI);
    }
    for (const button of buttons) {
      const path = pathOf(button);
      const icon = COMPOSER_ICONS.find(([start]) => path.startsWith(start))?.[1];
      // The last part holds the like button, or send once there is text.
      const end = composer.lastElementChild?.tagName === 'SPAN' && composer.lastElementChild.contains(button);
      const like = button.querySelector('img') || path.startsWith(THUMBS_UP);
      if (icon) mark(button, icon);
      else if (!path && button.querySelector('svg')) mark(button, 'record-stop');
      else if (end) mark(button, like ? 'like' : 'send');
      else if (recording && !field?.contains(button)) mark(button, 'record-play');
      else if (!field?.contains(button)) mark(button, 'more-actions');
    }
  };
  // The marks markComposer gives: they belong to the message box only.
  const COMPOSER_MARKS = new Set([
    'composer',
    'composer-bar',
    ...COMPOSER_ICONS.map(([, name]) => name),
    'record-stop',
    'record-bar',
    'like',
    'send',
    'more-actions',
  ]);
  const EDIT_MARKS = new Set(['edit-composer', 'edit-bar', 'edit-cancel', 'edit-box', 'edit-field', 'edit-emoji', 'edit-done']);
  // The lowest box around el, inside the chat, with a button that isn't in el.
  const aroundWithButton = (el, log) => {
    for (let box = el.parentElement; box && !box.contains(log); box = box.parentElement) {
      for (const button of box.querySelectorAll('[role="button"]')) if (!el.contains(button)) return box;
    }
    return null;
  };
  // Editing a message: Facebook's box for the edit has no region, and is
  // made of two rows, a bar (the title and a cancel button) and the box: the
  // field (the text and an emoji button) and ✓ beside it. Found from the text
  // outwards, each step the next box with another button in it.
  const markEdit = (textbox, log) => {
    if (!log) return null;
    const field = aroundWithButton(textbox, log);
    const row = field && aroundWithButton(field, log);
    const panel = row && aroundWithButton(row, log);
    if (!panel || panel.children.length !== 2) return null;
    const box = [...panel.children].find((child) => child.contains(row));
    const bar = [...panel.children].find((child) => child !== box);
    mark(panel, 'edit-composer');
    mark(bar, 'edit-bar');
    mark(box, 'edit-box');
    mark(field, 'edit-field');
    for (const button of panel.querySelectorAll('[role="button"]')) {
      mark(button, field.contains(button) ? 'edit-emoji' : box.contains(button) ? 'edit-done' : 'edit-cancel');
    }
    return panel;
  };
  // Marks of a message box that is gone, or of what wasn't one: Facebook
  // keeps elements across chats and edits, and a mark left on them keeps a
  // theme's look for the box (a pill, a hidden button) where it doesn't belong.
  const unmarkOldComposer = (main, composer, edit) => {
    for (const el of main?.querySelectorAll(`[${UI}]`) ?? []) {
      const name = el.getAttribute(UI);
      let kept = true;
      if (EDIT_MARKS.has(name)) kept = Boolean(edit?.contains(el));
      else if (name === 'composer') kept = el === composer;
      else if (name === 'composer-bar') kept = el === composer?.previousElementSibling;
      else if (COMPOSER_MARKS.has(name)) kept = Boolean(composer?.contains(el));
      if (!kept) el.removeAttribute(UI);
    }
  };
  let markedInfo = null;
  function markUi(main, list, log, details) {
    // The box's own region. While a message is edited, Facebook's box for the
    // edit has none, and the nearest region holds the whole chat: marked as
    // the composer, it took the themes' rules for the box (margins, centred
    // like a pill) and the chat shrank to a narrow column in the middle.
    const textbox = main?.querySelector('[role="textbox"][contenteditable="true"]');
    const region = textbox?.closest('[role="region"]');
    const composer = region && !region.contains(log) ? region : null;
    if (composer) markComposer(composer);
    const edit = textbox && !composer ? markEdit(textbox, log) : null;
    unmarkOldComposer(main, composer, edit);
    mark(details, 'details');
    mark(list?.querySelector('[role="button"][aria-haspopup="menu"]:not([role="grid"] *)'), 'list-menu');
    // The header's button with aria-expanded opens the details; the calls are
    // the two buttons before it on the same line.
    if (log && !(markedInfo?.isConnected && main.contains(markedInfo))) {
      const info = [...main.querySelectorAll('[role="button"][aria-expanded]')].find(
        (button) => !log.contains(button) && !composer?.contains(button) && !details?.contains(button),
      );
      if (info) {
        markedInfo = info;
        mark(info, 'info');
        let header = info;
        while (header.parentElement && !header.parentElement.contains(log)) header = header.parentElement;
        mark(header, 'chat-header');
        const buttons = [...header.querySelectorAll('[role="button"]')];
        const top = info.getBoundingClientRect().top;
        const calls = buttons
          .slice(0, buttons.indexOf(info))
          .filter((button) => button.querySelector('svg') && Math.abs(button.getBoundingClientRect().top - top) < 8)
          .slice(-2);
        if (calls.length === 2) {
          mark(calls[0], 'audio-call');
          mark(calls[1], 'video-call');
        }
      }
    }
    markReactions();
  }
  // The picker is opened by a click and lives outside the chat.
  function markReactions() {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (!menu.querySelector('[role="menuitemradio"] img[alt]')) continue;
      mark(menu, 'reactions');
      mark(menu.querySelector('[role="button"]'), 'more-emojis');
    }
  }
  // Typing turns the like button into send.
  let typedFrame = 0;
  document.addEventListener(
    'input',
    (event) => {
      const composer = event.target instanceof Element && event.target.closest(`[${UI}="composer"]`);
      if (composer) typedFrame ||= requestAnimationFrame(() => ((typedFrame = 0), markComposer(composer)));
    },
    { capture: true, passive: true },
  );

