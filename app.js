'use strict';
const $ = selector => document.querySelector(selector);
if (!window.layarDesktop && window.AndroidBridge) {
  window.layarDesktop = {
    api: async resource => {
      const res = await fetch('/api/source?resource=' + encodeURIComponent(resource));
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Sumber belum bisa dimuat.');
      return data;
    },
    settings: async () => {
      try { return JSON.parse(window.AndroidBridge.getSettings()); }
      catch { return { quality: 'auto', blockAds: true, passthrough: false, nativePath: '', language: 'id' }; }
    },
    setLanguage: async value => {
      window.AndroidBridge.setLanguage(value);
      return value;
    },
    saveSettings: async value => {
      window.AndroidBridge.saveSettings(JSON.stringify(value));
      return value;
    },
    chooseNative: async () => ({ nativePath: '' }),
    native: async () => {},
    openFile: async () => ({ opened: false }),
    play: async options => {
      window.AndroidBridge.play(JSON.stringify(options));
    },
    closePlayer: async () => {
      window.AndroidBridge.closePlayer();
    },
    fullscreen: async () => {},
    openSource: async options => {
      window.AndroidBridge.openSource(options ? JSON.stringify(options) : '');
    },
    onPlayerStatus: callback => {
      window.__layarPlayerStatus = callback;
    }
  };
}
const desktop = window.layarDesktop;
const SOURCE = 'https://z2.idlixku.com';
const IMG = 'https://image.tmdb.org/t/p/';
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const logo = (name, label) => `<svg class="brand-logo logo-${name}" role="img" aria-label="${label}"><use href="#logo-${name}"/></svg>`;
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('layar.v2.' + key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('layar.v2.' + key, JSON.stringify(value)); } catch {} }
};
const i18n = window.LayarI18n.createI18n(storage.get('language', 'id'));
const t = (key, values) => i18n.t(key, values);
function applyInterfaceLanguage() {
  document.documentElement.lang = i18n.language;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  for (const attribute of ['title', 'aria-label', 'placeholder']) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(node => node.setAttribute(attribute, t(node.getAttribute('data-i18n-' + attribute))));
  }
  $('#language').value = i18n.language;
}
async function changeLanguage(value) {
  if (!['id', 'en'].includes(value) || value === i18n.language) return;
  const wasSettings = !!$('#languagePreference');
  const item = !$('#modal').classList.contains('hidden') && !wasSettings ? detail : null;
  const season = Number($('#detailSeason')?.value);
  i18n.setLanguage(value); storage.set('language', value);
  applyInterfaceLanguage();
  render();
  if (wasSettings) { await openSettings(); $('#languagePreference [aria-checked=true]')?.focus(); }
  else if (item) {
    renderDetail(item);
    if (season && $('#detailSeason') && Number($('#detailSeason').value) !== season) { $('#detailSeason').value = String(season); loadDetailEpisodes(item, season); }
  }
  if (playback) {
    $('#playerSubtitle').textContent = playback.episode ? `Season ${playback.season} · Episode ${playback.episode.number} — ${playback.episode.title}` : `${playback.item.year} · ${runtime(playback.item.runtime)}`;
    if (playback.item.type === 'tv_series') loadPlayerEpisodes(sidebarSeason || playback.season);
    if (externalPlaying) $('#playerMessage').innerHTML = `<p>${t('Film diputar di mpv.')}</p><small>${t('Tutup mpv untuk kembali ke player internal.')}</small>`;
    else if (lastPlayerStatus) handlePlayerStatus(lastPlayerStatus);
  }
  try { await desktop?.setLanguage?.(value); } catch (error) { toast(errorText(error)); }
}
const image = (path, size = 'w500') => !path ? '' : /^\/[a-zA-Z0-9_.-]+$/.test(path) ? IMG + size + path : '';
const keyOf = item => item.type + ':' + item.slug;
const typeLabel = item => item.type === 'tv_series' ? t("SERIES") : t("FILM");
const runtime = n => n ? (n >= 60 ? `${Math.floor(n / 60)} ${i18n.language === 'en' ? 'h' : 'j'}${n % 60 ? ` ${n % 60} m` : ''}` : n + ' m') : '';
const saved = item => storage.get('list', []).some(x => keyOf(x) === keyOf(item));
const historyOf = item => storage.get('history', []).find(x => keyOf(x.item) === keyOf(item));
let viewToken = 0, detailToken = 0, episodeToken = 0, playerEpisodeToken = 0;
let currentTab = 'home', currentQuery = '', homeData, detail, playback, focusBeforeModal, searchTimer, toastTimer, heroTimer;
function clearHeroTimer() { if (heroTimer) { clearTimeout(heroTimer); heroTimer = null; } }
let sidebarSeason = 0, episodeSelector;
let settingsToken = 0, capabilityPromise, streamFormats = {}, externalPlaying = false, lastPlayerStatus;
function qualityLabel(height) { return height >= 2160 ? '4K UHD' : height >= 1080 ? '1080p' : height ? height + 'p' : ''; }
function probeCapabilities() {
  return capabilityPromise ||= (async () => {
    async function probe(config) { try { return await navigator.mediaCapabilities.decodingInfo({ type: 'media-source', ...config }); } catch { return { supported: false, smooth: false, powerEfficient: false }; } }
    const [avc, hevc, dolby, atmos] = await Promise.all([
      probe({ video: { contentType: 'video/mp4; codecs="avc1.640033"', width: 3840, height: 2160, bitrate: 20000000, framerate: 30 } }),
      probe({ video: { contentType: 'video/mp4; codecs="hvc1.1.6.L153.B0"', width: 3840, height: 2160, bitrate: 20000000, framerate: 30 } }),
      probe({ audio: { contentType: 'audio/mp4; codecs="ec-3"', channels: '6', bitrate: 768000, samplerate: 48000 } }),
      probe({ audio: { contentType: 'audio/mp4; codecs="ec-3"', channels: '16', bitrate: 768000, samplerate: 48000, spatialRendering: true } })
    ]);
    return { avc, hevc, dolby, atmos };
  })();
}

