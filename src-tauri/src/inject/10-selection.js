  // Only text in the chat (messages, the pinned message, the details), in
  // dialogs and in the fields can be selected, as in a native app; the chat
  // list can't. (Only messages could at first, which kept the pinned
  // message's text, an address say, from being copied.)
  // A double or triple click selects a whole message and the break after it,
  // and WebKit then fills the space under its last line down to the edge of
  // the bubble, or across the chat; it fills only what can be selected
  // (Facebook marks every layer selectable, and wraps messages in more of
  // them now and then: the rule used to cover [data-message-id] only, then
  // rows gained a full-width role="article" around it). And Select All (⌘A)
  // outside a field selected the whole page: the chat list, the tabs, the
  // header, the details, all in bands.
  const selectStyle = document.createElement('style');
  selectStyle.textContent = `
    html[${CHATS}] body,
    html[${CHATS}] body * { -webkit-user-select: none !important; user-select: none !important; }
    html[${CHATS}] :is([role="main"], [role="dialog"]) [dir="auto"],
    html[${CHATS}] :is([role="main"], [role="dialog"]) [dir="auto"] *,
    html[${CHATS}] :is(input, textarea, [contenteditable="true"], [contenteditable="true"] *) {
      -webkit-user-select: text !important;
      user-select: text !important;
    }
  `;
  withRoot((root) => root.append(selectStyle));
  // Select All outside a field would select every bit of that text, from the
  // header down to the details; there it selects nothing, as in a native app.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.code !== 'KeyA' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (!document.documentElement.hasAttribute(CHATS)) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
    },
    true,
  );
  // Spell check (fMess Settings). It knows only the system's languages, so on
  // a Windows set up in English nearly every Vietnamese word was underlined
  // in red; turned off, fields don't check spelling. Fields are turned off as
  // they take the focus, so a message box Facebook draws again is too.
  let spellCheck = settings.spellCheck !== false;
  const UNCHECKED = 'data-fmess-unchecked';
  const FIELDS = 'input, textarea, [contenteditable="true"]';
  const uncheck = (field) => {
    if (!field?.spellcheck) return;
    field.spellcheck = false;
    field.setAttribute(UNCHECKED, '');
  };
  document.addEventListener(
    'focusin',
    (event) => !spellCheck && event.target instanceof Element && uncheck(event.target.closest(FIELDS)),
    true,
  );
  function setSpellCheck(on) {
    spellCheck = on;
    if (!on) return uncheck(document.activeElement?.closest?.(FIELDS));
    for (const field of document.querySelectorAll(`[${UNCHECKED}]`)) {
      field.removeAttribute(UNCHECKED);
      field.spellcheck = true;
    }
  }
  // Copy Image in WebKit's menu leaves the picture along with its address, as
  // text and as an <img> in HTML, and Messenger's box then took the address
  // instead of the picture. Such a paste reaches Messenger with the picture
  // alone, as from Chrome; other pastes are left as they are.
  const repasted = new WeakSet();
  const onlyItsAddress = (data) => {
    const text = data.getData('text/plain').trim();
    const html = data.getData('text/html');
    if (!text && !html) return false;
    if (text && !/^(https?|blob|data):\S+$/.test(text)) return false;
    if (!html) return true;
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    return !body.textContent.trim() && body.querySelector('img') !== null;
  };
  document.addEventListener(
    'paste',
    (event) => {
      const data = event.clipboardData;
      if (repasted.has(event) || !data?.files.length || !(event.target instanceof Element) || !event.target.closest(FIELDS)) return;
      if (![...data.files].every((file) => file.type.startsWith('image/')) || !onlyItsAddress(data)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pictures = new DataTransfer();
      for (const file of data.files) pictures.items.add(file);
      const again = new ClipboardEvent('paste', { clipboardData: pictures, bubbles: true, cancelable: true });
      repasted.add(again);
      event.target.dispatchEvent(again);
    },
    true,
  );
  if (titleBarInset) {
    const dragStrip = document.createElement('div');
    dragStrip.setAttribute('data-tauri-drag-region', '');
    dragStrip.style.cssText = `position: fixed; inset: 0 0 auto 0; height: ${inset}; z-index: 2147483647;`;
    withRoot((root) => root.append(dragStrip));
  }
  // Double-clicking empty space in a message row initiates a reply to that
  // message, as in Zalo PC. Double-clicking text selects words as usual.
  const isReplyButton = (button) => {
    if (!(button instanceof Element) || button.getAttribute('role') !== 'button') return false;
    const d = button.querySelector('svg path')?.getAttribute('d') ?? '';
    return /^m101 936\.5c/i.test(d) || /reply|trả lời/i.test(button.getAttribute('aria-label') ?? '');
  };
  const findReplyButton = (row) => {
    const buttons = [...row.querySelectorAll('[role="toolbar"] [role="button"]:not(.fmess-quick-reaction)')];
    return buttons.find(isReplyButton) ?? (buttons.length === 3 ? buttons[1] : null);
  };
  const waitReplyButton = (row, ms = 400) =>
    new Promise((resolve) => {
      const immediate = findReplyButton(row);
      if (immediate) return resolve(immediate);
      let timer = null;
      let observer = null;
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => {
          const found = findReplyButton(row);
          if (found) {
            clearTimeout(timer);
            observer.disconnect();
            resolve(found);
          }
        });
        observer.observe(row, { childList: true, subtree: true });
      }
      timer = setTimeout(() => {
        if (observer) observer.disconnect();
        resolve(findReplyButton(row));
      }, ms);
    });
  const findMessageRow = (target) => {
    if (!(target instanceof Element) || !target.closest('[role="main"]')) return null;
    if (target.closest('[data-fmess-ui="composer"], [data-fmess-ui="composer-bar"], [data-fmess-ui="details"], [data-fmess-ui="chat-header"], [role="navigation"]')) return null;
    const row = target.closest('[data-scope="messages_table"], [role="log"] [role="article"], [role="row"]');
    if (!row || row.matches('[data-scope="date_break"]') || row.querySelector('[data-scope="date_break"]')) return null;
    if (!row.matches('[data-message-id]') && !row.querySelector('[data-message-id]')) return null;
    return row;
  };
  const isContentTarget = (target) =>
    target instanceof Element &&
    Boolean(
      target.closest(
        'a[href], button, [role="button"], img, video, audio, blockquote, [role="toolbar"], [dir="auto"], [data-scope="date_break"], input, textarea, [contenteditable="true"]',
      ),
    );
  const isEmptySpaceClick = (row, x, y) => {
    const rowRect = row.getBoundingClientRect();
    if (y < rowRect.top || y > rowRect.bottom || x < rowRect.left || x > rowRect.right) return false;
    const interactive = row.querySelectorAll('[role="button"], [role="toolbar"]');
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return false;
    }
    const messageTargets = (row.matches('[data-message-id]') ? [row] : []).concat([
      ...row.querySelectorAll('[data-message-id], [dir="auto"], blockquote, img, video, audio'),
    ]);
    const contentRects = [];
    for (const el of messageTargets) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.width < rowRect.width * 0.95) {
        contentRects.push(rect);
      }
    }
    if (!contentRects.length) return false;
    for (const rect of contentRects) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return false;
    }
    let contentLeft = Infinity;
    let contentRight = -Infinity;
    for (const rect of contentRects) {
      if (rect.left < contentLeft) contentLeft = rect.left;
      if (rect.right > contentRight) contentRight = rect.right;
    }
    const rowMid = (rowRect.left + rowRect.right) / 2;
    const contentMid = (contentLeft + contentRight) / 2;
    return contentMid > rowMid ? x < contentLeft : x > contentRight;
  };
  const triggerReply = async (row) => {
    let button = findReplyButton(row);
    if (!button) {
      const target = row.querySelector('[data-message-id]') ?? row;
      const mouseEvent =
        typeof MouseEvent !== 'undefined'
          ? new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window })
          : { type: 'mouseover' };
      target.dispatchEvent(mouseEvent);
      button = await waitReplyButton(row, 400);
    }
    if (button) {
      button.click();
      row.closest('[role="main"]')?.querySelector('[role="textbox"][contenteditable="true"]')?.focus();
      return true;
    }
    return false;
  };
  document.addEventListener(
    'dblclick',
    (event) => {
      if (!document.documentElement.hasAttribute(CHATS)) return;
      if (isContentTarget(event.target)) return;
      const row = findMessageRow(event.target);
      if (!row || !isEmptySpaceClick(row, event.clientX, event.clientY)) return;
      event.preventDefault();
      window.getSelection?.()?.removeAllRanges?.();
      triggerReply(row).catch(() => {});
    },
    true,
  );


