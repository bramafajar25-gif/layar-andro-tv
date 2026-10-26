'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { installPlayerTools, playerSnapshot } = require('../desktop/player-tools.cjs');
function fixture() {
  const clicked = [];
  const button = (textContent, disabled, visible = true) => ({ textContent, disabled, getClientRects: () => visible ? [1] : [], click: () => clicked.push(textContent) });
  const buttons = [button('Lewati Iklan', false), button('Skip ad', true), button('Lewati dalam 5 dtk', false), button('Putar film', false), button('Skip ads', false, false)];
  const root = { setAttribute() {}, removeAttribute() {} };
  const context = { window: {}, document: { body: { classList: { toggle() {} } }, querySelector: name => name === '.hero-player-playing' ? root : null, querySelectorAll: () => buttons }, MutationObserver: class { observe() {} }, requestAnimationFrame: callback => callback() };
  vm.createContext(context);
  return { context, clicked };
}
test('auto skip clicks only visible enabled ad skip buttons, leaving countdown and film buttons alone', () => {
  const { context, clicked } = fixture();
  vm.runInContext(`(${installPlayerTools})({blockAds:true})`, context);
  assert.deepEqual(clicked, ['Lewati Iklan']);
  assert.equal(context.window.__layarTools.skipped, 1);
});
test('disabled filtering never auto-clicks and installing twice reuses page tools', () => {
  const { context, clicked } = fixture();
  vm.runInContext(`(${installPlayerTools})({blockAds:false})`, context);
  const tools = context.window.__layarTools;
  vm.runInContext(`(${installPlayerTools})({blockAds:true})`, context);
  assert.equal(context.window.__layarTools, tools);
  assert.equal(tools.options.blockAds, true);
  assert.deepEqual(clicked, []);
});
test('stream dimensions report the playing movie and exclude sponsored video', () => {
  const video = { videoWidth: 3840, videoHeight: 2160, currentTime: 10, paused: false, readyState: 3 };
  let title = 'NOW PLAYING';
  const context = { window: {}, document: { querySelector: () => ({ querySelector: name => name === 'video' ? video : { textContent: title } }) } };
  vm.createContext(context);
  let result = vm.runInContext(`(${playerSnapshot})()`, context);
  assert.equal(result.height, 2160);
  assert.equal(result.playing, true);
  title = 'SPONSORED';
  result = vm.runInContext(`(${playerSnapshot})()`, context);
  assert.equal(result.height, 0);
  assert.equal(result.playing, false);
});
test('Indonesian subtitle detection uses caption tracks and never changes the selected subtitle mode', () => {
  const tracks = [{ kind: 'subtitles', language: 'en', label: 'English', mode: 'showing' }, { kind: 'subtitles', language: 'id-ID', label: 'Indonesia', mode: 'disabled' }];
  const video = { textTracks: tracks };
  const context = { window: {}, document: { querySelector: () => ({ querySelector: name => name === 'video' ? video : { textContent: 'NOW PLAYING' } }) } };
  vm.createContext(context);
  assert.equal(vm.runInContext(`(${playerSnapshot})()`, context).hasIndonesianSubtitles, true);
  assert.equal(tracks[1].mode, 'disabled');
  tracks.splice(1);
  assert.equal(vm.runInContext(`(${playerSnapshot})()`, context).hasIndonesianSubtitles, false);
  tracks.push({ kind: 'metadata', language: 'id', label: 'Indonesia' });
  assert.equal(vm.runInContext(`(${playerSnapshot})()`, context).hasIndonesianSubtitles, false);
});