async function api(resource) {
  if (desktop) return desktop.api(resource);
  if (location.protocol === 'file:') throw new Error(t("Buka Layar lewat Layar.vbs untuk menjalankan aplikasi desktop."));
  const response = await fetch('/api/source?resource=' + encodeURIComponent(resource), { signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t("Sumber belum bisa dimuat."));
  return data;
}
function errorText(error) {
  const message = (error?.message || 'Koneksi ke IDLIX terputus. Coba lagi.').replace(/^Error invoking remote method '[^']+': Error: /, '');
  if (i18n.language === 'en' && /^IDLIX belum bisa dimuat \(\d+\)\.$/.test(message)) return message.replace('IDLIX belum bisa dimuat', 'Could not load IDLIX');
  return t(message);
}
function element(tag, className, html) { const node = document.createElement(tag); node.className = className || ''; if (html != null) node.innerHTML = html; return node; }
function toast(text) { const node = $('#toast'); node.textContent = text; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3200); }
function metadata(item) {
  return `${item.rating ? `<span class="rating">★ ${item.rating.toFixed(1)}</span>` : ''}<span>${esc(item.year)}</span>${item.type === 'tv_series' && item.numberOfSeasons ? `<span>${t("{count} season", { count: item.numberOfSeasons })}</span>` : item.runtime ? `<span>${runtime(item.runtime)}</span>` : ''}${item.quality ? `<span class="quality">${esc(item.quality)}</span>` : ''}`;
}
function listButton(item, compact = false) { return compact ? icon(saved(item) ? 'check' : 'plus') : icon(saved(item) ? 'check' : 'plus') + (saved(item) ? t("Di Daftarku") : t("Daftarku")); }
function toggleList(item) {
  const list = storage.get('list', []), exists = saved(item);
  storage.set('list', exists ? list.filter(x => keyOf(x) !== keyOf(item)) : [item, ...list]);
  document.querySelectorAll('[data-save]').forEach(button => { if (button.dataset.save === keyOf(item)) { button.innerHTML = listButton(item, button.classList.contains('icon-button')); button.setAttribute('aria-pressed', String(!exists)); } });
  toast(exists ? t("Dihapus dari Daftarku") : t("Ditambahkan ke Daftarku"));
}
function card(item, recent, landscape = false, rank = null) {
  const button = element('button', 'card' + (landscape ? ' landscape-card' : ''));
  button.title = `${item.title}${item.year ? ' (' + item.year + ')' : ''}`;
  const src = image(landscape ? item.backdrop || item.poster : item.poster, landscape ? 'w500' : 'w342');
  const topBadge = rank ? `<span class="card-rank-badge">#${rank} TOP 10</span>` : '';
  const score = item.rating ? `<span class="card-score">★ ${item.rating.toFixed(1)}</span>` : '';
  const yearText = item.year ? `<span>${item.year}</span>` : '';
  const typeText = `<span>${item.type === 'tv_series' ? t("Series") : t("Film")}</span>`;
  const qualityChip = `<span class="card-chip">${esc(item.quality || 'HD')}</span>`;
  button.innerHTML = `<div class="card-art">${src ? `<img src="${src}" alt="${esc(item.title)}" loading="lazy" decoding="async">` : `<span class="no-image">${esc(item.title)}</span>`}<span class="card-type">${landscape ? `<b>L</b>` : typeLabel(item)}</span>${topBadge}<span class="card-shade"></span>${landscape ? `<div class="card-overlay-info"><span class="card-overlay-title">${esc(item.title)}</span><div class="card-overlay-meta">${score}${yearText}${typeText}${qualityChip}</div></div>` : ''}<span class="card-play">${icon('play')}</span>${recent?.episode ? `<span class="recent-tag">S${recent.season} · E${recent.episode}</span>` : ''}</div><span class="card-caption">${esc(item.title)}</span><span class="card-meta"><span>${esc(item.year)}</span>${item.rating ? `<span class="score">★ ${item.rating.toFixed(1)}</span>` : ''}<span>${item.type === 'tv_series' ? t("Series") : t("Film")}</span></span>`;
  button.setAttribute('aria-label', recent?.episode ? t("{title}, terakhir Season {season} Episode {episode}", { title: item.title, season: recent.season, episode: recent.episode }) : item.title);
  button.querySelector('img')?.addEventListener('error', event => { event.target.replaceWith(element('span', 'no-image', esc(item.title))); }, { once: true });
  button.onclick = () => item.type === 'tv_series' ? openDetail(item, true) : playTitle(item);
  return button;
}
const rowNames = { 'Trending Now': 'Lagi ramai ditonton', 'Trending in Indonesia': 'Populer di Indonesia', 'Trending in Your Country': 'Populer di Indonesia', 'Network Originals': 'Dari jaringan favoritmu', Collections: 'Pilihan buat malam ini', 'Recently Added Movies': 'Film yang baru hadir', 'Recently Added Series': 'Series yang baru hadir' };
function makeRow(title, items, opts = {}) {
  const section = element('section', 'row');
  section.innerHTML = `<div class="row-heading"><h2>${esc(title)}</h2><div class="row-tools"><button data-dir="-1" aria-label="${esc(t("Geser {title} ke kiri", { title }))}">‹</button><button data-dir="1" aria-label="${esc(t("Geser {title} ke kanan", { title }))}">›</button></div></div><div class="track"></div>`;
  const track = section.querySelector('.track');
  const isTrending = /ramai|populer|trending|pilihan/i.test(title);
  items.forEach((item, idx) => track.append(card(item, opts.history?.find(x => keyOf(x.item) === keyOf(item)), true, isTrending && idx < 10 ? (idx + 1) : null)));
  section.querySelectorAll('[data-dir]').forEach(button => { button.onclick = () => track.scrollBy({ left: Number(button.dataset.dir) * track.clientWidth * .8, behavior: 'smooth' }); });
  return section;
}
function renderHero(items) {
  clearHeroTimer();
  const hero = element('section', 'hero');
  const pool = items.filter(x => x.backdrop).slice(0, 5);
  if (!pool.length) return hero;
  let currentIndex = 0;
  let isPaused = false;

  hero.innerHTML = `
    <div class="hero-bg-wrap">
      <img class="hero-image active" src="${image(pool[0].backdrop, 'w1280')}" alt="" fetchpriority="high">
    </div>
    <div class="hero-vignette"></div>
    <div class="hero-content"></div>
    <div class="hero-maturity"><span></span></div>
    <div class="hero-bottom">
      <div class="hero-dots">${pool.map((_, i) => `<button data-slide="${i}" class="${i === 0 ? 'active' : ''}" aria-label="${t("Pilihan")} ${i + 1}" aria-pressed="${i === 0}"></button>`).join('')}</div>
      <span class="hero-source">${t("KATALOG IDLIX")}</span>
    </div>`;

  const bgWrap = hero.querySelector('.hero-bg-wrap');
  const contentEl = hero.querySelector('.hero-content');
  const maturitySpan = hero.querySelector('.hero-maturity span');
  const dots = hero.querySelectorAll('[data-slide]');

  function updateContent(item) {
    const maturity = item.certification || '';
    const tagline = item.genres?.length ? item.genres.slice(0, 2).join(' • ') : (item.type === 'tv_series' ? t("Series Populer") : t("Film Populer"));
    maturitySpan.textContent = maturity;
    maturitySpan.parentElement.hidden = !maturity;

    contentEl.innerHTML = `
      <div class="hero-kicker"><span class="hero-monogram">L</span> <span class="hero-type-tag">${typeLabel(item)}</span></div>
      <div class="hero-title">${image(item.logo) ? `<img class="hero-logo" src="${image(item.logo, 'w500')}" alt="${esc(item.title)}">` : `<h1>${esc(item.title)}</h1>`}</div>
      <div class="hero-meta">${metadata(item)}</div>
      <div class="hero-tagline">${icon('sparkle')}<span>${esc(tagline)}</span></div>
      <p class="hero-overview">${esc(item.overview || t("Temukan cerita berikutnya buat ditonton malam ini."))}</p>
      <div class="btns">
        <button class="btn primary hero-play" data-action="play">${icon('play')} <span>${t("Putar")}</span></button>
        <button class="btn secondary hero-info" data-action="detail">${icon('info')} <span>${t("Info lainnya")}</span></button>
        <button class="icon-button hero-save" data-save="${esc(keyOf(item))}" aria-label="${esc(t("Simpan ke Daftarku") + " · " + item.title)}" aria-pressed="${saved(item)}">${listButton(item, true)}</button>
      </div>`;

    contentEl.querySelector('.hero-logo')?.addEventListener('error', event => event.target.replaceWith(element('h1', '', esc(item.title))), { once: true });
    contentEl.querySelector('[data-action=play]').onclick = () => item.type === 'tv_series' ? openDetail(item, true) : playTitle(item);
    contentEl.querySelector('[data-action=detail]').onclick = () => openDetail(item);
    contentEl.querySelector('[data-save]').onclick = () => toggleList(item);
  }

  function updateDots(index) {
    dots.forEach((btn, i) => {
      const isActive = i === index;
      if (isActive && btn.classList.contains('active')) {
        btn.classList.remove('active');
        void btn.offsetWidth;
      }
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive);
    });
  }

  function show(index, instant = false) {
    if (index < 0 || index >= pool.length) return;
    if (index === currentIndex && !instant) return;
    currentIndex = index;
    const item = pool[currentIndex];

    updateDots(currentIndex);

    if (instant) {
      updateContent(item);
      const activeImg = bgWrap.querySelector('.hero-image');
      if (activeImg) activeImg.src = image(item.backdrop, 'w1280');
      startTimer();
      return;
    }

    contentEl.classList.add('hero-content-exit');
    setTimeout(() => {
      updateContent(item);
      contentEl.classList.remove('hero-content-exit');
      contentEl.classList.add('hero-content-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          contentEl.classList.remove('hero-content-enter');
        });
      });
    }, 280);

    const newImg = document.createElement('img');
    newImg.className = 'hero-image incoming';
    newImg.alt = '';
    newImg.src = image(item.backdrop, 'w1280');
    newImg.onload = () => {
      bgWrap.append(newImg);
      requestAnimationFrame(() => {
        newImg.classList.add('active');
        newImg.classList.remove('incoming');
        const oldImgs = bgWrap.querySelectorAll('.hero-image:not(.incoming)');
        oldImgs.forEach(img => {
          if (img !== newImg) {
            img.classList.remove('active');
            img.classList.add('fading-out');
            setTimeout(() => img.remove(), 850);
          }
        });
      });
    };
    newImg.onerror = () => { newImg.remove(); };

    startTimer();
  }

  function startTimer() {
    clearHeroTimer();
    if (pool.length <= 1) return;
    heroTimer = setTimeout(() => {
      if (!isPaused && document.contains(hero)) {
        show((currentIndex + 1) % pool.length);
      } else if (document.contains(hero)) {
        startTimer();
      }
    }, 5000);
  }

  dots.forEach(btn => {
    btn.onclick = () => {
      show(Number(btn.dataset.slide));
    };
  });

  hero.addEventListener('mouseenter', () => {
    isPaused = true;
    hero.classList.add('hero-paused');
  });
  hero.addEventListener('mouseleave', () => {
    isPaused = false;
    hero.classList.remove('hero-paused');
    updateDots(currentIndex);
    startTimer();
  });
  hero.addEventListener('focusin', () => {
    isPaused = true;
    hero.classList.add('hero-paused');
  });
  hero.addEventListener('focusout', (e) => {
    if (!hero.contains(e.relatedTarget)) {
      isPaused = false;
      hero.classList.remove('hero-paused');
      updateDots(currentIndex);
      startTimer();
    }
  });

  show(0, true);
  return hero;
}
function showPageError(container, error, retry) {
  container.innerHTML = `<section class="status-panel"><span class="eyebrow">LAYAR · IDLIX</span><h1>${t("Belum bisa terhubung.")}</h1><p>${esc(errorText(error))}</p><div class="btns"><button class="btn primary" data-retry>${t("Coba lagi")}</button><button class="btn" data-source>${t("Buka IDLIX ↗")}</button></div></section>`;
  container.querySelector('[data-retry]').onclick = retry;
  container.querySelector('[data-source]').onclick = () => openExternal();
}
async function renderHome(token) {
  const main = $('#main');
  main.innerHTML = `<div class="skeleton skeleton-hero"></div><div class="row"><div class="track">` + `<div class="skeleton card"></div>`.repeat(7) + `</div></div>`;
  try {
    const data = await api('homepage');
    if (token !== viewToken) return;
    homeData = data;
    main.replaceChildren(renderHero(data.featured.length ? data.featured : data.rows[0]?.items || []));
    const rows = element('div', 'home-rows');
    const history = storage.get('history', []);
    const seen = new Set();
    for (const row of data.rows) {
      if (!row.title || row.type === 'tmdb_trending') continue;
      const label = t(rowNames[row.title] || row.title);
      if (seen.has(label)) continue;
      seen.add(label); rows.append(makeRow(label, row.items));
    }
    if (history.length) {
      const recent = makeRow(t("Terakhir kamu putar"), history.map(x => x.item), { history });
      if (rows.firstElementChild) rows.firstElementChild.after(recent); else rows.append(recent);
    }
    main.append(rows);
  } catch (error) { if (token === viewToken) showPageError(main, error, render); }
  finally { if (token === viewToken) main.setAttribute('aria-busy', 'false'); }
}
function showEmpty(grid, title, text) { grid.innerHTML = ''; const node = element('div', 'empty', `${icon('search')}<h2>${esc(title)}</h2><p>${esc(text)}</p>`); grid.replaceWith(node); }
function gridPage(token, { title, subtitle, fetchPage, sort = false, items }) {
  const page = element('section', 'grid-page');
  page.innerHTML = `<div class="page-heading"><div><span class="eyebrow">${t("KOLEKSI LAYAR")}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${sort ? `<select id="sort" aria-label="${esc(t("Urutkan katalog"))}"><option value="latest">${t("Baru ditambahkan")}</option><option value="popular">${t("Paling populer")}</option></select>` : ''}</div><div class="grid"></div><button class="btn load-more hidden">${t("Muat lebih banyak")}</button>`;
  $('#main').replaceChildren(page);
  const grid = page.querySelector('.grid'), more = page.querySelector('.load-more');
  let pageNumber = 0, sortValue = 'latest', requestId = 0;
  const seen = new Set();
  async function load(reset = false) {
    const request = ++requestId;
    if (reset) { pageNumber = 0; seen.clear(); grid.replaceChildren(); }
    const nextPage = pageNumber + 1;
    if (!pageNumber) { grid.innerHTML = `<div class="skeleton card"></div>`.repeat(12); }
    more.disabled = true; more.textContent = t("Memuat…");
    try {
      const data = await fetchPage(nextPage, sortValue);
      if (token !== viewToken || request !== requestId) return;
      if (!pageNumber) grid.replaceChildren();
      for (const item of data.items) { if (!seen.has(keyOf(item))) { seen.add(keyOf(item)); grid.append(card(item)); } }
      pageNumber = nextPage;
      more.classList.toggle('hidden', pageNumber >= data.pages);
      if (document.activeElement === $('#main')) grid.querySelector('.card')?.focus();
      if (!seen.size) showEmpty(grid, t("Belum ada hasil"), currentQuery ? t("Coba judul asli atau kata kunci yang lebih singkat.") : t("Judul akan muncul di sini saat tersedia."));
    } catch (error) {
      if (token !== viewToken || request !== requestId) return;
      if (!pageNumber) {
        grid.innerHTML = `<div class="empty"><p>${esc(errorText(error))}</p><button class="btn" data-retry>${t("Coba lagi")}</button></div>`;
        grid.querySelector('[data-retry]').onclick = () => load(true);
      } else toast(errorText(error));
    } finally { if (request === requestId) { more.disabled = false; more.textContent = t("Muat lebih banyak"); $('#main').setAttribute('aria-busy', 'false'); } }
  }
  more.onclick = () => load();
  page.querySelector('#sort')?.addEventListener('change', event => { sortValue = event.target.value; load(true); });
  if (items) { items.forEach(item => grid.append(card(item))); if (!items.length) showEmpty(grid, t("Daftarku masih kosong"), t("Simpan film atau series lewat tombol + supaya gampang ditemukan lagi.")); $('#main').setAttribute('aria-busy', 'false'); }
  else load();
}
function render() {
  clearHeroTimer();
  const token = ++viewToken;
  document.body.classList.toggle('catalog-view', !!currentQuery || currentTab !== 'home');
  $('#main').setAttribute('aria-busy', 'true');
  window.scrollTo(0, 0);
  const query = currentQuery;
  if (query) gridPage(token, { title: t("Hasil untuk “{query}”", { query: currentQuery }), subtitle: t("Film dan series dari katalog IDLIX."), fetchPage: page => api('search?' + new URLSearchParams({ q: query, page, limit: 24 })) });
  else if (currentTab === 'home') renderHome(token);
  else if (currentTab === 'list') gridPage(token, { title: t("Daftarku"), subtitle: t("Cerita yang kamu simpan untuk nanti."), items: storage.get('list', []) });
  else gridPage(token, { title: currentTab === 'movie' ? t("Film") : t("Series"), subtitle: currentTab === 'movie' ? t("Satu film lagi sebelum hari berganti.") : t("Satu episode selalu berujung satu season."), sort: true, fetchPage: (page, sort) => api(`${currentTab === 'movie' ? 'movies' : 'series'}?page=${page}&limit=24&sort=${sort}`) });
}
function setTab(tab) {
  clearTimeout(searchTimer); currentTab = tab; currentQuery = ''; $('#search').value = '';
  document.querySelectorAll('[data-tab]').forEach(button => { button.classList.toggle('active', button.dataset.tab === tab); button.setAttribute('aria-current', button.dataset.tab === tab ? 'page' : 'false'); });
  render();
}

