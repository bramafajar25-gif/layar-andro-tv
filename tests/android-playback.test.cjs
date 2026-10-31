'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createI18n } = require('../i18n.js');

function fixture(desktopBridge, responseData = { episodes: [] }) {
  const nodes = new Map(), calls = [], values = new Map();
  function node(selector) {
    if (!nodes.has(selector)) {
      const classes = new Set(['hidden']);
      nodes.set(selector, {
        classList: {
          add: value => classes.add(value), remove: value => classes.delete(value),
          contains: value => classes.has(value),
          toggle(value, force = !classes.has(value)) { if (force) classes.add(value); else classes.delete(value); }
        },
        getBoundingClientRect: () => ({ x: 0, y: 76, width: 900, height: 500 }),
        replaceChildren() {}, querySelector: () => null, addEventListener() {}
      });
    }
    return nodes.get(selector);
  }
  const context = vm.createContext({
    window: {
      AndroidBridge: {
        play: json => calls.push(JSON.parse(json)), closePlayer() {},
        openSource() {}, setLanguage() {}
      },
      layarDesktop: desktopBridge,
      LayarI18n: { createI18n }, addEventListener() {}
    },
    document: { querySelector: node, querySelectorAll: () => [], body: node('body'), addEventListener() {} },
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    ResizeObserver: class { observe() {} },
    fetch: async () => ({ ok: true, json: async () => responseData })
  });
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  // Install the real UI handlers without running the splash and initial catalogue request.
  vm.runInContext(source.slice(0, source.lastIndexOf('\ninitNetflixIntro();')), context);
  vm.runInContext("currentTab = 'movies';", context);
  return { context, calls, node, values };
}

test('Android Play reaches the native movie player without the Electron bounds API', async () => {
  const { context, calls, values } = fixture();
  await vm.runInContext("startPlayback({type:'movie', slug:'the-hunt-2012', title:'The Hunt', year:2012})", context);
  assert.deepEqual(calls, [{ type: 'movie', slug: 'the-hunt-2012', seasons: [] }]);
  assert.equal(JSON.parse(values.get('layar.v2.history'))[0].item.slug, 'the-hunt-2012');
  assert.doesNotThrow(() => vm.runInContext('updateBounds()', context));
});

test('Android TV Play forwards the selected season and episode to the native player', async () => {
  const { context, calls } = fixture();
  await vm.runInContext("startPlayback({type:'tv_series', slug:'the-mentalist-2008', title:'The Mentalist', seasons:[{number:7}]}, 7, {number:13, title:'White Orchids', available:true})", context);
  assert.deepEqual(calls, [{ type: 'tv_series', slug: 'the-mentalist-2008', season: 7, episode: 13, seasons: [{ number: 7 }] }]);
});

test('Android API exposes source errors even when the native bridge returns an HTTP 200 JSON envelope', async () => {
  const { context } = fixture(undefined, { error: 'IDLIX menolak koneksi. Coba muat ulang.' });
  await assert.rejects(vm.runInContext("api('homepage')", context), /IDLIX menolak koneksi/);
});

test('returning from the Android player clears the loading screen and allows another Play', async () => {
  const { context, calls, node } = fixture();
  await vm.runInContext("startPlayback({type:'movie', slug:'the-hunt-2012', title:'The Hunt'})", context);
  vm.runInContext("window.__layarPlayerStatus({state:'close-request'})", context);
  assert.equal(node('#player').classList.contains('hidden'), true);
  assert.equal(vm.runInContext('playback', context), null);
  await vm.runInContext("startPlayback({type:'movie', slug:'the-hunt-2012', title:'The Hunt'})", context);
  assert.equal(calls.length, 2);
});

test('desktop playback still sends its surface bounds before opening the player', async () => {
  const calls = [];
  const { context } = fixture({
    bounds: rect => calls.push({ bounds: { ...rect } }),
    play: async options => calls.push({ play: { ...options } }),
    onPlayerStatus() {}
  });
  await vm.runInContext("startPlayback({type:'movie', slug:'the-hunt-2012', title:'The Hunt'})", context);
  assert.deepEqual(calls[0], { bounds: { x: 0, y: 76, width: 900, height: 500 } });
  assert.equal(calls[1].play.slug, 'the-hunt-2012');
});

test('a desktop bounds failure is surfaced by the player instead of leaving an unhandled rejection', async () => {
  const { context, node } = fixture({
    bounds() { throw new Error('Bounds unavailable'); }, play() {}, onPlayerStatus() {}
  });
  await vm.runInContext("startPlayback({type:'movie', slug:'the-hunt-2012', title:'The Hunt'})", context);
  assert.match(node('#playerMessage').innerHTML, /Bounds unavailable/);
});


test('poster instant play mounts the movie player without opening details', async () => {
  const { context, calls, node } = fixture();
  await vm.runInContext("playTitle({type:'movie',slug:'example',title:'Example'})", context);
  assert.equal(calls[0].slug, 'example');
  assert.equal(node('#modal').classList.contains('hidden'), true);
  assert.equal(node('#player').classList.contains('hidden'), false);
});
