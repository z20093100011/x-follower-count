const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('manifest grants only storage and points to the settings popup', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.2.0');
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const key of ['host_permissions', 'optional_permissions', 'optional_host_permissions']) {
    assert.equal(Object.hasOwn(manifest, key), false);
  }
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.ok(fs.statSync(path.join(root, manifest.action.default_popup)).isFile());
  assert.equal(manifest.action.default_title, 'X 粉丝数显示');
  assert.deepEqual(manifest.action.default_icon, { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png' });
});
