  // Context menus for threads and messages: right-clicking opens the 3-dot action menu; a second click keeps the webview menu.
  let activeContextTarget = null;
  let isInvoking = false;
  // Text selected before the right-click keeps the webview's menu (Copy). Not
  // what the click itself selected: WebKit selects the word under a
  // right-click before the menu is asked for, which on macOS kept every
  // message's menu from opening.
  let selectedBeforeRightClick = false;
  document.addEventListener(
    'mousedown',
    (event) => {
      if (event.button === 2 || (event.button === 0 && event.ctrlKey)) selectedBeforeRightClick = Boolean(window.getSelection()?.toString()?.trim());
    },
    { capture: true, passive: true },
  );

  const isContextMenuOpen = () =>
    [...document.querySelectorAll('[role="menu"]:not([data-fmess-ui="reactions"])')].some(
      (menu) => menu.offsetWidth > 0 || menu.getBoundingClientRect?.().width > 0,
    );

  const dismissContextMenu = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
  };

  const threadMenuButton = (row) => row.querySelector('[role="button"][aria-haspopup="menu"]');

  const messageMoreButton = (row) => {
    const buttons = [...row.querySelectorAll('[role="toolbar"] [role="button"]')];
    return (
      buttons.find((btn) => {
        if (btn.getAttribute('aria-haspopup') === 'menu') return true;
        const path = btn.querySelector('svg path')?.getAttribute('d') ?? '';
        return /^M456[,\s]410/i.test(path);
      }) ??
      (buttons.length >= 2 ? buttons.at(-1) : null)
    );
  };

  const waitForMessageMoreButton = (row, ms = 200) =>
    new Promise((resolve) => {
      let btn = messageMoreButton(row);
      if (btn) return resolve(btn);
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
      row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true, view: window }));
      const start = Date.now();
      const step = () => {
        btn = messageMoreButton(row);
        if (btn) return resolve(btn);
        if (Date.now() - start >= ms) return resolve(null);
        setTimeout(step, 20);
      };
      setTimeout(step, 20);
    });

  const invokeMenuButton = (btn) => {
    isInvoking = true;
    try {
      btn.click();
    } finally {
      isInvoking = false;
    }
  };

  document.addEventListener(
    'contextmenu',
    (event) => {
      if (!onChatsPage() || document.documentElement.hasAttribute('data-fmess-resizing')) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('input, textarea, [contenteditable="true"]')) return;
      if (selectedBeforeRightClick) return;

      // 1. Sidebar conversation thread row (#56)
      const threadRow = event.target.closest(`[${LIST_PANE}] [role="row"], [role="navigation"] [role="grid"] [role="row"]`);
      if (threadRow) {
        if (activeContextTarget === threadRow && isContextMenuOpen()) {
          activeContextTarget = null;
          dismissContextMenu();
          return;
        }
        const btn = threadMenuButton(threadRow);
        if (btn) {
          event.preventDefault();
          activeContextTarget = threadRow;
          invokeMenuButton(btn);
          return;
        }
      }

      // 2. Chat message bubble (#57). Links, photos and videos keep the
      // webview's menu (Copy Link, Copy Image; see the paste in 10-selection).
      if (event.target.closest('a[href], img, video, svg image')) return;
      const messageRow = event.target.closest('[role="main"] [data-scope="messages_table"], [role="main"] [data-message-id]');
      if (messageRow && !event.target.closest('[data-scope="date_break"], [data-fmess-ui="composer"], [data-fmess-ui="chat-header"], [data-fmess-ui="details"]')) {
        if (activeContextTarget === messageRow && isContextMenuOpen()) {
          activeContextTarget = null;
          dismissContextMenu();
          return;
        }
        event.preventDefault();
        // The word the right-click selected (above).
        window.getSelection()?.removeAllRanges();
        activeContextTarget = messageRow;
        waitForMessageMoreButton(messageRow).then((btn) => {
          if (btn) invokeMenuButton(btn);
          else if (activeContextTarget === messageRow) activeContextTarget = null;
        });
      }
    },
    true,
  );

  document.addEventListener(
    'click',
    (event) => {
      if (!isInvoking && event.isTrusted !== false) activeContextTarget = null;
    },
    { capture: true, passive: true },
  );
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') activeContextTarget = null; }, { capture: true, passive: true });
  window.addEventListener('popstate', () => { activeContextTarget = null; }, { passive: true });
