(() => {
  'use strict';
  const { badgeText, badgeTitle, relationTag, detailRows, tierOf } = globalThis.XFCWalker;
  const config = globalThis.XFCConfig;
  const cache = new Map();
  const selector = 'article [data-testid="User-Name"], [data-testid="UserCell"], [data-testid="UserName"], [data-testid="HoverCard"]';
  const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'compose', 'intent']);
  const style = document.createElement('style');
  style.textContent = `.xfc-wrap { display:inline-flex; gap:4px; align-items:center; align-self:center;
    vertical-align:middle; flex:0 0 auto; flex-shrink:0; white-space:nowrap; margin:0 4px 0 0; }
    .xfc-wrap.xfc-after { margin:0 0 0 4px; }
    .xfc-badge, .xfc-rel { display:inline-flex; align-items:center; flex:none; padding:1px 6px;
    border-radius:6px; font-size:13px; font-weight:600; line-height:16px; white-space:nowrap;
    font-family:inherit; border:none; pointer-events:auto; cursor:default; }
    .xfc-badge { background:#e8f5fd; color:#1d9bf0; }
    .xfc-rel { background:#f0ebff; color:#7856ff; }
    .xfc-dark .xfc-badge { background:rgba(29,155,240,0.15); }
    .xfc-dark .xfc-rel { background:rgba(120,86,255,0.18); }
    .xfc-badge.xfc-t0 { background:rgba(113,118,123,0.14); color:#71767b; }
    .xfc-badge.xfc-t1 { background:#e8f5fd; color:#1d9bf0; }
    .xfc-badge.xfc-t2 { background:#e6f7f0; color:#00a06c; }
    .xfc-badge.xfc-t3 { background:#fff3e0; color:#d67e00; }
    .xfc-badge.xfc-t4 { background:linear-gradient(135deg, #ffe3f0, #fff0dc); color:#e21674; }
    .xfc-dark .xfc-badge.xfc-t0 { background:rgba(113,118,123,0.22); color:#8b98a5; }
    .xfc-dark .xfc-badge.xfc-t1 { background:rgba(29,155,240,0.15); color:#1d9bf0; }
    .xfc-dark .xfc-badge.xfc-t2 { background:rgba(0,186,124,0.18); color:#00ba7c; }
    .xfc-dark .xfc-badge.xfc-t3 { background:rgba(255,159,10,0.2); color:#ffad1f; }
    .xfc-dark .xfc-badge.xfc-t4 { background:linear-gradient(135deg, rgba(249,24,128,0.22), rgba(255,159,10,0.22)); color:#f91880; }
    #xfc-debug { position:fixed; left:8px; bottom:8px; z-index:2147483646; pointer-events:none;
    font:12px monospace; padding:3px 8px; border-radius:6px; background:rgba(0,0,0,0.7); color:#fff; }
    #xfc-tip { position:fixed; z-index:2147483647; pointer-events:none; min-width:190px;
    max-width:calc(100vw - 16px); box-sizing:border-box; padding:10px 12px; border-radius:12px;
    box-shadow:0 4px 20px #0003; font:13px/1.5 system-ui,sans-serif; background:#fff; color:#0f1419; }
    .xfc-dark #xfc-tip { background:#16181c; color:#e7e9ea; }
    #xfc-tip > div { display:flex; justify-content:space-between; gap:16px; margin-top:4px; }
    #xfc-tip > div > :first-child { color:#71767b; }`;
  const tip = document.createElement('div');
  tip.id = 'xfc-tip';
  tip.hidden = true;
  document.documentElement.append(style, tip);
  let parsed = 0, debugBar;
  function updateDebug() {
    if (!config.debug) { debugBar?.remove(); debugBar = null; return; }
    if (!debugBar) { debugBar = document.createElement('div'); debugBar.id = 'xfc-debug'; }
    const text = `XFC 响应 ${parsed} · 用户 ${cache.size} · 徽标 ${document.querySelectorAll('.xfc-wrap').length}`;
    if (debugBar.textContent !== text) debugBar.textContent = text;
    if (!debugBar.isConnected) document.documentElement.append(debugBar);
  }
  let activeWrap;
  function hideTip() { tip.hidden = true; activeWrap = null; }
  function showTip(wrap) {
    if (!config.enabled || !config.hoverCard) return hideTip();
    const rec = cache.get(wrap.dataset.xfcHandle);
    if (!rec || !wrap.isConnected) return hideTip();
    activeWrap = wrap;
    const header = document.createElement('strong');
    header.textContent = '@' + rec.screenName;
    tip.replaceChildren(header);
    for (const row of detailRows(rec)) {
      const line = document.createElement('div');
      for (const value of row) {
        const cell = document.createElement('span');
        cell.textContent = value;
        line.append(cell);
      }
      tip.append(line);
    }
    tip.hidden = false;
    const rect = wrap.getBoundingClientRect(), width = tip.offsetWidth, height = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(rect.bottom + 6 + height <= innerHeight - 8 ?
      rect.bottom + 6 : rect.top - height - 6, innerHeight - height - 8)) + 'px';
  }
  window.addEventListener('scroll', hideTip, { capture:true, passive:true });

  function updateTheme() {
    const color = document.body && getComputedStyle(document.body).backgroundColor;
    const match = color && /^rgba?\(([^)]+)\)$/.exec(color);
    const channels = match ? match[1].split(',').map(Number) : [];
    let dark = false;
    if (channels.length >= 3 && channels.every(Number.isFinite) &&
        (channels.length === 3 || channels[3] > 0)) {
      const [r, g, b] = channels.slice(0, 3).map(value => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
    }
    document.documentElement.classList.toggle('xfc-dark', dark);
  }

  function findHandle(container) {
    // Do not mistake handles in biographies or nested quoted content for the owner.
    const owned = element => element.closest(selector) === container;
    for (const span of container.querySelectorAll('span')) {
      if (!owned(span) || span.closest('.xfc-wrap')) continue;
      const match = /^@([A-Za-z0-9_]{1,15})$/.exec(span.textContent.trim());
      if (match) {
        return { key: match[1].toLowerCase(), anchor:span };
      }
    }
    for (const link of container.querySelectorAll('a[href]')) {
      if (!owned(link)) continue;
      const match = /^\/([A-Za-z0-9_]{1,15})\/?$/.exec(link.getAttribute('href'));
      if (match && !reserved.has(match[1].toLowerCase())) return { key: match[1].toLowerCase(), anchor: link };
    }
    return null;
  }

  function fallback(container, handleEl) {
    let node = handleEl;
    while (node.parentElement && node.parentElement !== container &&
        getComputedStyle(node.parentElement).display === 'inline') node = node.parentElement;
    return { node, after:true };
  }
  function placement(container, handleEl) {
    const tweet = !!container.closest('article');
    for (let node = handleEl; node && node !== container; node = node.parentElement) {
      const parent = node.parentElement;
      if (!parent || !container.contains(parent)) break;
      if (parent.closest('a') && container.contains(parent.closest('a'))) continue; // never inside a link
      const css = getComputedStyle(parent);
      if (['flex', 'inline-flex'].includes(css.display) && css.flexDirection.startsWith('row') &&
          css.flexWrap === 'nowrap') {
        if (!tweet && parent.querySelector('img, button, [role="button"], [data-testid$="follow"]')) break;
        return { node, after:false };
      }
    }
    return fallback(container, handleEl);
  }
  // Never reparent X's React-managed nodes; only add our own sibling.
  function insert(wrap, spot) {
    wrap.classList.toggle('xfc-after', spot.after);
    if (spot.after) spot.node.after(wrap); else spot.node.before(wrap);
  }
  const placements = new WeakMap();
  function removeWrap(wrap) {
    if (!wrap) return;
    wrap.remove();
  }
  function scan() {
    if (!config.enabled) return;
    for (const container of document.querySelectorAll(selector)) {
      const handle = findHandle(container);
      const wraps = [...container.querySelectorAll('.xfc-wrap')].filter(el => el.closest(selector) === container);
      let wrap = wraps.shift();
      wraps.forEach(removeWrap);
      if (!handle || container.dataset.xfcHandle !== handle.key) {
        removeWrap(wrap);
        placements.delete(container);
        wrap = null;
        delete container.dataset.xfcHandle;
      }
      if (!handle) continue;
      container.dataset.xfcHandle = handle.key;
      const record = cache.get(handle.key);
      if (!record) continue;
      cache.delete(handle.key);
      cache.set(handle.key, record);
      if (!wrap) {
        wrap = document.createElement('span');
        wrap.className = 'xfc-wrap';
        wrap.dataset.xfcHandle = handle.key;
        const badge = document.createElement('span');
        badge.className = 'xfc-badge';
        wrap.append(badge);
        for (const type of ['mouseover', 'mouseout', 'pointerover', 'pointerout', 'mousemove', 'pointermove']) {
          wrap.addEventListener(type, event => event.stopPropagation());
        }
        wrap.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
        wrap.addEventListener('mouseenter', () => showTip(wrap));
        wrap.addEventListener('mouseleave', hideTip);
      }
      const badge = wrap.querySelector('.xfc-badge'), text = badgeText(record.followers);
      if (badge.textContent !== text) badge.textContent = text;
      const tier = config.colorTiers ? tierOf(record.followers) : -1;
      for (let i = 0; i <= 4; i++) badge.classList.toggle(`xfc-t${i}`, tier === i);
      wrap.setAttribute('aria-label', badgeTitle(record.followers));
      wrap.removeAttribute('title');
      badge.removeAttribute('title');
      const tag = config.relationTags ? relationTag(record) : '';
      let rel = wrap.querySelector('.xfc-rel');
      if (!tag) rel?.remove();
      else {
        if (!rel) { rel = document.createElement('span'); rel.className = 'xfc-rel'; wrap.append(rel); }
        if (rel.textContent !== tag) rel.textContent = tag;
      }
      let saved = placements.get(container);
      if (!saved || saved.handle !== handle.anchor || !saved.spot.node.isConnected) {
        const spot = placement(container, handle.anchor);
        insert(wrap, spot);
        // Check once per handle placement, so an overflow fallback cannot oscillate.
        const row = wrap.parentElement;
        const crowded = !spot.after && [...row.querySelectorAll('span, a, div')].some(el =>
          !el.closest('.xfc-wrap') && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1);
        if (crowded) { Object.assign(spot, fallback(container, handle.anchor)); insert(wrap, spot); }
        saved = { handle:handle.anchor, spot };
        placements.set(container, saved);
      } else if ((saved.spot.after ? saved.spot.node.nextElementSibling : saved.spot.node.previousElementSibling) !== wrap) {
        insert(wrap, saved.spot);
      }
    }
    if (activeWrap && !activeWrap.isConnected) hideTip();
    updateDebug();
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      // Our own badge changes must not create an observer feedback loop.
      observer.disconnect();
      try {
        scan();
        if (activeWrap) showTip(activeWrap);
      } finally { observe(); }
    });
  }
  const observer = new MutationObserver(() => {
    if (activeWrap && !activeWrap.isConnected) hideTip();
    schedule();
  });
  function observe() {
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['href', 'data-testid']
    });
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin ||
        event.data?.source !== 'xfc-main' || event.data.type !== 'counts') return;
    const data = event.data.data;
    if (!data || typeof data !== 'object') return;
    if (typeof event.data.parsed === 'number' && Number.isFinite(event.data.parsed) && event.data.parsed >= 0) {
      parsed = event.data.parsed;
    }
    for (const [key, record] of Object.entries(data)) {
      const count = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
      if (!/^[a-z0-9_]{1,15}$/.test(key) || !record ||
          typeof record.screenName !== 'string' || !/^[A-Za-z0-9_]{1,15}$/.test(record.screenName) ||
          record.screenName.toLowerCase() !== key || !count(record.followers) ||
          ![record.following, record.tweets].every(n => n === null || count(n)) ||
          !(record.createdAt === null || typeof record.createdAt === 'string' && record.createdAt.length <= 64) ||
          typeof record.followedBy !== 'boolean' || typeof record.iFollow !== 'boolean') continue;
      const { screenName, followers, following, tweets, createdAt, followedBy, iFollow } = record;
      cache.delete(key);
      cache.set(key, { screenName, followers, following, tweets, createdAt, followedBy, iFollow });
      if (cache.size > 5000) cache.delete(cache.keys().next().value);
    }
    updateDebug();
    schedule();
  });
  // Theme switches restyle <body>; watch only that instead of every class/style change on the page.
  const themeObserver = new MutationObserver(updateTheme);
  const watchTheme = () => document.body && themeObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
  if (document.body) watchTheme(); else document.addEventListener('DOMContentLoaded', watchTheme, { once: true });
  globalThis.XFCConfigSubscribe(() => {
    if (!config.enabled) {
      document.querySelectorAll('.xfc-wrap').forEach(removeWrap);
      for (const container of document.querySelectorAll(`${selector}, [data-xfc-handle]`)) {
        placements.delete(container);
        delete container.dataset.xfcHandle;
      }
    }
    if (!config.relationTags) document.querySelectorAll('.xfc-rel').forEach(el => el.remove());
    if (!config.enabled || !config.hoverCard) hideTip();
    updateDebug();
    schedule();
  });
  observe();
  updateTheme();
  schedule();
  window.postMessage({ source: 'xfc-content', type: 'ready' }, location.origin);
})();
