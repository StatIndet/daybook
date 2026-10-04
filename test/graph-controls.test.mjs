import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultSettings, loadSettings, saveSettings, settingsStorageKey, validateSettings,
} from '../assets/ts/graph-settings.ts';
test('defaults are independent and settings validation rejects malformed data and drops obsolete preferences', () => {
  const first = defaultSettings();
  first.query = 'tag:notes';
  assert.equal(defaultSettings().query, '');
  const checked = validateSettings({
    query: 'tag:中文', showTags: 'false', existingOnly: false,
    textFade: -100, nodeSize: 10, lineWidth: null, centerForce: Infinity,
    repelForce: -8, linkForce: NaN, linkDistance: 900,
    groups: [{ id: 'old', query: 'file:.md', color: '#123456' }],
  });
  assert.equal(checked.query, 'tag:中文');
  assert.equal(checked.showTags, false);
  assert.equal(checked.existingOnly, false);
  assert.equal(checked.textFade, -1);
  assert.equal(checked.nodeSize, 3);
  assert.equal(checked.lineWidth, 1);
  assert.equal(checked.centerForce, 1);
  assert.equal(checked.repelForce, 0);
  assert.equal(checked.linkForce, 1);
  assert.equal(checked.linkDistance, 400);
  assert.equal('groups' in checked, false, 'Old color preferences do not survive validation');
  for (const bad of [null, false, [], 'oops']) assert.deepEqual(validateSettings(bad), defaultSettings());
});

test('preferences share a site across locales and isolate different deployment subpaths', () => {
  assert.equal(settingsStorageKey('/graph/'), settingsStorageKey('/en_US/graph/'));
  assert.equal(settingsStorageKey('/blog/graph'), settingsStorageKey('/blog/en_US/graph/'));
  assert.equal(settingsStorageKey('/blog/zh_CN/graph/'), settingsStorageKey('/blog/graph/'));
  assert.notEqual(settingsStorageKey('/graph/'), settingsStorageKey('/blog/graph/'));
  assert.notEqual(settingsStorageKey('/blog/graph/'), settingsStorageKey('/another/graph/'));
});

test('storage handles missing, stale, corrupt, and unavailable records without breaking the graph', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let data = null;
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => data, setItem: (_key, value) => { data = value; } },
    });
    assert.deepEqual(loadSettings('test'), defaultSettings());
    const settings = { ...defaultSettings(), query: 'file:中文.md', showTags: true };
    saveSettings('test', settings);
    assert.equal(JSON.parse(data).version, 1);
    assert.deepEqual(loadSettings('test'), settings);
    data = JSON.stringify({ version: 1, settings: { ...settings, groups: [{ id: 'old', color: '#123456', query: 'file:.md' }] } });
    assert.deepEqual(loadSettings('test'), settings, 'Existing preferences survive color-group removal');
    saveSettings('test', loadSettings('test'));
    assert.equal('groups' in JSON.parse(data).settings, false);
    data = '{invalid';
    assert.deepEqual(loadSettings('test'), defaultSettings());
    data = JSON.stringify({ version: 99, settings });
    assert.deepEqual(loadSettings('test'), defaultSettings());
    data = JSON.stringify({ version: 1, settings: { ...settings, linkDistance: 'bad' } });
    assert.equal(loadSettings('test').linkDistance, 120);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('SecurityError'); },
    });
    assert.deepEqual(loadSettings('test'), defaultSettings());
    assert.doesNotThrow(() => saveSettings('test', settings));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
