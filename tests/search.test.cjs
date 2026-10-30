'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const searchCode = source.slice(source.indexOf('const isTv ='), source.indexOf("$('#modal').onclick"));
function fixture() {
  const events = {}, calls = [], timers = new Map();
  let nextTimer = 0;
  const input = { value: '', addEventListener: (name, fn) => events[name] = fn, focus: () => calls.push('input-focus') };
  const main = { focus: () => calls.push('main-focus') };
  const card = { focus: () => calls.push('card-focus') };
  const nav = { focus: () => calls.push('nav-focus') };
  const context = vm.createContext({
    window: { AndroidBridge: { isTelevision: () => true, showKeyboard: () => calls.push('show'), hideKeyboard: () => calls.push('hide') } },
    document: { body: { classList: { toggle() {} } }, addEventListener() {} },
    $: selector => ({ '#search': input, '#main': main, '#main .card:not(.skeleton)': card, '[data-tab].active': nav, '.search': { addEventListener() {} } })[selector],
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    render: () => calls.push('render'), searchTimer: undefined, viewToken: 0, currentQuery: ''
  });
  vm.runInContext(searchCode, context);
  const key = name => events.keydown({ key: name, preventDefault() {}, stopPropagation() {} });
  return { events, calls, input, timers, context, key };
}
test('search Enter cancels debounce, submits current text and leaves input', () => {
  const f = fixture(); f.input.value = ' Wednesday ';
  f.events.input({ isComposing: false });
  assert.equal(f.timers.size, 1);
  f.key('Enter');
  assert.equal(f.timers.size, 0);
  assert.equal(f.context.currentQuery, 'Wednesday');
  assert.deepEqual(f.calls, ['hide', 'main-focus', 'render']);
});
test('search waits for IME composition to finish', () => {
  const f = fixture(); f.input.value = 'film';
  f.events.input({ isComposing: true });
  assert.equal(f.timers.size, 0);
  f.events.compositionend();
  assert.equal(f.timers.size, 1);
  assert.equal(f.context.currentQuery, 'film');
});
test('search Down and Escape restore useful remote focus', () => {
  const f = fixture(); f.key('ArrowDown'); f.key('Escape');
  assert.deepEqual(f.calls, ['hide', 'card-focus', 'hide', 'nav-focus']);
});
test('clearing search debounces back to the selected catalogue', () => {
  const f = fixture(); f.input.value = 'film'; f.events.input({});
  f.input.value = ''; f.events.input({});
  assert.equal(f.timers.size, 1);
  assert.equal(f.context.currentQuery, '');
  [...f.timers.values()][0]();
  assert.deepEqual(f.calls, ['render']);
});
