(() => {
  'use strict';
  const DEFAULTS = Object.freeze({ enabled: true, relationTags: true, hoverCard: true, colorTiers: false, debug: false });
  function normalizeSettings(raw) {
    const settings = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (raw && Object.hasOwn(raw, key) && typeof raw[key] === 'boolean') settings[key] = raw[key];
    }
    return settings;
  }
  if (typeof module !== 'undefined') module.exports = { DEFAULTS, normalizeSettings };
  globalThis.XFCDefaults = DEFAULTS;
  globalThis.XFCNormalizeSettings = normalizeSettings;
  const config = globalThis.XFCConfig = { ...DEFAULTS }, subscribers = new Set();
  globalThis.XFCConfigSubscribe = fn => {
    subscribers.add(fn);
    fn(config);
    return () => subscribers.delete(fn);
  };
  const update = raw => {
    Object.assign(config, normalizeSettings(raw));
    for (const fn of subscribers) fn(config);
  };
  try {
    const chrome = globalThis.chrome;
    if (!chrome?.storage?.sync) return;
    let changed = false, loaded = false;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !Object.hasOwn(changes, 'xfcSettings')) return;
      changed = true;
      update(changes.xfcSettings.newValue);
    });
    const onLoad = result => {
      if (loaded) return;
      loaded = true;
      try {
        if (!chrome.runtime?.lastError && !changed) update(result?.xfcSettings);
      } catch { /* Extension may have been reloaded. */ }
    };
    const pending = chrome.storage.sync.get('xfcSettings', onLoad);
    pending?.then?.(onLoad, () => {});
  } catch { /* Keep defaults if the extension context is unavailable. */ }
})();
