(() => {
  'use strict';
  const normalize = globalThis.XFCNormalizeSettings;
  const inputs = [...document.querySelectorAll('input[name]')];
  const details = document.getElementById('details'), status = document.getElementById('status');
  let settings = normalize(globalThis.XFCConfig);
  const render = () => {
    for (const input of inputs) input.checked = settings[input.name];
    details.disabled = !settings.enabled;
  };
  try { document.getElementById('version').textContent = chrome.runtime.getManifest().version; } catch {}
  globalThis.XFCConfigSubscribe(config => { settings = normalize(config); render(); });
  for (const input of inputs) input.addEventListener('change', () => {
    settings = normalize({ ...settings, [input.name]: input.checked });
    render();
    status.hidden = true;
    const failed = () => { status.textContent = '设置保存失败，请重新打开面板后重试'; status.hidden = false; };
    try {
      const pending = chrome.storage.sync.set({ xfcSettings: settings }, () => {
        try { if (chrome.runtime.lastError) failed(); } catch { failed(); }
      });
      pending?.catch?.(failed);
    } catch { failed(); }
  });
})();
