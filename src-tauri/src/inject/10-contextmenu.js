  // Right-clicking a conversation in the sidebar opens its 3-dot action menu; a second right-click keeps the webview menu.
  let activeThreadRow = null;
  let isInvoking = false;

  const isThreadMenuOpen = () =>
    [...document.querySelectorAll('[role="menu"]:not([data-fmess-ui="reactions"])')].some(
      (menu) => menu.offsetWidth > 0 || menu.getBoundingClientRect?.().width > 0,
    );

  const dismissThreadMenu = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
  };

  const threadMenuButton = (row) => row.querySelector('[role="button"][aria-haspopup="menu"]');

  const invokeThreadButton = (btn) => {
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
      if (window.getSelection()?.toString()?.trim()?.length > 0) return;

      const threadRow = event.target.closest(`[${LIST_PANE}] [role="row"], [role="navigation"] [role="grid"] [role="row"]`);
      if (!threadRow) return;

      if (activeThreadRow === threadRow && isThreadMenuOpen()) {
        activeThreadRow = null;
        dismissThreadMenu();
        return;
      }

      const btn = threadMenuButton(threadRow);
      if (btn) {
        event.preventDefault();
        activeThreadRow = threadRow;
        invokeThreadButton(btn);
      }
    },
    true,
  );

  document.addEventListener(
    'click',
    (event) => {
      if (!isInvoking && event.isTrusted !== false) activeThreadRow = null;
    },
    { capture: true, passive: true },
  );
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') activeThreadRow = null; }, { capture: true, passive: true });
  window.addEventListener('popstate', () => { activeThreadRow = null; }, { passive: true });
