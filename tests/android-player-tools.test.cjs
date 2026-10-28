'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require.resolve('../android/app/src/main/assets/player-tools.js'), 'utf8');

function fixture({ readyState = 4, rejected = false, blockAds = true } = {}) {
  const clicks = [], frames = [], listeners = {}, styles = [], classes = new Set();
  let mutations, plays = 0, marked = false, present = true, observers = 0;
  const button = (name, textContent, disabled = false, visible = true) => ({
    textContent, disabled, getAttribute: () => null,
    getClientRects: () => visible ? [1] : [], click: () => clicks.push(name)
  });
  const overlay = button('initial-play', 'play_arrow');
  const skip = button('skip', 'Lewati Iklan');
  const controls = [skip, button('countdown', 'Lewati dalam 5 dtk'), button('disabled', 'Skip ad', true),
    button('hidden', 'Skip ads', false, false), button('replay', 'Replay'), button('pause', 'Pause')];
  const video = {
    paused: true, ended: false, readyState, muted: false,
    play() { plays++; if (rejected) return Promise.reject(new Error('Autoplay denied')); this.paused = false; return Promise.resolve(); },
    addEventListener: (event, callback) => { listeners[event] = callback; }
  };
  const target = {
    setAttribute() { marked = true; }, removeAttribute() { marked = false; },
    querySelectorAll(selector) {
      if (selector === 'video') return [video];
      if (selector === 'button, .skip-button, .jw-skip') return controls;
      // Match the real CSS selectors so generic Play/Replay selectors would select controls.
      return [overlay, ...controls].filter(item => item === overlay || /aria-label|title|\.play-button|\.play-icon/.test(selector));
    }
  };
  const document = {
    body: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } },
    head: { appendChild: style => styles.push(style) }, createElement: () => ({}),
    querySelector: selector => selector === '[data-layar-player]' ? (marked ? target : null) : (present ? target : null)
  };
  const context = vm.createContext({
    window: {}, document, atob: value => Buffer.from(value, 'base64').toString('utf8'),
    requestAnimationFrame: callback => frames.push(callback),
    MutationObserver: class { constructor(callback) { mutations = callback; observers++; } observe() {} }
  });
  vm.runInContext(script, context);
  const install = () => vm.runInContext(`installLayarPlayer({css:'',blockAds:${blockAds}})`, context);
  install();
  return {
    clicks, video, listeners, frames, styles, classes, install,
    get plays() { return plays; }, get observers() { return observers; },
    mutate: () => mutations(), flush: () => frames.splice(0).forEach(callback => callback()),
    removeTarget: () => { present = false; }
  };
}

test('Android bootstrap clicks initial Play once and leaves Replay and countdown controls alone', () => {
  const f = fixture();
  assert.deepEqual(f.clicks, ['skip', 'initial-play']);
  for (let i = 0; i < 10; i++) f.mutate();
  assert.equal(f.frames.length, 1);
  f.flush();
  assert.deepEqual(f.clicks, ['skip', 'initial-play']);
});

test('Android bootstrap preserves a manual pause and installs only one observer', () => {
  const f = fixture();
  assert.equal(f.plays, 1);
  f.video.paused = true;
  f.mutate(); f.flush(); f.install();
  assert.equal(f.plays, 1);
  assert.equal(f.video.paused, true);
  assert.equal(f.observers, 1);
  assert.equal(f.styles.length, 1);
});

test('Android bootstrap waits for metadata before its single autoplay attempt', () => {
  const f = fixture({ readyState: 0 });
  assert.equal(f.plays, 0);
  f.video.readyState = 1;
  f.listeners.loadedmetadata();
  assert.equal(f.plays, 1);
  f.video.paused = true;
  f.mutate(); f.flush();
  assert.equal(f.plays, 1);
});

test('rejected Android autoplay leaves audio enabled and permits manual playback', async () => {
  const f = fixture({ rejected: true });
  await Promise.resolve();
  f.mutate(); f.flush();
  assert.equal(f.video.muted, false);
  assert.equal(f.plays, 1);
});

test('Android ad skipping follows the saved setting', () => {
  const f = fixture({ blockAds: false });
  assert.deepEqual(f.clicks, ['initial-play']);
});

test('leaving the source player restores the page instead of hiding all content', () => {
  const f = fixture();
  assert.equal(f.classes.has('layar-player-active'), true);
  f.removeTarget(); f.mutate(); f.flush();
  assert.equal(f.classes.has('layar-player-active'), false);
});
