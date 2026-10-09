const test = require('node:test');
const assert = require('node:assert/strict');
const configPath = require.resolve('../src/config.js');
const { DEFAULTS, normalizeSettings } = require(configPath);

test('defaults and null/undefined input return a fresh settings object', () => {
  assert.deepEqual(DEFAULTS, { enabled: true, relationTags: true, hoverCard: true, colorTiers: false, debug: false });
  for (const raw of [{}, null, undefined]) {
    assert.deepEqual(normalizeSettings(raw), DEFAULTS);
    assert.notEqual(normalizeSettings(raw), DEFAULTS);
  }
});

test('partial settings merge without mutating input or defaults', () => {
  const raw = Object.freeze({ enabled: false, colorTiers: true });
  assert.deepEqual(normalizeSettings(raw), { ...DEFAULTS, ...raw });
  assert.equal(DEFAULTS.enabled, true);
  for (const key of Object.keys(DEFAULTS)) {
    for (const value of [true, false]) assert.equal(normalizeSettings({ [key]: value })[key], value);
  }
});

test('non-booleans are ignored and unknown or inherited keys are dropped', () => {
  for (const value of [null, undefined, '', 'true', 'false', '1', '0', 0, 1, [], {}]) {
    const raw = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, value]));
    assert.deepEqual(normalizeSettings(raw), DEFAULTS);
  }
  assert.deepEqual(normalizeSettings({ extra: true, handle: 'someone', followers: 123 }), DEFAULTS);
  assert.deepEqual(normalizeSettings(Object.create({ enabled: false })), DEFAULTS);
});

function reloadWithChrome(t, chrome) {
  const keys = ['chrome', 'XFCConfig', 'XFCDefaults', 'XFCNormalizeSettings', 'XFCConfigSubscribe'];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  t.after(() => {
    keys.forEach((key, i) => {
      if (previous[i]) Object.defineProperty(globalThis, key, previous[i]);
      else delete globalThis[key];
    });
    delete require.cache[configPath];
  });
  globalThis.chrome = chrome;
  delete require.cache[configPath];
  return require(configPath);
}

for (const mode of ['callback', 'promise']) {
  test(`live config loads and notifies subscribers via ${mode}`, async t => {
    let listener, load;
    reloadWithChrome(t, {
      storage: {
        sync: { get(key, callback) {
          assert.equal(key, 'xfcSettings');
          if (mode === 'callback') { load = callback; return; }
          return new Promise(resolve => { load = resolve; });
        } },
        onChanged: { addListener(fn) { listener = fn; } }
      }
    });
    const live = globalThis.XFCConfig, seen = [];
    const unsubscribe = globalThis.XFCConfigSubscribe(config => seen.push({ ...config }));
    assert.deepEqual(live, DEFAULTS);
    load({ xfcSettings: { enabled: false, debug: true, extra: true } });
    await Promise.resolve();
    assert.equal(globalThis.XFCConfig, live);
    assert.deepEqual(live, { ...DEFAULTS, enabled: false, debug: true });
    assert.deepEqual(seen, [{ ...DEFAULTS }, { ...live }]);
    listener({ xfcSettings: { newValue: { colorTiers: true } } }, 'local');
    listener({ unrelated: { newValue: true } }, 'sync');
    assert.equal(seen.length, 2);
    listener({ xfcSettings: { newValue: { colorTiers: true, hoverCard: false } } }, 'sync');
    assert.equal(globalThis.XFCConfig, live);
    assert.deepEqual(live, { ...DEFAULTS, colorTiers: true, hoverCard: false });
    assert.deepEqual(seen[2], live);
    listener({ xfcSettings: { oldValue: { colorTiers: true } } }, 'sync');
    assert.deepEqual(live, DEFAULTS);
    assert.deepEqual(seen[3], DEFAULTS);
    unsubscribe();
    listener({ xfcSettings: { newValue: { debug: true } } }, 'sync');
    assert.equal(seen.length, 4);
    const late = [];
    globalThis.XFCConfigSubscribe(config => late.push({ ...config }));
    assert.deepEqual(late, [{ ...DEFAULTS, debug: true }]);
  });
}

test('a stale initial load cannot overwrite a storage change', t => {
  let listener, load;
  reloadWithChrome(t, { storage: {
    sync: { get(key, fn) { load = fn; } },
    onChanged: { addListener(fn) { listener = fn; } }
  } });
  listener({ xfcSettings: { newValue: { enabled: false } } }, 'sync');
  load({ xfcSettings: { enabled: true } });
  assert.equal(globalThis.XFCConfig.enabled, false);
});

test('unavailable extension context retains defaults', async t => {
  for (const chrome of [undefined,
    { get storage() { throw new Error('Extension context invalidated'); } },
    { storage: { sync: { get() { throw new Error('Extension context invalidated'); } }, onChanged: { addListener() {} } } },
    { storage: { sync: { get() { return Promise.reject(new Error('Extension context invalidated')); } }, onChanged: { addListener() {} } } }
  ]) {
    await t.test('does not throw', async t => {
      assert.doesNotThrow(() => reloadWithChrome(t, chrome));
      await Promise.resolve();
      assert.deepEqual(globalThis.XFCConfig, DEFAULTS);
    });
  }
});
