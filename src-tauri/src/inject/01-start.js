// fMess: keeps the window on Messenger chats, hides Facebook's top bar there,
// and hands web notifications to the OS notification center.
// Runs at document start, before the page's scripts.
(() => {
  if (window.top !== window || window.__fmessInstalled) return;
  window.__fmessInstalled = true;

  // The browser's own timers, for every part of this script. Facebook swaps
  // window.setInterval and its kin for its scheduler's once its scripts load,
  // and that clearInterval doesn't know a timer made before: one started as
  // the page loaded never stopped. After a reload at a chat, the one that
  // puts the cursor in the message box (06-routes) went on doing so every
  // 50 ms, so no other field could be typed in and no text selected until
  // fMess was quit (#51).
  const setTimeout = window.setTimeout.bind(window);
  const clearTimeout = window.clearTimeout.bind(window);
  const setInterval = window.setInterval.bind(window);
  const clearInterval = window.clearInterval.bind(window);

  // SharedWorker breaks in WebView2 across page reloads (Edge issue #4852),
  // leaving chats on an infinite spinner. Suppressing it forces Messenger's
  // worker (MAWSetupWorker) into its dedicated Worker fallback. Windows only:
  // WebKit's reloads are fine with it (tests/app/live-check.sh).
  if (/^Win/.test(navigator.platform)) {
    try {
      Object.defineProperty(window, 'SharedWorker', { value: undefined, configurable: false, writable: false });
    } catch {}
  }

  // Debug builds (window.__fmessDebug, see webview.rs): note who adds wheel,
  // touch and scroll listeners and whether they can cancel scrolling, for
  // probes (window.__fmessListenerLog). A wheel listener that isn't passive
  // makes WebKit hold the first event of every scroll gesture until the page
  // has run it.
  if (window.__fmessDebug) {
    const listenerLog = (window.__fmessListenerLog = []);
    const WATCHED = new Set(['wheel', 'mousewheel', 'touchstart', 'touchmove', 'scroll']);
    const describe = (target) => {
      if (target === window) return 'window';
      if (target === document) return 'document';
      if (!(target instanceof Element)) return String(target);
      const role = target.getAttribute('role');
      return `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}${role ? `[role=${role}]` : ''}`;
    };
    const nativeAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (WATCHED.has(type) && listenerLog.length < 500) {
        listenerLog.push({
          type,
          target: describe(this),
          passive: typeof options === 'object' && options !== null && 'passive' in options ? Boolean(options.passive) : null,
          capture: typeof options === 'boolean' ? options : Boolean(options?.capture),
          at: Math.round(performance.now()),
          stack: (new Error().stack || '').split('\n').slice(1, 4).join(' | ').slice(0, 300),
        });
      }
      return nativeAdd.call(this, type, listener, options);
    };

    // The page's errors, printed by probe.rs. Query strings and URL fragments
    // are cut, as they can carry tokens, and objects show only their type, as
    // they can hold names or message text.
    const errors = (window.__fmessErrors = []);
    const show = (part) => {
      if (part instanceof Error) return `${part.name}: ${part.message}`;
      if (typeof part === 'function') return '[function]';
      if (part === null || typeof part !== 'object') return String(part);
      try {
        return `[${part.constructor?.name || 'object'}]`;
      } catch {
        return '[object]';
      }
    };
    const note = (kind, parts) => {
      if (errors.length >= 200) return;
      const text = parts
        .map(show)
        .join(' ')
        .replace(/\?[^\s"')]*/g, '?…')
        .replace(/(\S)#[^\s"')]*/g, '$1#…')
        .slice(0, 500);
      errors.push(`${kind} ${text}`);
    };
    window.addEventListener('error', (event) => {
      const where = event.filename ? `(${event.filename}:${event.lineno})` : '';
      note('error', [event.error ?? event.message, where]);
    });
    window.addEventListener('unhandledrejection', (event) => note('unhandledrejection', [event.reason]));
    const nativeError = console.error;
    console.error = function (...args) {
      note('console.error', args);
      return nativeError.apply(this, args);
    };

    // The page's WebSockets, for live checks (tests/app/live-check.sh): where
    // to (host and path only), when each opened and closed, and when it last
    // got and sent a frame. Messenger's own way to see a dead connection.
    const sockets = (window.__fmessSockets = []);
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args, newTarget) {
        const socket = Reflect.construct(target, args, newTarget);
        let where = String(args[0]);
        try {
          const url = new URL(where);
          where = `${url.host}${url.pathname}`;
        } catch {}
        const entry = { where, created: Date.now(), opened: null, closed: null, code: null, lastIn: null, ins: 0, lastOut: null, outs: 0 };
        if (sockets.length >= 200) sockets.shift();
        sockets.push(entry);
        socket.__fmessEntry = entry;
        socket.addEventListener('open', () => (entry.opened = Date.now()));
        socket.addEventListener('message', () => {
          entry.lastIn = Date.now();
          entry.ins += 1;
        });
        socket.addEventListener('close', (event) => {
          entry.closed = Date.now();
          entry.code = event.code;
        });
        return socket;
      },
    });
    const nativeSocketSend = NativeWebSocket.prototype.send;
    NativeWebSocket.prototype.send = function (data) {
      const entry = this.__fmessEntry;
      if (entry) {
        entry.lastOut = Date.now();
        entry.outs += 1;
      }
      return nativeSocketSend.call(this, data);
    };
  }

  // WebView2 (Windows) runs this before the page has its <html> element;
  // WebKit already has one. What needs it waits for it.
  const withRoot = (use) => {
    if (document.documentElement) return use(document.documentElement);
    const wait = new MutationObserver(() => {
      if (!document.documentElement) return;
      wait.disconnect();
      use(document.documentElement);
    });
    wait.observe(document, { childList: true });
  };

