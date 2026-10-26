'use strict';
// Runs in the isolated source page; no Node APIs or session-gate changes.
function installPlayerTools(options) {
  if (window.__layarTools) { window.__layarTools.options = options; return; }
  const state = window.__layarTools = { options, skipped: 0 };
  let queued = false;
  function update() {
    queued = false;
    const target = document.querySelector('.hero-player-playing') || document.querySelector('.detail-backdrop');
    const previous = document.querySelector('[data-layar-player]');
    if (previous !== target) {
      previous?.removeAttribute('data-layar-player');
      target?.setAttribute('data-layar-player', '');
    }
    document.body.classList.toggle('layar-player-active', !!target);
    if (!state.options.blockAds) return;
    for (const button of document.querySelectorAll('button')) {
      if (!button.disabled && button.getClientRects().length && /^(skip ad|skip ads|lewati iklan|lanjutkan ke video)$/i.test(button.textContent.trim())) {
        button.click(); state.skipped++;
      }
    }
  }
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(update); } }).observe(document.body, { childList: true, subtree: true });
  update();
}
function playerSnapshot() {
  const root = document.querySelector('[data-layar-player]');
  const video = root?.querySelector('video');
  const ad = /sponsored|bersponsor|lewati dalam|skip in/i.test(root?.querySelector('.hero-player-titlebar')?.textContent || '');
  const subtitleTracks = ad ? [] : Array.from(video?.textTracks || [])
    .filter(track => ['subtitles', 'captions'].includes(track.kind)).slice(0, 16)
    .map(track => ({ language: String(track.language || '').slice(0, 35), label: String(track.label || '').slice(0, 100) }));
  const hasIndonesianSubtitles = subtitleTracks.some(track => /^(id|ind|in)(-|$)/i.test(track.language) || /\b(indonesia|indonesian)\b/i.test(track.label));
  return { advertisement: ad, subtitleTracks, hasIndonesianSubtitles, width: !ad && video?.videoWidth || 0, height: !ad && video?.videoHeight || 0, time: !ad && video?.currentTime || 0, playing: !ad && !!video && !video.paused && video.readyState >= 2, skipped: window.__layarTools?.skipped || 0 };
}
module.exports = { installPlayerTools, playerSnapshot };
