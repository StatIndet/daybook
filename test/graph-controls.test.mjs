import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultSettings, loadSettings, saveSettings, settingsStorageKey, validateSettings,
} from '../assets/ts/graph-settings.ts';
import {
  hexToRGB, hslToRGB, hsvToRGB, normalizeHex, rgbToHex, rgbToHSL, rgbToHSV,
} from '../assets/ts/graph-color.ts';

test('RGB, HSL, and HSV conversions preserve every sampled RGB color including achromatic values', () => {
  for (let r = 0; r <= 255; r += 17) {
    for (let g = 0; g <= 255; g += 17) {
      for (let b = 0; b <= 255; b += 17) {
        const rgb = { r, g, b };
        const hex = rgbToHex(rgb);
        assert.deepEqual(hexToRGB(hex), rgb);
        assert.equal(rgbToHex(hslToRGB(rgbToHSL(rgb))), hex, `HSL roundtrip: ${hex}`);
        assert.equal(rgbToHex(hsvToRGB(rgbToHSV(rgb))), hex, `HSV roundtrip: ${hex}`);
      }
    }
  }
});

test('hex color parsing normalizes supported forms and rejects incomplete and non-color input', () => {
  assert.equal(normalizeHex(' e05252 '), '#E05252');
  assert.equal(normalizeHex('#abc'), '#AABBCC');
  assert.equal(normalizeHex('#000000'), '#000000');
  for (const value of ['', '#', '#12', '#abcd', '#aabbccdd', 'red', 'rgb(0,0,0)', '#GGGGGG']) {
    assert.equal(normalizeHex(value), null);
    assert.throws(() => hexToRGB(value));
  }
  assert.equal(rgbToHex(hslToRGB({ h: 360, s: 100, l: 50 })), '#FF0000');
  assert.equal(rgbToHex(hsvToRGB({ h: -60, s: 100, v: 100 })), '#FF00FF');
});

test('defaults are independent and settings validation cannot leak malformed data into forces or groups', () => {
  const first = defaultSettings();
  first.groups.push({ id: 'a', query: 'tag:notes', color: '#000000' });
  assert.equal(defaultSettings().groups.length, 0);
  const checked = validateSettings({
    query: 'tag:中文', showTags: 'false', existingOnly: false,
    textFade: -100, nodeSize: 10, lineWidth: null, centerForce: Infinity,
    repelForce: -8, linkForce: NaN, linkDistance: 900,
    groups: [
      { id: 'one', query: 'path:notes', color: '#aabbcc', unsafe: 'discard' },
      { id: 'one', query: 'duplicate', color: '#123456' },
      { id: 'two', query: 'bad color', color: 'red' },
      { id: '', query: '', color: '#123456' },
      { id: 'three', color: '#123456' },
      null,
    ],
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
  assert.deepEqual(checked.groups, [{ id: 'one', query: 'path:notes', color: '#AABBCC' }]);
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