function openModal() { $('#modal').setAttribute?.('aria-label', t('Detail judul')); if (playback) desktop?.playerVisible?.(false)?.catch(() => {}); $('#dialog').classList.remove('concept-dialog'); focusBeforeModal = document.activeElement; $('#modal').classList.remove('hidden'); document.body.classList.add('locked'); $('#modal').scrollTop = 0; $('#modal').focus(); }
function closeModal() { episodeSelector?.dispose(); episodeSelector = null; $('#modal').classList.remove('episode-overlay'); $('#modal').style?.removeProperty('--episode-backdrop'); ++detailToken; ++episodeToken; ++settingsToken; $('#modal').classList.add('hidden'); $('#dialog').replaceChildren(); $('#dialog').classList.remove('concept-dialog'); detail = null; if (playback) desktop?.playerVisible?.(true)?.catch(() => {}); if (!playback) document.body.classList.remove('locked'); focusBeforeModal?.focus?.(); if (currentTab === 'list') render(); }
async function openDetail(item, focusEpisodes = false) {
  openModal(); const token = ++detailToken;
  $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="loading"><span class="spinner"></span><p>${t("Memuat {title}…", { title: esc(item.title) })}</p></div>`;
  try {
    const data = await api(`${item.type === 'tv_series' ? 'series' : 'movies'}/${item.slug}`);
    if (token !== detailToken) return;
    detail = data; renderDetail(data);
    if (focusEpisodes && item.type === 'tv_series') { selectDetailTab('episodes'); $('#dialog [data-season][aria-pressed=true]')?.focus(); }
  } catch (error) {
    if (token !== detailToken) return;
    $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="empty"><h2>${t("Detail belum bisa dimuat")}</h2><p>${esc(errorText(error))}</p><button class="btn" data-retry>${t("Coba lagi")}</button></div>`;
    $('#dialog [data-retry]').onclick = () => openDetail(item, focusEpisodes);
  }
}
let detailEpisodes = [];
function selectDetailTab(name) {
  document.querySelectorAll('[data-detail-tab]').forEach(button => {
    const active = button.dataset.detailTab === name;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-detail-panel]').forEach(panel => { panel.hidden = panel.dataset.detailPanel !== name; });
}
function renderDetail(item) {
  const last = historyOf(item), series = item.type === 'tv_series';
  const availableSeasons = (item.seasons || []).filter(s => s.number > 0).sort((a, b) => a.number - b.number);
  const initialSeason = availableSeasons.find(s => s.number === last?.season)?.number || availableSeasons[0]?.number;
  detailEpisodes = [];
  $('#dialog').classList.add('concept-dialog');
  const tabs = [['overview', t('Overview')], ...(series ? [['episodes', t('Episodes')]] : []), ['details', t('Details')]];
  const title = image(item.logo) ? `<img class="concept-logo" src="${image(item.logo, 'w500')}" alt="${esc(item.title)}">` : `<h2>${esc(item.title)}</h2>`;
  $('#dialog').innerHTML = `<article class="concept-detail">
    <div class="concept-backdrop" style="background-image:url('${image(item.backdrop, 'w1280')}')"></div>
    <button class="icon-button dialog-close" data-close aria-label="${esc(t('Tutup'))}">${icon('close')}</button>
    <div class="concept-layout">
      <div class="concept-left">
        <div class="detail-kicker"><span class="hero-monogram">L</span><span class="eyebrow">${typeLabel(item)}</span></div>
        <div class="concept-title">${title}</div>
        <div class="detail-quick-meta">${metadata(item)}${item.certification ? `<span class="detail-maturity-badge">${esc(item.certification)}</span>` : ''}</div>
        <div class="concept-panels">
          <section id="detail-overview" role="tabpanel" aria-labelledby="tab-overview" data-detail-panel="overview"><p class="detail-synopsis">${esc(item.overview || t('Sinopsis belum tersedia.'))}</p></section>
          ${series ? `<section id="detail-episodes" role="tabpanel" aria-labelledby="tab-episodes" data-detail-panel="episodes" hidden><p class="detail-synopsis">${t('Pilih season, lalu episode yang ingin kamu tonton.')}</p>${last?.episode ? `<p class="episode-status">${esc(t('Terakhir diputar'))}: S${last.season} · E${last.episode}</p>` : ''}<button class="text-button" data-browse-episodes>${t('Daftar episode')} <span aria-hidden="true">&rarr;</span></button></section>` : ''}
          <section id="detail-details" role="tabpanel" aria-labelledby="tab-details" data-detail-panel="details" hidden><div class="detail-meta-col">${item.cast?.length ? `<p><b>${t('Pemeran:')}</b> <span class="meta-val">${esc(item.cast.join(', '))}</span></p>` : ''}${item.genres?.length ? `<p><b>${t('Genre:')}</b> <span class="meta-val">${esc(item.genres.join(' · '))}</span></p>` : ''}${item.director ? `<p><b>${t('Sutradara:')}</b> <span class="meta-val">${esc(item.director)}</span></p>` : ''}<p>${t('Kualitas dan audio mengikuti stream yang diputar.')}</p></div></section>
        </div>
        <div class="btns concept-actions"><button class="btn primary" data-play ${!series && item.hasVideo === false || series && !initialSeason ? 'disabled' : ''}>${icon('play')} ${t('Putar')}</button><button class="btn" data-more-info>${t('Info lainnya')}</button><button class="icon-button" data-save="${esc(keyOf(item))}" aria-label="${esc(t('Simpan ke Daftarku'))}" aria-pressed="${saved(item)}">${listButton(item, true)}</button></div>
        <div class="detail-tabs" role="tablist" aria-label="${esc(t('Detail judul'))}">${tabs.map(([name, label]) => `<button id="tab-${name}" role="tab" data-detail-tab="${name}" aria-controls="detail-${name}" aria-selected="${name === 'overview'}" tabindex="${name === 'overview' ? 0 : -1}">${label}</button>`).join('')}</div>
      </div>
      ${series ? `<div id="detailEpisodeSelector"></div><select id="detailSeason" class="hidden" aria-label="Season">${availableSeasons.map(season => `<option value="${season.number}">${season.number}</option>`).join('')}</select>` : ''}
    </div>
  </article>`;
  $('#dialog .concept-logo')?.addEventListener('error', event => event.target.replaceWith(element('h2', '', esc(item.title))), { once: true });
  $('#dialog [data-save]').onclick = () => toggleList(item);
  const play = async () => {
    if (!series) return startPlayback(item);
    const season = Number($('#detailSeason').value);
    if (!detailEpisodes.length) await loadDetailEpisodes(item, season);
    if (detail !== item || Number($('#detailSeason')?.value) !== season) return;
    const episode = detailEpisodes.find(ep => ep.available && last?.season === season && last?.episode === ep.number) || detailEpisodes.find(ep => ep.available);
    if (episode) startPlayback(item, season, episode);
    else { selectDetailTab('episodes'); $('#detailEpisodeSelector').scrollIntoView({ block: 'nearest' }); }
  };
  $('#dialog [data-play]').onclick = play;
  $('#dialog [data-more-info]').onclick = () => { selectDetailTab('details'); $('#tab-details').focus(); };
  const buttons = [...document.querySelectorAll('[data-detail-tab]')];
  buttons.forEach((button, index) => {
    button.onclick = () => selectDetailTab(button.dataset.detailTab);
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      selectDetailTab(buttons[next].dataset.detailTab); buttons[next].focus();
    };
  });
  if (series) {
    $('#dialog [data-browse-episodes]').onclick = () => { const season = $('#detailEpisodeSelector [data-season][aria-pressed=true]'); season?.focus(); $('#detailEpisodeSelector').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    episodeSelector?.dispose();
    episodeSelector = window.LayarEpisodes.mount($('#detailEpisodeSelector'), {
      slug: item.slug, seasons: availableSeasons, season: initialSeason, releaseEdges: true,
      say: (id, en) => i18n.language === 'en' ? en : id,
      load: season => api(`series/${item.slug}/season/${season}`),
      onChange: (season, episodes) => { $('#detailSeason').value = season; detailEpisodes = episodes; },
      onSelect: (episode, season) => startPlayback(item, season, episode)
    });
  }
}

function episodeRow(item, season, episode, active) {
  return window.LayarEpisodes.card(episode, {
    slug:item.slug, season, active,
    say:(id,en) => i18n.language === 'en' ? en : id,
    onSelect:(ep,selectedSeason) => startPlayback(item,selectedSeason,ep)
  });
}

async function loadDetailEpisodes(item, season) {
  await episodeSelector?.selectSeason(season);
}

function playbackOptions(value = playback) { return { type: value.item.type, slug: value.item.slug, season: value.season, episode: value.episode?.number }; }
function externalUrl(options) {
  if (!options) return SOURCE;
  return options.type === 'movie' ? `${SOURCE}/movie/${options.slug}?play=1` : `${SOURCE}/series/${options.slug}/season/${options.season}/episode/${options.episode}?play=1`;
}
function openExternal(options) { if (desktop) desktop.openSource(options).catch(error => toast(errorText(error))); else window.open(externalUrl(options), '_blank', 'noopener,noreferrer'); }
function updateBounds() {
  // Android opens a separate Activity and has no Electron surface to resize.
  if (!playback || typeof desktop?.bounds !== 'function') return;
  const rect = $('#playerSurface').getBoundingClientRect();
  desktop.bounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}
let playTitleToken = 0;
async function playTitle(item) {
  const token = ++playTitleToken;
  try {
    if (item.type !== 'tv_series') return await startPlayback(item);
    const full = await api('series/' + item.slug);
    const last = historyOf(item);
    const seasons = (full.seasons || []).filter(s => s.number > 0).sort((a,b) => a.number-b.number);
    if (last) seasons.sort((a,b) => Number(b.number === last.season)-Number(a.number === last.season));
    for (const season of seasons) {
      const data = await api(`series/${item.slug}/season/${season.number}`);
      if (token !== playTitleToken) return;
      const episode = data.episodes.find(e => e.available && season.number === last?.season && e.number === last?.episode) || data.episodes.find(e => e.available);
      if (episode) return await startPlayback(full, season.number, episode);
    }
    toast(t('Video belum tersedia dari sumber.'));
  } catch (error) { if (token === playTitleToken) toast(errorText(error)); }
}
async function openPlayerEpisodes() {
  if (!playback || playback.item.type !== 'tv_series') return;
  const current = playback;
  let backdrop;
  try { backdrop = await desktop?.playerBackdrop?.(); } catch {}
  if (playback !== current) return;
  openModal();
  $('#modal').classList.add('episode-overlay');
  if (backdrop) $('#modal').style.setProperty('--episode-backdrop', `url("${backdrop}")`);
  $('#modal').setAttribute('aria-label', t('Episode'));
  $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t('Tutup'))}">${icon('close')}</button><div class="episode-overlay-content"><div id="overlayEpisodeSelector"></div></div>`;
  $('#dialog [data-close]').focus();
  episodeSelector?.dispose();
  episodeSelector = window.LayarEpisodes.mount($('#overlayEpisodeSelector'), {
    slug: current.item.slug, seasons: current.item.seasons, season: current.season,
    active: {season:current.season,episode:current.episode.number}, focusActive: true, releaseEdges: true,
    say: (id,en) => i18n.language === 'en' ? en : id,
    load: season => api(`series/${current.item.slug}/season/${season}`),
    onSelect: (episode,season,active) => { if (active) closeModal(); else startPlayback(current.item,season,episode); }
  });
}

