  // Privacy (fMess Settings): don't let people see that you're typing.
  //
  // Messenger sends requests over the /ws/lightspeed WebSocket. A frame holds
  // parts: a type byte and a 2-byte stream id, then, except in the part that
  // closes a stream (0x0e), a 3-byte length and that many bytes; all little
  // endian. Each request has a stream of its own, and its data part (0x0d) is
  // two flag bytes and the request as JSON, nesting more JSON in strings.
  // Requests are edited rather than dropped, so every stream still gets its
  // answer and nothing is retried: typing (type 4, label "3") says
  // is_typing 0. Typing in encrypted chats goes to Messenger's worker instead
  // (sendChatStateFromComposer) and is edited on its way there.
  const privacy = { blockTyping: Boolean(settings.blockTyping), hideAvatars: false, redactMode: false };

  // Privacy (fMess Settings): people's pictures as their initials, for
  // screens others can see. A person's picture in the chat list, the chat's
  // header, beside messages and in the details is drawn as a circle with the
  // first letter of the name, its colour following the name; one whose name
  // fMess can't tell (the small "seen" pictures) as a grey circle. Pictures
  // there are hidden until fMess has looked at them, so a photo never shows
  // for a moment; those that aren't people's (photos sent) are let through.
  const AVATARS_HIDDEN = 'data-fmess-hide-avatars';
  const AVATAR = 'data-fmess-avatar';
  const AVATAR_PLACES = ':is([role="navigation"] [role="row"], [data-fmess-ui="chat-header"], [role="log"], [data-fmess-ui="details"])';
  const AVATAR_COLOURS = ['#c4314b', '#e3008c', '#8764b8', '#4f6bed', '#0078d4', '#038387', '#498205', '#ca5010'];
  const avatarStyle = document.createElement('style');
  avatarStyle.textContent = `
    html[${AVATARS_HIDDEN}] ${AVATAR_PLACES} :is(img:not([src*="emoji.php"]), svg image):not([${AVATAR}]) { visibility: hidden !important; }
  `;
  withRoot((root) => root.append(avatarStyle));
  const initialPictures = new Map();
  const initialPicture = (name) => {
    const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toLocaleUpperCase();
    const colour = letter ? AVATAR_COLOURS[[...name].reduce((hash, c) => (hash * 31 + c.codePointAt(0)) >>> 0, 7) % AVATAR_COLOURS.length] : '#bcc0c4';
    const key = `${letter}${colour}`;
    if (!initialPictures.has(key)) {
      const text = letter
        ? `<text x='20' y='20' dy='.35em' text-anchor='middle' font-family='-apple-system,system-ui,sans-serif' font-size='18' font-weight='600' fill='white'>${letter}</text>`
        : '';
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='${colour}'/>${text}</svg>`;
      initialPictures.set(key, `data:image/svg+xml,${encodeURIComponent(svg)}`);
    }
    return initialPictures.get(key);
  };
  // The name a picture stands for, from where it is; '' for a grey circle,
  // null for a picture that isn't a person's.
  const pictureName = (picture) => {
    const box = picture.getBoundingClientRect();
    if (!box.width || Math.abs(box.width - box.height) > 2 || box.width > 100) return box.width ? null : undefined;
    const row = picture.closest('[role="navigation"] [role="row"]');
    if (row) return picture.tagName === 'IMG' ? row.querySelector('a[role="link"] span[dir="auto"]')?.textContent ?? '' : picture.closest('svg')?.getAttribute('aria-label') ?? '';
    const header = picture.closest('[data-fmess-ui="chat-header"]');
    if (header) return header.querySelector('h1, h2, h3')?.textContent ?? '';
    if (picture.closest('[role="log"]')) return box.width > 40 ? null : box.width > 20 ? picture.getAttribute('alt') ?? '' : '';
    return picture.closest('svg')?.getAttribute('aria-label') ?? picture.getAttribute('alt') ?? '';
  };
  const coverPicture = (picture) => {
    const name = pictureName(picture);
    if (name === undefined) return;
    if (name === null) return picture.setAttribute(AVATAR, 'none');
    const url = initialPicture(name);
    if (picture.tagName === 'IMG') picture.style.setProperty('content', `url("${url}")`, 'important');
    else {
      if (!picture.hasAttribute('data-fmess-href')) picture.setAttribute('data-fmess-href', picture.getAttribute('href') ?? picture.getAttribute('xlink:href') ?? '');
      picture.setAttribute('href', url);
    }
    picture.setAttribute(AVATAR, 'initial');
  };
  const uncoverPicture = (picture) => {
    if (picture.tagName === 'IMG') picture.style.removeProperty('content');
    else if (picture.hasAttribute('data-fmess-href')) {
      picture.setAttribute('href', picture.getAttribute('data-fmess-href'));
      picture.removeAttribute('data-fmess-href');
    }
    picture.removeAttribute(AVATAR);
  };
  const coverPicturesIn = (root) => {
    if (!privacy.hideAvatars) return;
    for (const picture of root.querySelectorAll(`${AVATAR_PLACES} :is(img:not([src*="emoji.php"]), svg image):not([${AVATAR}])`)) coverPicture(picture);
  };
  // New pictures are looked at in the frame they arrive in; a picture not
  // laid out yet (no size) waits for the next look. Facebook may also give a
  // picture already looked at another source (or another person): it is
  // looked at again, and a picture's own source kept for when the switch is
  // turned off is the new one. (fMess's own initials don't count.)
  let pictureFrame = 0;
  const avatarWatcher = new MutationObserver((records) => {
    for (const { type, target } of records) {
      if (type !== 'attributes' || !target.hasAttribute?.(AVATAR)) continue;
      const source = target.getAttribute('href') ?? target.getAttribute('src') ?? '';
      if (source.startsWith('data:image/svg+xml')) continue;
      if (target.hasAttribute('data-fmess-href')) target.setAttribute('data-fmess-href', source);
      target.removeAttribute(AVATAR);
    }
    pictureFrame ||= requestAnimationFrame(() => ((pictureFrame = 0), coverPicturesIn(document)));
  });
  let avatarTimer = 0;
  const setHideAvatars = (hide) => {
    if (hide === privacy.hideAvatars) return;
    privacy.hideAvatars = hide;
    withRoot((root) => root.toggleAttribute(AVATARS_HIDDEN, hide));
    avatarWatcher.disconnect();
    clearInterval(avatarTimer);
    cancelAnimationFrame(pictureFrame);
    pictureFrame = 0;
    if (hide) {
      withRoot((root) => avatarWatcher.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href'] }));
      avatarTimer = setInterval(() => coverPicturesIn(document), 1000);
      coverPicturesIn(document);
    } else for (const picture of document.querySelectorAll(`[${AVATAR}]`)) uncoverPicture(picture);
  };
  setHideAvatars(Boolean(settings.hideAvatars));

  const REDACT = 'data-fmess-redact';
  const redactStyle = document.createElement('style');
  redactStyle.textContent = `
    @font-face {
      font-family: 'fMessScramble';
      src: url('data:font/woff2;base64,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') format('woff2');
    }
    /* Scramble chat thread list, message bubbles, pinned banners, and conversation titles */
    html[${REDACT}] :is([role="navigation"] [role="row"], [role="main"]) :is([dir="auto"], h1, h2, h3, a) {
      font-family: 'fMessScramble', sans-serif !important;
      user-select: none !important;
    }
    /* Do NOT redact Messenger UI controls and action labels in the right sidebar (e.g. View pinned messages, Change theme, etc.) */
    html[${REDACT}] [role="main"] :is([data-fmess-ui="details"], [role="complementary"]) :is(
      [role="button"], [role="button"] *,
      [role="tab"], [role="tab"] *,
      [aria-expanded], [aria-expanded] *
    ) {
      font-family: var(--font-family-apple, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif) !important;
      user-select: auto !important;
    }
    /* In the right sidebar, keep member names in member lists scrambled */
    html[${REDACT}] [role="main"] :is([data-fmess-ui="details"], [role="complementary"]) :is([role="list"], [role="listitem"]) [dir="auto"] {
      font-family: 'fMessScramble', sans-serif !important;
      user-select: none !important;
    }
    /* Redact avatars: flat gray circle without entropy */
    html[${REDACT}] #fmess-account,
    html[${REDACT}] :is([role="navigation"] [role="row"], [data-fmess-ui="chat-header"], [role="log"], [data-fmess-ui="details"], [role="complementary"]) :is(img:not([src*="emoji.php"]), svg image, [role="img"]:not([aria-label*="emoji"])) {
      filter: grayscale(1) contrast(0) brightness(0.8) !important;
    }
    /* Redact media in message log */
    html[${REDACT}] [role="main"] [role="log"] :is(img:not([src*="emoji.php"]), video) {
      filter: blur(35px) brightness(0.6) !important;
    }
  `;
  withRoot((root) => root.append(redactStyle));

  const setRedactMode = (enabled) => {
    if (enabled === privacy.redactMode) return;
    privacy.redactMode = enabled;
    withRoot((root) => root.toggleAttribute(REDACT, enabled));
  };
  setRedactMode(Boolean(settings.redactMode));

  const currentUserId = () => {
    try {
      return window.require('CurrentUserInitialData').USER_ID || null;
    } catch {
      return null;
    }
  };
  const parseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  // Edits the JSON object in text with edit(value), which returns true when it
  // changed something; null when nothing changed. Ids are 64-bit numbers, so
  // only JSON that a parse and stringify give back unchanged is edited.
  const editJson = (text, edit) => {
    const value = parseJson(text);
    if (!value || typeof value !== 'object' || JSON.stringify(value) !== text) return null;
    return edit(value) ? JSON.stringify(value) : null;
  };
  // Same for object[key], which may hold the JSON as a string.
  const editNested = (object, key, edit) => {
    const value = object?.[key];
    if (value && typeof value === 'object') return edit(value);
    const edited = typeof value === 'string' ? editJson(value, edit) : null;
    if (edited === null) return false;
    object[key] = edited;
    return true;
  };

  const TYPING_LABEL = '3';
  const editRequest = (request) => {
    if (request.type === 4 && privacy.blockTyping) {
      return editNested(
        request,
        'payload',
        (update) =>
          update.label === TYPING_LABEL &&
          editNested(update, 'payload', (typing) => {
            if (!typing.is_typing) return false;
            typing.is_typing = 0;
            return true;
          }),
      );
    }
    return false;
  };
  const PART_DATA = 0x0d;
  const PART_CLOSE = 0x0e;
  // The frame with its requests edited, or null when nothing changed.
  const editFrame = (bytes) => {
    const parts = [];
    let edited = false;
    for (let pos = 0; pos < bytes.length; ) {
      if (bytes[pos] === PART_CLOSE) {
        parts.push(bytes.subarray(pos, pos + 3));
        pos += 3;
        continue;
      }
      if (pos + 6 > bytes.length) return null;
      const end = pos + 6 + (bytes[pos + 3] | (bytes[pos + 4] << 8) | (bytes[pos + 5] << 16));
      if (end > bytes.length) return null;
      let part = bytes.subarray(pos, end);
      const json = bytes[pos] === PART_DATA && end > pos + 8 ? new TextDecoder().decode(bytes.subarray(pos + 8, end)) : null;
      const request = json && editJson(json, editRequest);
      if (request) {
        const encoded = new TextEncoder().encode(request);
        const length = encoded.length + 2;
        part = new Uint8Array(8 + encoded.length);
        part.set(bytes.subarray(pos, pos + 3));
        part.set([length & 0xff, (length >> 8) & 0xff, length >> 16], 3);
        part.set(bytes.subarray(pos + 6, pos + 8), 6);
        part.set(encoded, 8);
        edited = true;
      }
      parts.push(part);
      pos = end;
    }
    if (!edited) return null;
    const frame = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    parts.reduce((offset, part) => (frame.set(part, offset), offset + part.length), 0);
    return frame;
  };
  const nativeSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    const bytes =
      !privacy.blockTyping || !String(this.url).includes('/ws/lightspeed')
        ? null
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : null;
    return nativeSend.call(this, (bytes && editFrame(bytes)) || data);
  };
  // Requests to the worker are batches: [{type: 'request', content: {name, arg}}].
  const CHAT_STATE = 'sendChatStateFromComposer';
  const CHAT_IDLE = 'idle';
  const nativePostMessage = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (message, ...rest) {
    if (privacy.blockTyping && Array.isArray(message) && message.some((item) => item?.content?.name === CHAT_STATE)) {
      // Seen so far: typing and idle. Anything but idle shows the dots.
      message = message.map((item) =>
        item?.content?.name === CHAT_STATE && item.content.arg?.state !== CHAT_IDLE
          ? { ...item, content: { ...item.content, arg: { ...item.content.arg, state: CHAT_IDLE } } }
          : item,
      );
    }
    return nativePostMessage.call(this, message, ...rest);
  };

