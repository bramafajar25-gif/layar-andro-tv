'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createI18n } = require('../i18n.js');

test('English and Indonesian can be switched independently without changing source text', () => {
  const ui = createI18n('en'), other = createI18n();
  assert.equal(ui.t('Beranda'), 'Home');
  assert.equal(ui.t('Daftarku'), 'My List');
  assert.equal(ui.t('Cyberpunk: Edgerunners'), 'Cyberpunk: Edgerunners');
  assert.equal(other.t('Beranda'), 'Beranda');
  ui.setLanguage('id');
  assert.equal(ui.t('Daftarku'), 'Daftarku');
});
test('dynamic labels interpolate once and use English episode plurals', () => {
  const ui = createI18n('en');
  assert.equal(ui.t('{count} episode', { count: 1 }), '1 episode');
  assert.equal(ui.t('{count} episode', { count: 23 }), '23 episodes');
  assert.equal(ui.t('Memuat {title}…', { title: '{count}' }), 'Loading {count}…');
  ui.setLanguage('id');
  assert.equal(ui.t('{count} episode', { count: 23 }), '23 episode');
});
test('invalid language input preserves the current language and invalid stored values fall back to Indonesian', () => {
  const ui = createI18n('en');
  assert.throws(() => ui.setLanguage('fr'), /Unsupported language/);
  assert.equal(ui.language, 'en');
  assert.equal(createI18n('unexpected').language, 'id');
});