async function startPlayback(item, season, episode) {
  clearHeroTimer();

  if (item.type === 'tv_series' && (!episode || !episode.available)) return;
  ++playTitleToken;
  playback = { item, season, episode };
  streamFormats = {}; externalPlaying = false; lastPlayerStatus = null;
  if (!$('#modal').classList.contains('hidden')) closeModal();
  document.body.classList.add('locked');
  $('#player').classList.remove('hidden');
  $('#playerQuality').focus?.();
  $('#playerTitle').textContent = item.title;
  $('#playerSubtitle').textContent = episode ? `Season ${season} · Episode ${episode.number} — ${episode.title}` : `${item.year} · ${runtime(item.runtime)}`;
  $('#playerMessage').innerHTML = `<span class="spinner"></span><p>${t("Menyiapkan player IDLIX…")}</p>`;
  $('#playerNote').textContent = t('Menyiapkan video…');
  renderPlayerBadges();
  $('#nativePlayer').hidden = true;
  const series = item.type === 'tv_series';
  $('#playerSidebar').classList.toggle('hidden', !series);
  $('#player').classList.add('no-sidebar');
  if (series) {
    $('#playerSeason').innerHTML = item.seasons.filter(s => s.number > 0).sort((a,b) => a.number - b.number).map(s => `<option value="${s.number}" ${s.number === season ? 'selected' : ''}>Season ${s.number}</option>`).join('');
    // The shared selector loads episodes when opened; playback need not wait for the list.
  }
  const current = playback;
  try {
    updateBounds();
    if (desktop) {
      const progress = episode && window.LayarEpisodes?.readProgress(item.slug,season,episode.number);
      const resumeTime = progress && window.LayarEpisodes.progress(progress) < .95 ? Number(progress.time) || 0 : 0;
      await desktop.play({ ...playbackOptions(current), seasons: item.seasons || [], ...(resumeTime > 0 ? {resumeTime} : {}) });
    }
    else {
      const frame = document.createElement('iframe');
      frame.title = item.title; frame.allow = 'autoplay; fullscreen; encrypted-media'; frame.allowFullscreen = true;
      frame.src = externalUrl(playbackOptions(current));
      $('#playerSurface iframe')?.remove?.(); $('#playerSurface').append(frame);
    }
    if (playback !== current) return;
    const history = storage.get('history', []).filter(x => keyOf(x.item) !== keyOf(item));
    storage.set('history', [{ item, season: season || null, episode: episode?.number || null, at: Date.now() }, ...history].slice(0, 20));
    if (episode) {
      const played = storage.get('playedEpisodes', {});
      played[`${keyOf(item)}:${season}:${episode.number}`] = Date.now();
      storage.set('playedEpisodes', Object.fromEntries(Object.entries(played).sort((a,b) => b[1] - a[1]).slice(0, 500)));
    }
  } catch (error) { if (playback === current) { $('#playerMessage').innerHTML = `<p>${esc(errorText(error))}</p>`; $('#playerNote').textContent = t("Gunakan Muat ulang atau Buka sumber."); } }
}
async function loadPlayerEpisodes(season) {
  const token = ++playerEpisodeToken, item = playback?.item;
  if (!item) return;
  sidebarSeason = season;
  const node = $('#playerEpisodes');
  node.innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
  try {
    const data = await api(`series/${item.slug}/season/${season}`);
    if (token !== playerEpisodeToken || !playback) return;
    node.replaceChildren();
    data.episodes.forEach(episode => node.append(episodeRow(item, season, episode, season === playback.season && episode.number === playback.episode?.number)));
    node.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    if (!data.episodes.length) node.innerHTML = `<p class="empty">${t("Belum ada episode.")}</p>`;
  } catch (error) {
    if (token !== playerEpisodeToken || !playback) return;
    node.innerHTML = `<div class="empty"><p>${esc(errorText(error))}</p><button class="btn" data-retry>${t("Coba lagi")}</button></div>`;
    node.querySelector('[data-retry]').onclick = () => loadPlayerEpisodes(season);
  }
}
async function closePlayer() {
  ++playTitleToken;
  if (!$('#modal').classList.contains('hidden')) closeModal();
  ++playerEpisodeToken;
  playback = null;
  $('#playerSurface iframe')?.remove?.();
  $('#player').classList.add('hidden');
  document.body.classList.remove('locked');
  try { await desktop?.closePlayer(); } catch {}
  if (currentTab === 'home') render();
}
const soundLabels = { original: 'Asli', surround: 'Surround 5.1', atmos: 'Dolby Atmos' };
const soundReasons = {
  'cross-origin': 'Player sumber ini tidak mengizinkan suaranya diolah.',
  'no-atmos': 'Film ini tidak punya track Dolby Atmos. Pilih Surround 5.1.',
  'no-decoder': 'Sumber punya track Atmos, tapi player ini tidak bisa memutar Dolby Digital Plus. Gunakan mpv dengan passthrough.',
  'atmos-hidden': 'Sumber punya track Atmos, tapi player sumber tidak menampilkannya.',
  suspended: 'Audio belum bisa diaktifkan. Putar video dulu, lalu coba lagi.',
  'no-video': 'Menunggu video'
};
function soundStatus(info, reason) {
  if (reason) return t(soundReasons[reason] || 'Mode suara belum bisa diganti.');
  if (!info || info.mode === 'original') return t('Suara asli dari sumber, tanpa diolah.');
  const prefix = info.mode === 'atmos' ? 'Dolby Atmos · ' : '';
  return prefix + (info.active === 6 ? t('Aktif: suara dibagi ke 6 speaker 5.1.') : t('Aktif: surround 3D virtual untuk headphone atau speaker stereo.'));
}
// Media badges are Layar's own marks. They describe the stream and imply no certification.
function mediaBadges({ height = 0, atmos = false, sound = 'original', subtitles = false } = {}) {
  const badges = [];
  if (height >= 2160) badges.push(`<span class="media-badge logo" title="4K Ultra HD">${logo('4k', '4K Ultra HD')}</span>`);
  else if (height) badges.push(`<span class="media-badge"><b>${esc(qualityLabel(height))}</b></span>`);
  if (atmos) badges.push(`<span class="media-badge logo" title="Dolby Atmos">${logo('dolby-atmos', 'Dolby Atmos')}</span>`);
  if (sound === 'surround') badges.push(`<span class="media-badge" title="Surround 5.1">${icon('surround')}<b>5.1</b></span>`);
  if (subtitles) badges.push(`<span class="media-badge" title="${esc(t('Sub Indo terdeteksi'))}"><b>CC</b><small>INDO</small></span>`);
  return badges.join('');
}
function sourceHasAtmos(quality) { return !!streamFormats.atmos || !!quality?.audioTracks?.some(track => track.atmos); }
function renderPlayerBadges() {
  const status = lastPlayerStatus || {};
  if (externalPlaying) { $('#playerBadges').innerHTML = `<span class="media-badge"><b>mpv</b></span>`; return; }
  if (!status.height || status.advertisement) { $('#playerBadges').innerHTML = `<span class="player-pending"><i></i>${esc(t('Memuat'))}</span>`; return; }
  const sound = status.quality?.sound;
  $('#playerBadges').innerHTML = mediaBadges({ height: status.height, atmos: sourceHasAtmos(status.quality), sound: sound?.active ? sound.mode : 'original', subtitles: status.hasIndonesianSubtitles === true });
}
const soundIcons = { original: 'speaker', surround: 'surround', atmos: 'atmos' };
const soundNotes = { original: 'Tanpa olahan', surround: 'Speaker 5.1 atau 3D di headphone', atmos: 'Track Atmos dari sumber' };
const soundShort = { 'cross-origin': 'Tidak bisa diolah di sumber ini', 'no-atmos': 'Tidak ada di film ini', 'no-decoder': 'Perlu mpv dengan passthrough', 'atmos-hidden': 'Tidak ditampilkan sumber' };
async function openPlayerQuality() {
  if (!playback) return;
  openModal();
  const current = playback, token = ++settingsToken;
  $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t('Tutup'))}">${icon('close')}</button><div class="loading"><span class="spinner"></span></div>`;
  try {
    const [quality, preferences] = await Promise.all([
      desktop?.playerQuality?.() || { levels: [], canSelect: false },
      desktop?.settings?.() || { quality: 'auto', blockAds: true, passthrough: false }
    ]);
    if (token !== settingsToken || playback !== current) return;
    const levels = quality.canSelect ? quality.levels || [] : [];
    const tracks = quality.audioTracks || [], sound = quality.sound;
    const activeHeight = lastPlayerStatus?.advertisement ? 0 : lastPlayerStatus?.height || quality.height || 0;
    const sourceHeight = Math.max(0, ...(streamFormats.resolutions || []), ...levels.map(level => Number(level.id) || 0));
    const locked = levels.filter(level => level.locked);
    const passthrough = !window.AndroidBridge && !!preferences.nativePath;
    const badges = mediaBadges({ height: activeHeight, atmos: sourceHasAtmos(quality), sound: sound?.active ? sound.mode : 'original' });
    const qualityHint = !levels.length ? t('Player ini tidak mengekspos pilihan kualitas. Gunakan menu kualitas pada video.')
      : locked.length ? t('{quality} perlu login akun IDLIX. Pilih untuk membuka form login sumber.', { quality: locked.map(level => level.label).join(', ') })
      : t('Auto disarankan karena menyesuaikan koneksi. Pilih 1080p atau 4K jika internet cepat dan stabil.');
    $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t('Tutup'))}">${icon('close')}</button><div class="settings-body player-quality-menu">
      <header class="pq-head"><span class="eyebrow">LAYAR · PLAYER</span><h2>${t('Kualitas & Suara')}</h2>
        <div class="pq-badges">${badges || `<span class="pq-muted">${esc(t('Menunggu video'))}</span>`}${sourceHeight > activeHeight && activeHeight ? `<span class="pq-muted">${esc(t('Sumber hingga {quality}', { quality: qualityLabel(sourceHeight) }))}</span>` : ''}</div>
      </header>
      <section class="pq-section"><h3>${t('Video')}</h3>
        ${levels.length ? `<div class="pq-chips" role="radiogroup" aria-label="${esc(t('Resolusi'))}">${levels.map(level => `<button type="button" class="pq-chip" role="radio" data-quality="${esc(level.id)}" aria-checked="${level.id === quality.selected}" ${level.locked ? `data-locked title="${esc(t('Perlu login akun IDLIX'))}"` : ''}>${esc(level.label)}${level.locked ? icon('lock') : ''}</button>`).join('')}</div>` : ''}
        <p class="pq-hint">${esc(qualityHint)}</p>
      </section>
      <section class="pq-section"><h3>${t('Suara')}</h3>
        <div class="pq-modes" role="radiogroup" aria-label="${esc(t('Mode suara'))}">${(sound?.options || [{ id: 'original', available: true, reason: '' }]).map(option => `<button type="button" class="pq-mode" role="radio" data-sound="${option.id}" aria-checked="${option.id === (sound?.mode || 'original')}" ${option.available ? '' : `disabled title="${esc(t(soundReasons[option.reason] || ''))}"`}>${option.id === 'atmos' ? logo('dolby-atmos', 'Dolby Atmos') : icon(soundIcons[option.id])}<b>${esc(t(soundLabels[option.id]))}</b><small>${esc(t(option.available ? soundNotes[option.id] : soundShort[option.reason] || 'tidak tersedia'))}</small></button>`).join('')}</div>
        <p class="pq-hint" id="soundStatus" role="status">${esc(soundStatus(sound))}</p>
        ${tracks.length > 1 ? `<label class="settings-row"><span><b>${t('Track audio')}</b></span><select id="streamAudio">${tracks.map(track => `<option value="${esc(track.id)}" ${track.id === quality.audioSelected ? 'selected' : ''}>${esc(track.label)}</option>`).join('')}</select></label>` : ''}
      </section>
      <details class="pq-advanced"><summary>${t('Lanjutan')}</summary>
        <p class="pq-hint">${t('Audio di sumber')}: ${esc(streamFormats.audioFormats?.join(' / ') || t('Belum terdeteksi'))}</p>
        <label class="settings-row"><span><b>Audio passthrough · mpv</b><small>${t('Berlaku saat berikutnya membuka mpv. Memerlukan perangkat HDMI dan track yang mendukung.')}</small></span><input id="playerPassthrough" type="checkbox" ${preferences.passthrough ? 'checked' : ''} ${passthrough ? '' : 'disabled'}></label>
        ${passthrough ? '' : `<p class="pq-hint">${t('Passthrough tersedia melalui mpv di laptop. Hubungkan mpv lewat Pengaturan.')}</p>`}
      </details>
      <p id="qualityFeedback" class="pq-hint" role="status"></p>
    </div>`;
    const group = selector => [...document.querySelectorAll(selector)];
    const check = (selector, key, value) => group(selector).forEach(node => node.setAttribute('aria-checked', String(node.dataset[key] === value)));
    group('#dialog [data-quality]').forEach(chip => chip.onclick = async () => {
      if (chip.getAttribute('aria-checked') === 'true') return;
      const chips = group('#dialog [data-quality]'), label = chip.textContent.trim();
      chips.forEach(node => { node.disabled = true; });
      try {
        const result = await desktop.playerQuality(chip.dataset.quality);
        if (token !== settingsToken) return;
        // The source shows its sign-in sheet in the player, so the menu steps aside.
        if (result.locked) { closeModal(); toast(t('Masuk ke akun IDLIX di form yang muncul untuk membuka {quality}.', { quality: label })); return; }
        check('#dialog [data-quality]', 'quality', chip.dataset.quality);
        $('#qualityFeedback').textContent = t('Resolusi diganti ke {quality}.', { quality: label });
      } catch (error) { if (token === settingsToken) $('#qualityFeedback').textContent = errorText(error); }
      finally { if (token === settingsToken) chips.forEach(node => { node.disabled = false; }); }
    });
    group('#dialog [data-sound]').forEach(card => card.onclick = async () => {
      if (card.getAttribute('aria-checked') === 'true') return;
      const cards = group('#dialog [data-sound]');
      cards.forEach(node => { node.dataset.wasDisabled = String(node.disabled); node.disabled = true; });
      try {
        const result = await desktop.playerSound(card.dataset.sound);
        if (token !== settingsToken) return;
        check('#dialog [data-sound]', 'sound', result.mode);
        $('#soundStatus').textContent = soundStatus(result, result.applied ? '' : result.reason);
        if (lastPlayerStatus?.quality) { lastPlayerStatus.quality.sound = result; renderPlayerBadges(); }
        const latest = await desktop.playerQuality();
        if (token === settingsToken && $('#streamAudio') && latest.audioTracks?.length) $('#streamAudio').value = latest.audioSelected;
      } catch (error) { if (token === settingsToken) $('#soundStatus').textContent = errorText(error); }
      finally { if (token === settingsToken) cards.forEach(node => { node.disabled = node.dataset.wasDisabled === 'true'; }); }
    });
    if ($('#streamAudio')) $('#streamAudio').onchange = async event => { try { await desktop.playerAudio(event.target.value); } catch (error) { if (token === settingsToken) $('#qualityFeedback').textContent = errorText(error); } };
    $('#playerPassthrough').onchange = async event => {
      const control = event.target; control.disabled = true;
      try { const latest = await desktop.settings(); await desktop.saveSettings({ ...latest, passthrough: control.checked }); }
      catch (error) { control.checked = !control.checked; if (token === settingsToken) $('#qualityFeedback').textContent = errorText(error); }
      finally { if (token === settingsToken) control.disabled = false; }
    };
    $('#dialog [data-close]').focus();
  } catch (error) {
    if (token === settingsToken) { closeModal(); toast(errorText(error)); }
  }
}
// Settings use switches and segmented buttons instead of form inputs so a TV remote can move through every control.
const deviceName = () => window.AndroidBridge ? (isTv ? 'TV' : 'HP') : 'laptop';
function settingsRow(name, title, note, control, wide = false) {
  return `<div class="st-row${wide ? ' wide' : ''}"><span class="st-row-icon">${icon(name)}</span><div class="st-row-text"><b>${title}</b>${note ? `<small>${note}</small>` : ''}</div><div class="st-row-control">${control}</div></div>`;
}
function settingsSwitch(setting, checked, disabled) {
  return `<button type="button" class="st-switch" role="switch" data-setting="${setting}" aria-checked="${!!checked}" ${disabled ? 'disabled' : ''}><span></span></button>`;
}
function settingsSegments(id, label, options, value, disabled) {
  return `<div id="${id}" class="st-segments" role="radiogroup" aria-label="${esc(label)}">${options.map(([key, text]) => `<button type="button" role="radio" data-value="${key}" aria-checked="${key === value}" ${disabled ? 'disabled' : ''}>${esc(text)}</button>`).join('')}</div>`;
}
function settingsGuide() {
  const device = deviceName();
  const open = device === 'laptop' ? [t('Klik {icon} Kualitas & Suara', { icon: icon('sliders') }), t('Tombolnya ada di kanan atas player.')]
    : device === 'TV' ? [t('Tekan ▲ lalu OK di remote'), t('Tombol atas memilih Kualitas & Suara di pojok kanan atas video.')]
    : [t('Ketuk Kualitas & Suara'), t('Tombolnya ada di pojok kanan atas video.')];
  const steps = [[t('Putar film atau episode'), t('Menu kualitas muncul saat video sedang diputar.')], open, [t('Pilih video dan suara'), t('Perubahan langsung berlaku tanpa mengulang film.')]];
  const option = (name, text) => `<li><b>${name}</b><span>${text}</span></li>`;
  return `<section id="settingsGuide" class="st-group"><h3>${t('Cara atur kualitas video & suara')}</h3>
    <ol class="st-guide">${steps.map(([title, note], index) => `<li class="st-step"><span class="st-num">${index + 1}</span><div><b>${title}</b><small>${note}</small></div></li>`).join('')}</ol>
    <div class="st-explain">
      <div class="st-explain-card"><div class="st-explain-head">${logo('4k', '4K Ultra HD')}<b>${t('Kualitas video')}</b></div><ul class="st-options">
        ${option('Auto', t('Disarankan. Menyesuaikan kecepatan internet agar tidak buffering.'))}
        ${option('1080p', t('Full HD. Butuh internet sekitar 5 Mbps.'))}
        ${option('4K UHD', t('Paling tajam. Butuh sekitar 25 Mbps dan layar 4K. Hanya muncul jika film menyediakannya.'))}
      </ul><p class="st-tip">${icon('lock')}${t('Kualitas bertanda gembok perlu login akun IDLIX.')}</p></div>
      <div class="st-explain-card"><div class="st-explain-head">${logo('dolby-atmos', 'Dolby Atmos')}<b>${t('Mode suara')}</b></div><ul class="st-options">
        ${option(t('Asli'), t('Untuk speaker HP, laptop, atau TV biasa.'))}
        ${option('Surround 5.1', t('Untuk headphone atau speaker 5.1. Suara terasa lebih luas.'))}
        ${option('Dolby Atmos', t('Hanya aktif jika film punya track Atmos dan perangkat mendukung.'))}
      </ul></div>
    </div></section>`;
}
function settingsCapabilities(capabilities) {
  const desktopApp = !window.AndroidBridge, fourK = capabilities.avc.supported || capabilities.hevc.supported;
  const status = (kind, text) => `<span class="st-status ${kind}">${text}</span>`;
  const ok = status('ok', t('Didukung')), missing = status('no', t('Belum terdeteksi'));
  const atmos = capabilities.atmos.supported ? [ok, t('Decoder spasial terdeteksi')]
    : capabilities.dolby.supported ? [status('partial', t('Sebagian')), t('Dolby Digital Plus tersedia; Atmos belum terkonfirmasi')]
    : [missing, desktopApp ? t('Decoder internal belum mendukung; gunakan passthrough mpv') : t('Belum didukung; Surround 5.1 tetap bisa dipakai.')];
  const card = (mark, state, note) => `<div class="st-cap"><div class="st-cap-mark">${mark}</div>${state}<small>${note}</small></div>`;
  return `<section class="st-group"><h3>${t('Kemampuan {device} ini', { device: t(deviceName()) })}</h3><div class="st-caps">
    ${card(logo('4k', '4K Ultra HD'), fourK ? ok : missing, fourK ? t('Decoder 2160p terdeteksi') : t('Decoder 2160p belum terdeteksi'))}
    ${card('<span class="st-cap-text">HEVC<small>H.265</small></span>', capabilities.hevc.supported ? ok : missing, capabilities.hevc.supported ? t('Decoder tersedia') : desktopApp ? t('Gunakan mpv jika dibutuhkan') : t('Video diputar dengan format lain'))}
    ${card(logo('dolby-atmos', 'Dolby Atmos'), atmos[0], atmos[1])}
  </div><p class="st-note">${t('Pemeriksaan decoder bukan jaminan keluaran speaker atau headphone. Resolusi, HDR, dan audio asli bergantung pada sumber. Layar tidak mengubah video HD menjadi 4K atau audio stereo menjadi Atmos.')}</p></section>`;
}
async function openSettings() {
  if (!$('#languagePreference')) openModal(); ++detailToken; const token = ++settingsToken;
  $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="loading"><span class="spinner"></span><p>${t("Memeriksa ruang tonton…")}</p></div>`;
  try {
    const [preferences, capabilities] = await Promise.all([desktop?.settings() || { quality: 'auto', blockAds: true, passthrough: false, nativePath: '' }, probeCapabilities()]);
    if (token !== settingsToken) return;
    const prefs = { quality: preferences.quality, blockAds: !!preferences.blockAds, passthrough: !!preferences.passthrough };
    const device = deviceName(), locked = !desktop, mpvStatus = () => preferences.nativePath ? t("mpv sudah dipilih") : t("Belum dihubungkan");
    // mpv runs only beside the Windows app, so phones and TVs never see its options.
    const mpv = window.AndroidBridge ? '' : `<section class="st-group"><h3>${t("Player eksternal · mpv")}</h3><p class="st-lead">${t("Opsional. Pakai mpv untuk file 4K/HEVC atau audio Dolby Atmos lewat HDMI.")}</p><div class="st-card">
      ${settingsRow('monitor', 'mpv.exe', `<span id="nativePath">${esc(mpvStatus())}</span>`, `<button id="chooseNative" class="btn" ${locked ? 'disabled' : ''}>${t("Pilih mpv.exe")}</button>`, true)}
      ${settingsRow('sliders', t("Kualitas stream di mpv"), t("Hemat hingga 2 Mbps · Seimbang hingga 8 Mbps · Maksimum: kualitas tertinggi sumber, termasuk 4K."), settingsSegments('qualityPreference', t("Kualitas stream di mpv"), [['eco', t("Hemat")], ['auto', t("Seimbang")], ['maximum', t("Maksimum")]], prefs.quality, locked), true)}
      ${settingsRow('speaker', 'Dolby Atmos / DTS passthrough', t("Kirim audio asli ke receiver atau soundbar HDMI. Matikan untuk speaker laptop."), settingsSwitch('passthrough', prefs.passthrough, locked))}
    </div><p class="st-note">${t("Subtitle dari situs belum diteruskan ke mpv. Untuk file lokal, gunakan subtitle bawaan file atau tambahkan file subtitle sendiri di mpv.")}</p></section>`;
    $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="settings-body settings-v2">
      <header class="st-head"><span class="st-head-icon">${icon('gear')}</span><div><h2>${t("Pengaturan")}</h2><p>${t("Tersimpan otomatis di {device} ini.", { device: t(device) })}</p></div></header>
      ${settingsGuide()}
      <section class="st-group"><h3>${t("Umum")}</h3><div class="st-card">
        ${settingsRow('globe', t("Bahasa tampilan"), t("Bahasa menu Layar. Judul, sinopsis, dan subtitle tetap mengikuti sumber."), settingsSegments('languagePreference', t("Bahasa tampilan"), [['id', 'Indonesia'], ['en', 'English']], i18n.language), true)}
        ${settingsRow('shield', t("Lewati iklan otomatis"), t("Blokir iklan dan klik Lewati saat tersedia. Waktu tunggu dari server tetap berlaku."), settingsSwitch('blockAds', prefs.blockAds, locked))}
        ${settingsRow('cc', 'Sub Indo', t("Saat menonton, pilih Indonesia / Indonesian di menu CC atau Subtitle. Tidak semua judul punya Sub Indo."), '')}
      </div></section>
      ${settingsCapabilities(capabilities)}
      ${mpv}
      <p class="st-foot">${t("Daftarku dan riwayat episode disimpan di {device} ini. Katalog: IDLIX · Gambar: TMDB.", { device: t(device) })}</p>
    </div>`;
    async function save(nodes, revert) {
      nodes.forEach(node => { node.disabled = true; });
      try { await desktop.saveSettings({ ...prefs }); toast(t("Pengaturan disimpan. Berlaku pada pemutaran berikutnya.")); }
      catch (error) { revert(); toast(errorText(error)); }
      finally { if (token === settingsToken) nodes.forEach(node => { node.disabled = false; }); }
    }
    function segments(id, pick) {
      const buttons = [...document.querySelectorAll(`#${id} [role=radio]`)];
      const select = value => buttons.forEach(node => node.setAttribute('aria-checked', String(node.dataset.value === value)));
      buttons.forEach(button => button.onclick = () => {
        const previous = buttons.find(node => node.getAttribute('aria-checked') === 'true')?.dataset.value;
        if (button.dataset.value === previous) return;
        select(button.dataset.value);
        pick(button.dataset.value, () => select(previous), buttons);
      });
    }
    segments('languagePreference', value => changeLanguage(value).catch(error => toast(errorText(error))));
    segments('qualityPreference', (value, revert, buttons) => { const previous = prefs.quality; prefs.quality = value; save(buttons, () => { prefs.quality = previous; revert(); }); });
    document.querySelectorAll('#dialog .st-switch').forEach(button => button.onclick = () => {
      const key = button.dataset.setting, next = !prefs[key];
      prefs[key] = next; button.setAttribute('aria-checked', String(next));
      save([button], () => { prefs[key] = !next; button.setAttribute('aria-checked', String(!next)); });
    });
    if ($('#chooseNative')) $('#chooseNative').onclick = async () => {
      try { const result = await desktop.chooseNative(); preferences.nativePath = result.nativePath; if (token === settingsToken) $('#nativePath').textContent = mpvStatus(); }
      catch (error) { toast(errorText(error)); }
    };
  } catch (error) { if (token === settingsToken) $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="empty"><p>${esc(errorText(error))}</p></div>`; }
}

document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => setTab(button.dataset.tab); });
$('#home').onclick = () => setTab('home');
$('#settings').onclick = () => openSettings();
$('#mobileSettings')?.addEventListener('click', () => openSettings());
$('#language').onchange = event => changeLanguage(event.target.value).catch(error => toast(errorText(error)));
$('#openFile').onclick = async () => {
  if (!desktop) return toast(t("Buka Layar.vbs untuk memutar file lokal."));
  try { const result = await desktop.openFile(); if (result.opened) toast(t("File dibuka di mpv.")); }
  catch (error) { toast(errorText(error)); }
};
const isTv = window.AndroidBridge?.isTelevision?.() === true || /Tizen|Web0S|WebOS|SmartTV/i.test(window.navigator?.userAgent || '');
document.body.classList.toggle('tv-mode', isTv);
const searchInput = $('#search');
function updateSearch() {
  clearTimeout(searchTimer);
  ++viewToken;
  currentQuery = searchInput.value.trim();
  searchTimer = setTimeout(render, 350);
}
searchInput.addEventListener('input', event => {
  if (!event.isComposing) updateSearch();
});
searchInput.addEventListener('compositionend', updateSearch);
$('.search').addEventListener('click', () => {
  searchInput.focus();
  window.AndroidBridge?.showKeyboard?.();
});
searchInput.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    clearTimeout(searchTimer);
    currentQuery = searchInput.value.trim();
    window.AndroidBridge?.hideKeyboard?.();
    $('#main').focus();
    render();
  } else if (event.key === 'ArrowDown' || event.key === 'Escape') {
    const target = event.key === 'ArrowDown' ? $('#main .card:not(.skeleton)') : $('[data-tab].active');
    if (target) {
      event.preventDefault();
      event.stopPropagation();
      window.AndroidBridge?.hideKeyboard?.();
      target.focus();
    }
  }
});
// Keep directional navigation scoped to the visible screen; text editing stays native.
document.addEventListener('keydown', event => {
  if (!isTv || event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const active = document.activeElement;
  if (/INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
  const scope = !$('#modal').classList.contains('hidden') ? $('#dialog') : playback ? $('#player') : document;
  const origin = active.getBoundingClientRect();
  const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
  let best, distance = Infinity;
  for (const node of scope.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')) {
    if (node === active || !node.getClientRects().length) continue;
    const box = node.getBoundingClientRect();
    const dx = (box.left + box.right - origin.left - origin.right) / 2;
    const dy = (box.top + box.bottom - origin.top - origin.bottom) / 2;
    const forward = (horizontal ? dx : dy) * sign;
    const cross = Math.abs(horizontal ? dy : dx);
    if (forward <= 1) continue;
    const score = forward + cross * 3;
    if (score < distance) { best = node; distance = score; }
  }
  if (best) {
    event.preventDefault();
    best.focus();
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
});
$('#modal').onclick = event => { if (event.target === $('#modal') || event.target.closest('[data-close]')) closeModal(); };
$('#playerBack').onclick = closePlayer;
$('#playerQuality').onclick = openPlayerQuality;
$('#playerSeason').onchange = event => loadPlayerEpisodes(Number(event.target.value));
$('#playerSidebar').onclick = openPlayerEpisodes;
$('#fullscreen').onclick = () => desktop ? desktop.fullscreen() : document.fullscreenElement ? document.exitFullscreen() : $('#player').requestFullscreen();
$('#openSource').onclick = () => { if (playback) openExternal(playbackOptions()); };
$('#retryPlayer').onclick = () => { if (playback) startPlayback(playback.item, playback.season, playback.episode); };
$('#nativePlayer').onclick = async () => {
  const current = playback;
  $('#nativePlayer').disabled = true;
  try {
    await desktop.native();
    if (playback !== current) return;
    externalPlaying = true; renderPlayerBadges();
    $('#playerMessage').innerHTML = `<p>${t("Film diputar di mpv.")}</p><small>${t("Tutup mpv untuk kembali ke player internal.")}</small>`;
    $('#playerNote').textContent = t("Player internal dijeda selama mpv terbuka.");
  } catch (error) { toast(errorText(error)); }
  finally { if (playback === current) $('#nativePlayer').disabled = externalPlaying; }
};
new ResizeObserver(updateBounds).observe($('#playerSurface'));
function handlePlayerStatus(status) {
  lastPlayerStatus = status;
  if (status.state === 'local-error') { toast(t(status.message)); return; }
  if (!playback) return;
  if (status.state === 'close-request') { closePlayer(); return; }
  if (status.state === 'error') { $('#playerNote').textContent = t(status.message); }
  else if (status.state === 'loaded') $('#playerNote').textContent = t('Sumber sedang menyiapkan video.');
  else if (status.state === 'stream') {
    if (status.resolutions) streamFormats = status;
    // mpv appears only once the source exposes a stream address it can open.
    $('#nativePlayer').hidden = !status.externalReady || externalPlaying;
    renderPlayerBadges();
    $('#nativePlayer').title = t("Putar stream yang sama dengan mpv yang dipilih di Pengaturan");
  } else if (status.state === 'metrics' && !externalPlaying) {
    if (playback.episode && !status.advertisement) window.LayarEpisodes.saveProgress(playback.item.slug, playback.season, playback.episode.number, {time:status.time,duration:status.duration});
    renderPlayerBadges();
    if (status.playing) $('#playerNote').textContent = t("Selamat menonton.");
    if (status.playing && !status.externalReady) $('#nativePlayer').title = t("Sumber ini memakai player khusus. Gunakan player internal; mpv tetap tersedia untuk file lokal lewat Buka file.");
  } else if (status.state === 'external-closed') {
    externalPlaying = false; $('#nativePlayer').hidden = false; $('#nativePlayer').disabled = false; $('#playerNote').textContent = t(status.message); renderPlayerBadges();
  }
}
desktop?.onPlayerStatus(handlePlayerStatus);
window.addEventListener('scroll', () => $('#nav').classList.toggle('solid', scrollY > 35), { passive: true });
document.addEventListener('keydown', event => {
  if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key) || [10009, 461].includes(event.keyCode)) { event.preventDefault(); if (!$('#modal').classList.contains('hidden')) closeModal(); else if (playback) closePlayer(); }
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !playback && $('#modal').classList.contains('hidden')) { event.preventDefault(); $('#search').focus(); }
  if (event.key === 'Tab' && !$('#modal').classList.contains('hidden')) {
    const nodes = [...$('#dialog').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(node => node.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('#modal'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('#modal'))) { event.preventDefault(); first?.focus(); }
  }
});

function initNetflixIntro() {
  const splash = $('#introSplash');
  if (!splash) return;

  let audioStarted = false;
  function playIntroTaDum() {
    if (audioStarted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const runTaDum = () => {
        if (audioStarted) return;
        audioStarted = true;
        const now = ctx.currentTime;
        const t0 = now + 0.03;

        // 1. Transient Click / Percussion strike (the sharp "Ta")
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        clickOsc.type = 'sine';
        clickOsc.frequency.setValueAtTime(1600, t0);
        clickOsc.frequency.exponentialRampToValueAtTime(180, t0 + 0.04);
        clickGain.gain.setValueAtTime(0.35, t0);
        clickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.045);
        clickOsc.connect(clickGain);
        clickGain.connect(ctx.destination);
        clickOsc.start(t0);
        clickOsc.stop(t0 + 0.05);

        // Sub kick strike
        const kickOsc = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kickOsc.type = 'triangle';
        kickOsc.frequency.setValueAtTime(150, t0);
        kickOsc.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
        kickGain.gain.setValueAtTime(0.6, t0);
        kickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
        kickOsc.connect(kickGain);
        kickGain.connect(ctx.destination);
        kickOsc.start(t0);
        kickOsc.stop(t0 + 0.15);

        // 2. Cinematic D-Minor Chord Swell (the signature "DUM" at t0 + 0.09s)
        const t1 = t0 + 0.09;

        // Deep sub fundamental D1 (36.7Hz) & D2 (73.4Hz)
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(73.42, t1);
        subOsc.frequency.exponentialRampToValueAtTime(36.71, t1 + 0.45);
        subGain.gain.setValueAtTime(0.001, t1);
        subGain.gain.linearRampToValueAtTime(0.65, t1 + 0.07);
        subGain.gain.exponentialRampToValueAtTime(0.001, t1 + 2.0);
        subOsc.connect(subGain);
        subGain.connect(ctx.destination);
        subOsc.start(t1);
        subOsc.stop(t1 + 2.1);

        // Cinematic Chord Harmonics with detuning & resonant sweep
        const chordTones = [
          { f: 73.42, type: 'sawtooth', vol: 0.28, detune: -5 },
          { f: 110.0, type: 'sawtooth', vol: 0.25, detune: 6 },
          { f: 146.83, type: 'triangle', vol: 0.26, detune: -3 },
          { f: 174.61, type: 'sawtooth', vol: 0.20, detune: 5 }, // Iconic minor third tension
          { f: 220.0, type: 'triangle', vol: 0.16, detune: -4 },
          { f: 293.66, type: 'sine', vol: 0.12, detune: 3 }
        ];

        chordTones.forEach(tone => {
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();

          osc.type = tone.type;
          osc.frequency.setValueAtTime(tone.f, t1);
          osc.detune.setValueAtTime(tone.detune, t1);

          filter.type = 'lowpass';
          filter.Q.setValueAtTime(3.2, t1);
          filter.frequency.setValueAtTime(380, t1);
          filter.frequency.exponentialRampToValueAtTime(2600, t1 + 0.26); // Bright bloom
          filter.frequency.exponentialRampToValueAtTime(130, t1 + 2.1);  // Dark warm decay

          gain.gain.setValueAtTime(0.001, t1);
          gain.gain.linearRampToValueAtTime(tone.vol, t1 + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, t1 + 2.2);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(t1);
          osc.stop(t1 + 2.3);
        });
      };

      if (ctx.state === 'running') {
        runTaDum();
      } else {
        ctx.resume().then(() => {
          if (ctx.state === 'running') runTaDum();
        }).catch(() => {});
        const unlock = () => {
          ctx.resume().then(() => {
            if (ctx.state === 'running') runTaDum();
          }).catch(() => {});
          window.removeEventListener('pointerdown', unlock);
          window.removeEventListener('keydown', unlock);
        };
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
      }
    } catch (_) {}
  }

  playIntroTaDum();

  let dismissed = false;
  function dismissSplash() {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.remove();
    }, 550);
  }

  setTimeout(dismissSplash, 1950);
  splash.addEventListener('click', dismissSplash);
  window.addEventListener('keydown', () => {
    if (!dismissed) dismissSplash();
  }, { once: true });
}

initNetflixIntro();
applyInterfaceLanguage();
Promise.resolve(desktop?.setLanguage?.(i18n.language)).catch(error => toast(errorText(error)));
render();
