'use strict';
// Runs in the isolated source page; no Node APIs or session-gate changes.
function installPlayerTools(options) {
  if (window.__layarTools) { window.__layarTools.options = options; return; }
  const state = window.__layarTools = { options, skipped: 0 };
  let queued = false;
  const resumed = new WeakSet();

  const AD_SELECTORS = [
    '.ad-overlay', '.ad-container', '.ads-container', '[id*="ad-overlay"]',
    '[class*="ad-banner"]', '[class*="ads-banner"]', '[id*="ads-"]',
    '.popup-overlay', '.modal-ads', '[class*="popunder"]', '[class*="popup-ad"]',
    'iframe[src*="ads"]', 'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
    '[class*="sponsor"]', '[id*="sponsor"]', '.overlay-ad', '#overlay-ad',
    '.video-ad-overlay', '.ad-blocker-message', '.adblock-message',
    '[data-ad]', '[data-ads]', '[data-ad-slot]'
  ];
  const SKIP_BUTTON_TEXTS = /^(skip\s*ad|skip\s*ads|lewati\s*iklan|lanjutkan\s*ke\s*video)$/i;

  function hideAdElements() {
    for (const selector of AD_SELECTORS) {
      for (const el of document.querySelectorAll(selector)) {
        if (typeof el.closest === 'function' && el.closest('[data-layar-player]') && typeof el.querySelector === 'function' && el.querySelector('video')) continue;
        if (el.style && typeof el.style.setProperty === 'function') {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
        }
      }
    }
  }

  function clickSkipButtons() {
    for (const button of document.querySelectorAll('button')) {
      if (button.disabled) continue;
      const visible = typeof button.getClientRects === 'function' ? button.getClientRects().length > 0 : button.offsetParent !== null;
      if (!visible) continue;
      const text = (button.textContent || '').trim();
      const isSkipText = SKIP_BUTTON_TEXTS.test(text);
      const isAdClose = typeof button.matches === 'function' && button.matches('.close-ad, .ad-close, [class*="close-ad"], [aria-label*="close ad" i]');
      if (isSkipText || isAdClose) {
        button.click();
        state.skipped++;
      }
    }
  }

  function speedUpAdVideo() {
    const root = document.querySelector('[data-layar-player]');
    const ad = /sponsored|bersponsor|lewati dalam|skip in/i.test(root?.querySelector('.hero-player-titlebar')?.textContent || '');
    if (ad) {
      const video = root?.querySelector('video');
      if (video && video.playbackRate < 16) { video.playbackRate = 16; video.muted = true; }
    }
  }

  function update() {
    queued = false;
    const target = document.querySelector('.hero-player-playing') || document.querySelector('.detail-backdrop');
    const previous = document.querySelector('[data-layar-player]');
    if (previous !== target) {
      previous?.removeAttribute('data-layar-player');
      target?.setAttribute('data-layar-player', '');
    }
    document.body.classList.toggle('layar-player-active', !!target);
    const video = target?.querySelector?.('video');
    const advertisement = /sponsored|bersponsor|lewati dalam|skip in/i.test(target?.querySelector?.('.hero-player-titlebar')?.textContent || '');
    if (video && !advertisement && !resumed.has(video)) {
      resumed.add(video);
      const resume = () => { if (state.options.resumeTime > 0 && Number.isFinite(video.duration) && video.currentTime < 2) video.currentTime = Math.min(state.options.resumeTime, video.duration); };
      if (video.readyState > 0) resume(); else video.addEventListener('loadedmetadata', resume, {once:true});
    }
    if (!state.options.blockAds) return;
    // Hide off-site promo links
    for (const link of target?.querySelectorAll?.('a[href]') || []) {
      try { if (new URL(link.href, location.href).origin !== location.origin) link.setAttribute('data-layar-promo', ''); } catch {}
    }
    clickSkipButtons();
    hideAdElements();
    speedUpAdVideo();
  }
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(update); } }).observe(document.body, { childList: true, subtree: true });
  // Periodic check every 500ms for ads that appear without DOM mutations
  if (typeof setInterval === 'function') setInterval(() => { if (state.options.blockAds) { clickSkipButtons(); hideAdElements(); speedUpAdVideo(); } }, 500);
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
  return { advertisement: ad, subtitleTracks, hasIndonesianSubtitles, width: !ad && video?.videoWidth || 0, height: !ad && video?.videoHeight || 0, time: !ad && video?.currentTime || 0, duration: !ad && Number.isFinite(video?.duration) ? video.duration : 0, playing: !ad && !!video && !video.paused && video.readyState >= 2, skipped: window.__layarTools?.skipped || 0 };
}
module.exports = { installPlayerTools, playerSnapshot };
